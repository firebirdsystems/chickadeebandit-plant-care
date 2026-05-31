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
    ELSE (MAX(l.done_at)::date + a.interval_days::integer)::text
  END AS next_due_at
FROM activities a
JOIN plants p
  ON p.id            = a.plant_id
  AND p.household_id = a.household_id
LEFT JOIN logs l
  ON l.activity_id   = a.id
  AND l.household_id = a.household_id
WHERE a.household_id = current_setting('app.household_id', true)::uuid
GROUP BY a.id, a.name, a.icon, a.interval_days, p.id, p.name, p.emoji, p.location
HAVING
  MAX(l.done_at) IS NULL
  OR (MAX(l.done_at)::date + a.interval_days::integer) < CURRENT_DATE
ORDER BY next_due_at NULLS FIRST, p.name
LIMIT 100
