package com.guild.app.member.dto;

import jakarta.validation.constraints.Size;

public record SuspendMemberRequest(
        @Size(max = 500, message = "O motivo pode ter até 500 caracteres.")
        String reason
) {}
