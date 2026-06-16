SELECT
  p.id,
  p.name,
  p.type,
  p.emoji,
  p.location,
  COUNT(DISTINCT a.id) AS activity_count,
  MAX(l.done_at)       AS last_cared_at
FROM app_plant_care__plants p
LEFT JOIN app_plant_care__activities a
  ON a.plant_id      = p.id
LEFT JOIN app_plant_care__logs l
  ON l.plant_id      = p.id
GROUP BY p.id, p.name, p.type, p.emoji, p.location
ORDER BY last_cared_at NULLS FIRST, p.name
LIMIT 200
