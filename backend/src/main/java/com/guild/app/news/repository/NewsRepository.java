package com.guild.app.news.repository;

import com.guild.app.news.entity.News;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NewsRepository extends JpaRepository<News, Long> {

    @EntityGraph(attributePaths = {"createdBy", "updatedBy"})
    Page<News> findAllByOrderByCreatedAtDescIdDesc(Pageable pageable);
}
