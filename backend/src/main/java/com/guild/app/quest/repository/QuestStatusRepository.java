package com.guild.app.quest.repository;

import com.guild.app.quest.entity.QuestStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestStatusRepository extends JpaRepository<QuestStatus, Long> {
}
