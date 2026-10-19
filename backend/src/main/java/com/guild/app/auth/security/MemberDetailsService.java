package com.guild.app.auth.security;

import com.guild.app.common.enums.MemberStatus;
import com.guild.app.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MemberDetailsService implements UserDetailsService {

    private final MemberRepository memberRepository;
    private final MemberPrincipalCache memberPrincipalCache;

    @Override
    public UserDetails loadUserByUsername(String username) {
        var member = memberRepository.findByEmail(username)
                .or(() -> memberRepository.findByDiscordId(username))
                .orElseThrow(() -> new UsernameNotFoundException("Member not found"));
        return new MemberPrincipal(member);
    }

    /**
     * Used for every JWT (REST + WebSocket), served from {@link MemberPrincipalCache}. Deleting an account
     * evicts it after commit, so its still-valid token stops working on the next request.
     */
    public UserDetails loadById(Long id) {
        return memberPrincipalCache.get(id, () -> memberRepository.findById(id)
                .filter(m -> m.getStatus() != MemberStatus.EXCLUIDO)
                .map(MemberPrincipal::new)
                .orElseThrow(() -> new UsernameNotFoundException("Member not found")));
    }
}
