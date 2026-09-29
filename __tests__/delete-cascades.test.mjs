/**
 * Deleting a plant used to be three sequential /api/db calls with the parent
 * going first, so a failure after the first left activities and logs orphaned
 * under a plant that no longer exists — invisible to the UI and to the
 * recurring_due digest. manifest delete_cascades now removes them inside the
 * parent's transactional batch.
 */
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));
const migrationsDir = join(__dirname, "../migrations");
const schema = readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort()
  .map(f => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");
const client = readFileSync(join(__dirname, "../src/index.html"), "utf-8");

describe("delete_cascades", () => {
  it("declares the plant's, the activity's and the sit's children", () => {
    expect(manifest.delete_cascades).toEqual({
      plants: [
        { table: "activities", foreign_key: "plant_id" },
        { table: "logs", foreign_key: "plant_id" },
        { table: "sit_tasks", foreign_key: "plant_id" },
      ],
      activities: [
        { table: "logs", foreign_key: "activity_id" },
        { table: "sit_tasks", foreign_key: "activity_id" },
      ],
      // Not logs: a sitter's ticks are care history and outlive the sit.
      sits: [{ table: "sit_tasks", foreign_key: "sit_id" }],
    });
  });

  it("every declared table and foreign key exists in the migrations", () => {
    for (const [parent, dependents] of Object.entries(manifest.delete_cascades)) {
      expect(schema).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS app_plant_care__${parent}\\s*\\(`));
      for (const dep of dependents) {
        expect(schema).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS app_plant_care__${dep.table}\\s*\\(`));
        expect(schema).toMatch(new RegExp(`\\b${dep.foreign_key}\\b`));
      }
    }
  });

  it("the client no longer deletes the children itself", () => {
    expect(client).not.toMatch(/DELETE FROM app_plant_care__activities WHERE plant_id/);
    expect(client).not.toMatch(/DELETE FROM app_plant_care__logs WHERE plant_id/);
    expect(client).toMatch(/DELETE FROM app_plant_care__plants WHERE id = \?/);
    expect(client).toMatch(/DELETE FROM app_plant_care__activities WHERE id = \?/);
  });
});
