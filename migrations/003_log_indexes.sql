-- See pet-care 003: recurring_due wants the latest log per activity, and
-- logs(activity_id) alone cannot stop early.
CREATE INDEX IF NOT EXISTS app_plant_care__idx_logs_activity_done
  ON app_plant_care__logs (activity_id, done_at);
