package com.guild.app.presence.dto;

import java.time.Instant;
import java.util.List;

public record PresenceSnapshot(List<OnlineMember> members, Instant serverTime) {}
