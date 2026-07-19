/**
 * Pure business logic for the Plant Care app.
 * No DOM, no fetch — importable in both browser and test environments.
 */

export function formatDuration(totalDays) {
  const d = Math.abs(totalDays);
  if (d < 1 / 24) return `${Math.round(d * 24 * 60)}m`;
  if (d < 1)      return `${Math.round(d * 24)}h`;
  if (d < 7)      return `${Math.round(d)}d`;
  if (d < 30)     return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}

// Date inputs carry a calendar date with no timezone. Round-tripping one through
// `new Date("2026-07-01")` parses it as UTC midnight, which reads back as the
// previous day west of UTC — so convert against the local calendar instead.
export function localDateToISO(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function isoToLocalDateInput(iso) {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function statusColor(pct) {
  const c = Math.min(1, Math.max(0, pct));
  function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
  let r, g, b;
  if (c < 0.5) {
    const t = c / 0.5;
    [r, g, b] = [lerp(22, 217, t), lerp(163, 119, t), lerp(74, 6, t)];
  } else {
    const t = (c - 0.5) / 0.5;
    [r, g, b] = [lerp(217, 220, t), lerp(119, 38, t), lerp(6, 38, t)];
  }
  return `rgb(${r},${g},${b})`;
}

export function activityStatusFromLog(activity, log, members, now = new Date()) {
  const days = activity.interval_days ?? 7;
  if (!log) return { pct: 2, label: "Never done", lastBy: null };

  const lastDone = new Date(log.done_at);
  const elapsedD = (now - lastDone) / 86400000;
  const pct      = elapsedD / days;
  const nextDue  = new Date(lastDone.getTime() + days * 86400000);
  const diffDays = (nextDue - now) / 86400000;
  const label    = pct >= 1
    ? `Overdue by ${formatDuration(-diffDays)}`
    : `Due in ${formatDuration(diffDays)}`;
  const member   = members.find(m => m.id === log.done_by) ?? null;
  return { pct, label, lastBy: { member, agoD: elapsedD } };
}
