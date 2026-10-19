package com.guild.app.auth.security;

import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import com.guild.app.member.entity.Member;
import lombok.Getter;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Getter
public class MemberPrincipal implements UserDetails {

    private final Long id;
    /** For logs and presence: who did it, without exposing the e-mail. */
    private final String nickname;
    private final String email;
    private final String passwordHash;
    private final Role role;
    private final MemberStatus status;
    private final boolean profileComplete;

    public MemberPrincipal(Member member) {
        this.id = member.getId();
        this.nickname = member.getNickname();
        this.email = member.getEmail() != null ? member.getEmail() : member.getDiscordId();
        this.passwordHash = member.getPasswordHash();
        this.role = member.getRole();
        this.status = member.getStatus();
        this.profileComplete = member.isProfileComplete();
    }

    @Override
    public Collection<SimpleGrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return status != MemberStatus.REJEITADO;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
