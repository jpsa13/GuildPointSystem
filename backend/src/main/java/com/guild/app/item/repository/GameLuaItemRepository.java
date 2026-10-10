package com.guild.app.item.repository;

import com.guild.app.item.entity.GameLuaItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface GameLuaItemRepository extends JpaRepository<GameLuaItem, Long> {

    Optional<GameLuaItem> findByGameCode(String gameCode);

    List<GameLuaItem> findByGameCodeIn(Collection<String> gameCodes);

    @Query("""
            SELECT g FROM GameLuaItem g
            WHERE g.category = :category
              AND (
                :hasSearch = false
                OR LOWER(g.name) LIKE :searchPattern
                OR LOWER(g.gameCode) LIKE :searchPattern
              )
            ORDER BY g.name ASC
            """)
    Page<GameLuaItem> findFilteredPage(
            @Param("category") String category,
            @Param("hasSearch") boolean hasSearch,
            @Param("searchPattern") String searchPattern,
            Pageable pageable);
}
