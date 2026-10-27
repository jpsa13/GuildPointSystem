CREATE TABLE member_equipment_relic (
    member_id BIGINT NOT NULL REFERENCES member(id),
    relic_id INTEGER NOT NULL CHECK (relic_id BETWEEN 0 AND 119),
    PRIMARY KEY (member_id,relic_id)
);
