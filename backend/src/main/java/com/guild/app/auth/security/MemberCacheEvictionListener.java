package com.guild.app.auth.security;

import com.guild.app.member.entity.Member;
import jakarta.persistence.PostRemove;
import jakarta.persistence.PostUpdate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Every write to a member (status, role, deletion, points…) drops its cached principal. */
@Component
@RequiredArgsConstructor
public class MemberCacheEvictionListener {

    private final MemberPrincipalCache memberPrincipalCache;

    @PostUpdate
    @PostRemove
    void evict(Member member) {
        memberPrincipalCache.evictAfterCommit(member.getId());
    }
}
