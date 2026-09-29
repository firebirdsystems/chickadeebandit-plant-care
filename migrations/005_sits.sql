-- A sit: the household hands its plants to a sitter, who gets a share link
-- (manifest.shareable.sit) listing the chosen plants' tasks to tick off. Each
-- tick lands in logs like a member's tap, so the overdue badge, digest and
-- reminders see it. Same shape as pet-care 005.
CREATE TABLE IF NOT EXISTS app_plant_care__sits (
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,              -- "Plants, Oct 3–10"
  instructions TEXT NOT NULL DEFAULT '',   -- how much water, where the can is
  starts_on    TEXT NOT NULL DEFAULT '',   -- household-local yyyy-mm-dd
  ends_on      TEXT NOT NULL DEFAULT '',
  plant_ids    TEXT NOT NULL DEFAULT '[]', -- JSON array: the plants this sit covers
  archived     INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (id)
);

-- The sit's checklist, one row per activity of a chosen plant, rebuilt by the
-- app whenever it drifts from the plants' activities. The share page lists
-- these in insertion order, so the app writes them in display order (grouped
-- by location, so the sitter goes room by room).
CREATE TABLE IF NOT EXISTS app_plant_care__sit_tasks (
  id          TEXT NOT NULL,
  sit_id      TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  plant_id    TEXT NOT NULL,
  label       TEXT NOT NULL,              -- "Monstera · Watering"
  detail      TEXT NOT NULL DEFAULT '',   -- "Every 7 days · Living room" (sitTaskRows)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS app_plant_care__sit_tasks_sit_activity
  ON app_plant_care__sit_tasks (sit_id, activity_id);
-- delete_cascades from plants and activities.
CREATE INDEX IF NOT EXISTS app_plant_care__sit_tasks_plant
  ON app_plant_care__sit_tasks (plant_id);
CREATE INDEX IF NOT EXISTS app_plant_care__sit_tasks_activity
  ON app_plant_care__sit_tasks (activity_id);

-- A sitter's tick: sit_id names the sit, done_by is 'sitter' and the name is
-- the one they typed. task_label keeps what the task was called at the time.
ALTER TABLE app_plant_care__logs ADD COLUMN sit_id      TEXT NOT NULL DEFAULT '';
ALTER TABLE app_plant_care__logs ADD COLUMN sitter_name TEXT NOT NULL DEFAULT '';
ALTER TABLE app_plant_care__logs ADD COLUMN task_label  TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS app_plant_care__logs_sit
  ON app_plant_care__logs (sit_id, done_at);
