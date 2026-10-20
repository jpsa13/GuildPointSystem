package com.guild.app.emoji.repository;

import com.guild.app.emoji.entity.GuildEmoji;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GuildEmojiRepository extends JpaRepository<GuildEmoji, Long> {

    List<GuildEmoji> findAllByOrderByNameAsc();

    boolean existsByNameIgnoreCase(String name);

    Optional<GuildEmoji> findByNameIgnoreCase(String name);
}
