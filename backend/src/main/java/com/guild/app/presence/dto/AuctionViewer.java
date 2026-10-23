package com.guild.app.presence.dto;

/** A member with an auction page open; {@code idle} means every tab they have on it is in the background. */
public record AuctionViewer(Long memberId, String nickname, String className, String classImageUrl, boolean idle) {}
