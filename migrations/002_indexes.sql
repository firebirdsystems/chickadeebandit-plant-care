CREATE INDEX IF NOT EXISTS idx_plant_care_logs_activity  ON app_plant_care__logs(activity_id);
CREATE INDEX IF NOT EXISTS idx_plant_care_logs_plant     ON app_plant_care__logs(plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_care_acts_plant     ON app_plant_care__activities(plant_id, sort_order);
