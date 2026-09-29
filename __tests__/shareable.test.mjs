import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));
const page = readFileSync(join(__dirname, "../src/index.html"), "utf-8");
const migrationsDir = join(__dirname, "../migrations");
const schema = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()
  .map(f => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");

const sit = manifest.shareable?.sit;

/**
 * A share link is an anonymous read that skips row policies, and a writable
 * one an anonymous INSERT, so the declared block is the whole public surface.
 * These pin it to what the panel tells the adult minting the link. The hub's
 * own share-plant-care exercise test runs this block against real SQLite.
 */
describe("shareable.sit", () => {
  it("anchors on the sits table and hides an archived sit", () => {
    expect(sit.table).toBe("sits");
    expect(sit.id_column ?? "id").toBe("id");
    expect(sit.title_column).toBe("title");
    expect(sit.visible_where).toEqual({ column: "archived", values: ["0"] });
    expect(sit.mint_roles ?? "adult").toBe("adult");
  });

  // The panel says: dates, instructions, tasks with schedules and last done.
  // Never who made the sit, and never which member did a task.
  it("projects only the sit's dates and instructions, and the sitter's own ticks", () => {
    expect(sit.columns.map(c => c.column)).toEqual(["starts_on", "ends_on", "instructions"]);
    expect(sit.feed.table).toBe("logs");
    expect(sit.feed.fk_column).toBe("sit_id");
    expect(sit.feed.columns.map(c => c.column)).toEqual(["task_label", "sitter_name", "done_at"]);
    const surface = JSON.stringify(sit);
    expect(surface).not.toContain("created_by");
    expect(surface).not.toContain("plant_ids");
  });

  it("is a checklist that writes into logs the way a member's tap does", () => {
    const { submit } = sit;
    expect(submit.layout).toEqual({ kind: "checklist", last_done: "all" });
    expect(submit.table).toBe("logs");
    expect(submit.fk_column).toBe("sit_id");
    expect(submit.fixed_values).toEqual({ done_by: "sitter" });
    expect(submit.timestamp_columns).toEqual(["done_at"]);
    expect(submit.fields.map(f => [f.column, f.type, f.required])).toEqual([
      ["sitter_name", "text", true],
      ["activity_id", "select", true],
    ]);
    // The submitted value is the real activity id, so last-done, the digest
    // and the glance need no translation; the plant and label are copied from
    // the sit's own task row, never taken from the visitor.
    expect(submit.fields[1].values_from).toEqual({
      table: "sit_tasks", fk_column: "sit_id", id_column: "activity_id",
      label_column: "label", detail_column: "detail",
      copy: { plant_id: "plant_id", task_label: "label" },
    });
    expect(submit.event).toBeUndefined();
  });

  it("every column it names exists in the migrations", () => {
    const cols = ["title", "starts_on", "ends_on", "instructions", "archived", "plant_ids",
      "sit_id", "sitter_name", "task_label", "label", "detail", "activity_id", "plant_id", "done_by", "done_at"];
    for (const c of cols) expect(schema, c).toMatch(new RegExp(`\\b${c}\\b`));
  });

  it("indexes what the hub reads per request", () => {
    expect(schema).toMatch(/ON app_plant_care__sit_tasks \(sit_id, activity_id\)/);
    expect(schema).toMatch(/ON app_plant_care__logs \(sit_id, done_at\)/);
    expect(schema).toMatch(/ON app_plant_care__logs\s*\(activity_id/);
  });

  // `_on` is not a plaintext suffix (the codec's are _id/_at/_date/_by/_time),
  // so the sit's dates must be declared, like medication-tracker's: a date is
  // not confidential, and an encrypted one can never be sorted or compared in
  // SQL. The title and instructions (a door code) stay encrypted.
  it("stores the sit's dates in plaintext and its words encrypted", () => {
    expect(manifest.db_plaintext_columns).toEqual(expect.arrayContaining(["starts_on", "ends_on", "archived"]));
    expect(manifest.db_plaintext_columns).not.toContain("title");
    expect(manifest.db_plaintext_columns).not.toContain("instructions");
  });

  it("keeps sits and their tasks adult-only to write", () => {
    expect(manifest.row_policies.sits).toEqual({ kind: "adult_writable" });
    expect(manifest.row_policies.sit_tasks).toEqual({ kind: "adult_writable" });
  });

  it("is the item type the page mints, as a writable link", () => {
    expect(Object.keys(manifest.shareable)).toEqual(["sit"]);
    expect(page).toMatch(/itemType:\s*"sit"/);
    expect(page).toMatch(/writable:\s*true/);
  });
});

describe("sitter ticks in the app", () => {
  it("the history prune never deletes a sitter's tick", () => {
    expect(page).toMatch(/DELETE FROM app_plant_care__logs WHERE activity_id = \? AND id != \? AND sit_id = ''/);
  });

  it("editing last done never rewrites a sitter's tick", () => {
    expect(page).toMatch(/SELECT id FROM app_plant_care__logs WHERE activity_id = \? AND sit_id = '' ORDER BY done_at DESC LIMIT 1/);
  });

  it("the activity form saves last done only when it changed", () => {
    expect(page).toMatch(/data-initial="\$\{lastDoneVal\}"/);
    expect(page).toMatch(/lastDoneToSave\(lastDoneEl\.value, lastDoneEl\.dataset\.initial\)/);
    expect(page).not.toMatch(/localDateToISO\(lastDoneVal\)/);
  });
});

/** One window.* handler's body, from its declaration to the next one. */
function handler(name) {
  const start = page.indexOf(`window.${name} = async function`);
  expect(start, name).toBeGreaterThan(-1);
  const next = page.indexOf("\nwindow.", start + 1);
  return page.slice(start, next === -1 ? undefined : next);
}

describe("sit links in the app", () => {
  it("refuses to share a sit whose checklist could not be refreshed", () => {
    const body = handler("shareSit");
    expect(body).toMatch(/const result = await syncSits\(\);/);
    const gate = body.indexOf("sitSyncBlocksShare(result, id)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf("shareUi.open("));
  });

  it("the sync never rejects, so the gate always gets a result", () => {
    expect(page).toMatch(/sitSync\.then\(refreshOpenSits\)\.catch\(\(\) => \(\{ ok: false, failed: \[\], tooMany: \{\} \}\)\)/);
  });

  it("an archived sit offers Revoke links, never the share panel", () => {
    expect(page).toMatch(/\$\{!archived && share\.enabled \? `[^`]*shareSit\(/);
    expect(page).toMatch(/\$\{archived && share\.enabled \? `[^`]*revokeSitLinks\(/);
  });

  it("revokes only the links this member may revoke", () => {
    const body = handler("revokeSitLinks");
    expect(body).toMatch(/planSitLinkRevoke\(links, \{ meId: ME\?\.id, isAdmin: window\.__IS_ADMIN === true, members \}\)/);
    expect(body).toMatch(/for \(const link of mine\)/);
    expect(body).not.toMatch(/for \(const link of links\)/);
    // A refused list read is not "no links".
    expect(body).toMatch(/status\.limits === null/);
  });
});

describe("the sit form", () => {
  it("offers plants grouped by location, so a room goes in together", () => {
    expect(page).toMatch(/const groups = plantsByLocation\(plants\);/);
    expect(page).toMatch(/onclick="toggleSitGroup\(this\)"/);
    expect(page).toMatch(/window\.toggleSitGroup = function/);
  });
});

describe("page safety", () => {
  it("a refused log write takes the optimistic tick back off", () => {
    expect(page).toMatch(/const res = await db\(`INSERT INTO app_plant_care__logs[^\n]*\n\s*if \(res\?\.error\) throw new Error\(res\.error\);/);
  });

  it("escapes a stored emoji or icon wherever it is rendered", () => {
    expect(page).not.toMatch(/\$\{p\.emoji\} \$\{esc\(p\.name\)\}/);
    expect(page).not.toMatch(/value="\$\{sel\}"/);
  });
});

describe("the sitter page's task limit in the page", () => {
  it("refuses to save a sit past SIT_MAX_TASKS, before writing anything", () => {
    const body = handler("submitSit");
    const check = body.indexOf("if (rows.length > SIT_MAX_TASKS)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(body.indexOf("await dbBatch(statements)"));
    expect(page).not.toMatch(/MAX_BATCH_STATEMENTS/);
  });

  it("says why Share is refused for a sit past the limit, before the generic gate", () => {
    const body = handler("shareSit");
    const tooMany = body.indexOf("if (result.tooMany?.[id])");
    expect(tooMany).toBeGreaterThan(-1);
    expect(tooMany).toBeLessThan(body.indexOf("sitSyncBlocksShare(result, id)"));
    expect(body.indexOf("sitSyncBlocksShare(result, id)")).toBeLessThan(body.indexOf("shareUi.open("));
  });

  it("warns on the sit's row, from the last refresh", () => {
    expect(page).toMatch(/sitTooMany = tooMany;/);
    expect(page).toMatch(/sitTooMany\[sit\.id\] \? `<span class="form-error" data-testid="sit-too-many">/);
  });
});

