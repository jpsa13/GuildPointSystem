package com.guild.app.discord.repository;

import com.guild.app.discord.entity.DiscordHiddenMember;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DiscordHiddenMemberRepository extends JpaRepository<DiscordHiddenMember, String> {}
