-- Status de quests (ativas/concluidas) enviado pelo cliente CerberusBags.
-- Name-based (associa pelo nome do personagem = nickname), display-only, sem token.
-- "done" = quest que sumiu do journal no dia de reset (03h America/Sao_Paulo);
-- e conclusao INFERIDA (imprecisa) -- o cliente nao da sinal inequivoco.
-- Codigos guardados como lista separada por virgula no formato Q000000.

CREATE TABLE quest_status (
    member_id BIGINT PRIMARY KEY REFERENCES member(id),
    quest_day DATE NOT NULL,
    active_codes TEXT NOT NULL DEFAULT '',
    done_codes TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
