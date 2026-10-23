package com.guild.app.equipment;

import com.guild.app.common.enums.AuditLogType;
import com.guild.app.log.entity.AuditLog;
import com.guild.app.log.repository.AuditLogRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.websocket.WebSocketPublisher;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.mockito.Mockito.*;

class EquipmentAuditPrivacyTest {
    @Test void equipmentNotificationsCarryOnlyFlagsAndWaitForCommit() {
        var template=mock(org.springframework.messaging.simp.SimpMessagingTemplate.class);
        var publisher=new WebSocketPublisher(template);
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            publisher.publishEquipmentChanged();
            publisher.publishEquipmentCatalogChanged();
            verifyNoInteractions(template);
            org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations().forEach(sync->sync.afterCommit());
            verify(template).convertAndSend("/topic/equipment",Map.of("changed",true));
            verify(template).convertAndSend("/topic/equipment",Map.of("changed",true,"catalogChanged",true));
            verifyNoMoreInteractions(template);
        } finally {
            org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization();
        }
    }
    @Test void equipmentAuditNeverBroadcastsItsPayloadOnThePublicLogFeed() {
        var repository=mock(AuditLogRepository.class);
        var publisher=mock(WebSocketPublisher.class);
        when(repository.save(any(AuditLog.class))).thenAnswer(call->call.getArgument(0));
        var service=new AuditLogService(repository,publisher,mock(MemberRepository.class));
        service.log(AuditLogType.EQUIPMENT_CHANGED,(Member)null,null,Map.of("reason","privado"));
        service.log(AuditLogType.EQUIPMENT_CATALOG_IMPORTED,(Member)null,null,Map.of("sourceHash","privado"));
        verify(publisher).publishEquipmentChanged();
        verify(publisher).publishEquipmentCatalogChanged();
        verify(publisher,never()).publishLog(any());
        service.log(AuditLogType.PROFILE_UPDATED,(Member)null,null,Map.of());
        verify(publisher).publishLog(any());
    }
}
