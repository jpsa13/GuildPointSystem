package com.guild.app.news.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NewsRequest(
        @NotBlank(message = "Informe o título.")
        @Size(max = 200, message = "O título pode ter no máximo 200 caracteres.")
        String title,

        @NotBlank(message = "Escreva o conteúdo da notícia.")
        @Size(max = 50_000, message = "A notícia ficou grande demais.")
        String contentHtml
) {}
