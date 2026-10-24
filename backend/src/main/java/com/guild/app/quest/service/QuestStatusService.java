package com.guild.app.quest.service;

import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.quest.dto.QuestStatusIngestRequest;
import com.guild.app.quest.entity.QuestStatus;
import com.guild.app.quest.repository.QuestStatusRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Ingestao name-based (sem token) do status de quests do cliente, e sobreposicao
 * na checklist. Display-only: "done" marca a quest como concluida na checklist,
 * com a imprecisao de que um sumico do journal pode nao ser conclusao real.
 */
@Service
@RequiredArgsConstructor
public class QuestStatusService {

    private static final ZoneId BRT = ZoneId.of("America/Sao_Paulo");

    private final QuestStatusRepository repository;
    private final MemberRepository memberRepository;

    /** Dia de quest: reset 03:00 America/Sao_Paulo (desloca 3h e pega a data). */
    public static LocalDate currentQuestDay() {
        return ZonedDateTime.now(BRT).minusHours(3).toLocalDate();
    }

    @Transactional
    public void ingest(QuestStatusIngestRequest request) {
        Member member = memberRepository.findByNicknameIgnoreCase(request.character())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Nenhum membro com esse nome de personagem"));

        String active = toCodes(request.active());
        String done = toCodes(request.done());

        QuestStatus status = repository.findById(member.getId()).orElseGet(() -> {
            QuestStatus created = new QuestStatus();
            created.setMemberId(member.getId());
            return created;
        });
        status.setQuestDay(currentQuestDay());
        status.setActiveCodes(active);
        status.setDoneCodes(done);
        status.setUpdatedAt(Instant.now());
        repository.save(status);
    }

    /** Codigos "concluidos" do membro para o dia pedido (vazio se nao houver para esse dia). */
    @Transactional(readOnly = true)
    public Set<String> doneCodesForDay(long memberId, LocalDate day) {
        return repository.findById(memberId)
                .filter(s -> day.equals(s.getQuestDay()))
                .map(s -> parse(s.getDoneCodes()))
                .orElse(Set.of());
    }

    private static String toCodes(java.util.List<Integer> values) {
        return values.stream()
                .map(v -> String.format("Q%06X", v & 0xFFFFFF))
                .distinct()
                .collect(Collectors.joining(","));
    }

    private static Set<String> parse(String codes) {
        if (codes == null || codes.isBlank()) return Set.of();
        return Arrays.stream(codes.split(",")).filter(s -> !s.isBlank()).collect(Collectors.toSet());
    }
}
