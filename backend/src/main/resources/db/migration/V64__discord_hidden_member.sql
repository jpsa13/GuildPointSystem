-- Discord users left out of the dashboard's member list (Líder/Administrador choose them in the UI).
CREATE TABLE discord_hidden_member (
    discord_id VARCHAR(32) PRIMARY KEY,
    hidden_by BIGINT REFERENCES member(id),
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
