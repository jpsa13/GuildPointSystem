package com.guild.app.common.enums;

public enum MemberStatus {
    PENDENTE,
    APROVADO,
    REJEITADO,
    /** Account deleted by Líder/Administrador: no login, personal data wiped, history kept. */
    EXCLUIDO,
    /** Access blocked by Líder/Administrador: no login, everything kept; lifting it returns to APROVADO. */
    SUSPENSO
}
