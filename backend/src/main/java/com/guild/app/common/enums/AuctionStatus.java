package com.guild.app.common.enums;

public enum AuctionStatus {
    OPEN,
    DOLE,
    TIE_BREAK,
    CLOSED,
    /** Force-closed by a leader/admin: no winner, nobody charged. */
    CANCELLED
}
