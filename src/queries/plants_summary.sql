SELECT
  p.id,
  p.name,
  p.type,
  p.emoji,
  p.location,
  COUNT(DISTINCT a.id) AS activity_count,
  MAX(l.done_at)       AS last_cared_at
FROM plants p
LEFT JOIN activities a
  ON a.plant_id      = p.id
  AND a.household_id = p.household_id
LEFT JOIN logs l
  ON l.plant_id      = p.id
  AND l.household_id = p.household_id
WHERE p.household_id = current_setting('app.household_id', true)::uuid
GROUP BY p.id, p.name, p.type, p.emoji, p.location
ORDER BY last_cared_at NULLS FIRST, p.name
LIMIT 200
