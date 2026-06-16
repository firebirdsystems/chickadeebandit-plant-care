SELECT
  a.id          AS activity_id,
  a.name        AS activity_name,
  a.icon,
  a.interval_days,
  p.id          AS plant_id,
  p.name        AS plant_name,
  p.emoji,
  p.location,
  MAX(l.done_at) AS last_done_at,
  CASE
    WHEN MAX(l.done_at) IS NULL THEN NULL
    ELSE date(MAX(l.done_at), '+' || a.interval_days || ' days')
  END AS next_due_at
FROM app_plant_care__activities a
JOIN app_plant_care__plants p
  ON p.id            = a.plant_id
LEFT JOIN app_plant_care__logs l
  ON l.activity_id   = a.id
GROUP BY a.id, a.name, a.icon, a.interval_days, p.id, p.name, p.emoji, p.location
HAVING
  MAX(l.done_at) IS NULL
  OR date(MAX(l.done_at), '+' || a.interval_days || ' days') < CURRENT_DATE
ORDER BY next_due_at NULLS FIRST, p.name
LIMIT 100
