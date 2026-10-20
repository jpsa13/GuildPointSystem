package com.guild.app.auction.dto;

import java.time.Instant;
import java.util.List;

public record AuctionMessageResponse(
        Long id,
        String type,
        String content,
        String imageUrl,
        Instant createdAt,
        MemberSummary member,
        ReplySummary replyTo,
        List<ReactionSummary> reactions
) {
    public record MemberSummary(Long id, String nickname) {}

    /** The quoted message (always a member's TEXT message; {@code member} is null if the account is gone). */
    public record ReplySummary(Long id, String type, String content, MemberSummary member) {}

    /** One emoji on a message and who reacted with it, oldest first (emojis in first-use order). */
    public record ReactionSummary(String emoji, List<MemberSummary> members) {}
}
