package com.guild.app.news.controller;

import com.guild.app.common.security.SecurityUtils;
import com.guild.app.news.dto.NewsRequest;
import com.guild.app.news.dto.NewsResponse;
import com.guild.app.news.service.NewsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/news")
@RequiredArgsConstructor
public class NewsController {

    private final NewsService newsService;

    @GetMapping
    public Page<NewsResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "1") int size) {
        return newsService.list(page, size);
    }

    /** Líder/Administrador. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public NewsResponse create(@Valid @RequestBody NewsRequest request) {
        return newsService.create(request, SecurityUtils.currentMember());
    }

    /** Líder/Administrador. */
    @PutMapping("/{id}")
    public NewsResponse update(@PathVariable Long id, @Valid @RequestBody NewsRequest request) {
        return newsService.update(id, request, SecurityUtils.currentMember());
    }

    /** Líder/Administrador. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        newsService.delete(id, SecurityUtils.currentMember());
    }
}
