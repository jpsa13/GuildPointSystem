package com.guild.app.emoji.service;

import com.guild.app.auction.repository.AuctionMessageReactionRepository;
import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.emoji.dto.GuildEmojiResponse;
import com.guild.app.emoji.entity.GuildEmoji;
import com.guild.app.emoji.repository.GuildEmojiRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.awt.Rectangle;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class GuildEmojiService {

    /** Letters, digits and underscore, as on Discord. */
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_]{2,32}");
    private static final Pattern REACTION_KEY = Pattern.compile(":([A-Za-z0-9_]{2,32}):");
    private static final int MAX_EMOJIS = 200;
    /** Static images arrive already fitted to 128×128 by the client. */
    private static final long MAX_STATIC_BYTES = 256 * 1024;
    /** GIFs are fitted here (keeping the animation), so the upload itself may be large. */
    private static final long MAX_GIF_BYTES = 5 * 1024 * 1024;
    private static final int EMOJI_PX = 128;

    private final GuildEmojiRepository guildEmojiRepository;
    private final AuctionMessageReactionRepository reactionRepository;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;
    private final WebSocketPublisher webSocketPublisher;
    private final TransactionTemplate transactionTemplate;

    /** One GIF at a time: re-encoding a big one takes seconds of CPU on the server that also runs the bids. */
    private final Semaphore gifSlot = new Semaphore(1);

    @Value("${guild.upload.base-path}")
    private String uploadBasePath;

    @Transactional(readOnly = true)
    public List<GuildEmojiResponse> list() {
        return guildEmojiRepository.findAllByOrderByNameAsc().stream().map(this::toResponse).toList();
    }

    /** {@code ":name:"} of an existing guild emoji, with the name as registered; empty otherwise. */
    @Transactional(readOnly = true)
    public Optional<String> canonicalReactionKey(String value) {
        var matcher = REACTION_KEY.matcher(value);
        if (!matcher.matches()) return Optional.empty();
        return guildEmojiRepository.findByNameIgnoreCase(matcher.group(1)).map(e -> ":" + e.getName() + ":");
    }

    /**
     * {@code crop}: square part of a GIF chosen by the member (static images arrive already cropped).
     * Not transactional as a whole: the image work runs without holding a DB connection (the pool is
     * shared with bids); only the insert at the end runs in a short transaction.
     */
    public GuildEmojiResponse create(String rawName, MultipartFile file, Rectangle crop, MemberPrincipal actor)
            throws IOException {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        String name = rawName == null ? "" : rawName.trim().replace(":", "");
        if (!NAME.matcher(name).matches()) {
            throw new AppException("Nome inválido: use de 2 a 32 letras, números ou _.", HttpStatus.BAD_REQUEST);
        }
        if (guildEmojiRepository.existsByNameIgnoreCase(name)) {
            throw new AppException("Já existe um emoji :" + name + ":.", HttpStatus.CONFLICT);
        }
        if (guildEmojiRepository.count() >= MAX_EMOJIS) {
            throw new AppException("Limite de " + MAX_EMOJIS + " emojis atingido.", HttpStatus.BAD_REQUEST);
        }
        if (file == null || file.isEmpty()) {
            throw new AppException("Selecione uma imagem.", HttpStatus.BAD_REQUEST);
        }

        byte[] bytes = file.getBytes();
        String ext = imageExtension(bytes);
        if (ext == null) {
            throw new AppException("Tipo de arquivo inválido. Use PNG, JPG, WebP ou GIF.", HttpStatus.BAD_REQUEST);
        }
        boolean animated = ext.equals("gif");
        if (bytes.length > (animated ? MAX_GIF_BYTES : MAX_STATIC_BYTES)) {
            throw new AppException("Imagem muito grande (máx. " + (animated ? "5 MB" : "256 KB") + ").",
                    HttpStatus.BAD_REQUEST);
        }
        if (animated) {
            bytes = resizeGif(bytes, crop);
        }

        Path dir = Path.of(uploadBasePath);
        Files.createDirectories(dir);
        String filename = "emoji-" + UUID.randomUUID() + "." + ext;
        Path target = dir.resolve(filename);
        Files.write(target, bytes);

        try {
            return transactionTemplate.execute(status -> {
                var emoji = new GuildEmoji();
                emoji.setName(name);
                emoji.setImageUrl("/uploads/" + filename);
                emoji.setAnimated(animated);
                emoji.setCreatedBy(memberRepository.getReferenceById(actor.getId()));
                emoji = guildEmojiRepository.save(emoji);

                auditLogService.log(AuditLogType.EMOJI_CREATED, actor, null,
                        Map.of("emojiId", emoji.getId(), "name", name));
                webSocketPublisher.publishEmojis(Map.of("type", "EMOJIS_CHANGED"));
                return toResponse(emoji);
            });
        } catch (DataIntegrityViolationException e) {
            // Same name created meanwhile (unique index): drop the orphan file.
            Files.deleteIfExists(target);
            throw new AppException("Já existe um emoji :" + name + ":.", HttpStatus.CONFLICT);
        }
    }

    private byte[] resizeGif(byte[] gif, Rectangle crop) {
        try {
            if (!gifSlot.tryAcquire(20, TimeUnit.SECONDS)) {
                throw new AppException("Outro GIF está sendo processado. Tente de novo em instantes.",
                        HttpStatus.SERVICE_UNAVAILABLE);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AppException("Envio interrompido.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        try {
            return GifResizer.fitSquare(gif, EMOJI_PX, crop);
        } catch (IOException | RuntimeException e) {
            log.info("GIF emoji rejected: {}", e.getMessage());
            throw new AppException("Não foi possível processar o GIF"
                    + (e instanceof IOException && e.getMessage() != null ? ": " + e.getMessage() : "."),
                    HttpStatus.BAD_REQUEST);
        } finally {
            gifSlot.release();
        }
    }

    @Transactional
    public void delete(Long id, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var emoji = guildEmojiRepository.findById(id)
                .orElseThrow(() -> new AppException("Emoji não encontrado.", HttpStatus.NOT_FOUND));
        reactionRepository.deleteByEmoji(":" + emoji.getName() + ":");
        guildEmojiRepository.delete(emoji);

        auditLogService.log(AuditLogType.EMOJI_DELETED, actor, null,
                Map.of("emojiId", emoji.getId(), "name", emoji.getName()));
        webSocketPublisher.publishEmojis(Map.of("type", "EMOJIS_CHANGED"));
        deleteFileAfterCommit(emoji.getImageUrl());
    }

    /** Detects the format from the file header (the declared content type is not trusted). */
    private static String imageExtension(byte[] b) {
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "png";
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return "jpg";
        if (b.length >= 6 && ascii(b, 0, 4).equals("GIF8")) return "gif";
        if (b.length >= 12 && ascii(b, 0, 4).equals("RIFF") && ascii(b, 8, 4).equals("WEBP")) return "webp";
        return null;
    }

    private static String ascii(byte[] b, int offset, int length) {
        return new String(b, offset, length, StandardCharsets.US_ASCII);
    }

    private void deleteFileAfterCommit(String imageUrl) {
        Runnable remove = () -> {
            try {
                Files.deleteIfExists(Path.of(uploadBasePath).resolve(imageUrl.replace("/uploads/", "")));
            } catch (IOException e) {
                log.warn("Could not delete emoji file {}: {}", imageUrl, e.getMessage());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    remove.run();
                }
            });
        } else {
            remove.run();
        }
    }

    private GuildEmojiResponse toResponse(GuildEmoji e) {
        return new GuildEmojiResponse(e.getId(), e.getName(), e.getImageUrl(), e.isAnimated());
    }
}
