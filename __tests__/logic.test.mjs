import { describe, it, expect } from "vitest";
import { formatDuration, statusColor, activityStatusFromLog, localDateToISO, isoToLocalDateInput } from "../src/logic.js";

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
