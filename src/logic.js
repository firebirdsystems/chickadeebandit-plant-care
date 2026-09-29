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
  const { member, name, sitter } = logAuthor(log, members);
  return { pct, label, lastBy: { member, name, sitter, agoD: elapsedD } };
}

/** The "Last done" value to save from the activity form, or null to leave the
 *  logs alone. The field is prefilled from the newest log (possibly a
 *  sitter's) at day precision, so sending it back unchanged would move that
 *  log to midnight, or a member's log to a sitter's day. Cleared means leave. */
export function lastDoneToSave(value, initial) {
  if ((value ?? "") === (initial ?? "")) return null;
  return localDateToISO(value);
}

// ─── Who did it ──────────────────────────────────────────────────────────────

/** The name to show for a log row. A sitter's tick (share link, done_by
 *  "sitter") carries the name they typed; it is not a member. */
export function logAuthor(log, members) {
  if (log?.done_by === "sitter") return { member: null, name: log.sitter_name || "Sitter", sitter: true };
  const member = members.find(m => m.id === log?.done_by) ?? null;
  return { member, name: member?.name ?? "Someone", sitter: false };
}

// ─── Schedules ───────────────────────────────────────────────────────────────

/** "Every 7 days", "Every day", "Every 0.5 days". */
export function schedLabel(activity) {
  const days = activity.interval_days ?? 7;
  return days === 1 ? "Every day" : `Every ${days} days`;
}

// ─── Sits ────────────────────────────────────────────────────────────────────
// The sit helpers below (and the Sit links section) have a twin in
// pet-care/src/logic.js. They differ on purpose only in the ids (plant_id),
// the schedule label (days), and the room-by-room order (plantsByLocation).
// A fix to the shared behaviour (checklist refresh, drift, statements, expiry,
// the share gate, the revoke plan) belongs in both apps, with its test.

/** The plants a sit covers (its stored JSON array), or [] when unreadable. */
export function sitPlantIds(sit) {
  try {
    const ids = JSON.parse(sit?.plant_ids ?? "[]");
    return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Whether a sit still needs its checklist kept up to date: not archived and
 *  not over. `today` is the local yyyy-mm-dd. */
export function sitIsOpen(sit, today) {
  return Number(sit.archived) !== 1 && (!sit.ends_on || sit.ends_on >= today);
}

/** A location as typed, compared without case or extra spaces: location is
 *  free text, and "Kitchen", "kitchen" and "Kitchen " are one room. */
function roomKey(location) {
  return String(location ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Plants in walking order: grouped by location (roomKey), locations in the
 *  order their first plant appears and named as that plant spells it, plants
 *  with no location last; within a group the plants keep the order given. The
 *  sitter's page and the sit form both use it, so the sitter goes room by
 *  room. */
export function plantsByLocation(plants) {
  const groups = new Map();
  for (const p of plants) {
    const key = roomKey(p.location);
    if (!groups.has(key)) groups.set(key, { location: String(p.location ?? "").trim().replace(/\s+/g, " "), plants: [] });
    groups.get(key).plants.push(p);
  }
  const located = [...groups.entries()].filter(([k]) => k !== "").map(([, g]) => g);
  return groups.has("") ? [...located, groups.get("")] : located;
}

/** The checklist a sit should have: every activity of its plants, in walking
 *  order (plantsByLocation), each plant's activities in their own order. The
 *  share page lists tasks in the order they were written, so this order is
 *  the page's. */
export function sitTaskRows(sit, plants, activities) {
  const chosen = new Set(sitPlantIds(sit));
  const rows = [];
  for (const { location: where, plants: group } of plantsByLocation(plants.filter(p => chosen.has(p.id)))) {
    for (const plant of group) {
      const acts = activities
        .filter(a => a.plant_id === plant.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
      for (const a of acts) {
        rows.push({
          activity_id: a.id,
          plant_id: plant.id,
          label: `${plant.name} · ${a.name}`,
          detail: where ? `${schedLabel(a)} · ${where}` : schedLabel(a),
          sort_order: rows.length,
        });
      }
    }
  }
  return rows;
}

/** Whether the stored checklist (in its stored order) differs from the one the
 *  sit should have — a renamed activity, a changed schedule or location, one
 *  added or gone. */
export function sitTasksDrifted(current, desired) {
  if (current.length !== desired.length) return true;
  return current.some((row, i) => {
    const want = desired[i];
    return row.activity_id !== want.activity_id || row.plant_id !== want.plant_id
      || row.label !== want.label || row.detail !== want.detail;
  });
}

/** The most tasks a sit may have: the hub offers a sitter's page at most this
 *  many options and accepts a tick only on one of them
 *  (MAX_SHAREABLE_SELECT_OPTIONS in hub-contract), so a longer checklist
 *  would hide its tail from the sitter. Checked when a sit is saved and
 *  whenever its checklist is refreshed. */
export const SIT_MAX_TASKS = 100;

/** Rows per INSERT: 7 binds each, under D1's 100 bound parameters. */
const SIT_TASK_ROWS_PER_INSERT = 14;

/** Statements that replace a sit's checklist with `desired`, for one atomic
 *  batch: delete, then insert in display order (the page's order). Replacing
 *  rather than upserting is what keeps a new activity in its place instead of
 *  at the end. Logs point at the activity, not the task row, so no history is
 *  touched. */
export function sitTaskStatements(sitId, desired, newId) {
  const statements = [{ sql: "DELETE FROM app_plant_care__sit_tasks WHERE sit_id = ?", params: [sitId] }];
  for (let i = 0; i < desired.length; i += SIT_TASK_ROWS_PER_INSERT) {
    const chunk = desired.slice(i, i + SIT_TASK_ROWS_PER_INSERT);
    statements.push({
      sql: "INSERT INTO app_plant_care__sit_tasks (id, sit_id, activity_id, plant_id, label, detail, sort_order) VALUES "
        + chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", "),
      params: chunk.flatMap(r => [newId(), sitId, r.activity_id, r.plant_id, r.label, r.detail, r.sort_order]),
    });
  }
  return statements;
}

function localDay(dateStr) {
  const [y, m, d] = String(dateStr ?? "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** "Oct 3", or "" for a blank or malformed date. */
export function formatDay(dateStr) {
  const dt = localDay(dateStr);
  return dt ? dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
}

/** "Oct 3 – Oct 10", "From Oct 3", "Until Oct 10", or "". */
export function sitDates(sit) {
  const from = formatDay(sit.starts_on), until = formatDay(sit.ends_on);
  if (from && until) return `${from} – ${until}`;
  if (from) return `From ${from}`;
  if (until) return `Until ${until}`;
  return "";
}

/** The share panel's own expiry choice for a sit: the link lasts through the
 *  day after the sit ends, for the handover. Null when the sit has no end date
 *  or that moment has passed. Asked again at mint, so `now` is always fresh. */
export function sitExpiryChoice(sit, now = new Date()) {
  const end = localDay(sit?.ends_on);
  if (!end) return null;
  const dayAfter = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const expiresAt = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 2);
  const hours = Math.ceil((expiresAt.getTime() - now.getTime()) / 3_600_000);
  if (hours <= 0) return null;
  const day = dayAfter.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { hours, label: `Until the day after the sit (${day})` };
}

/** One /api/db batch reading everything a checklist is built from, together,
 *  so a sync never mixes a fresh read with a copy the page loaded hours ago. */
export const CARE_SNAPSHOT_STATEMENTS = Object.freeze([
  { sql: "SELECT * FROM app_plant_care__plants ORDER BY created_at", params: [] },
  { sql: "SELECT * FROM app_plant_care__activities ORDER BY plant_id, sort_order, created_at", params: [] },
  { sql: "SELECT * FROM app_plant_care__sits ORDER BY archived, created_at DESC", params: [] },
  { sql: "SELECT id, sit_id, activity_id, plant_id, label, detail, sort_order FROM app_plant_care__sit_tasks ORDER BY sit_id, sort_order", params: [] },
]);

/** The batch's results as { plants, activities, sits, tasks }. Throws unless
 *  every read came back as rows: a missing answer is not an empty table, and a
 *  checklist built from one would delete every task. */
export function parseCareSnapshot(results) {
  const rows = (results ?? []).map(r => r?.rows);
  if (rows.length !== CARE_SNAPSHOT_STATEMENTS.length || !rows.every(Array.isArray)) {
    throw new Error("Could not read your plants — try again.");
  }
  const [plants, activities, sits, tasks] = rows;
  return { plants, activities, sits, tasks };
}

/** Rewrite each open sit's checklist that drifted from its plants' activities.
 *  `read` returns a care snapshot (and throws when it can't); nothing is
 *  written from anything else. `write` applies one sit's statements
 *  atomically. A refused write skips that sit only, so it cannot stall every
 *  sit after it. A sit whose checklist would pass SIT_MAX_TASKS is not
 *  rewritten at all: its link keeps the last checklist that fit, rather than
 *  one the sitter's page would cut short. Returns the snapshot read, whether
 *  anything was written, the sits that failed (too many tasks included), and
 *  `tooMany`: sit id → the task count it would have. */
export async function refreshSitChecklists({ read, write, today, newId }) {
  const snap = await read();
  let changed = false;
  const failed = [];
  const tooMany = {};
  for (const sit of snap.sits) {
    if (!sitIsOpen(sit, today)) continue;
    const desired = sitTaskRows(sit, snap.plants, snap.activities);
    if (desired.length > SIT_MAX_TASKS) {
      tooMany[sit.id] = desired.length;
      failed.push(sit.id);
      continue;
    }
    const current = snap.tasks.filter(t => t.sit_id === sit.id);
    if (!sitTasksDrifted(current, desired)) continue;
    try {
      await write(sitTaskStatements(sit.id, desired, newId));
      changed = true;
    } catch {
      failed.push(sit.id);
    }
  }
  return { snap, changed, failed, tooMany };
}

// ─── Sit links ───────────────────────────────────────────────────────────────

/** Whether a checklist sync result stops `sitId` being shared: the read
 *  failed, or that sit's rewrite was refused. A link to a checklist that could
 *  not be brought up to date could show old or missing tasks. */
export function sitSyncBlocksShare(result, sitId) {
  return !result?.ok || (result.failed ?? []).includes(sitId);
}

/** Which of an archived sit's live links this member can revoke. The hub lets
 *  only a link's creator or an admin revoke it (as the share panel does), so
 *  the rest are named by who holds them, deduplicated, for the message. */
export function planSitLinkRevoke(links, { meId, isAdmin, members }) {
  const mine = links.filter(l => isAdmin || (meId != null && l.createdBy === meId));
  const others = links.filter(l => !mine.includes(l));
  const holders = [...new Set(others.map(l =>
    members.find(m => m.id === l.createdBy)?.name || "another adult"))];
  return { mine, others, holders };
}
