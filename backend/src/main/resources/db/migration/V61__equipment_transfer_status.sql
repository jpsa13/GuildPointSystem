ALTER TABLE equipment_assignment DROP CONSTRAINT equipment_assignment_status_check;
ALTER TABLE equipment_assignment ADD CONSTRAINT equipment_assignment_status_check
    CHECK (status IN ('ACTIVE','CANCELLED','CORRECTED','TRANSFERRED'));
