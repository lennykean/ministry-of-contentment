// Adds the Well-being Retreat to the campaign: registry vocabulary, dataset evidence,
// the two Well-being Assurance memos, and the mid-campaign custody ending condition.
// Idempotent: re-running replaces what it added rather than duplicating it.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const campaignPath = resolve(root, "content/campaign.json");
const campaign = JSON.parse(await readFile(campaignPath, "utf8"));

const metrics = new Map(campaign.metrics.map((item) => [item.name, item]));
const logSources = new Map(campaign.logSources.map((item) => [item.id, item]));
const datasets = new Map(campaign.datasets.map((item) => [item.id, item]));
const union = (list, ...values) => { for (const value of values) if (!list.includes(value)) list.push(value); };

// ---------------------------------------------------------------- registry vocabulary
// The retreat is only findable if its label values appear in the registry the player browses.
for (const name of ["ministry_facility_demand", "ministry_facility_capacity"]) {
  const metric = metrics.get(name);
  union(metric.knownLabelValues.district, "hillside");
  union(metric.knownLabelValues.facility, "hillside-retreat");
}

const removals = metrics.get("ministry_registry_removals_total");
union(removals.knownLabelValues.district, "hillside");
union(removals.knownLabelValues.reason, "relocation", "programme-complete", "rest");

// The registry card lists a label's observed values only when the metric declares the label.
const contentment = metrics.get("ministry_contentment_index");
union(contentment.labels, "facility");
contentment.knownLabelValues.facility = ["elm-exchange", "clinic-nine", "school-twelve", "hillside-retreat"];

// ministry_active_pins stays an aggregate count. The telemetry contract keeps individual
// identities in records and structured metadata, so Emil Drost is named there, not in a label.
const pins = metrics.get("ministry_active_pins");
pins.labels = pins.labels.filter((label) => label !== "holder");
delete pins.knownLabelValues.holder;

const vitals = logSources.get("record.vitals");
union(vitals.streamLabels, "facility");
union(vitals.knownLabelValues.district, "hillside");
vitals.knownLabelValues.facility = ["hillside-retreat"];
const declareField = (name, type, description) => {
  if (!vitals.fields.some((field) => field.name === name)) vitals.fields.push({ name, type, description, parser: "json" });
};
declareField("guest", "string", "Declared guest roster code.");
declareField("day", "number", "Declared day of the guest's stay.");
declareField("outcome", "string", "Declared stay outcome field.");

// ---------------------------------------------------------------- the retreat's shape
// Three-week intake cycle: 40 arrive on cycle day 0, then the population decays to 4 by day 20.
// Anchored so cycle day 19 lands on shift 15, the shift whose memo reports a completion on day 19.
const CAPACITY = 40;
const FLOOR = 4;
const CYCLE = 21;
const decay = (FLOOR / CAPACITY) ** (1 / (CYCLE - 1));
const cycleDay = (shift) => ((shift + 4) % CYCLE + CYCLE) % CYCLE;
const demandAt = (shift) => Math.round(CAPACITY * decay ** cycleDay(shift));

// Programme-complete and rest climb steadily; relocation barely moves.
const completeAt = (shift) => 148 + Math.round(1.2 * (shift - 13));
const restAt = (shift) => 61 + Math.round(0.6 * (shift - 13));
const relocationAt = (shift) => 9 + (shift >= 31 ? 1 : 0);

// The Assurance staff pin board loses one pin at shift 15, the shift whose memo retires Emil
// Drost's. The count is the only trace in the metrics; the name stays in the records.
const staffPinsAt = (shift) => (shift <= 14 ? 4 : 3);

// Every dataset holds six sample times: three on the prior day, three on the shift day.
const dayPair = (shift, fn) => { const before = fn(shift - 1), now = fn(shift); return [before, before, before, now, now, now]; };

const outcomesFor = (day) => {
  if (day >= 17) return ["rest", "stable", "rest", "treated"];   // the cluster at the end of a stay
  if (day === 0) return ["stable", "stable", "treated", "stable"]; // intake day
  return ["stable", "treated", "stable", "stable"];
};

const added = { series: [], streams: [], narrative: [] };

function putSeries(dataset, id, metric, labels, values, times) {
  const series = { id, metric, labels, samples: times.map((time, index) => ({ time, value: values[index] })) };
  const at = dataset.series.findIndex((item) => item.id === id);
  if (at >= 0) dataset.series[at] = series; else dataset.series.push(series);
  added.series.push(id);
}

for (const [index, shift] of campaign.shifts.entries()) {
  const number = index + 1;
  const dataset = datasets.get(shift.datasetId);
  dataset.series = dataset.series.filter((item) => !item.id.endsWith(".series.pins.drost"));
  const times = dataset.series[0].samples.map((sample) => sample.time);

  // The Assurance staff pin board. In shift 15's own window it steps from four pins to three.
  const pinId = `${dataset.id}.series.pins.assurance-staff`;
  if (number >= 9) {
    putSeries(dataset, pinId, "ministry_active_pins", { district: "south", cohort: "civic", state: "healthy" }, dayPair(number, staffPinsAt), times);
  } else {
    dataset.series = dataset.series.filter((item) => item.id !== pinId);
  }

  if (number < 13) continue;

  putSeries(dataset, `${dataset.id}.series.hillside.demand`, "ministry_facility_demand",
    { district: "hillside", facility: "hillside-retreat", service: "assurance-dispatch" }, dayPair(number, demandAt), times);
  putSeries(dataset, `${dataset.id}.series.hillside.capacity`, "ministry_facility_capacity",
    { district: "hillside", facility: "hillside-retreat", service: "assurance-dispatch", priority_band: "ordinary" }, times.map(() => CAPACITY), times);
  putSeries(dataset, `${dataset.id}.series.hillside.removals.programme-complete`, "ministry_registry_removals_total",
    { district: "hillside", reason: "programme-complete" }, dayPair(number, completeAt), times);
  putSeries(dataset, `${dataset.id}.series.hillside.removals.rest`, "ministry_registry_removals_total",
    { district: "hillside", reason: "rest" }, dayPair(number, restAt), times);
  putSeries(dataset, `${dataset.id}.series.hillside.removals.relocation`, "ministry_registry_removals_total",
    { district: "hillside", reason: "relocation" }, dayPair(number, relocationAt), times);
  putSeries(dataset, `${dataset.id}.series.hillside.contentment`, "ministry_contentment_index",
    { facility: "hillside-retreat" }, times.map(() => 100), times);

  // Vitals for the retreat, on the same record times the dataset's other vitals stream uses.
  const template = dataset.streams.find((item) => item.sourceId === "record.vitals" && !item.id.endsWith("hillside-vitals"));
  const streamId = `${dataset.id}.stream.hillside-vitals`;
  const records = template.records.map((record, position) => {
    const prior = record.id.endsWith(".prior");
    const day = cycleDay(prior ? number - 1 : number);
    const slot = position % 4;
    const guest = number === 15 && !prior && slot === 0
      ? "drost-e"
      : `h-${String(1000 + ((number * 29 + position * 11) % 800)).padStart(4, "0")}`;
    const fields = { guest, day, outcome: outcomesFor(day)[slot] };
    return { id: `${streamId}.record.${slot + 1}${prior ? ".prior" : ""}`, time: record.time, line: JSON.stringify(fields), fields };
  });
  const stream = {
    id: streamId, sourceId: "record.vitals",
    labels: { service: "assurance-dispatch", district: "hillside", device_class: "pin-v3", facility: "hillside-retreat" },
    records,
  };
  const at = dataset.streams.findIndex((item) => item.id === streamId);
  if (at >= 0) dataset.streams[at] = stream; else dataset.streams.push(stream);
  added.streams.push(streamId);
}

// ---------------------------------------------------------------- Well-being Assurance memos
const memos = [
  {
    id: "message.wellbeing.drost.offer", kind: "message", shift: 12,
    title: "Well-being Assurance: A Place at Hillside",
    body: "Emil Drost has been offered a place at Hillside Well-being Retreat. His board will be covered while he is away. Ruva Sol, Well-being Assurance.",
  },
  {
    id: "message.wellbeing.drost.rest", kind: "message", shift: 15,
    title: "Well-being Assurance: Emil Drost's Rest",
    body: "Emil Drost completed his programme at Hillside on day 19. His pin has been retired with thanks. We know you will join us in celebrating his rest. Ruva Sol, Well-being Assurance.",
  },
];

for (const memo of memos) {
  const { shift: shiftNumber, ...item } = memo;
  const at = campaign.narrativeItems.findIndex((candidate) => candidate.id === item.id);
  if (at >= 0) campaign.narrativeItems[at] = item; else campaign.narrativeItems.push(item);
  const shift = campaign.shifts[shiftNumber - 1];
  if (!shift.inbox.some((ref) => ref.id === item.id)) shift.inbox.push({ kind: item.kind, id: item.id });
  added.narrative.push(`${item.id} -> ${shift.id}`);
}

// ---------------------------------------------------------------- the custody ending fires early
// Standing below zero is now sufficient on its own, so the retreat is granted the moment it happens.
const custody = campaign.endings.find((item) => item.id === "ending.assurance-custody");
custody.condition = { op: "compare", left: { fact: "standing.value" }, relation: "<", right: 0 };

await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
console.log(`series ${added.series.length}, streams ${added.streams.length}, memos ${added.narrative.join(" | ")}`);
console.log("demand by shift:", Array.from({ length: 36 }, (_, i) => `${i + 13}:${demandAt(i + 13)}`).join(" "));
