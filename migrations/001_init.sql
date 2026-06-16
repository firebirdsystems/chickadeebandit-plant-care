CREATE TABLE IF NOT EXISTS app_plant_care__plants (
  id            TEXT NOT NULL,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT '',
  emoji         TEXT NOT NULL DEFAULT '🪴',
  location      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_plant_care__activities (
  id            TEXT NOT NULL,
  plant_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT '💧',
  interval_days REAL NOT NULL DEFAULT 7,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_plant_care__logs (
  id           TEXT NOT NULL,
  activity_id  TEXT NOT NULL,
  plant_id     TEXT NOT NULL,
  done_by      TEXT NOT NULL,
  done_at      TEXT NOT NULL,
  PRIMARY KEY (id)
);
