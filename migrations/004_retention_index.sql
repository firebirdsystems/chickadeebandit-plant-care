-- retain_days sweep key for logs. Ungoverned table (any member waters a plant),
-- so the expiry lives in the manifest's top-level `retention` map.
CREATE INDEX IF NOT EXISTS app_plant_care__logs_retention_idx
  ON app_plant_care__logs (done_at, id);
