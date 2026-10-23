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
    @Test void equipmentAuditNeverBroadcastsItsPayloadOnThePublicLogFeed() {
        var repository=mock(AuditLogRepository.class);
        var publisher=mock(WebSocketPublisher.class);
        when(repository.save(any(AuditLog.class))).thenAnswer(call->call.getArgument(0));
        var service=new AuditLogService(repository,publisher,mock(MemberRepository.class));
        service.log(AuditLogType.EQUIPMENT_CHANGED,(Member)null,null,Map.of("reason","privado"));
        service.log(AuditLogType.EQUIPMENT_CATALOG_IMPORTED,(Member)null,null,Map.of("sourceHash","privado"));
        verify(publisher,times(2)).publishEquipmentChanged();
        verify(publisher,never()).publishLog(any());
        service.log(AuditLogType.PROFILE_UPDATED,(Member)null,null,Map.of());
        verify(publisher).publishLog(any());
    }
}
