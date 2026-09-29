import { describe, it, expect, vi } from "vitest";
import {
  formatDuration, statusColor, activityStatusFromLog, localDateToISO, isoToLocalDateInput,
  logAuthor, schedLabel, lastDoneToSave, sitPlantIds, sitIsOpen, plantsByLocation, sitTaskRows, sitTasksDrifted,
  sitTaskStatements, formatDay, sitDates, sitExpiryChoice, CARE_SNAPSHOT_STATEMENTS, parseCareSnapshot,
  refreshSitChecklists, sitSyncBlocksShare, planSitLinkRevoke,
  SIT_MAX_TASKS,
} from "../src/logic.js";

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats sub-hour in minutes", () => {
    expect(formatDuration(0.5 / 24)).toBe("30m");
    expect(formatDuration(0.25 / 24)).toBe("15m");
  });

  it("formats fractional days as hours", () => {
    expect(formatDuration(0.5)).toBe("12h");
    expect(formatDuration(0.25)).toBe("6h");
  });

  it("formats whole days", () => {
    expect(formatDuration(1)).toBe("1d");
    expect(formatDuration(3)).toBe("3d");
  });

  it("formats weeks (7–29 days)", () => {
    expect(formatDuration(7)).toBe("1w");
    expect(formatDuration(14)).toBe("2w");
  });

  it("formats months (30+ days)", () => {
    expect(formatDuration(30)).toBe("1mo");
    expect(formatDuration(60)).toBe("2mo");
  });

  it("uses absolute value for negatives", () => {
    expect(formatDuration(-7)).toBe("1w");
  });
});

// ── statusColor ───────────────────────────────────────────────────────────────

describe("statusColor", () => {
  it("returns green for 0", () => {
    expect(statusColor(0)).toMatch(/^rgb\(22,\s*163,\s*74\)$/);
  });

  it("returns red for 1", () => {
    expect(statusColor(1)).toMatch(/^rgb\(220,\s*38,\s*38\)$/);
  });

  it("clamps out-of-range values", () => {
    expect(statusColor(-1)).toBe(statusColor(0));
    expect(statusColor(5)).toBe(statusColor(1));
  });
});

// ── activityStatusFromLog ─────────────────────────────────────────────────────

describe("activityStatusFromLog", () => {
  const activity = { id: "a1", interval_days: 7 };
  const member   = { id: "u1", name: "Alex" };
  const members  = [member];

  it("returns never-done when log is null", () => {
    const s = activityStatusFromLog(activity, null, members);
    expect(s.label).toBe("Never done");
    expect(s.pct).toBe(2);
    expect(s.lastBy).toBeNull();
  });

  it("returns overdue when past the interval", () => {
    const log = { done_by: "u1", done_at: new Date(Date.now() - 10 * 86400000).toISOString() };
    const s = activityStatusFromLog(activity, log, members);
    expect(s.pct).toBeGreaterThan(1);
    expect(s.label).toMatch(/Overdue/);
  });

  it("returns due-in when within the interval", () => {
    const log = { done_by: "u1", done_at: new Date(Date.now() - 2 * 86400000).toISOString() };
    const s = activityStatusFromLog(activity, log, members);
    expect(s.pct).toBeLessThan(1);
    expect(s.label).toMatch(/Due in/);
  });

  it("resolves the member from the members array", () => {
    const log = { done_by: "u1", done_at: new Date(Date.now() - 2 * 86400000).toISOString() };
    const s = activityStatusFromLog(activity, log, members);
    expect(s.lastBy.member.name).toBe("Alex");
  });

  it("defaults interval_days to 7", () => {
    const actNoInterval = { id: "a2" };
    const log = { done_by: "u1", done_at: new Date(Date.now() - 3.5 * 86400000).toISOString() };
    const s = activityStatusFromLog(actNoInterval, log, members);
    expect(s.pct).toBeCloseTo(0.5, 1);
  });
});

// ── local date round-trip ─────────────────────────────────────────────────────

describe("localDateToISO / isoToLocalDateInput", () => {
  it("round-trips a date input back to the same calendar date", () => {
    for (const d of ["2026-07-01", "2026-01-15", "2026-12-31", "2026-03-08"]) {
      expect(isoToLocalDateInput(localDateToISO(d))).toBe(d);
    }
  });

  it("anchors the stored instant to local midnight, not UTC midnight", () => {
    const dt = new Date(localDateToISO("2026-07-01"));
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(6);
    expect(dt.getDate()).toBe(1);
    expect(dt.getHours()).toBe(0);
  });

  it("reads a stored instant back as its local calendar date", () => {
    const dt = new Date(2026, 6, 1, 23, 30);
    expect(isoToLocalDateInput(dt.toISOString())).toBe("2026-07-01");
  });

  it("returns null/empty for blank or malformed values", () => {
    expect(localDateToISO("")).toBeNull();
    expect(localDateToISO(null)).toBeNull();
    expect(localDateToISO("not-a-date")).toBeNull();
    expect(isoToLocalDateInput("")).toBe("");
    expect(isoToLocalDateInput(null)).toBe("");
    expect(isoToLocalDateInput("not-a-date")).toBe("");
  });
});

// ── Who did it ────────────────────────────────────────────────────────────────

describe("logAuthor", () => {
  const members = [{ id: "u1", name: "Alex" }];

  it("names a member by their id", () => {
    expect(logAuthor({ done_by: "u1" }, members)).toMatchObject({ member: members[0], name: "Alex", sitter: false });
  });

  it("names a sitter's tick by the name they typed, not as a member", () => {
    expect(logAuthor({ done_by: "sitter", sitter_name: "Sam" }, members)).toEqual({ member: null, name: "Sam", sitter: true });
  });

  it("falls back to 'Sitter' for a sitter with no name, and 'Someone' for an unknown member", () => {
    expect(logAuthor({ done_by: "sitter", sitter_name: "" }, members).name).toBe("Sitter");
    expect(logAuthor({ done_by: "gone" }, members).name).toBe("Someone");
  });

  it("reaches activityStatusFromLog's lastBy", () => {
    const log = { done_by: "sitter", sitter_name: "Sam", done_at: new Date(Date.now() - 3600000).toISOString() };
    const s = activityStatusFromLog({ interval_days: 7 }, log, members);
    expect(s.lastBy).toMatchObject({ name: "Sam", member: null, sitter: true });
  });
});

describe("schedLabel", () => {
  it("says the interval in days", () => {
    expect(schedLabel({ interval_days: 7 })).toBe("Every 7 days");
    expect(schedLabel({ interval_days: 1 })).toBe("Every day");
    expect(schedLabel({ interval_days: 0.5 })).toBe("Every 0.5 days");
    expect(schedLabel({})).toBe("Every 7 days");
  });
});

describe("lastDoneToSave", () => {
  it("leaves the logs alone when the prefilled date is saved unchanged", () => {
    // A rename would otherwise move the newest log to local midnight.
    expect(lastDoneToSave("2026-10-04", "2026-10-04")).toBeNull();
  });

  it("saves a changed date, or one set on a form that had none, as local midnight", () => {
    expect(lastDoneToSave("2026-10-02", "2026-10-04")).toBe(localDateToISO("2026-10-02"));
    expect(lastDoneToSave("2026-10-02", "")).toBe(localDateToISO("2026-10-02"));
    expect(lastDoneToSave("2026-10-02", undefined)).toBe(localDateToISO("2026-10-02"));
  });

  it("treats a cleared field as leave alone", () => {
    expect(lastDoneToSave("", "2026-10-04")).toBeNull();
  });
});

// ── Sits ──────────────────────────────────────────────────────────────────────

describe("sitPlantIds", () => {
  it("reads the stored array and tolerates junk", () => {
    expect(sitPlantIds({ plant_ids: '["p1","p2"]' })).toEqual(["p1", "p2"]);
    expect(sitPlantIds({ plant_ids: "not json" })).toEqual([]);
    expect(sitPlantIds({ plant_ids: '{"a":1}' })).toEqual([]);
    expect(sitPlantIds({ plant_ids: '["p1",2]' })).toEqual(["p1"]);
    expect(sitPlantIds({})).toEqual([]);
  });
});

describe("sitIsOpen", () => {
  it("is open until the end date passes, and never when archived", () => {
    expect(sitIsOpen({ archived: 0, ends_on: "2026-10-10" }, "2026-10-10")).toBe(true);
    expect(sitIsOpen({ archived: 0, ends_on: "2026-10-10" }, "2026-10-11")).toBe(false);
    expect(sitIsOpen({ archived: 0, ends_on: "" }, "2026-10-11")).toBe(true);
    expect(sitIsOpen({ archived: 1, ends_on: "" }, "2026-10-11")).toBe(false);
  });
});

describe("plantsByLocation", () => {
  it("groups by location in first-seen order, keeps plant order, puts no location last", () => {
    const groups = plantsByLocation([
      { id: "a", location: "Kitchen" }, { id: "b", location: "" }, { id: "c", location: "Bedroom" },
      { id: "d", location: "Kitchen" }, { id: "e" }, { id: "f", location: " Bedroom " },
    ]);
    expect(groups.map(g => [g.location, g.plants.map(p => p.id)])).toEqual([
      ["Kitchen", ["a", "d"]], ["Bedroom", ["c", "f"]], ["", ["b", "e"]],
    ]);
  });

  it("is empty for no plants", () => {
    expect(plantsByLocation([])).toEqual([]);
  });

  it("treats spellings that differ only in case or spacing as one room, named as first typed", () => {
    const groups = plantsByLocation([
      { id: "a", location: "Living room" }, { id: "b", location: "Kitchen" },
      { id: "c", location: "living  room " }, { id: "d", location: "KITCHEN" },
    ]);
    expect(groups.map(g => [g.location, g.plants.map(p => p.id)])).toEqual([
      ["Living room", ["a", "c"]], ["Kitchen", ["b", "d"]],
    ]);
  });
});

describe("sitTaskRows", () => {
  const plants = [
    { id: "p1", name: "Monstera", location: "Living room" },
    { id: "p2", name: "Basil", location: "Kitchen" },
    { id: "p3", name: "Fern", location: "Living room" },
    { id: "p4", name: "Cactus", location: "" },
  ];
  const activities = [
    { id: "a1", plant_id: "p1", name: "Watering", interval_days: 7, sort_order: 0, created_at: "1" },
    { id: "a2", plant_id: "p1", name: "Fertilizing", interval_days: 30, sort_order: 1, created_at: "1" },
    { id: "a3", plant_id: "p2", name: "Watering", interval_days: 2, sort_order: 0, created_at: "1" },
    { id: "a4", plant_id: "p3", name: "Misting", interval_days: 1, sort_order: 0, created_at: "1" },
    { id: "a5", plant_id: "p4", name: "Watering", interval_days: 14, sort_order: 0, created_at: "1" },
  ];

  it("lists the chosen plants' activities room by room, with schedule and location", () => {
    const rows = sitTaskRows({ plant_ids: '["p4","p2","p3","p1"]' }, plants, activities);
    expect(rows).toEqual([
      { activity_id: "a1", plant_id: "p1", label: "Monstera · Watering", detail: "Every 7 days · Living room", sort_order: 0 },
      { activity_id: "a2", plant_id: "p1", label: "Monstera · Fertilizing", detail: "Every 30 days · Living room", sort_order: 1 },
      { activity_id: "a4", plant_id: "p3", label: "Fern · Misting", detail: "Every day · Living room", sort_order: 2 },
      { activity_id: "a3", plant_id: "p2", label: "Basil · Watering", detail: "Every 2 days · Kitchen", sort_order: 3 },
      { activity_id: "a5", plant_id: "p4", label: "Cactus · Watering", detail: "Every 14 days", sort_order: 4 },
    ]);
  });

  it("gives every plant in a room the same room name in its detail", () => {
    const rows = sitTaskRows({ plant_ids: '["x","y"]' }, [
      { id: "x", name: "Fern", location: "Hall" }, { id: "y", name: "Ivy", location: " hall" },
    ], [
      { id: "ax", plant_id: "x", name: "Watering", interval_days: 7, sort_order: 0, created_at: "1" },
      { id: "ay", plant_id: "y", name: "Watering", interval_days: 7, sort_order: 0, created_at: "1" },
    ]);
    expect(rows.map(r => r.detail)).toEqual(["Every 7 days · Hall", "Every 7 days · Hall"]);
  });

  it("orders rooms by the chosen plants only, and skips a plant that no longer exists", () => {
    // Monstera is not chosen, so the Kitchen comes first.
    const rows = sitTaskRows({ plant_ids: '["p2","p3","gone"]' }, plants, activities);
    expect(rows.map(r => r.activity_id)).toEqual(["a3", "a4"]);
  });
});

describe("sitTasksDrifted", () => {
  const want = [
    { activity_id: "a1", plant_id: "p1", label: "Monstera · Watering", detail: "Every 7 days · Living room" },
    { activity_id: "a2", plant_id: "p1", label: "Monstera · Fertilizing", detail: "Every 30 days · Living room" },
  ];
  const stored = want.map((r, i) => ({ ...r, id: `t${i}`, sit_id: "s1", sort_order: i }));

  it("is quiet when the stored checklist matches, whatever its row ids", () => {
    expect(sitTasksDrifted(stored, want)).toBe(false);
  });

  it("notices a rename, a schedule or location change, a reorder, an addition and a removal", () => {
    expect(sitTasksDrifted(stored, [{ ...want[0], label: "Monstera · Water" }, want[1]])).toBe(true);
    expect(sitTasksDrifted(stored, [want[0], { ...want[1], detail: "Every 30 days · Hall" }])).toBe(true);
    expect(sitTasksDrifted(stored, [want[1], want[0]])).toBe(true);
    expect(sitTasksDrifted(stored, [...want, { activity_id: "a3", plant_id: "p2", label: "x", detail: "" }])).toBe(true);
    expect(sitTasksDrifted(stored, [want[0]])).toBe(true);
  });
});

describe("sitTaskStatements", () => {
  const row = (i) => ({ activity_id: `a${i}`, plant_id: "p1", label: `T${i}`, detail: "", sort_order: i });
  let n = 0;
  const newId = () => `id-${n++}`;

  it("deletes the sit's rows, then inserts the new ones in order", () => {
    const [del, ins] = sitTaskStatements("s1", [row(0), row(1)], newId);
    expect(del).toEqual({ sql: "DELETE FROM app_plant_care__sit_tasks WHERE sit_id = ?", params: ["s1"] });
    expect(ins.sql).toMatch(/^INSERT INTO app_plant_care__sit_tasks \(id, sit_id, activity_id, plant_id, label, detail, sort_order\)/);
    expect(ins.params.filter((_, i) => i % 7 === 2)).toEqual(["a0", "a1"]);
    expect(ins.params.filter((_, i) => i % 7 === 3)).toEqual(["p1", "p1"]);
  });

  it("keeps every INSERT under D1's 100 bound parameters, in order", () => {
    const statements = sitTaskStatements("s1", Array.from({ length: 30 }, (_, i) => row(i)), newId);
    expect(statements).toHaveLength(4); // delete + 14 + 14 + 2
    for (const st of statements.slice(1)) {
      expect(st.params.length).toBeLessThanOrEqual(100);
      expect((st.sql.match(/\?/g) ?? []).length).toBe(st.params.length);
    }
    const order = statements.slice(1).flatMap((st) => st.params.filter((_, i) => i % 7 === 2));
    expect(order).toEqual(Array.from({ length: 30 }, (_, i) => `a${i}`));
  });

  it("with no tasks, only clears the checklist", () => {
    expect(sitTaskStatements("s1", [], newId)).toHaveLength(1);
  });
});

describe("sit dates", () => {
  it("formats a range, either end alone, or nothing", () => {
    expect(sitDates({ starts_on: "2026-10-03", ends_on: "2026-10-10" })).toBe(`${formatDay("2026-10-03")} – ${formatDay("2026-10-10")}`);
    expect(sitDates({ starts_on: "2026-10-03", ends_on: "" })).toBe(`From ${formatDay("2026-10-03")}`);
    expect(sitDates({ starts_on: "", ends_on: "2026-10-10" })).toBe(`Until ${formatDay("2026-10-10")}`);
    expect(sitDates({ starts_on: "", ends_on: "" })).toBe("");
    expect(formatDay("junk")).toBe("");
  });
});

describe("sitExpiryChoice", () => {
  it("lasts through the day after the sit ends, counted from now", () => {
    const now = new Date(2026, 9, 10, 12, 0); // noon on the last day, local
    const choice = sitExpiryChoice({ ends_on: "2026-10-10" }, now);
    expect(choice.hours).toBe(36); // to local midnight at the end of Oct 11
    expect(choice.label).toMatch(/^Until the day after the sit \(/);
  });

  it("is null with no end date, or once that moment has passed", () => {
    expect(sitExpiryChoice({ ends_on: "" }, new Date(2026, 9, 1))).toBeNull();
    expect(sitExpiryChoice({ ends_on: "2026-10-10" }, new Date(2026, 9, 12, 0, 0))).toBeNull();
    expect(sitExpiryChoice(undefined)).toBeNull();
  });
});

// ── Keeping a sit's checklist current ─────────────────────────────────────────

describe("parseCareSnapshot", () => {
  const ok = [{ rows: [{ id: "p1" }] }, { rows: [{ id: "a1" }] }, { rows: [] }, { rows: [] }];

  it("names the four reads", () => {
    expect(parseCareSnapshot(ok)).toEqual({ plants: [{ id: "p1" }], activities: [{ id: "a1" }], sits: [], tasks: [] });
  });

  it("throws on any missing read rather than calling it an empty table", () => {
    expect(() => parseCareSnapshot([])).toThrow();
    expect(() => parseCareSnapshot(undefined)).toThrow();
    expect(() => parseCareSnapshot(ok.slice(0, 3))).toThrow();
    expect(() => parseCareSnapshot([{ error: "boom" }, ...ok.slice(1)])).toThrow();
  });

  it("reads every table a checklist is built from, in one batch", () => {
    expect(CARE_SNAPSHOT_STATEMENTS.map(st => st.sql.match(/FROM (\w+)/)[1])).toEqual([
      "app_plant_care__plants", "app_plant_care__activities", "app_plant_care__sits", "app_plant_care__sit_tasks",
    ]);
  });
});

describe("refreshSitChecklists", () => {
  const TODAY = "2026-10-05";
  const plants = [{ id: "p1", name: "Monstera", location: "" }];
  const water = { id: "a1", plant_id: "p1", name: "Watering", interval_days: 7, sort_order: 0, created_at: "1" };
  const feed = { id: "a2", plant_id: "p1", name: "Fertilizing", interval_days: 30, sort_order: 1, created_at: "1" };
  const sit = { id: "s1", plant_ids: '["p1"]', archived: 0, ends_on: "2026-10-10" };
  const stored = (acts) => sitTaskRows(sit, plants, acts).map((r, i) => ({ ...r, id: `t${i}`, sit_id: "s1" }));
  let n = 0;
  const newId = () => `n${n++}`;

  it("never writes when the read fails", async () => {
    const write = vi.fn();
    await expect(refreshSitChecklists({
      read: async () => { throw new Error("offline"); }, write, today: TODAY, newId,
    })).rejects.toThrow("offline");
    expect(write).not.toHaveBeenCalled();
  });

  it("builds from what it read: another adult's new activity is added", async () => {
    const write = vi.fn(async () => {});
    const { changed } = await refreshSitChecklists({
      read: async () => ({ plants, activities: [water, feed], sits: [sit], tasks: stored([water]) }),
      write, today: TODAY, newId,
    });
    expect(changed).toBe(true);
    expect(write.mock.calls[0][0][1].params.filter((_, i) => i % 7 === 2)).toEqual(["a1", "a2"]);
  });

  it("rewrites a checklist when a plant moves room", async () => {
    const write = vi.fn(async () => {});
    const { changed } = await refreshSitChecklists({
      read: async () => ({ plants: [{ ...plants[0], location: "Hall" }], activities: [water], sits: [sit], tasks: stored([water]) }),
      write, today: TODAY, newId,
    });
    expect(changed).toBe(true);
    expect(write.mock.calls[0][0][1].params).toContain("Every 7 days · Hall");
  });

  it("leaves a matching checklist alone, and skips archived and ended sits", async () => {
    const write = vi.fn(async () => {});
    const { changed } = await refreshSitChecklists({
      read: async () => ({
        plants, activities: [water, feed],
        sits: [sit, { ...sit, id: "s2", archived: 1 }, { ...sit, id: "s3", ends_on: "2026-10-01" }],
        tasks: stored([water, feed]),
      }),
      write, today: TODAY, newId,
    });
    expect(changed).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("a refused write skips that sit only, and the sits after it still refresh", async () => {
    const write = vi.fn(async (statements) => {
      if (statements[0].params[0] === "s1") throw new Error("too many statements");
    });
    const { changed, failed } = await refreshSitChecklists({
      read: async () => ({ plants, activities: [water, feed], sits: [sit, { ...sit, id: "s2" }], tasks: stored([water]) }),
      write, today: TODAY, newId,
    });
    expect(failed).toEqual(["s1"]);
    expect(changed).toBe(true);
    expect(write.mock.calls.map(([st]) => st[0].params[0])).toEqual(["s1", "s2"]);
  });
});

describe("sitSyncBlocksShare", () => {
  it("allows sharing after a clean sync", () => {
    expect(sitSyncBlocksShare({ ok: true, failed: [] }, "s1")).toBe(false);
  });

  it("blocks when the read failed, and only the sit whose rewrite was refused", () => {
    expect(sitSyncBlocksShare({ ok: false, failed: [] }, "s1")).toBe(true);
    expect(sitSyncBlocksShare({ ok: true, failed: ["s2"] }, "s2")).toBe(true);
    expect(sitSyncBlocksShare({ ok: true, failed: ["s2"] }, "s1")).toBe(false);
    expect(sitSyncBlocksShare(undefined, "s1")).toBe(true);
  });
});

describe("planSitLinkRevoke", () => {
  const members = [{ id: "m-me", name: "Ada" }, { id: "m-sam", name: "Sam" }];
  const links = [
    { id: "l1", createdBy: "m-me" }, { id: "l2", createdBy: "m-sam" },
    { id: "l3", createdBy: "m-sam" }, { id: "l4", createdBy: "m-gone" },
  ];

  it("offers a member only their own links, naming each other holder once", () => {
    const plan = planSitLinkRevoke(links, { meId: "m-me", isAdmin: false, members });
    expect(plan.mine.map(l => l.id)).toEqual(["l1"]);
    expect(plan.holders).toEqual(["Sam", "another adult"]);
  });

  it("offers an admin every link", () => {
    const plan = planSitLinkRevoke(links, { meId: "m-me", isAdmin: true, members });
    expect(plan.mine).toHaveLength(4);
    expect(plan.holders).toEqual([]);
  });

  it("never matches a link to a member with no id", () => {
    expect(planSitLinkRevoke([{ id: "l9", createdBy: undefined }], { meId: undefined, isAdmin: false, members }).mine).toEqual([]);
  });
});

describe("the sitter page's task limit", () => {
  const TODAY = "2026-10-05";
  const parents = [{ id: "p1", name: "One", location: "" }];
  const acts = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, plant_id: "p1", name: `T${i}`, interval_days: 7, sort_order: i, created_at: "1" }));
  const sit = (id) => ({ id, plant_ids: '["p1"]', archived: 0, ends_on: "" });
  let n = 0;
  const newId = () => `n${n++}`;

  it("matches the hub's cap on a sitter page's options", () => {
    // MAX_SHAREABLE_SELECT_OPTIONS in hub-contract; the hub's share-plant-care
    // exercise test pins the two together.
    expect(SIT_MAX_TASKS).toBe(100);
  });

  it("writes a checklist of exactly the limit", async () => {
    const write = vi.fn(async () => {});
    const { changed, failed, tooMany } = await refreshSitChecklists({
      read: async () => ({ plants: parents, activities: acts(SIT_MAX_TASKS), sits: [sit("s1")], tasks: [] }),
      write, today: TODAY, newId,
    });
    expect(changed).toBe(true);
    expect(failed).toEqual([]);
    expect(tooMany).toEqual({});
    const written = write.mock.calls[0][0].slice(1).flatMap(st => st.params.filter((_, i) => i % 7 === 2));
    expect(written).toHaveLength(SIT_MAX_TASKS);
  });

  it("leaves a sit past the limit on its last checklist, and names it, while other sits refresh", async () => {
    const write = vi.fn(async () => {});
    const stored = [{ id: "t0", sit_id: "s-big", activity_id: "a0", plant_id: "p1", label: "old", detail: "", sort_order: 0 }];
    const { changed, failed, tooMany } = await refreshSitChecklists({
      read: async () => ({
        plants: [...parents, { id: "p2", name: "Two", location: "" }],
        activities: [...acts(SIT_MAX_TASKS + 1), { ...acts(1)[0], id: "b0", plant_id: "p2" }],
        sits: [sit("s-big"), { id: "s-small", plant_ids: '["p2"]', archived: 0, ends_on: "" }],
        tasks: stored,
      }),
      write, today: TODAY, newId,
    });
    expect(tooMany).toEqual({ "s-big": SIT_MAX_TASKS + 1 });
    expect(failed).toEqual(["s-big"]);
    // Nothing is written for the big sit (its stored checklist stays); the small one refreshes.
    expect(write.mock.calls.map(([st]) => st[0].params[0])).toEqual(["s-small"]);
    expect(changed).toBe(true);
  });

  it("a sit past the limit blocks sharing", () => {
    expect(sitSyncBlocksShare({ ok: true, failed: ["s-big"], tooMany: { "s-big": 101 } }, "s-big")).toBe(true);
  });
});

