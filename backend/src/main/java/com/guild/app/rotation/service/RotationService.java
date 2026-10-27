package com.guild.app.rotation.service;

import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.rotation.dto.RotationDtos.*;
import com.guild.app.rotation.repository.RotationRepository;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class RotationService {
    private final RotationRepository repository;
    private final MemberRepository members;
    private final AuditLogService audit;
    private final WebSocketPublisher publisher;
    private Member actor() {
        var member=members.findById(SecurityUtils.currentMember().getId()).orElseThrow();
        if(member.getStatus()!=MemberStatus.APROVADO || !member.isProfileComplete() || member.getDeletedAt()!=null)
            throw new AppException("Acesso não permitido.",HttpStatus.FORBIDDEN);
        return member;
    }
    public Schedule read() { actor(); return repository.read(); }
    @Transactional public Schedule update(Update request) {
        var actor=actor();
        if(!actor.getRole().isAtLeast(Role.ADMINISTRADOR)) throw new AppException("Apenas administradores podem editar a rotação.",HttpStatus.FORBIDDEN);
        var times=new HashSet<String>();
        for(var slot:request.slots()) {
            if(!times.add(slot.time())) throw new AppException("Não repita horários.",HttpStatus.BAD_REQUEST);
            for(var assignments:List.of(slot.qg(),slot.outpost())) {
                var guilds=new HashSet<Guild>(); var bosses=new HashSet<String>();
                for(var entry:assignments) {
                    if(!guilds.add(entry.guild())) throw new AppException("Agrupe os bosses da mesma guilda no horário e área.",HttpStatus.BAD_REQUEST);
                    for(var boss:entry.bosses()) if(!bosses.add(boss.strip().toLowerCase(Locale.ROOT)))
                        throw new AppException("Um boss não pode ter duas atribuições no mesmo horário e área.",HttpStatus.BAD_REQUEST);
                }
            }
        }
        var sorted=new Update(request.version(),request.slots().stream().sorted(Comparator.comparing(Slot::time)).toList());
        if(!repository.update(sorted,actor.getId())) throw new AppException("A rotação foi atualizada por outra pessoa. Recarregue antes de salvar.",HttpStatus.CONFLICT);
        audit.log(AuditLogType.ROTATION_UPDATED,actor,null,Map.of("version",request.version()+1,"slots",request.slots().size()));
        publisher.publishRotationChanged();
        return repository.read();
    }
}
