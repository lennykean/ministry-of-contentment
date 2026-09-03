// Checks the Well-being Retreat evidence a player would follow: the intake sawtooth, the
// removal ledger, the pinned contentment index, the staff pin board, and the vitals records.
// Run with `npx tsx scripts/probe-hillside.ts`. Exits non-zero when the authored chain breaks.
import { strict as assert } from "node:assert";
import campaign from "../content/campaign.json";
import { buildQueryContext } from "../src/game";
import { loadCampaign } from "../src/loader";
import { executeQuery } from "../src/query";

const index = loadCampaign(campaign as never);

function query(datasetId: string, language: "promql" | "logql", expression: string, mode: "instant" | "records" = "instant") {
  const dataset = index.datasets.get(datasetId)!;
  const times = dataset.series[0]!.samples.map((sample) => Date.parse(sample.time) / 1000);
  const timestamp = times[times.length - 1]!;
  const start = times[0]! - 600;
  const controls = mode === "records"
    ? { timestamp, start, end: timestamp + 600, lookback: timestamp + 600 - start, direction: "backward" as const, limit: 50, visualization: "logs" as const }
    : { timestamp, visualization: "table" as const };
  const run = executeQuery(language, expression, buildQueryContext(index, datasetId, controls));
  assert.ok(run.ok, `${datasetId} ${expression}: ${run.ok ? "" : run.error.message}`);
  return run.result;
}

const scalarAt = (shift: number, expression: string): number => {
  const result = query(`dataset.shift-${String(shift).padStart(2, "0")}`, "promql", expression);
  assert.equal(result.type, "instant-vector", `${expression} should return an instant vector`);
  assert.equal(result.series.length, 1, `${expression} should return one series in shift ${shift}`);
  return result.series[0]!.value as number;
};

const recordsAt = (shift: number, selector: string): Array<Record<string, unknown>> =>
  (query(`dataset.shift-${String(shift).padStart(2, "0")}`, "logql", selector, "records") as { streams: Array<{ records: Array<{ line: string }> }> })
    .streams.flatMap((stream) => stream.records.map((record) => JSON.parse(record.line)));

const demand = 'ministry_facility_demand{facility="hillside-retreat"}';

// Intake fills the retreat to its stated capacity, then the population decays over the cycle.
assert.equal(scalarAt(17, demand), 40, "shift 17 is an intake day");
assert.equal(scalarAt(38, demand), 40, "shift 38 is the next intake day");
assert.equal(scalarAt(17, `${demand} / on (district, facility, service) ministry_facility_capacity{facility="hillside-retreat"}`), 1, "intake fills capacity exactly");
for (const [shift, expected] of [[15, 4], [25, 16], [37, 4], [48, 13]] as const) {
  assert.equal(scalarAt(shift, demand), expected, `shift ${shift} sits at the authored point on the sawtooth`);
}
assert.ok(scalarAt(16, demand) >= 3 && scalarAt(16, demand) <= 5, "the cycle bottoms out between 3 and 5");

// The removal ledger climbs on rest and programme completion while relocation stays flat.
const removal = (shift: number, reason: string) => scalarAt(shift, `ministry_registry_removals_total{district="hillside",reason="${reason}"}`);
for (const reason of ["programme-complete", "rest"]) {
  assert.ok(removal(48, reason) > removal(13, reason) + 20, `${reason} climbs steadily across the campaign`);
}
assert.ok(removal(48, "relocation") - removal(13, "relocation") <= 1, "relocation barely moves");

// The retreat reports perfect contentment throughout.
for (const shift of [13, 30, 48]) assert.equal(scalarAt(shift, 'ministry_contentment_index{facility="hillside-retreat"}'), 100, "the retreat is pinned at 100");

// The Assurance staff pin board drops by one inside shift 15's own window.
const staff = 'ministry_active_pins{district="south",cohort="civic",state="healthy"}';
assert.equal(scalarAt(14, staff), 4, "four staff pins before the retirement");
assert.equal(scalarAt(15, staff), 3, "three staff pins after it");

// Rest clusters at the end of a stay and is absent in mid-cycle datasets.
const restDays = recordsAt(15, '{facility="hillside-retreat"}').filter((record) => record.outcome === "rest").map((record) => record.day as number);
assert.ok(restDays.length > 0 && restDays.every((day) => day >= 17 && day <= 21), "rest clusters around days 17 to 21");
assert.ok(recordsAt(25, '{facility="hillside-retreat"}').every((record) => record.outcome !== "rest"), "no rest records mid-cycle");
assert.ok(recordsAt(15, '{facility="hillside-retreat"}').some((record) => record.guest === "drost-e" && record.day === 19 && record.outcome === "rest"),
  "the shift 15 memo's day 19 completion is present in the records");

console.log("hillside evidence chain intact");
