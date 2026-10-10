package com.guild.app.item.repository;

import com.guild.app.item.entity.Item;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ItemRepository extends JpaRepository<Item, Long> {

    List<Item> findByDeletedFalseOrderByCreatedAtDesc();

    @Query(value = """
            SELECT i.* FROM item i
            WHERE i.deleted = FALSE
              AND (:category IS NULL OR i.lua_category = :category)
              AND (
                :hasSearch = FALSE
                OR LOWER(i.name) LIKE LOWER(CONCAT('%', :search, '%'))
                OR LOWER(i.game_code) LIKE LOWER(CONCAT('%', :search, '%'))
              )
            ORDER BY i.name ASC
            """,
            countQuery = """
            SELECT COUNT(*) FROM item i
            WHERE i.deleted = FALSE
              AND (:category IS NULL OR i.lua_category = :category)
              AND (
                :hasSearch = FALSE
                OR LOWER(i.name) LIKE LOWER(CONCAT('%', :search, '%'))
                OR LOWER(i.game_code) LIKE LOWER(CONCAT('%', :search, '%'))
              )
            """,
            nativeQuery = true)
    Page<Item> findGuildInventoryPage(
            @Param("category") String category,
            @Param("hasSearch") boolean hasSearch,
            @Param("search") String search,
            Pageable pageable);
}
