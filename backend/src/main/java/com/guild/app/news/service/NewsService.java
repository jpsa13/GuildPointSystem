package com.guild.app.news.service;

import com.guild.app.auth.security.MemberPrincipal;
import com.guild.app.common.enums.AuditLogType;
import com.guild.app.common.enums.Role;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.repository.MemberRepository;
import com.guild.app.news.dto.NewsRequest;
import com.guild.app.news.dto.NewsResponse;
import com.guild.app.news.entity.News;
import com.guild.app.news.repository.NewsRepository;
import com.guild.app.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class NewsService {

    private static final int MAX_PAGE_SIZE = 50;

    private final NewsRepository newsRepository;
    private final MemberRepository memberRepository;
    private final AuditLogService auditLogService;
    private final WebSocketPublisher webSocketPublisher;

    /** Newest first. */
    @Transactional(readOnly = true)
    public Page<NewsResponse> list(int page, int size) {
        var pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE));
        return newsRepository.findAllByOrderByCreatedAtDescIdDesc(pageable).map(this::toResponse);
    }

    @Transactional
    public NewsResponse create(NewsRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var news = new News();
        news.setTitle(request.title().trim());
        news.setContentHtml(cleanContent(request.contentHtml()));
        news.setCreatedBy(memberRepository.getReferenceById(actor.getId()));
        news = newsRepository.save(news);

        auditLogService.log(AuditLogType.NEWS_CREATED, actor, null,
                Map.of("newsId", news.getId(), "title", news.getTitle()));
        publishChanged("CREATED", news.getId());
        return toResponse(news);
    }

    @Transactional
    public NewsResponse update(Long id, NewsRequest request, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var news = newsRepository.findById(id)
                .orElseThrow(() -> new AppException("Notícia não encontrada.", HttpStatus.NOT_FOUND));
        news.setTitle(request.title().trim());
        news.setContentHtml(cleanContent(request.contentHtml()));
        news.setUpdatedBy(memberRepository.getReferenceById(actor.getId()));
        news.setUpdatedAt(Instant.now());
        newsRepository.save(news);

        auditLogService.log(AuditLogType.NEWS_UPDATED, actor, null,
                Map.of("newsId", news.getId(), "title", news.getTitle()));
        publishChanged("UPDATED", news.getId());
        return toResponse(news);
    }

    @Transactional
    public void delete(Long id, MemberPrincipal actor) {
        SecurityUtils.requireRole(Role.ADMINISTRADOR);
        var news = newsRepository.findById(id)
                .orElseThrow(() -> new AppException("Notícia não encontrada.", HttpStatus.NOT_FOUND));
        auditLogService.log(AuditLogType.NEWS_DELETED, actor, null,
                Map.of("newsId", news.getId(), "title", news.getTitle()));
        newsRepository.delete(news);
        publishChanged("DELETED", id);
    }

    private String cleanContent(String html) {
        var clean = NewsHtmlSanitizer.sanitize(html);
        if (NewsHtmlSanitizer.isBlank(clean)) {
            throw new AppException("Escreva o conteúdo da notícia.", HttpStatus.BAD_REQUEST);
        }
        return clean;
    }

    private void publishChanged(String action, Long newsId) {
        webSocketPublisher.publishNews(Map.of("type", "NEWS_" + action, "newsId", newsId));
    }

    private NewsResponse toResponse(News news) {
        var author = news.getCreatedBy();
        var editor = news.getUpdatedBy();
        return new NewsResponse(
                news.getId(),
                news.getTitle(),
                news.getContentHtml(),
                author != null ? author.getId() : null,
                author != null ? author.getNickname() : null,
                news.getCreatedAt(),
                editor != null ? editor.getNickname() : null,
                news.getUpdatedAt());
    }
}
