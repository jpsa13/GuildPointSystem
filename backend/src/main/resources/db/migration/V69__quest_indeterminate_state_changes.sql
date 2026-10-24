ALTER TABLE quest_observation DROP CONSTRAINT quest_observation_state_check;
ALTER TABLE quest_observation ADD CONSTRAINT quest_observation_state_check
    CHECK(state IN ('PRESENT','COMPLETION_SIGNAL','REMOVED_UNKNOWN','STATE_CHANGED'));
