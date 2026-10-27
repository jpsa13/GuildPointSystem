package com.guild.app.rotation.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;

public final class RotationDtos {
    private RotationDtos() {}
    public enum Guild { Energy, Espada, Quit, Devotion, Yonkou, Blacklist }
    public record Assignment(@NotNull Guild guild,
        @NotEmpty @Size(max=20) List<@NotBlank @Size(max=100) String> bosses) {}
    public record Slot(@NotNull @Pattern(regexp="(?:[01][0-9]|2[0-3]):[0-5][0-9]") String time,
        @NotNull @Size(max=6) List<@NotNull @Valid Assignment> qg,
        @NotNull @Size(max=6) List<@NotNull @Valid Assignment> outpost) {}
    public record Update(@Min(0) long version, @NotEmpty @Size(max=24) List<@NotNull @Valid Slot> slots) {}
    public record Schedule(long version, Instant updatedAt, List<Slot> slots) {}
}
