package com.guild.app.emoji.controller;

import com.guild.app.common.security.SecurityUtils;
import com.guild.app.emoji.dto.GuildEmojiResponse;
import com.guild.app.emoji.service.GuildEmojiService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.awt.Rectangle;
import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/emojis")
@RequiredArgsConstructor
public class GuildEmojiController {

    private final GuildEmojiService guildEmojiService;

    @GetMapping
    public List<GuildEmojiResponse> list() {
        return guildEmojiService.list();
    }

    /** Líder/Administrador. {@code cropX/cropY/cropSize}: optional square of a GIF, in source pixels. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public GuildEmojiResponse create(@RequestParam("name") String name,
                                     @RequestParam("file") MultipartFile file,
                                     @RequestParam(required = false) Integer cropX,
                                     @RequestParam(required = false) Integer cropY,
                                     @RequestParam(required = false) Integer cropSize) throws IOException {
        Rectangle crop = cropX != null && cropY != null && cropSize != null && cropSize > 0
                ? new Rectangle(cropX, cropY, cropSize, cropSize)
                : null;
        return guildEmojiService.create(name, file, crop, SecurityUtils.currentMember());
    }

    /** Líder/Administrador. Reactions with this emoji go with it. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        guildEmojiService.delete(id, SecurityUtils.currentMember());
    }
}
