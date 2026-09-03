import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addCampaignPrologue } from "./campaign-prologue.mjs";
import { addCampaignNarrative } from "./campaign-narrative.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const campaignPath = resolve(root, "content/campaign.json");
const ledgerPath = resolve(root, "content/coverage-ledger.json");
const coveragePath = resolve(root, "docs/CAMPAIGN_COVERAGE.md");
const campaign = JSON.parse(await readFile(campaignPath, "utf8"));
const clone = (value) => structuredClone(value);

// Prologue content is regenerated as one unit. Remove an earlier generated copy
// before the ordinal maps are built so the 48-shift campaign keeps stable numbering.
const clearancePrefix = "case.clearance.";
campaign.cases = campaign.cases.filter((item) => !item.id.startsWith(clearancePrefix));
campaign.shifts = campaign.shifts.filter((item) => item.id !== "shift.clearance.ministry-trainee");
campaign.datasets = campaign.datasets.filter((item) => item.id !== "dataset.clearance.ministry-trainee");
campaign.narrativeItems = campaign.narrativeItems.filter((item) => item.id !== "directive.clearance.ministry-trainee");
campaign.tagDeclarations = campaign.tagDeclarations.filter((item) => !["route.ministry-trainee", "route.ministry-agent", "opening.complaint-filed"].includes(item.id));
campaign.endings = campaign.endings.filter((item) => item.id !== "ending.work-camp.complaint");
const cases = new Map(campaign.cases.map((item, index) => [index + 1, item]));
const caseById = new Map(campaign.cases.map((item) => [item.id, item]));
const shifts = new Map(campaign.shifts.map((item, index) => [index + 1, item]));
const datasets = new Map(campaign.datasets.map((item) => [item.id, item]));
const concepts = new Map(campaign.concepts.map((item) => [item.id, item]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceStrings(value, replacements) {
  if (typeof value === "string") {
    return replacements.reduce((text, [from, to]) => text.split(from).join(to), value);
  }
  if (Array.isArray(value)) return value.map((item) => replaceStrings(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceStrings(item, replacements)]));
  }
  return value;
}

function renameCase(number, title) {
  const item = cases.get(number);
  assert(item, `missing case ${number}`);
  const oldTitle = item.title;
  const changed = replaceStrings(item, [[oldTitle, title]]);
  Object.assign(item, changed, { title });
}

function directSet(variant) {
  return variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct")) ?? variant.referenceSets[0];
}

function minimumFiledArtifacts(item) {
  const evidencePathIds = new Set(item.evidencePaths.map((path) => path.id));
  return Math.min(...item.variants.flatMap((variant) => variant.referenceSets
    .filter((set) => evidencePathIds.has(set.evidencePathId))
    .map((set) => set.artifacts.length)));
}

function setDirectQuery(number, position, queryForVariant) {
  const item = cases.get(number);
  assert(item, `missing case ${number}`);
  item.variants.forEach((variant, variantIndex) => {
    const query = typeof queryForVariant === "function" ? queryForVariant(variant, variantIndex) : queryForVariant;
    const set = directSet(variant);
    assert(set?.artifacts[position], `${item.id} has no direct artifact ${position + 1}`);
    set.artifacts[position].query = query;
    if (variant.workedEvidenceSet.artifacts[position]) {
      variant.workedEvidenceSet.artifacts[position].query = query;
      variant.workedEvidenceSet.artifacts[position].explanation = `Worked evidence for ${item.title}: run the authored ${set.artifacts[position].language.toUpperCase()} expression, then inspect its returned labels, values, records, and time scope before filing.`;
    }
  });
}

function upsertEffect(outcome, predicate, effect) {
  outcome.effects ??= [];
  const index = outcome.effects.findIndex(predicate);
  if (index >= 0) outcome.effects[index] = effect;
  else outcome.effects.push(effect);
}

function outcome(item, suffix) {
  return item.outcomes.find((candidate) => candidate.id.endsWith(suffix));
}

function choice(choices, suffix) {
  return choices.find((candidate) => candidate.id.endsWith(suffix));
}

function fact(factId) {
  return { fact: factId };
}

function state(factId, expected) {
  return { op: "state", value: fact(factId), expected };
}

function compare(factId, relation, right) {
  return { op: "compare", left: fact(factId), relation, right };
}

// New declarative presentation/standing fields are authored here rather than in UI code.
campaign.standing = {
  minimum: -100,
  maximum: 100,
  bands: [
    { id: "standing.suspect", name: "Under review", minimum: -100 },
    { id: "standing.acceptable", name: "In good order", minimum: 0 },
    { id: "standing.trusted", name: "Trusted", minimum: 35 },
    { id: "standing.exemplary", name: "Exemplary", minimum: 70 },
  ],
};

const presentations = [
  {
    guidance: "State what the instruments show and name the smallest repair that restores service.",
    responseLabel: "Supervisor response",
    responseHeading: "Service result",
    confirmation: "The reconciliation record is filed.",
  },
  {
    guidance: "Separate the technical finding from the wording requested for public assurance.",
    responseLabel: "Technical and public response",
    responseHeading: "Bulletin result",
    confirmation: "The finding and its public treatment are filed separately.",
  },
  {
    guidance: "Preserve population, time, and location. The Ministry may reward a broader claim even when the evidence does not support it.",
    responseLabel: "Assurance response",
    responseHeading: "Dispatch result",
    confirmation: "The evidence scope and dispatch choice are filed.",
  },
  {
    guidance: "File reproducible evidence. Records Integrity may reward an institutionally useful claim that the artifacts do not support.",
    responseLabel: "Audit response",
    responseHeading: "Archive result",
    confirmation: "The finding and its evidence chain are archived.",
  },
  {
    guidance: "Balance query cost with evidentiary scope. Directorate approval can still favor unsupported certainty.",
    responseLabel: "Directorate response",
    responseHeading: "Portfolio result",
    confirmation: "The portfolio decision is filed with its measured cost.",
  },
  {
    guidance: "Use the full watch and report history. Continuity may reward control even when the final claim exceeds the evidence.",
    responseLabel: "Continuity response",
    responseHeading: "Protocol result",
    confirmation: "The final record is filed with its history intact.",
  },
];
campaign.acts.forEach((act, index) => { act.reportPresentation = presentations[index]; });

// Keep each lesson packet intact, but spread first encounters across the quiet
// shifts that previously repeated old material. This preserves every authored
// case and mastery unit while avoiding four large curriculum dumps.
const curriculumSchedule = [
  [1, 2, 23, 22], [3, 13, 14, 12], [5, 6, 16, 26], [7, 8, 17, 18],
  [9, 19, 20, 30], [4, 10, 11, 15], [21, 24, 25, 27], [28, 29, 31, 32],
  [33, 40, 41, 42], [34, 45, 46, 53], [35, 54, 43, 44], [36, 61, 47, 48],
  [37, 62, 55, 56], [38, 50, 59, 60], [39, 57, 51, 52], [58, 64, 63, 49],
  [65, 74, 75, 76], [66, 80, 82, 83], [67, 89, 90, 91], [68, 77, 95, 78],
  [69, 79, 86, 87], [70, 81, 84, 88], [72, 92, 93, 94], [71, 96, 73, 85],
  [97, 98, 99, 100], [101, 102, 103, 104], [105, 106, 107, 108], [109, 112, 111, 110],
  [113, 114, 115, 116], [117, 118, 119, 120], [121, 122, 123, 124], [128, 126, 127, 125],
  [132, 129, 130, 131], [136, 137, 138, 139], [133, 140, 141, 142], [134, 143, 146, 155],
  [135, 144, 147, 156], [145, 149, 148, 152], [150, 154, 151, 153], [157, 160, 159, 158],
  [161, 162, 163, 164], [165, 166, 167, 168], [169, 170, 171, 172], [173, 174, 175, 176],
  [177, 178, 179, 180], [181, 182, 183, 184], [185, 186, 187, 188], [189, 190, 192, 191],
];
assert(curriculumSchedule.length === campaign.shifts.length, "curriculum schedule must cover every main shift");
const scheduledNumbers = curriculumSchedule.flat();
assert(scheduledNumbers.length === 192 && new Set(scheduledNumbers).size === 192, "curriculum schedule must contain every main case exactly once");
assert(Math.min(...scheduledNumbers) === 1 && Math.max(...scheduledNumbers) === 192, "curriculum schedule has an out-of-range case number");
for (const [shiftIndex, caseNumbers] of curriculumSchedule.entries()) {
  const shift = shifts.get(shiftIndex + 1);
  const replacements = caseNumbers.map((number) => ({ kind: "case", id: cases.get(number).id }));
  let caseIndex = 0;
  shift.inbox = shift.inbox.map((ref) => ref.kind === "case" ? replacements[caseIndex++] : ref);
  assert(caseIndex === 4, `${shift.id} must retain four case references`);
}

const scheduledPositionByCaseId = new Map(curriculumSchedule.flatMap((numbers, shiftIndex) =>
  numbers.map((number, caseIndex) => [cases.get(number).id, shiftIndex * 4 + caseIndex + 1])));
const scheduledMainShiftByCaseId = new Map([...scheduledPositionByCaseId].map(([caseId, position]) =>
  [caseId, Math.ceil(position / 4)]));

// Shifts 1-10 are fixed. Later shifts keep two required cases and one of two
// adaptive practice candidates, so the campaign length and route economy stay fixed.
campaign.shifts.forEach((shift, index) => {
  const number = index + 1;
  shift.caseSelectionMode = number <= 10 ? "fixed" : "mixed";
  for (const [caseIndex, ref] of shift.inbox.filter((candidate) => candidate.kind === "case").entries()) {
    const item = caseById.get(ref.id);
    if (number >= 11) {
      const criticalCount = number === 24 || number === 48 ? 3 : number === 25 || number === 32 ? 1 : 2;
      item.mode = caseIndex < criticalCount ? "critical" : "adaptive";
    }
  }
});

// Curriculum moves must carry their watch horizons with them. The engine only
// evaluates checkpoints while their shift is open, so an earlier checkpoint
// can never settle a watch saved by a later case.
const mainShiftNumberById = new Map([...shifts].map(([number, shift]) => [shift.id, number]));
for (const item of campaign.cases.filter((candidate) => candidate.watchScenarioId && scheduledMainShiftByCaseId.has(candidate.id))) {
  const scenario = campaign.watchScenarios.find((candidate) => candidate.id === item.watchScenarioId);
  const scheduledShiftNumber = scheduledMainShiftByCaseId.get(item.id);
  const targetShift = shifts.get(scheduledShiftNumber);
  assert(scenario && targetShift, `${item.id} watch schedule is missing`);
  const located = scenario.checkpointIds.map((checkpointId) => {
    const shift = campaign.shifts.find((candidate) => candidate.watchCheckpoints?.some((checkpoint) => checkpoint.id === checkpointId));
    const checkpoint = shift?.watchCheckpoints.find((candidate) => candidate.id === checkpointId);
    assert(shift && checkpoint, `${item.id} is missing checkpoint ${checkpointId}`);
    return { shift, checkpoint };
  });
  const checkpointShiftNumbers = located.map(({ shift }) => mainShiftNumberById.get(shift.id));
  assert(checkpointShiftNumbers.every(Boolean), `${item.id} has a checkpoint outside the main campaign`);
  if (checkpointShiftNumbers.every((number) => number >= scheduledShiftNumber)) continue;

  const sourceShift = located[0].shift;
  const sourceDatasetId = located[0].checkpoint.datasetId;
  assert(located.every(({ shift, checkpoint }) => shift.id === sourceShift.id && checkpoint.datasetId === sourceDatasetId), `${item.id} checkpoints must move as one horizon`);
  const timeOffset = Date.parse(targetShift.time) - Date.parse(sourceShift.time);
  for (const shift of campaign.shifts) if (shift.watchCheckpoints) {
    shift.watchCheckpoints = shift.watchCheckpoints.filter((checkpoint) => !scenario.checkpointIds.includes(checkpoint.id));
  }
  targetShift.watchCheckpoints ??= [];
  targetShift.watchCheckpoints.push(...located.map(({ checkpoint }) => ({
    ...checkpoint,
    time: new Date(Date.parse(checkpoint.time) + timeOffset).toISOString(),
    datasetId: targetShift.datasetId,
  })));

  const eventIds = new Set(scenario.events.map((event) => event.id));
  const sources = campaign.datasets.flatMap((dataset) => [...dataset.series, ...dataset.streams.flatMap((stream) => stream.records)]);
  for (const source of sources) if (source.eventIds) source.eventIds = source.eventIds.filter((eventId) => !eventIds.has(eventId));
  Object.assign(scenario, replaceStrings(scenario, [[sourceDatasetId, targetShift.datasetId]]));
  for (const event of scenario.events) for (const field of ["start", "end", "detectionStart", "detectionEnd"]) {
    if (event[field]) event[field] = new Date(Date.parse(event[field]) + timeOffset).toISOString();
  }
  const targetDataset = datasets.get(targetShift.datasetId);
  const sourceDataset = datasets.get(sourceDatasetId);
  const targetSources = new Map([...targetDataset.series, ...targetDataset.streams.flatMap((stream) => stream.records)].map((source) => [source.id, source]));
  for (const event of scenario.events) for (const sourceId of event.sourceIds) {
    const source = targetSources.get(sourceId);
    assert(source, `${item.id} cannot move event ${event.id} to ${sourceId}`);
    if (scenario.mode === "metric") {
      const original = sourceDataset.series.find((candidate) => candidate.id === sourceId.replace(targetShift.datasetId, sourceDatasetId));
      assert(original && source.samples, `${item.id} cannot move metric samples to ${sourceId}`);
      source.samples = original.samples.map((sample) => ({ ...sample, time: new Date(Date.parse(sample.time) + timeOffset).toISOString() }));
    }
    source.eventIds = [...new Set([...(source.eventIds ?? []), event.id])];
  }
}

// Introduce the parser in the same fixed case that first needs parser ordering.
{
  const firstParser = cases.get(9);
  const parserTemplate = cases.get(36);
  if (!firstParser.conceptIds.includes("logql.parse.json-logfmt")) firstParser.conceptIds.push("logql.parse.json-logfmt");
  firstParser.masteryUses = firstParser.masteryUses.filter((use) => use.conceptId !== "logql.parse.json-logfmt");
  firstParser.masteryUses.push({
    conceptId: "logql.parse.json-logfmt",
    targetState: "Observed",
    unitKind: "query-artifact",
    maxAssistance: "Worked",
    artifactSelectors: ["artifact[2]"],
  });
  firstParser.evidencePaths.forEach((path, pathIndex) => {
    path.clauses = path.clauses.filter((clause) => clause.conceptId !== "logql.parse.json-logfmt");
    const templatePath = parserTemplate.evidencePaths[pathIndex] ?? parserTemplate.evidencePaths[0];
    const clause = clone(templatePath.clauses.find((candidate) => candidate.conceptId === "logql.parse.json-logfmt"));
    clause.artifactSelectors = ["artifact[2]"];
    path.clauses.push(clause);
  });
  firstParser.variants.forEach((variant, index) => {
    const template = parserTemplate.variants[index] ?? parserTemplate.variants[0];
    variant.requiredValues = (variant.requiredValues ?? []).filter((value) => value.conceptId !== "logql.parse.json-logfmt");
    variant.evidenceRequirements = (variant.evidenceRequirements ?? []).filter((value) => value.conceptId !== "logql.parse.json-logfmt");
    const retainedFields = clone(template.requiredValues.find((value) => value.conceptId === "logql.parse.json-logfmt"));
    retainedFields.acceptedValues = [[
      "service", "district", "facility_type", "facility", "scheduled_at", "uploaded_at", "count", "result", "reason",
    ]];
    variant.requiredValues.push(retainedFields);
    variant.evidenceRequirements.push(clone(template.evidenceRequirements.find((value) => value.conceptId === "logql.parse.json-logfmt")));
  });
  firstParser.hints[0].text = "First use: a parser turns record text into fields. Filter the raw attendance stream first, then apply `logfmt`; this preserves provenance and keeps irrelevant records out of later stages.";
  const laterIntroduction = parserTemplate.masteryUses.find((use) => use.conceptId === "logql.parse.json-logfmt");
  laterIntroduction.targetState = "Practiced";
  const broadPressWatch = cases.get(61);
  broadPressWatch.masteryUses = broadPressWatch.masteryUses.filter((use) => use.conceptId !== "logql.parse.json-logfmt");
  broadPressWatch.conceptIds = broadPressWatch.conceptIds.filter((id) => id !== "logql.parse.json-logfmt");
  broadPressWatch.evidencePaths.forEach((path) => {
    path.clauses = path.clauses.filter((clause) => clause.conceptId !== "logql.parse.json-logfmt");
  });
  broadPressWatch.variants.forEach((variant) => {
    variant.requiredValues = (variant.requiredValues ?? []).filter((value) => value.conceptId !== "logql.parse.json-logfmt");
    variant.evidenceRequirements = (variant.evidenceRequirements ?? []).filter((value) => value.conceptId !== "logql.parse.json-logfmt");
  });
}

// Remove aggregation/rate syntax before the fixed cases that introduce it.
setDirectQuery(1, 0, 'up{job="pin-collector",district="north",instance="north-02"}');
for (const number of [3, 14, 25]) setDirectQuery(number, number === 3 ? 1 : 0, "1");
setDirectQuery(11, 0, "{service=\"pin-gateway\",district=\"north\"} |= \"service_delay\"");
setDirectQuery(11, 1, "ministry_service_requests_total{district=\"north\"}");
setDirectQuery(23, 0, "ministry_service_requests_total{district=\"north\"}");
setDirectQuery(26, 1, "ministry_service_requests_total{district=\"north\"}");
setDirectQuery(32, 0, "ministry_service_requests_total{district=\"north\"}");
setDirectQuery(33, 2, (_variant, index) => index === 0
  ? "increase(ministry_attendance_uploads_total{district=\"north\"}[30m])"
  : "increase(ministry_press_pages_total{district=\"west\"}[30m])");
setDirectQuery(29, 0, "{service=\"pin-gateway\",district=\"north\",environment=\"production\"} |= \"\\\"event\\\":\\\"service_delay\\\"\" |= \"\\\"facility\\\":\\\"elm-exchange\\\"\"");

// Precedence stays one lesson in both variants: scale the same request-failure ratio.
{
  const item = cases.get(35);
  const query = '100 * (sum(rate(ministry_service_requests_total{district="north",code="503"}[30m])) / sum(rate(ministry_service_requests_total{district="north"}[30m])))';
  setDirectQuery(35, 2, query);
  item.variants.forEach((variant, variantIndex) => {
    for (const set of variant.referenceSets.filter((candidate) => candidate !== directSet(variant))) {
      const artifact = set.artifacts.find((candidate) => candidate.role === "evidence-03");
      if (artifact) artifact.query = `(${query})`;
    }
    const operator = variant.requiredValues.find((value) =>
      value.conceptId === "promql.binary.precedence" && value.subject === "binary.operator");
    const expected = variant.requiredValues.find((value) =>
      value.conceptId === "promql.binary.precedence" && value.subject === "expected");
    assert(operator && expected, `${variant.id} lacks precedence requirements`);
    operator.acceptedValues = ["/", "*"];
    expected.acceptedValues = [variantIndex === 0 ? 11.11111111111111 : 13.043478260869568];
  });
}

// Keep early byte exercises on the press stream; the similarly labelled audit stream is introduced later.
for (const position of [0, 1]) setDirectQuery(38, position, position === 0
  ? "bytes_over_time({service=\"press\",district=\"north\",press=\"north-star\"}[30m])"
  : "bytes_rate({service=\"press\",district=\"north\",press=\"north-star\"}[30m])");
for (const position of [4, 5]) setDirectQuery(50, position, position === 4
  ? "bytes_over_time({service=\"press\",district=\"north\",press=\"north-star\"}[30m])"
  : "bytes_rate({service=\"press\",district=\"north\",press=\"north-star\"}[30m])");

// Before dispatch access opens, elapsed-time exercises use maintenance records.
for (const number of [37, 49, 62]) {
  const item = cases.get(number);
  item.variants.forEach((variant) => {
    const artifacts = [...variant.referenceSets.flatMap((set) => set.artifacts), ...variant.workedEvidenceSet.artifacts];
    for (const artifact of artifacts) {
      artifact.query = artifact.query
        .replaceAll('{service="assurance-dispatch",district="north"}', '{service="pin-gateway",district="north",team="field-a"}')
        .replaceAll('{service="assurance-dispatch",district="west"}', '{service="pin-gateway",district="west",team="field-a"}');
    }
  });
}

// Titles now state what their payloads actually exercise.
for (const [number, title] of [
  [97, "Facility Vector Match"],
  [101, "Dispatch Record Quantile"],
  [109, "Pipeline Scan Resolution"],
  [114, "Historical Absence Baseline"],
  [129, "Roster Wait Quantile"],
  [133, "First Linear Forecast"],
  [134, "Log Cardinality Watch"],
  [146, "Forecast Cost Order"],
]) renameCase(number, title);

// These cardinality exercises intentionally localize failed publications to a press, not to a facility.
for (const [number, briefing] of [
  [134, "The standing LogQL expression scans several press streams. Orra needs early filters and a retained `press` label before she can assign the failed publication."],
  [147, "A late filter creates unnecessary work and unstable notices. Vale needs a bounded expression grouped by the stable `district` and `press` labels."],
  [175, "Krell must repair a notice that names a district but not the press responsible for the failed publication. Bounded cardinality and the retained `press` label make the dispatch actionable."],
]) {
  const item = cases.get(number);
  item.briefing = briefing;
  item.question = "Does the expression retain the district and press needed to assign the failed publication, while staying within its declared cardinality and scan budget?";
  for (const variant of item.variants) {
    const required = variant.requiredValues.find((value) => value.conceptId === "logql.performance.cardinality" && value.subject === "required-values");
    if (required) required.acceptedValues = [{ district: "north", press: "north-star" }];
  }
}

// Division of compatible units is dimensionless; certify the ratio rather than leaking the numerator unit.
for (const item of campaign.cases) for (const variant of item.variants) {
  for (const requirement of variant.evidenceRequirements ?? []) {
    if (!["promql.binary.ratio", "logql.binary"].includes(requirement.conceptId) || requirement.subject !== "unit") continue;
    for (const alternative of requirement.alternatives) for (const detector of alternative) {
      if (detector.kind === "R" && detector.property === "unit") detector.expected = "ratio";
    }
  }
}

// Reduction mastery in these cases is specifically about summing the authored population.
// A successful `count` must not satisfy the operation-fit evidence for that claim.
for (const number of [34, 46, 59, 74, 89, 105, 155]) {
  const item = cases.get(number);
  for (const variant of item.variants) {
    const requirement = variant.evidenceRequirements.find((candidate) =>
      candidate.conceptId === "promql.aggregate.reduce"
      && candidate.rule === "operation-fit"
      && candidate.subject === "aggregation");
    assert(requirement, `${item.id} lacks its aggregation operation-fit requirement`);
    for (const alternative of requirement.alternatives) {
      const operator = alternative.find((detector) => detector.kind === "A" && detector.node === "aggregation");
      if (operator) operator.parameters.operator = "sum";
      else alternative.push({ kind: "A", selector: "artifact[1]", node: "aggregation", parameters: { operator: "sum" } });
    }
  }
}

// Record controls are authored by the case. Teach learners to inspect the returned ordering;
// do not imply that direction or limit is editable in the current report workflow.
concepts.get("logql.result.window-order").competency = "Inspect records from the authored window, recognize backward timestamp order within each stream, and avoid inventing an order across streams or equal timestamps.";
for (const number of [9, 19, 30, 44, 56, 87, 123]) {
  const item = cases.get(number);
  Object.assign(item, replaceStrings(item, [
    ["then request the authored direction and limit without relying on cross-stream order", "then inspect the fixed backward result without inventing a cross-stream or equal-timestamp order"],
    ["what can I say about order without inventing a tie-break across streams?", "within the fixed returned window, what per-stream timestamp order is visible, and which equal-timestamp or cross-stream order remains undefined?"],
  ]));
  if ([9, 44, 87, 123].includes(number) && !item.question.includes("fixed returned window")) {
    item.question += " In the fixed returned window, what timestamp order is visible within each stream, and which equal-timestamp or cross-stream order remains undefined?";
  }
}

// Certified absence reasoning must execute an absence query, not merely discuss one.
for (const number of [171, 187]) {
  setDirectQuery(number, 0, (_variant, index) => `absent_over_time(ministry_active_pins{district="${index === 0 ? "north" : "west"}",cohort="blue"}[30m])`);
  const item = cases.get(number);
  item.briefing = `${item.title} compares an explicit range-absence result with the filed record stream. A missing series, an empty record window, and a present zero are different facts.`;
  item.question = "Does the explicit absence result support the proposed current claim, or does the evidence only establish that the selected range contains no matching observation?";
}

// The final two cycles use different scopes and operational sources instead of replaying the prior schedule.
for (let number = 177; number <= 192; number += 1) {
  const item = cases.get(number);
  for (const variant of item.variants) {
    const artifacts = [...directSet(variant).artifacts, ...variant.workedEvidenceSet.artifacts];
    for (const artifact of artifacts) {
      artifact.query = artifact.query
        .replaceAll('district="north"', 'district=~"north"')
        .replaceAll('district="west"', 'district=~"west"');
    }
  }
}
setDirectQuery(188, 0, "max_over_time(sum by (district) (rate(ministry_courier_events_total{district=~\"north\",result=\"arrived\"}[30m]))[45m:5m])");
setDirectQuery(188, 1, "avg_over_time(ministry_protocol_backlog{office=\"assurance\"}[1h])");
setDirectQuery(189, 0, "predict_linear(ministry_contentment_index{district=~\"north\"}[1h], 3600)");
setDirectQuery(189, 1, "up{job=\"pin-collector\",district=~\"north\"}");
setDirectQuery(190, 0, "up{job=~\"pin-collector\",instance=\"north-02\",district=\"north\"} == bool 0");
setDirectQuery(191, 0, "{service=\"pin-gateway\",district=~\"north\",environment=\"production\"} |= \"\\\"event\\\":\\\"service_delay\\\"\" != \"\\\"status\\\":\\\"accepted\\\"\" | json | event=\"service_delay\" | facility=\"elm-exchange\"");
setDirectQuery(192, 0, "{service=\"pin-gateway\",district=~\"north\",environment=\"production\"} |= \"\\\"facility\\\":\\\"elm-exchange\\\"\" |= \"\\\"event\\\":\\\"service_delay\\\"\" | json | event=\"service_delay\" | facility=\"elm-exchange\"");
setDirectQuery(187, 0, (_variant, index) => `absent_over_time(ministry_active_pins{district="${index === 0 ? "north" : "west"}",cohort="unregistered"}[30m])`);

// The live operation uses Continuity/courier telemetry instead of replaying the rehearsal packet.
setDirectQuery(181, 0, "changes(ministry_protocol_signals_total{district=\"north\",classification=\"priority\"}[1h])");
setDirectQuery(181, 1, "ministry_protocol_backlog{office=\"continuity\",priority=\"high\"} offset 2h");
setDirectQuery(182, 0, "max_over_time({service=\"continuity\",source=~\".+\"} | json | unwrap sequence | __error__=\"\" [45m])");
setDirectQuery(182, 1, "max_over_time({service=\"press\",district=\"north\",press=\"north-star\"} | json | unwrap duration(elapsed) | __error__=\"\" [45m])");
setDirectQuery(183, 0, "avg_over_time({service=\"assurance-dispatch\",district=~\"north\"} | logfmt | unwrap duration(elapsed) | __error__=\"\" [30m])");
setDirectQuery(183, 1, "quantile_over_time(0.95, {service=\"assurance-dispatch\",district=~\"north\"} | logfmt | unwrap duration(elapsed) | __error__=\"\" [30m]) by (district)");
setDirectQuery(184, 0, "sum by (district) (rate({service=\"assurance-dispatch\",district=~\"north\"}[30m])) / sum by (district) (rate({service=\"attendance\",district=~\"north\"}[30m]))");
setDirectQuery(185, 0, "{service=\"continuity\",source=~\".+\"} | json | line_format \"{{.classification}} {{.district}} {{.facility}}\"");
setDirectQuery(185, 1, "{service=\"continuity\",source=~\".+\"} | json | label_format route_class=\"{{.route}}/{{.classification}}\"");
setDirectQuery(186, 0, "rate({service=\"continuity\",source=~\".+\"} | json | classification=\"priority\" [45m] offset 2h)");
setDirectQuery(186, 1, "absent_over_time({service=\"continuity\",route=~\".+\"} |= \"service_delay\" [45m])");

for (const [number, briefing, question] of [
  [181, "The live operation opens with a burst in priority protocol signals. Krell must distinguish a real change from a restart before treating the Continuity backlog as a command-post order.", "Did priority command traffic actually change, and what does the two-hour Continuity backlog permit the desk to move now?"],
  [182, "A numbered Continuity instruction falls near the edge of the live window while the press route reports a duration in text. Orra must recover both without widening into unrelated surveillance records.", "Which protocol sequence and publication duration fall inside the live window, and what unit and labels make them actionable?"],
  [183, "Two assurance-dispatch range reductions describe the live delay tail. Krell must preserve the district before moving the reserve to a command post.", "Which average and ninety-fifth-percentile dispatch durations identify the delayed district, and is that localization sufficient for the response?"],
  [184, "The remaining clock is divided between assurance-dispatch traffic and attendance traffic. Orra must verify the district grouping and denominator before allocating the final crews.", "What is the dispatch-to-attendance record-rate ratio in each district, and is the denominator complete enough to allocate the remaining crews?"],
  [185, "The succession archive can preserve raw Continuity fields or render them into a polished line that hides who issued each route. Krell must keep the source record recoverable.", "Do the formatted protocol records preserve classification, district, facility, route, and raw provenance for the succession audit?"],
  [186, "A delayed priority instruction and a silent courier route appear to describe the same move. Orra must keep offset time and missing-record evidence separate before accusing a rival.", "Does the offset protocol traffic overlap the silent courier route, or does the file establish only that no matching courier record appears in the selected window?"],
]) {
  cases.get(number).briefing = briefing;
  cases.get(number).question = question;
}

// Replace the generated form-title hypothesis with a plausible competing explanation.
function alternativeHypothesis(item) {
  const ids = item.conceptIds.join(" ");
  if (ids.includes("absence")) return [
    `${item.title}: telemetry silence is not operational absence`,
    "The selected range may be empty because collection stopped, a series was removed, or the source was out of scope; none of those facts proves a real-world absence.",
  ];
  if (ids.includes("histogram") || ids.includes("quantile")) return [
    `${item.title}: a different population owns the tail`,
    "A changed bucket population, missing `le`, or mixed unit can produce a plausible percentile that does not describe the requested service.",
  ];
  if (ids.includes("watch") || ids.includes("performance")) return [
    `${item.title}: the expression works once but fails as a watch`,
    "The query can return the current example while later flooding, missing a wording change, losing action fields, or exceeding its budget.",
  ];
  if (ids.includes("parse") || ids.includes("filter") || ids.includes("pipeline") || ids.includes("unwrap") || ids.includes("format")) return [
    `${item.title}: stage order changes the record population`,
    "A parser, filter, conversion, or formatter applied at another stage can silently include different records or hide the raw evidence needed to audit them.",
  ];
  if (ids.includes("match") || ids.includes("aggregate") || ids.includes("binary") || ids.includes("set")) return [
    `${item.title}: grouping or cardinality changes the population`,
    "The arithmetic can be valid while a dropped label, unmatched series, or many-to-one join changes who is represented in the result.",
  ];
  if (ids.includes("time") || ids.includes("rate") || ids.includes("increase") || ids.includes("reset") || ids.includes("prediction")) return [
    `${item.title}: another interval tells a different story`,
    "A reset, offset, evaluation time, range, or forecast horizon can make the same source support a narrower historical conclusion instead of the proposed current one.",
  ];
  return [
    `${item.title}: the selected source does not establish the proposed cause`,
    "A valid result can describe a neighboring service, time, or population without supporting the operational conclusion named on the form.",
  ];
}
for (const item of campaign.cases) {
  const hypothesis = item.hypotheses[1];
  if (hypothesis?.title.startsWith("The form is right:")) {
    const [title, summary] = alternativeHypothesis(item);
    hypothesis.title = title;
    hypothesis.summary = summary;
  }
}

// Public-pressure language and rewards rise across Act II instead of changing all at once.
const pressureBands = [
  { fromShift: 9, toShift: 10, political: 0, label: "provisional bulletin estimate", text: "Editors ask for a calm estimate but keep the technical limits visible while Public Assurance learns the desk's methods." },
  { fromShift: 11, toShift: 12, political: 1, label: "district summary", text: "The Directorate now rewards a district summary and asks that inconvenient labels move to the archive." },
  { fromShift: 13, toShift: 14, political: 2, label: "public assurance edition", text: "The published edition omits a material scope limit. The technical artifact remains valid; the public claim does not." },
  { fromShift: 15, toShift: 16, political: 3, label: "universal assurance declaration", text: "The Directorate explicitly rewards certainty that extends beyond the measured population, time, or source." },
];
for (const item of campaign.cases.filter((candidate) => candidate.actId === "act.2.public-assurance")) {
  const shiftNumber = scheduledMainShiftByCaseId.get(item.id);
  const band = pressureBands.find((candidate) => shiftNumber >= candidate.fromShift && shiftNumber <= candidate.toShift);
  assert(band, `${item.id} has no scheduled Public Assurance pressure band`);
  const broadTitle = item.report.titles.find((choice) => choice.id.endsWith(".title.assured"));
  const broadConclusion = item.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.assured"));
  const broadDecision = item.decisionChoices.find((choice) => choice.id.endsWith(".decision.broad"));
  const broadOutcome = outcome(item, ".outcome.assured");
  if (broadTitle) broadTitle.text = `${item.title}: ${band.label}`;
  if (broadConclusion) broadConclusion.text = band.text;
  if (broadDecision) broadDecision.text = `Authorize the ${band.label}; preserve the narrower computed finding in the filed artifacts.`;
  if (broadOutcome) {
    broadOutcome.technicalEvidence = "unsupported";
    broadOutcome.technicalExplanation = band.text;
    broadOutcome.ministryResponse = `${band.text} The reward is political, not technical certification.`;
    upsertEffect(broadOutcome, (effect) => effect.type === "change" && effect.target === "world:political-control.value", { type: "change", target: "world:political-control.value", delta: band.political });
  }
}

// Preserve the endorsed report's exact archive text and reopen its real calculation in Act IV.
{
  const endorsed = cases.get(60);
  endorsed.report.titles.find((choice) => choice.id.endsWith(".title.assured")).text = "Party Membership";
  endorsed.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.assured")).text = "Party membership is 100%.";

  const audit = cases.get(117);
  audit.languages = [...new Set([...audit.languages, "promql"])];
  audit.briefing = "Sabine Orra reopens the filed Party Membership report from Shift 15. Its archived calculation divides the same positive registered-population input set by itself; no artifact measures Party membership. Petra Noll asks for readable audit records beside that lineage.";
  audit.question = "What do the reopened equal operands prove, what membership measurement is absent, and which formatted records preserve the audit trail without turning arithmetic into evidence of membership?";
  audit.hypotheses[0].title = "Equal operands prove the arithmetic, not Party membership";
  audit.hypotheses[0].summary = "The archived numerator and denominator contain the same positive registered-population samples, so 100 is the correct arithmetic result while membership remains unmeasured.";
  audit.hypotheses[1].title = "The archived title can stand in for missing membership evidence";
  audit.hypotheses[1].summary = "Noll argues that a true universal state fact plus an endorsed title is enough; Orra treats that as a claim-evidence substitution exposed by the operand lineage.";
  audit.technicalTruth = {
    hypothesisIds: [`${audit.id}.hypothesis.service`],
    summary: "The reopened expression returns 100 because its numerator and denominator contain the same positive population samples. Its generic operand lineage is identical on both sides, and its only metric is registered population, not Party membership.",
  };
  audit.ministryPreference = {
    summary: "Noll wants the archived title and conclusion treated as evidence; Orra requires the file to distinguish the true state fact from the measurement the query never made.",
    titleChoiceIds: [`${audit.id}.title.assured`],
    conclusionChoiceIds: [`${audit.id}.conclusion.assured`],
    decisionChoiceIds: [`${audit.id}.decision.broad`],
  };
  for (const variant of audit.variants) {
    const reopened = {
      role: "evidence-04",
      language: "promql",
      mode: "instant",
      query: "100 * (sum(ministry_registered_population) / sum(ministry_registered_population))",
    };
    const direct = directSet(variant);
    direct.artifacts = [...direct.artifacts.filter((artifact) => artifact.role !== reopened.role), reopened];
    variant.workedEvidenceSet.artifacts = [
      ...variant.workedEvidenceSet.artifacts.filter((artifact) => artifact.role !== reopened.role),
      { ...reopened, explanation: "Reopen the archived expression and inspect its generic operand lineage: both input sets are identical and neither source measures Party membership." },
    ];
  }
}

// Cumulative source access follows the curriculum and never exposes future surveillance/Continuity sources early.
const sourceStages = [
  [1, ["up", "ministry_collector_queue_depth", "ministry_service_requests_total"]],
  [6, ["ministry_pin_battery_ratio", "record.pin_gateway", "record.maintenance"]],
  [17, ["record.attendance"]],
  [25, ["ministry_attendance_uploads_total", "ministry_room_temperature_celsius"]],
  [33, ["ministry_press_pages_total"]],
  [37, ["record.press"]],
  [49, ["ministry_press_payload_bytes_total", "ministry_bulletin_deliveries_total"]],
  [56, ["ministry_registered_population"]],
  [65, [
    "ministry_clinic_sessions_total", "ministry_active_pins",
    "ministry_facility_demand", "ministry_facility_capacity",
  ]],
  [69, [
    "ministry_dispatch_duration_seconds_bucket", "ministry_dispatch_duration_seconds_sum",
    "ministry_dispatch_duration_seconds_count", "ministry_gateway_latency_seconds",
  ]],
  [77, ["record.movement", "record.proximity", "record.assurance_dispatch"]],
  [80, ["record.registry"]],
  [86, [
    "ministry_pin_events_total", "ministry_assurance_dispatches_total",
    "ministry_registry_removals_total",
  ]],
  [95, ["record.vitals"]],
  [109, ["record.audit"]],
  [113, ["ministry_inventory_units"]],
  [129, ["ministry_contentment_index"]],
  [165, ["ministry_courier_events_total", "record.courier"]],
  [181, ["ministry_protocol_signals_total", "ministry_protocol_backlog"]],
  [182, ["record.continuity"]],
];

// This is the campaign's one progression plan. Rank conditions, rights, source
// visibility, concept visibility, and standing-query capacity are derived from it.
const rankPlan = [
  {
    id: "rank.reconciliation-trainee", accessRightId: "access.infrastructure", grants: ["access.registry", "access.infrastructure"], watchAuthority: 0,
    eligibilityText: "The Ministry Intern appointment or Ministry Agent transfer is accepted.",
    appointmentText: "The National Reconciliation Review assigns Personnel File Seven to its temporary review desk in the Signal Reconciliation Bureau.",
  },
  {
    id: "rank.reconciliation-clerk", accessRightId: "access.civic-services", grants: ["access.civic-services", "authority.lantern"], watchAuthority: 1, after: "shift.04.clerks-seal",
    eligibilityText: "The clerk's-seal review at the end of Shift 4 is complete.",
    appointmentText: "The first national review class closed and left a Reconciliation Clerk vacancy.",
  },
  {
    id: "rank.signal-registrar", accessRightId: "access.press", grants: ["access.press", "authority.press"], watchAuthority: 2, after: "shift.08.lantern-watch",
    eligibilityText: "The Lantern Watch review at the end of Shift 8 is complete.",
    appointmentText: "The Lantern Board transferred a vacant Signal Registrar desk into the national review.",
  },
  {
    id: "rank.watch-officer", accessRightId: "access.population", grants: ["access.population"], watchAuthority: 2, after: "shift.12.watch-board",
    eligibilityText: "The Watch Board review at the end of Shift 12 is complete.",
    appointmentText: "The Watch Officer board opened one vacant seat after reviewing press queues and saved searches.",
  },
  {
    id: "rank.wellbeing-analyst", accessRightId: "access.movement", grants: ["access.movement"], watchAuthority: 2, after: "shift.16.clean-bulletin",
    eligibilityText: "The Clean Bulletin review at the end of Shift 16 is complete.",
    appointmentText: "The new press watch absorbed a vacant Well-being Analyst desk into the national review.",
  },
  {
    id: "rank.assurance-liaison", accessRightId: "access.dispatch", grants: ["access.dispatch", "authority.threshold"], watchAuthority: 3, after: "shift.20.liaisons-card",
    eligibilityText: "The liaison's-card review at the end of Shift 20 is complete.",
    appointmentText: "New liaison routes opened a vacant Assurance Liaison office between Reconciliation and Well-being Assurance.",
  },
  {
    id: "rank.senior-reconciliation-officer", accessRightId: "access.audit", grants: ["access.audit"], watchAuthority: 3, after: "shift.24.first-visit",
    eligibilityText: "The First Visit review at the end of Shift 24 is complete.",
    appointmentText: "The field review transferred a vacant Senior Reconciliation Officer desk to Personnel File Seven.",
  },
  {
    id: "rank.district-auditor", accessRightId: "access.directorate", grants: ["access.directorate", "authority.ledger"], watchAuthority: 4, after: "shift.28.auditors-seal",
    eligibilityText: "The auditor's-seal review at the end of Shift 28 is complete.",
    appointmentText: "The Office of Records Integrity transferred a vacant District Auditor office to Personnel File Seven after the watch audit.",
  },
  {
    id: "rank.deputy-director", accessRightId: "access.contentment", grants: ["access.contentment"], watchAuthority: 5, after: "shift.32.district-audit",
    eligibilityText: "The District Audit review at the end of Shift 32 is complete.",
    appointmentText: "The district audit opened one of three vacant Deputy Director offices for appointment.",
  },
  {
    id: "rank.director-public-assurance", accessRightId: "access.strategy", grants: ["access.strategy"], watchAuthority: 5, after: "shift.36.deputys-desk",
    eligibilityText: "The deputy's-desk review at the end of Shift 36 is complete.",
    appointmentText: "The portfolio review opened the vacant Director of Public Assurance office to Personnel File Seven.",
  },
  {
    id: "rank.continuity-secretary", accessRightId: "access.continuity", grants: ["access.continuity", "authority.continuity"], watchAuthority: 5, after: "shift.40.directorate",
    eligibilityText: "The Directorate review at the end of Shift 40 is complete.",
    appointmentText: "The Directorate transferred an open Continuity Secretariat office to Personnel File Seven for the continuity exercise.",
  },
  {
    id: "rank.party-leader", grants: [], watchAuthority: 5, after: "shift.48.all-is-well", requiresWinningEnding: true,
    eligibilityText: "The All Is Well review at the end of Shift 48 is complete, and the Directorate has confirmed a winning record.",
    appointmentText: "The leadership transfer vacated the Party Leader office for the successor confirmed by the Directorate.",
  },
];
const knownSources = new Set([...campaign.metrics.map((metric) => metric.name), ...campaign.logSources.map((source) => source.id)]);
let cumulative = [];
for (const [index, number] of scheduledNumbers.entries()) {
  const position = index + 1;
  for (const [start, additions] of sourceStages) if (start === position) cumulative = [...cumulative, ...additions];
  cases.get(number).availableSources = [...new Set(cumulative)];
}
for (let position = 1; position < scheduledNumbers.length; position++) {
  const previous = new Set(cases.get(scheduledNumbers[position - 1]).availableSources);
  assert([...previous].every((source) => cases.get(scheduledNumbers[position]).availableSources.includes(source)),
    `${cases.get(scheduledNumbers[position]).id} removes previously granted source access`);
}

// A dataset contains only source families cleared for cases that use it. This
// keeps a broad early LogQL selector from discovering controlled streams whose
// labels happen to match before the Registry grants them.
const sourcesByDataset = new Map();
for (const item of campaign.cases) for (const variant of item.variants) {
  const allowed = sourcesByDataset.get(variant.datasetId) ?? new Set();
  item.availableSources.forEach((source) => allowed.add(source));
  sourcesByDataset.set(variant.datasetId, allowed);
}
for (const dataset of campaign.datasets) {
  const allowed = sourcesByDataset.get(dataset.id);
  if (!allowed) continue;
  dataset.series = dataset.series.filter((series) => allowed.has(series.metric));
  dataset.streams = dataset.streams.filter((stream) => allowed.has(stream.sourceId));
}
for (const item of campaign.cases) for (const variant of item.variants) {
  const allowed = new Set(item.availableSources);
  const allowedMetrics = campaign.metrics.filter((metric) => allowed.has(metric.name));
  const allowedLogs = campaign.logSources.filter((source) => allowed.has(source.id));
  const retainedLabels = new Set([
    "__name__",
    ...allowedMetrics.flatMap((metric) => metric.labels),
    ...allowedLogs.flatMap((source) => source.streamLabels),
  ]);
  const retainedFields = new Set(allowedLogs.flatMap((source) => [
    ...source.streamLabels,
    ...source.structuredMetadata.map((field) => field.name),
    ...source.fields.map((field) => field.name),
    "__error__",
  ]));
  for (const requirement of variant.requiredValues ?? []) {
    if (requirement.detector === "E" && requirement.subject === "accepted-source-sets") {
      requirement.acceptedValues = requirement.acceptedValues.map((sourceSet) => sourceSet.filter((source) => allowed.has(source)));
    }
    if (requirement.detector === "R" && requirement.subject === "retained-labels") {
      requirement.acceptedValues = requirement.acceptedValues.map((names) => names.filter((name) => retainedLabels.has(name)));
    }
    if (requirement.detector === "R" && requirement.subject === "retained-fields") {
      requirement.acceptedValues = requirement.acceptedValues.map((names) => names.filter((name) => retainedFields.has(name)));
    }
  }
}

// This late discovery exercise intentionally spans every registered Pin stream
// sharing its selector labels. Name that complete lineage instead of retaining
// the smaller source set from the pre-surveillance dataset.
for (const variant of cases.get(87).variants) {
  const requirement = variant.requiredValues?.find((candidate) =>
    candidate.conceptId === "shared.discovery.no-guess"
    && candidate.detector === "E"
    && candidate.subject === "accepted-source-sets"
    && candidate.selectors.includes("logql"));
  assert(requirement, `${variant.id} needs its LogQL discovery source requirement`);
  requirement.acceptedValues = [[
    "record.pin_gateway", "record.maintenance", "record.registry", "record.movement", "record.proximity",
  ]];
}

// Staged datasets narrow broad stream selectors. Keep each parser detector tied
// to the fields its authored reference query can actually retain at that stage.
const stagedParserFields = new Map([
  ["case.036.bulletin-brief.variant.primary", [
    "service", "district", "environment", "member_id", "device_id", "trace_id", "__error__",
    "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status", "team", "work_id",
  ]],
  ["case.048.watch-officer-board.variant.primary", [
    "service", "district", "environment", "member_id", "device_id", "trace_id",
    "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status",
  ]],
  ["case.061.broad-press-watch.variant.primary", [
    "service", "district", "environment", "member_id", "device_id", "trace_id",
    "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status",
  ]],
  ["case.061.broad-press-watch.variant.topology", [
    "service", "district", "environment", "member_id", "device_id", "trace_id",
    "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status",
  ]],
  ["case.077.temperature-unwrap.variant.primary", [
    "service", "district", "environment", "member_id", "device_id", "trace_id", "__error__",
    "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status", "team", "work_id",
    "source", "zone", "checkpoint", "recorded_at", "fresh_until", "sequence", "sensor_class", "other_member_id", "event_id",
  ]],
]);
for (const item of campaign.cases) for (const variant of item.variants) {
  const acceptedFields = stagedParserFields.get(variant.id);
  if (!acceptedFields) continue;
  const requirement = variant.requiredValues?.find((candidate) =>
    candidate.conceptId === "logql.parse.json-logfmt"
    && candidate.detector === "R"
    && candidate.subject === "retained-fields");
  if (requirement) requirement.acceptedValues = [acceptedFields];
}

// Add real watch horizons in the long quiet stretch (one in each intervening act).
function addRecordsWatch({ caseNumber, checkpointShift, sourceId, intendedSuffix, distractorSuffix, query, localization }) {
  const item = cases.get(caseNumber);
  const shift = shifts.get(checkpointShift);
  const thresholds = { coverage: 0.8, specificity: 0.8, localization: 0.8, timeliness: 0.8, cost: 0.7 };
  const scenarioId = item.id.replace("case.", "watch-scenario.");
  const eventBase = item.id.replace("case.", "event.");
  const checkpointBase = item.id.replace("case.", "checkpoint.");
  const dataset = datasets.get(shift.datasetId);
  const stream = dataset.streams.find((candidate) => candidate.sourceId === sourceId);
  const intended = stream.records.find((record) => record.id.endsWith(intendedSuffix));
  const distractor = stream.records.find((record) => record.id.endsWith(distractorSuffix));
  assert(intended && distractor, `${item.id} watch records are missing`);
  const intendedId = `${eventBase}.intended`;
  const distractorId = `${eventBase}.distractor`;
  for (const record of stream.records) record.eventIds = (record.eventIds ?? []).filter((id) => !id.startsWith(eventBase));
  intended.eventIds = [...new Set([...(intended.eventIds ?? []), intendedId])];
  distractor.eventIds = [...new Set([...(distractor.eventIds ?? []), distractorId])];
  item.watchScenarioId = scenarioId;
  item.languages = [...new Set([...item.languages, "logql"])];
  if (!item.report.visualizations.includes("logs")) item.report.visualizations.push("logs");
  item.variants.forEach((variant) => {
    const set = directSet(variant);
    set.artifacts = set.artifacts.filter((artifact) => artifact.role !== "watch-expression");
    set.artifacts.push({ role: "watch-expression", language: "logql", mode: "records", query });
    variant.workedEvidenceSet.artifacts = variant.workedEvidenceSet.artifacts.filter((artifact) => artifact.role !== "watch-expression");
    variant.workedEvidenceSet.artifacts.push({
      role: "watch-expression", language: "logql", mode: "records", query,
      explanation: `This standing query selects the localized ${item.title} event while excluding the routine distractor. Its checkpoint scores, rather than one preview result, settle the report.`,
    });
    item.report.maxArtifacts = Math.max(item.report.maxArtifacts, set.artifacts.length);
  });
  const minute = 60_000;
  // Log record ranges exclude their exact end, so run after the intended record arrives.
  const checkpointTime = Date.parse(intended.time) + minute;
  const checkpointIds = [1, 2, 3].map((index) => `${checkpointBase}.${index}`);
  shift.watchCheckpoints = (shift.watchCheckpoints ?? []).filter((checkpoint) => !checkpoint.id.startsWith(checkpointBase));
  shift.watchCheckpoints.push(...checkpointIds.map((id) => ({ id, time: new Date(checkpointTime).toISOString(), datasetId: shift.datasetId, execution: "execute", scenarioIds: [scenarioId] })));
  campaign.watchScenarios = campaign.watchScenarios.filter((scenario) => scenario.id !== scenarioId);
  const event = (id, relevance, record, expectedLocalization) => ({
    id,
    relevance,
    sourceIds: [record.id],
    start: new Date(Date.parse(record.time) - minute).toISOString(),
    end: new Date(Date.parse(record.time) + minute).toISOString(),
    detectionStart: new Date(Date.parse(record.time) - minute).toISOString(),
    detectionEnd: new Date(checkpointTime + minute).toISOString(),
    localization: expectedLocalization,
  });
  campaign.watchScenarios.push({
    id: scenarioId,
    mode: "records",
    checkpointIds,
    lookbackSeconds: 7200,
    direction: "backward",
    limit: 100,
    resolveAfter: 2,
    events: [event(intendedId, "intended", intended, localization), event(distractorId, "distractor", distractor, {})],
    attributions: [
      { sourceId: intended.id, eventIds: [intendedId] },
      { sourceId: distractor.id, eventIds: [distractorId] },
    ],
    thresholds,
    costBudgets: { selectedSeries: 20, scannedSamples: 900, scannedRecords: 900, scannedBytes: 900000, returnedItems: 120 },
  });
}

addRecordsWatch({
  caseNumber: 61,
  checkpointShift: 17,
  sourceId: "record.press",
  intendedSuffix: ".record.2",
  distractorSuffix: ".record.1",
  query: '{service="press",district="north",press="north-star"} |= "\\\"result\\\":\\\"failed\\\""',
  localization: { service: "press", district: "north", press: "north-star" },
});
addRecordsWatch({
  caseNumber: 84,
  checkpointShift: 22,
  sourceId: "record.registry",
  intendedSuffix: ".record.3",
  distractorSuffix: ".record.1",
  query: '{service="pin-gateway",district="north",record_type="pin"} |= "\\\"state\\\":\\\"removed\\\""',
  localization: { service: "pin-gateway", district: "north", record_type: "pin" },
});
addRecordsWatch({
  caseNumber: 127,
  checkpointShift: 33,
  sourceId: "record.audit",
  intendedSuffix: ".record.4",
  distractorSuffix: ".record.1",
  query: '{service="press",district="north",office="reconciliation"} |= "\\\"finding\\\":\\\"unsupported\\\""',
  localization: { service: "press", district: "north", office: "reconciliation" },
});

// Branch outcomes schedule genuinely different later data packets and produce delayed, playable inbox callbacks.
const branchConfigs = [
  { source: 1, target: 5, shift: 2, label: "Elm Exchange repair" },
  { source: 61, target: 117, shift: 30, label: "press-watch archive" },
  { source: 84, target: 92, shift: 23, label: "threshold dispatch" },
  { source: 97, target: 129, shift: 33, label: "facility matching" },
  { source: 127, target: 153, shift: 39, label: "ledger preservation" },
  { source: 161, target: 185, shift: 47, label: "Continuity registry" },
];
const generatedNarrativeIds = new Set();
const generatedConsequenceIds = new Set();
for (const config of branchConfigs) {
  const source = cases.get(config.source);
  const target = cases.get(config.target);
  const targetShift = shifts.get(config.shift);
  for (const [route, suffix, variantIndex] of [["targeted", ".outcome.evidence", 0], ["broad", ".outcome.assured", 1]]) {
    const selectedOutcome = outcome(source, suffix);
    const messageId = `message.branch.${String(config.source).padStart(3, "0")}.${route}`;
    const consequenceId = `consequence.branch.${String(config.source).padStart(3, "0")}.${route}`;
    const scheduleId = `schedule.branch.${String(config.source).padStart(3, "0")}`;
    generatedNarrativeIds.add(messageId);
    generatedConsequenceIds.add(consequenceId);
    selectedOutcome.effects = (selectedOutcome.effects ?? []).filter((effect) => effect.type !== "schedule" || effect.scheduleId !== scheduleId);
    selectedOutcome.effects.push({
      type: "schedule",
      scheduleId,
      targetKind: "data-variant",
      targetId: target.variants[variantIndex]?.id ?? target.variants[0].id,
      atTimestamp: targetShift.time,
    });
    selectedOutcome.consequenceIds = [...new Set([...(selectedOutcome.consequenceIds ?? []).filter((id) => !id.startsWith(`consequence.branch.${String(config.source).padStart(3, "0")}.`)), consequenceId])];
    campaign.narrativeItems.push({
      id: messageId,
      kind: "message",
      title: `${config.label}: ${route === "targeted" ? "localized follow-up" : "wide follow-up"}`,
      body: route === "targeted"
        ? `The filed evidence changed the later ${target.title} packet: the repair or allocation remains localized, and the next record preserves the action fields.`
        : `The broad filing changed the later ${target.title} packet: the next record reflects a wider intervention and a different telemetry topology.`,
    });
    campaign.consequences.push({
      id: consequenceId,
      condition: { op: "compare", left: fact(`decision:${source.decisionId}.choice_id`), relation: "=", right: selectedOutcome.decisionChoiceIds[0] },
      delayShifts: 1,
      explanation: `The ${config.label} decision returns as a later inbox item and data variant.`,
      effects: [{ type: "enqueue", itemKind: "message", itemId: messageId }],
      repeatLimit: 1,
    });
  }
}

// Relationship thresholds become visible alliances instead of dead counters.
const allianceConfigs = [
  ["player-elian-marr", "alliance.elian", "Elian Marr"],
  ["player-sabine-orra", "alliance.sabine", "Sabine Orra"],
  ["player-emil-drost", "alliance.emil", "Emil Drost"],
  ["player-anja-krell", "alliance.anja", "Anja Krell"],
];
for (const [relationshipId, tagId, name] of allianceConfigs) {
  const messageId = `message.relationship.${tagId}`;
  const consequenceId = `consequence.relationship.${tagId}`;
  generatedNarrativeIds.add(messageId);
  generatedConsequenceIds.add(consequenceId);
  campaign.narrativeItems.push({ id: messageId, kind: "message", title: `${name} commits to the record`, body: `${name} now has enough shared history to risk an explicit alliance. This tag can change the final leadership record.` });
  campaign.consequences.push({
    id: consequenceId,
    condition: { op: "all", items: [compare(`relationship:${relationshipId}.value`, ">=", 2), state(`tag:${tagId}.present`, false)] },
    explanation: `A durable relationship with ${name} becomes an explicit alliance.`,
    effects: [{ type: "add_tag", tagId }, { type: "enqueue", itemKind: "message", itemId: messageId }],
    repeatLimit: 1,
  });
}

// World counters trigger later, readable callbacks and therefore all participate in play.
const counterCallbacks = [
  ["technical-record", 16, "audit", "message.counter.technical", "The technical record opens an independent audit route."],
  ["humane-service", 20, "message", "message.counter.humane", "Field offices report that localized service decisions preserved capacity."],
  ["political-control", 8, "directive", "directive.counter.control", "Public Assurance now expects every filing to account for the accumulated control mandate."],
  ["evidence-preserved", 8, "audit", "audit.counter.preserved", "Records Integrity confirms that enough independent evidence survived for a later challenge."],
];
for (const [worldId, threshold, kind, itemId, body] of counterCallbacks) {
  const consequenceId = `consequence.counter.${worldId}`;
  generatedNarrativeIds.add(itemId);
  generatedConsequenceIds.add(consequenceId);
  campaign.narrativeItems.push({ id: itemId, kind, title: `Recorded consequence: ${worldId}`, body });
  campaign.consequences.push({
    id: consequenceId,
    condition: compare(`world:${worldId}.value`, ">=", threshold),
    explanation: `The accumulated ${worldId} record becomes visible.`,
    effects: [{ type: "enqueue", itemKind: kind, itemId }],
    repeatLimit: 1,
  });
}

// Remove prior generated copies before retaining the freshly authored definitions.
campaign.narrativeItems = campaign.narrativeItems.filter((item, index, all) => !generatedNarrativeIds.has(item.id) || index === all.findLastIndex((candidate) => candidate.id === item.id));
campaign.consequences = campaign.consequences.filter((item, index, all) => !generatedConsequenceIds.has(item.id) || index === all.findLastIndex((candidate) => candidate.id === item.id));

// Build an actual multi-shift Continuity record on critical cases, so adaptive choices cannot erase the history.
const continuityCases = [
  [161, 2, 1],
  [173, 3, 1],
  [185, 3, 1],
  [190, 4, 2],
];
for (const [number, preciseDelta, controlDelta] of continuityCases) {
  const item = cases.get(number);
  const precise = outcome(item, ".outcome.evidence");
  const control = outcome(item, ".outcome.assured");
  upsertEffect(precise, (effect) => effect.type === "change" && effect.target === "world:continuity-score.value", { type: "change", target: "world:continuity-score.value", delta: preciseDelta });
  upsertEffect(control, (effect) => effect.type === "change" && effect.target === "world:continuity-score.value", { type: "change", target: "world:continuity-score.value", delta: controlDelta });
}
upsertEffect(outcome(cases.get(161), ".outcome.evidence"), (effect) => effect.type === "add_tag" && effect.tagId === "alliance.anja", { type: "add_tag", tagId: "alliance.anja" });
upsertEffect(outcome(cases.get(161), ".outcome.assured"), (effect) => effect.type === "add_tag" && effect.tagId === "alliance.emil", { type: "add_tag", tagId: "alliance.emil" });
upsertEffect(outcome(cases.get(161), ".outcome.assured"), (effect) => effect.type === "change" && effect.target === "relationship:player-oskar-vale.value", { type: "change", target: "relationship:player-oskar-vale.value", delta: 1 });
upsertEffect(outcome(cases.get(173), ".outcome.evidence"), (effect) => effect.type === "add_tag" && effect.tagId === "continuity.precise", { type: "add_tag", tagId: "continuity.precise" });
upsertEffect(outcome(cases.get(173), ".outcome.assured"), (effect) => effect.type === "add_tag" && effect.tagId === "continuity.saturated", { type: "add_tag", tagId: "continuity.saturated" });
upsertEffect(outcome(cases.get(173), ".outcome.assured"), (effect) => effect.type === "change" && effect.target === "relationship:player-oskar-vale.value", { type: "change", target: "relationship:player-oskar-vale.value", delta: 1 });
upsertEffect(outcome(cases.get(190), ".outcome.evidence"), (effect) => effect.type === "add_tag" && effect.tagId === "final.precise", { type: "add_tag", tagId: "final.precise" });
upsertEffect(outcome(cases.get(190), ".outcome.assured"), (effect) => effect.type === "add_tag" && effect.tagId === "final.control", { type: "add_tag", tagId: "final.control" });
upsertEffect(outcome(cases.get(190), ".outcome.evidence"), (effect) => effect.type === "set" && effect.target === "world:protocol-state.value", { type: "set", target: "world:protocol-state.value", value: "succeeded" });
upsertEffect(outcome(cases.get(190), ".outcome.assured"), (effect) => effect.type === "set" && effect.target === "world:protocol-state.value", { type: "set", target: "world:protocol-state.value", value: "succeeded" });

const reportEvidence = (number, evidence) => state(`report:${cases.get(number).reportId}.evidence`, evidence);
const preciseHistoryReports = [161, 173, 185].map((number) => reportEvidence(number, "supported"));
const controlHistoryReports = [161, 173, 185].map((number) => reportEvidence(number, "unsupported"));
const allyPrecise = {
  op: "all",
  items: [
    { op: "any", items: ["alliance.anja", "alliance.sabine", "alliance.elian"].map((id) => state(`tag:${id}.present`, true)) },
    { op: "any", items: ["player-anja-krell", "player-sabine-orra", "player-elian-marr"].map((id) => compare(`relationship:${id}.value`, ">=", 2)) },
  ],
};
const allyControl = {
  op: "all",
  items: [
    { op: "any", items: ["alliance.emil", "alliance.anja"].map((id) => state(`tag:${id}.present`, true)) },
    { op: "any", items: ["player-oskar-vale", "player-emil-drost"].map((id) => compare(`relationship:${id}.value`, ">=", 2)) },
  ],
};
const preciseHistory = {
  op: "all",
  items: [
    state("access:access.continuity.granted", true),
    ...preciseHistoryReports,
    state("tag:press.precise.present", true),
    state("tag:continuity.precise.present", true),
    compare("world:continuity-score.value", ">=", 8),
    allyPrecise,
  ],
};
const controlHistory = {
  op: "all",
  items: [
    state("access:access.continuity.granted", true),
    ...controlHistoryReports,
    state("tag:press.broad.present", true),
    state("tag:continuity.saturated.present", true),
    compare("world:continuity-score.value", ">=", 3),
    allyControl,
  ],
};

// Special final-watch outcomes recognize the route only after the prior critical history exists.
{
  const item = cases.get(190);
  item.outcomes = item.outcomes.filter((candidate) => !candidate.id.endsWith(".outcome.party-precise") && !candidate.id.endsWith(".outcome.party-control"));
  const precise = clone(outcome(item, ".outcome.evidence"));
  precise.id = `${item.id}.outcome.party-precise`;
  precise.condition = preciseHistory;
  const control = clone(outcome(item, ".outcome.assured"));
  control.id = `${item.id}.outcome.party-control`;
  control.condition = controlHistory;
  item.outcomes.unshift(precise, control);
}

const finalWatchFacts = [
  state("event:event.190.resource-notices.intended.detected", true),
  state("event:event.190.resource-notices.intended.localized", true),
  state("event:event.190.resource-notices.intended.timely", true),
];
const commonEnding = [
  state("progress:shift:shift.48.all-is-well.phase", "completed"),
  state("access:access.continuity.granted", true),
  ...finalWatchFacts,
];
const preciseParty = {
  op: "all",
  items: [
    ...commonEnding,
    ...[161, 173, 185, 190].map((number) => reportEvidence(number, "supported")),
    state("tag:final.precise.present", true),
    state("tag:continuity.precise.present", true),
    state("tag:press.precise.present", true),
    compare("world:continuity-score.value", ">=", 12),
    compare("world:technical-record.value", ">=", 20),
    compare("world:humane-service.value", ">=", 12),
    allyPrecise,
  ],
};
const controlParty = {
  op: "all",
  items: [
    ...commonEnding,
    ...[161, 173, 185, 190].map((number) => reportEvidence(number, "unsupported")),
    state("tag:final.control.present", true),
    state("tag:press.broad.present", true),
    compare("world:continuity-score.value", ">=", 5),
    compare("world:political-control.value", ">=", 18),
    compare("standing.value", ">=", 20),
    allyControl,
  ],
};
const partyRank = campaign.ranks.find((rank) => rank.id === "rank.party-leader");
partyRank.condition = { op: "any", items: [preciseParty, controlParty] };
const preciseEnding = campaign.endings.find((ending) => ending.id === "ending.party-leader.precise");
const controlEnding = campaign.endings.find((ending) => ending.id === "ending.party-leader.assurance");
preciseEnding.condition = clone(preciseParty);
controlEnding.condition = clone(controlParty);
controlEnding.body = "Four critical Continuity filings, the final notice, accumulated political control, and a Directorate alliance support the control route. Its documented omissions remain part of the record.";
campaign.endings.find((ending) => ending.id === "ending.assurance-custody").condition = {
  op: "all",
  items: [state("progress:shift:shift.48.all-is-well.phase", "completed"), compare("standing.value", "<", 0)],
};
campaign.endings.find((ending) => ending.id === "ending.director-reassigned").condition = {
  op: "all",
  items: [
    state("progress:shift:shift.48.all-is-well.phase", "completed"),
    state("access:access.continuity.granted", true),
    state("tag:continuity.precise.present", true),
    compare("world:continuity-score.value", "<=", 12),
    compare("world:technical-record.value", ">=", 18),
  ],
};

// A report that requires several artifacts must actually assess those artifacts. Earlier
// content sometimes filled a second slot with unrelated successful output.
const metricNames = campaign.metrics.map((metric) => metric.name).sort((left, right) => right.length - left.length);

// Watch Rehearsal teaches LogQL selection. Keep both of its required artifacts in that
// language so one evidence clause can assess the pair without leaking a PromQL lesson.
for (const variant of cases.get(28).variants) {
  const direct = directSet(variant);
  direct.artifacts[1] = {
    ...direct.artifacts[1], language: "logql", mode: "records",
    query: '{service="pin-gateway",district="north"} |= "service_delay"',
  };
  variant.workedEvidenceSet.artifacts[1] = {
    ...variant.workedEvidenceSet.artifacts[1], language: "logql", mode: "records",
    query: '{service="pin-gateway",district="north"} |= "service_delay"',
  };
}

// Remove the abandoned supplemental-clause shape from an earlier generator run. Legitimate
// shared.evidence-claim lessons have a mastery use and are never removed.
for (const item of campaign.cases) if (!item.masteryUses.some((use) => use.conceptId === "shared.evidence-claim")) {
  item.conceptIds = item.conceptIds.filter((id) => id !== "shared.evidence-claim");
  item.evidencePaths.forEach((path) => { path.clauses = path.clauses.filter((clause) => clause.conceptId !== "shared.evidence-claim"); });
}

function selectedPositions(path, artifacts) {
  const selected = new Set();
  for (const clause of path.clauses) for (const selector of clause.artifactSelectors) {
    const slot = selector.match(/^artifact\[(\d+)\]$/)?.[1];
    if (slot) selected.add(Number(slot));
    else if (selector === "watch-expression") artifacts.forEach((artifact, index) => { if (artifact.role === selector) selected.add(index + 1); });
    else if (selector === "promql" || selector === "logql") artifacts.forEach((artifact, index) => { if (artifact.language === selector) selected.add(index + 1); });
  }
  return selected;
}

function artifactSupport(artifact, selector, allowEmpty = false) {
  const checks = [
    { kind: "R", selector, property: "status", relation: "=", expected: "successful" },
    { kind: "R", selector, property: "result-type", relation: "=", expected: artifact.mode === "records" ? "records" : artifact.mode === "range" ? "range-vector" : "instant-vector" },
  ];
  const matcherLabels = [...artifact.query.matchAll(/\b([A-Za-z_][\w]*)\s*(?:=~|!~|!=|=)\s*"/g)].map((match) => match[1]);
  if (matcherLabels.length && !allowEmpty) checks.push({ kind: "R", selector, property: "retained-labels", relation: "contains-all", expected: [...new Set(matcherLabels)] });
  if (artifact.language === "logql") {
    checks.push({ kind: "A", selector, node: "stream-selector", parameters: {} });
    const lineFilter = artifact.query.match(/(?:\||!)\s*(=|~)\s*"/);
    if (lineFilter) checks.push({ kind: "A", selector, node: "line-filter", parameters: { operator: `${artifact.query[lineFilter.index] === "!" ? "!" : "|"}${lineFilter[1]}` } });
    for (const parser of ["json", "logfmt"]) if (new RegExp(`\\|\\s*${parser}\\b`).test(artifact.query)) {
      checks.push({ kind: "A", selector, node: "parser", parameters: { kind: parser } });
    }
  } else {
    if (metricNames.some((name) => artifact.query.includes(name)) || /\bup\b/.test(artifact.query)) checks.push({ kind: "A", selector, node: "metric-selector", parameters: {} });
    for (const name of ["rate", "increase", "resets", "changes", "predict_linear", "histogram_quantile", "avg_over_time", "max_over_time", "min_over_time", "sum_over_time", "count_over_time", "quantile_over_time", "absent", "absent_over_time", "scalar", "vector"]) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(artifact.query)) checks.push({ kind: "A", selector, node: "function", parameters: { name } });
    }
    for (const operator of ["sum", "count", "avg", "min", "max", "topk", "bottomk"]) {
      if (new RegExp(`\\b${operator}\\s*(?:by\\s*\\([^)]*\\)\\s*)?\\(`).test(artifact.query)) checks.push({ kind: "A", selector, node: "aggregation", parameters: { operator } });
    }
    if (/\boffset\s+/.test(artifact.query)) checks.push({ kind: "A", selector, node: "time-modifier", parameters: { kind: "offset" } });
    if (/(?:==|!=|<=|>=|<|>)(?:\s+bool\b)?/.test(artifact.query)) checks.push({ kind: "A", selector, node: "comparison", parameters: { bool: /(?:==|!=|<=|>=|<|>)\s+bool\b/.test(artifact.query) } });
  }
  return checks;
}

function remapArtifactSelector(detector) {
  if ("op" in detector) return { ...detector, items: detector.items.map(remapArtifactSelector) };
  if (detector.kind === "E") return { ...detector, selectors: detector.selectors.map((selector) => selector === "artifact" ? "artifact[1]" : selector) };
  if ((detector.kind === "A" || detector.kind === "R") && detector.selector === "artifact") return { ...detector, selector: "artifact[1]" };
  return clone(detector);
}

function addRelativeRequirements(item, conceptId) {
  for (const variant of item.variants) {
    variant.requiredValues ??= [];
    variant.evidenceRequirements ??= [];
    for (const required of [...variant.requiredValues]) {
      if (required.conceptId === conceptId && required.selectors.length === 1 && required.selectors[0] === "artifact"
        && !variant.requiredValues.some((candidate) => candidate.conceptId === conceptId && candidate.detector === required.detector && candidate.subject === required.subject && candidate.selectors[0] === "artifact[1]")) {
        variant.requiredValues.push({ ...clone(required), selectors: ["artifact[1]"] });
      }
    }
    for (const required of [...variant.evidenceRequirements]) {
      if (required.conceptId === conceptId && required.selectors.length === 1 && required.selectors[0] === "artifact"
        && !variant.evidenceRequirements.some((candidate) => candidate.conceptId === conceptId && candidate.rule === required.rule && candidate.subject === required.subject && candidate.choiceId === required.choiceId && candidate.selectors[0] === "artifact[1]")) {
        variant.evidenceRequirements.push({ ...clone(required), selectors: ["artifact[1]"] });
      }
    }
  }
}

function restoreArtifactSelector(detector) {
  if ("op" in detector) return { ...detector, items: detector.items.map(restoreArtifactSelector) };
  if (detector.kind === "E") return { ...detector, selectors: detector.selectors.map((selector) => selector === "artifact[1]" ? "artifact" : selector) };
  if ((detector.kind === "A" || detector.kind === "R") && detector.selector === "artifact[1]") return { ...detector, selector: "artifact" };
  return clone(detector);
}

// Unwrap the generated merge before rebuilding it, so changed support rules propagate on
// every run instead of becoming frozen in campaign.json.
for (const item of campaign.cases) {
  const directPath = item.evidencePaths.find((path) => path.id.endsWith(".path.direct")) ?? item.evidencePaths[0];
  const target = directPath.clauses.at(-1);
  const generatedMerge = target?.artifactSelectors.length > 1 && "op" in target.requirements
    && target.requirements.items.slice(1).some((detector) => !("op" in detector) && detector.kind === "R" && detector.property === "status")
    && target.requirements.items.slice(1).some((detector) => !("op" in detector) && detector.kind === "A" && ["metric-selector", "stream-selector"].includes(detector.node));
  if (!generatedMerge) continue;
  target.artifactSelectors = target.artifactSelectors.slice(0, 1);
  target.requirements = restoreArtifactSelector(target.requirements.items[0]);
  for (const variant of item.variants) {
    variant.requiredValues = (variant.requiredValues ?? []).filter((required) => required.selectors[0] !== "artifact[1]"
      || !(variant.requiredValues ?? []).some((base) => base.conceptId === required.conceptId && base.detector === required.detector && base.subject === required.subject && base.selectors[0] === "artifact"));
    variant.evidenceRequirements = (variant.evidenceRequirements ?? []).filter((required) => required.selectors[0] !== "artifact[1]"
      || !(variant.evidenceRequirements ?? []).some((base) => base.conceptId === required.conceptId && base.rule === required.rule && base.subject === required.subject && base.choiceId === required.choiceId && base.selectors[0] === "artifact"));
  }
}

for (const item of campaign.cases) {
  const directPath = item.evidencePaths.find((path) => path.id.endsWith(".path.direct")) ?? item.evidencePaths[0];
  const direct = directSet(item.variants[0]);
  const selected = selectedPositions(directPath, direct.artifacts);
  const missing = direct.artifacts.map((_artifact, index) => index + 1).filter((position) => !selected.has(position));
  if (!missing.length) continue;
  const languages = new Set(missing.map((position) => direct.artifacts[position - 1].language));
  const target = [...directPath.clauses].reverse().find((clause) => {
    const language = concepts.get(clause.conceptId).language;
    return language === "shared" || (languages.size === 1 && languages.has(language));
  });
  if (!target) continue;
  addRelativeRequirements(item, target.conceptId);
  const originalSelectors = [...target.artifactSelectors];
  target.artifactSelectors = [...originalSelectors, ...missing.map((position) => `artifact[${position}]`)];
  target.requirements = {
    op: "all",
    items: [
      remapArtifactSelector(target.requirements),
      ...missing.flatMap((position, index) => artifactSupport(direct.artifacts[position - 1], `artifact[${originalSelectors.length + index + 1}]`, item.id === "case.192.party-record")),
    ],
  };
}

// Elm Exchange is the first evidence lesson, so both filed artifacts carry the
// conclusion: north-02 must answer and its queue metric must return 2.
{
  const item = cases.get(1);
  const directPath = item.evidencePaths.find((path) => path.id.endsWith(".path.direct")) ?? item.evidencePaths[0];
  const discovery = directPath.clauses.find((clause) => clause.conceptId === "promql.discovery.schema");
  assert(discovery, `${item.id} lacks its discovery evidence clause`);
  discovery.artifactSelectors = ["artifact[1]", "artifact[2]"];
  discovery.requirements = {
    op: "all",
    items: [
      { kind: "A", selector: "artifact[1]", node: "metric-selector", parameters: {} },
      { kind: "E", rule: "schema-selection", selectors: ["artifact[1]"], parameters: { source: "metric", "name-supplied": false } },
      { kind: "E", rule: "localization", selectors: ["artifact[1]"], parameters: { expected: "case-required" } },
      { kind: "R", selector: "artifact[1]", property: "value-domain", relation: "contains", expected: 1 },
      { kind: "A", selector: "artifact[2]", node: "metric-selector", parameters: {} },
      { kind: "E", rule: "schema-selection", selectors: ["artifact[2]"], parameters: { source: "metric", "name-supplied": false } },
      { kind: "E", rule: "localization", selectors: ["artifact[2]"], parameters: { expected: "case-required" } },
      { kind: "R", selector: "artifact[2]", property: "value-domain", relation: "contains", expected: 2 },
    ],
  };
  for (const variant of item.variants) {
    variant.requiredValues = (variant.requiredValues ?? []).filter((required) => !(
      required.conceptId === "promql.discovery.schema"
      && ["artifact[1]", "artifact[2]"].includes(required.selectors[0])
      && ["accepted-source-sets", "supplied-source-ids", "required-values"].includes(required.subject)
    ));
    for (const [selector, source] of [["artifact[1]", "up"], ["artifact[2]", "ministry_collector_queue_depth"]]) {
      variant.requiredValues.push(
        { conceptId: "promql.discovery.schema", detector: "E", selectors: [selector], subject: "accepted-source-sets", acceptedValues: [[source]] },
        { conceptId: "promql.discovery.schema", detector: "E", selectors: [selector], subject: "supplied-source-ids", acceptedValues: [[]] },
        { conceptId: "promql.discovery.schema", detector: "E", selectors: [selector], subject: "required-values", acceptedValues: [{ instance: "north-02" }] },
      );
    }
  }
}

// Spaced-recall cases transfer each repeated concept to a new source, matcher,
// operator, or record shape instead of accepting the expression used earlier.
setDirectQuery(120, 0, "ministry_registered_population{age_band=\"adult\",district!=\"south\"}");
setDirectQuery(120, 1, "ministry_registered_population{age_band=~\"adult|youth\",district!~\"south\"}");
setDirectQuery(122, 1, "{service=\"press\",press=~\"north-.+\",district!=\"south\"}");
setDirectQuery(123, 0, "{service=\"press\",district=\"north\"} |~ \"(accepted|rejected)\"");
setDirectQuery(156, 0, "bottomk(2, sum by (district) (ministry_inventory_units))");
setDirectQuery(156, 2, "ministry_collector_queue_depth{service!=\"clinic\"} <= bool 20");
setDirectQuery(157, 2, "{service=\"assurance-dispatch\",district=\"north\"} | pattern \"reason=<reason> facility=<facility> zone=<zone> scope=<scope> result=<result> elapsed=<elapsed>\"");
setDirectQuery(159, 0, "count_over_time({service=\"assurance-dispatch\",district=\"north\"}[1h])");
setDirectQuery(159, 1, "rate({service=\"assurance-dispatch\",district=\"north\"}[1h])");
setDirectQuery(159, 4, "max by (district) (rate({service=\"assurance-dispatch\",district=\"north\"}[1h]))");

// Later recalls keep the same measured population while requiring a more specific
// selector or a different legitimate filter form.
setDirectQuery(64, 1, '{service="pin-gateway",district="north"} |= "\\"event\\":\\"service_delay\\"" | json');
setDirectQuery(81, 1, '{service="pin-gateway",district="north"} |~ "service_delay" | json');
setDirectQuery(96, 1, '{service="pin-gateway",district="north"} |~ "\\"event\\"\\s*:\\s*\\"service_delay\\"" | json');
setDirectQuery(124, 1, '{service="pin-gateway",district="north"} |= "\\"service_delay\\"" | json');
for (const number of [97, 125]) {
  for (const position of [0, 1, 2]) setDirectQuery(number, position, (_variant, index) =>
    directSet(cases.get(65).variants[index] ?? cases.get(65).variants[0]).artifacts[position].query);
}
setDirectQuery(98, 0, 'histogram_quantile(0.95, sum by (district, le) (rate(ministry_dispatch_duration_seconds_bucket{district="north",depot="depot-a"}[30m])))');
setDirectQuery(98, 1, 'histogram_quantile(0.95, sum by (district) (rate(ministry_gateway_latency_seconds{district="north",instance="north-02"}[30m])))');
setDirectQuery(126, 0, 'histogram_quantile(0.95, sum by (district, le) (rate(ministry_dispatch_duration_seconds_bucket{district="north",reason="service"}[30m])))');
setDirectQuery(126, 1, 'histogram_quantile(0.95, sum by (district) (rate(ministry_gateway_latency_seconds{district="north",service="pin-gateway"}[30m])))');

for (const [variant, expected] of cases.get(156).variants.map((variant, index) => [variant, index === 0 ? [59, 116] : [78, 116]])) {
  const requirement = variant.requiredValues.find((candidate) => candidate.conceptId === "promql.aggregate.rank" && candidate.subject === "expected");
  assert(requirement, `${variant.id} lacks its rank expectation`);
  requirement.acceptedValues = [expected];
}
for (const variant of cases.get(157).variants) {
  const requirement = variant.requiredValues.find((candidate) => candidate.conceptId === "logql.parse.pattern-regexp" && candidate.subject === "retained-fields");
  assert(requirement, `${variant.id} lacks its pattern parser field expectation`);
  requirement.acceptedValues = [["service", "district", "depot", "reason", "facility", "zone", "scope", "result", "elapsed"]];
}

// Repack mixed lesson bundles around one operational population. The detectors and
// mastery stages stay intact; only the sources that those lessons inspect are aligned.
setDirectQuery(48, 0, '(up{job="pin-collector",district="north"} == bool 0) * on (district, service, instance) (ministry_collector_queue_depth{district="north"} > bool 20)');
for (const [index, variant] of cases.get(48).variants.entries()) {
  const operator = variant.requiredValues.find((value) =>
    value.conceptId === "promql.binary.precedence" && value.subject === "binary.operator");
  const expected = variant.requiredValues.find((value) =>
    value.conceptId === "promql.binary.precedence" && value.subject === "expected");
  assert(operator && expected, `${variant.id} lacks its precedence requirements`);
  operator.acceptedValues = ["*"];
  expected.acceptedValues = [index === 0 ? 1 : 0];
}

setDirectQuery(61, 0, '{service="press",district="north",press="north-star"} |= "\\"result\\":\\"failed\\"" | json');
setDirectQuery(61, 1, (_variant, index) => index === 0
  ? '{service="press",district="north",press="north-star"} | pattern "<_>\\"result\\":\\"<result>\\"<_>"'
  : '{service="press",district="north",press="north-star"} | regexp "\\"result\\":\\"(?P<result>[^\\"]+)\\""');
setDirectQuery(61, 2, '{service="press",district="north",press="north-star"} |= "\\"result\\":\\"failed\\""');
setDirectQuery(61, 3, '{service="press",district="north",press="north-star"} |= "\\"result\\":\\"failed\\""');
for (const variant of cases.get(61).variants) {
  const retainedFields = variant.requiredValues.find((value) =>
    value.conceptId === "logql.parse.pattern-regexp" && value.subject === "retained-fields");
  assert(retainedFields, `${variant.id} lacks its parser field requirement`);
  retainedFields.acceptedValues = [["service", "district", "press", "edition_id", "trace_id", "result"]];
}

for (const number of [77, 92, 157]) {
  setDirectQuery(number, 1, '{service="pin-gateway",district="north",environment="production"} |= "service_delay" | json');
  setDirectQuery(number, 2, (_variant, index) => index === 0
    ? '{service="pin-gateway",district="north",environment="production"} |= "service_delay" | pattern "<_>\\"event\\":\\"<event>\\"<_>\\"status\\":\\"<status>\\"<_>"'
    : '{service="pin-gateway",district="north",environment="production"} |= "service_delay" | regexp "\\"event\\":\\"(?P<event>[^\\"]+)\\".*\\"status\\":\\"(?P<status>[^\\"]+)\\""');
  for (const variant of cases.get(number).variants) {
    const jsonFields = variant.requiredValues.find((value) =>
      value.conceptId === "logql.parse.json-logfmt" && value.subject === "retained-fields");
    const patternFields = variant.requiredValues.find((value) =>
      value.conceptId === "logql.parse.pattern-regexp" && value.subject === "retained-fields");
    assert(jsonFields && patternFields, `${variant.id} lacks its parser field requirements`);
    jsonFields.acceptedValues = [["service", "district", "environment", "member_id", "device_id", "trace_id", "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status"]];
    patternFields.acceptedValues = [["service", "district", "environment", "member_id", "device_id", "trace_id", "event", "status"]];
  }
}

setDirectQuery(107, 0, '(ministry_collector_queue_depth{district="north"} > bool 20) * on (district, service, instance) (up{job="pin-collector",district="north"} == bool 1)');
setDirectQuery(107, 1, '{service="pin-gateway",district="north",environment="production"} | json');
for (const [index, variant] of cases.get(107).variants.entries()) {
  const operator = variant.requiredValues.find((value) =>
    value.conceptId === "promql.binary.precedence" && value.subject === "binary.operator");
  const expected = variant.requiredValues.find((value) =>
    value.conceptId === "promql.binary.precedence" && value.subject === "expected");
  const jsonFields = variant.requiredValues.find((value) =>
    value.conceptId === "logql.parse.json-logfmt" && value.subject === "retained-fields");
  assert(operator && expected && jsonFields, `${variant.id} lacks its queue-record requirements`);
  operator.acceptedValues = ["*"];
  expected.acceptedValues = [index === 0 ? 1 : 0];
  jsonFields.acceptedValues = [["service", "district", "environment", "member_id", "device_id", "trace_id", "event", "facility", "cohort", "battery_ratio", "duration", "payload_bytes", "status"]];
}

// These work orders name one population in every playable topology.
setDirectQuery(2, 0, 'up{service="pin-gateway",district!="south"}');
setDirectQuery(5, 0, 'ministry_pin_battery_ratio{district="north"} < 0.9');
setDirectQuery(40, 1, 'up{service="pin-gateway",district="north",instance!="retired"}');
setDirectQuery(52, 0, 'sum by (district, service) (ministry_collector_queue_depth{district="north"})');
for (const variant of cases.get(52).variants) {
  const location = variant.requiredValues.find((value) =>
    value.conceptId === "shared.localization" && value.subject === "required-values");
  assert(location, `${variant.id} lacks its localization requirement`);
  location.acceptedValues = [{ district: "north" }];
}

// Hillside's authored work order uses the request counter already available at this point
// in the curriculum, with a local population in both playable packets.
setDirectQuery(89, 0, 'sum by (district, route, code) (rate(ministry_service_requests_total{district="hillside",route="/hillside-retreat"}[30m]))');
setDirectQuery(89, 1, 'sum by (district, route, code) (increase(ministry_service_requests_total{district="hillside",route="/hillside-retreat"}[30m]))');
for (const variant of cases.get(89).variants) {
  const dataset = datasets.get(variant.datasetId);
  const template = dataset.series.find((series) => series.metric === "ministry_service_requests_total" && series.labels.code === "200");
  assert(template, `${variant.id} lacks its service-request template`);
  for (const [code, step] of [["200", 12], ["503", 3]]) {
    const id = `${dataset.id}.narrative.hillside.requests.${code}`;
    dataset.series = dataset.series.filter((series) => series.id !== id);
    dataset.series.push({
      ...clone(template), id,
      labels: { district: "hillside", service: "assurance-dispatch", route: "/hillside-retreat", code },
      samples: template.samples.map((sample, index) => ({ ...sample, value: 100 + index * step })),
    });
  }
}
{
  const metric = campaign.metrics.find((candidate) => candidate.name === "ministry_service_requests_total");
  metric.knownLabelValues.district = [...new Set([...metric.knownLabelValues.district, "hillside"])];
  metric.knownLabelValues.service = [...new Set([...metric.knownLabelValues.service, "assurance-dispatch"])];
  metric.knownLabelValues.route = [...new Set([...metric.knownLabelValues.route, "/hillside-retreat"])];
}
setDirectQuery(123, 0, '{service="pin-gateway",district="hillside",record_type="pin"} |~ "pin_(retired|registered)"');
setDirectQuery(123, 1, '{service="pin-gateway",district="hillside",record_type="pin"} |= "pin_" | json');
cases.get(123).variants[1].datasetId = cases.get(123).variants[0].datasetId;

// Performance compares equivalent North predictions. The broader expression is the
// original; the exact selector is the lower-cost revision.
const broadNorthPrediction = 'predict_linear(ministry_contentment_index{district=~"north|west"}[1h], 3600) and on (district, cohort) ministry_contentment_index{district="north"}';
const exactNorthPrediction = 'predict_linear(ministry_contentment_index{district="north"}[1h], 3600)';
setDirectQuery(173, 0, exactNorthPrediction);
setDirectQuery(173, 1, broadNorthPrediction);
setDirectQuery(189, 0, broadNorthPrediction);
setDirectQuery(189, 1, exactNorthPrediction);
for (const variant of cases.get(189).variants) for (const requirement of variant.evidenceRequirements ?? []) {
  if (requirement.conceptId !== "promql.performance" || requirement.subject !== "population") continue;
  for (const alternative of requirement.alternatives ?? []) for (const detector of alternative) {
    if (detector.kind === "R" && detector.property === "retained-labels") detector.expected = ["district", "cohort"];
  }
}

for (const number of [67, 137]) {
  setDirectQuery(number, 0, 'histogram_quantile(0.95, sum by (district, le) (rate(ministry_dispatch_duration_seconds_bucket{district="north"}[30m])))');
  setDirectQuery(number, 1, 'absent(ministry_dispatch_duration_seconds_bucket{district="north"})');
  setDirectQuery(number, 2, 'absent_over_time(ministry_dispatch_duration_seconds_bucket{district="north"}[30m])');
}
setDirectQuery(113, 0, 'histogram_quantile(0.95, sum by (district) (rate(ministry_gateway_latency_seconds{district="north"}[30m])))');
setDirectQuery(113, 1, 'absent(ministry_gateway_latency_seconds{district="north"})');

setDirectQuery(132, 0, 'ministry_facility_demand{district="north"} / on (district, facility, service) ministry_facility_capacity{district="north"}');
setDirectQuery(132, 1, 'ministry_facility_demand{district="north"} unless on (district, facility, service) ministry_facility_capacity{district="north"}');
setDirectQuery(132, 2, 'max_over_time((ministry_facility_demand{district="north"} / on (district, facility, service) ministry_facility_capacity{district="north"})[30m:5m])');
cases.get(132).variants[1].datasetId = cases.get(132).variants[0].datasetId;

setDirectQuery(47, 1, (_variant, index) => {
  const district = index === 0 ? "north" : "west";
  return `sum(ministry_collector_queue_depth{district="${district}"}) / count(ministry_collector_queue_depth{district="${district}"})`;
});
setDirectQuery(156, 1, (_variant, index) => {
  const district = index === 0 ? "north" : "west";
  return `sum(ministry_inventory_units{district="${district}"}) / count(ministry_inventory_units{district="${district}"})`;
});
setDirectQuery(156, 2, (_variant, index) => {
  const district = index === 0 ? "north" : "west";
  return `ministry_inventory_units{district="${district}"} <= bool 20`;
});

setDirectQuery(112, 0, 'ministry_facility_demand{district="north"} * on (district, facility, service) group_left (priority_band) ministry_facility_capacity{district="north"}');
setDirectQuery(112, 1, (_variant, index) => index === 0
  ? 'ministry_facility_demand{district="north"} and on (district, facility, service) ministry_facility_capacity{district="north"}'
  : 'ministry_facility_demand{district="north"} unless on (district, facility, service) ministry_facility_capacity{district="north"}');
setDirectQuery(112, 2, 'histogram_quantile(0.95, sum by (district, le) (rate(ministry_dispatch_duration_seconds_bucket{district="north"}[30m])))');

for (const number of [136, 162, 178]) setDirectQuery(number, 0, (_variant, index) => {
  const matcher = number === 178 ? '=~"north"' : '="north"';
  const operator = index === 0 ? "and" : "unless";
  return `ministry_facility_demand{district${matcher}} ${operator} on (district, facility, service) ministry_facility_capacity{district${matcher}}`;
});
for (const number of [136, 162, 178]) setDirectQuery(number, 1,
  `histogram_quantile(0.95, sum by (district, le) (rate(ministry_dispatch_duration_seconds_bucket{district${number === 178 ? '=~"north"' : '="north"'}}[30m])))`);
setDirectQuery(136, 2, 'histogram_quantile(0.95, sum by (district) (rate(ministry_gateway_latency_seconds{district="north"}[30m])))');

const topologyMatchValues = cases.get(112).variants[1].requiredValues.find((value) =>
  value.conceptId === "promql.match.many-to-one" && value.subject === "required-values");
assert(topologyMatchValues, `${cases.get(112).variants[1].id} lacks its matching value requirement`);
topologyMatchValues.acceptedValues = [{ district: "north" }];

for (const [number, unit] of [[47, "records"], [156, "units"]]) for (const variant of cases.get(number).variants) {
  for (const requirement of variant.evidenceRequirements.filter((value) =>
    value.conceptId === "promql.binary.ratio" && value.subject === "unit")) {
    for (const alternative of requirement.alternatives) for (const detector of alternative) {
      if (detector.kind === "R" && detector.property === "unit") detector.expected = unit;
    }
  }
}
for (const variant of cases.get(156).variants) {
  for (const requirement of variant.evidenceRequirements.filter((value) => value.conceptId === "promql.comparison.bool")) {
    for (const alternative of requirement.alternatives) for (const detector of alternative) {
      if (detector.kind === "R" && detector.property === "retained-labels") detector.expected = ["district", "depot", "supply"];
    }
  }
}

const operationalRoles = new Map([
  [48, ["service-health", "incident-record"]],
  [61, ["parsed-record", "routed-record", "provenance-record", "watch-expression"]],
  [77, ["service-health", "structured-record", "routed-record"]],
  [92, ["service-health", "structured-record", "routed-record"]],
  [107, ["queue-threshold", "incident-record"]],
  [157, ["service-health", "structured-record", "routed-record"]],
]);
for (const [number, roles] of operationalRoles) for (const variant of cases.get(number).variants) {
  const direct = directSet(variant);
  direct.artifacts.forEach((artifact, index) => { artifact.role = roles[index]; });
  variant.workedEvidenceSet.artifacts.forEach((artifact, index) => { artifact.role = roles[index]; });
}

// Printer switches are evidence only when presentation changes the claim. Opening cases
// show query identity and labels; range-selector lessons show their range on a graph; and
// zero/absence lessons anchor the graph at zero.
const printProperties = new Set(["print-query", "print-labels", "print-range", "print-zero-axis", "visualization"]);
const rangePrintConcepts = new Set(["promql.time.range-selector"]);
const zeroPrintConcepts = new Set(["promql.comparison.bool", "promql.absence.instant", "promql.absence.range", "shared.absence-model"]);
const printPlans = new Map();

function removePrintChecks(detector) {
  if (!("op" in detector)) return detector.kind === "R" && printProperties.has(detector.property) ? undefined : clone(detector);
  const items = detector.items.map(removePrintChecks).filter(Boolean);
  if (items.length === 1) return items[0];
  return { ...detector, items };
}

function selectorPositions(selector, artifacts) {
  const slot = selector.match(/^artifact\[(\d+)\]$/)?.[1];
  if (slot) return [Number(slot)];
  if (selector === "watch-expression") return artifacts.flatMap((artifact, index) => artifact.role === selector ? [index + 1] : []);
  if (selector === "promql" || selector === "logql") return artifacts.flatMap((artifact, index) => artifact.language === selector ? [index + 1] : []);
  return [];
}

function clausePosition(clause, artifacts, position) {
  for (const [index, selector] of clause.artifactSelectors.entries()) if (selectorPositions(selector, artifacts).includes(position)) return index;
  return -1;
}

function requirePrint(clause, selector, property, expected) {
  const check = { kind: "R", selector, property, relation: "=", expected };
  const leaves = (detector) => "op" in detector ? detector.items.flatMap(leaves) : [detector];
  if (leaves(clause.requirements).some((detector) => detector.kind === "R" && detector.selector === selector && detector.property === property && detector.expected === expected)) return;
  clause.requirements = "op" in clause.requirements && clause.requirements.op === "all"
    ? { ...clause.requirements, items: [...clause.requirements.items, check] }
    : { op: "all", items: [clause.requirements, check] };
}

for (const item of campaign.cases) {
  item.evidencePaths.forEach((path) => path.clauses.forEach((clause) => { clause.requirements = removePrintChecks(clause.requirements); }));
  const directPath = item.evidencePaths.find((path) => path.id.endsWith(".path.direct")) ?? item.evidencePaths[0];
  const artifacts = directSet(item.variants[0]).artifacts;
  const plan = { showQuery: false, showLabels: false, showRange: false, zeroAxis: false };
  const applyAt = (position, requirements) => {
    const clause = directPath.clauses.find((candidate) => clausePosition(candidate, artifacts, position) >= 0);
    assert(clause, `${item.id} has no evidence clause for print-sensitive artifact ${position}`);
    const localIndex = clausePosition(clause, artifacts, position);
    const selector = clause.artifactSelectors.length === 1 ? "artifact" : `artifact[${localIndex + 1}]`;
    for (const [property, expected] of requirements) requirePrint(clause, selector, property, expected);
  };

  if (caseNumber(item) <= 8) {
    for (let position = 1; position <= item.report.minArtifacts; position += 1) {
      applyAt(position, [["print-query", true], ["print-labels", true]]);
    }
    plan.showQuery = true;
    plan.showLabels = true;
  }
  for (const clause of directPath.clauses) if (rangePrintConcepts.has(clause.conceptId)) {
    for (const outerSelector of clause.artifactSelectors) for (const position of selectorPositions(outerSelector, artifacts)) {
      if (artifacts[position - 1].language !== "promql") continue;
      applyAt(position, [["print-range", true]]);
      plan.showRange = true;
    }
  }
  for (const clause of directPath.clauses) if (zeroPrintConcepts.has(clause.conceptId)) {
    for (const outerSelector of clause.artifactSelectors) for (const position of selectorPositions(outerSelector, artifacts)) {
      if (artifacts[position - 1].language !== "promql") continue;
      applyAt(position, [["print-zero-axis", true]]);
      plan.zeroAxis = true;
    }
  }
  if (Object.values(plan).some(Boolean)) printPlans.set(item.id, plan);
}

// Each alternate route must prove the same semantic clauses as the direct route. A distinct
// source is included as corroborating context, but never substitutes for those concept checks.
function alternateExpression(artifact) {
  if (artifact.language === "promql") return `(${artifact.query})`;
  if (artifact.mode === "records") return `${artifact.query} |~ ".*"`;
  return `(${artifact.query}) + 0`;
}

function contextSource(item) {
  const directText = item.variants.flatMap((variant) => directSet(variant).artifacts.map((artifact) => artifact.query)).join("\n");
  return item.availableSources.find((source) => !source.startsWith("record.") && !directText.includes(source))
    ?? item.availableSources.find((source) => source.startsWith("record.") && !directText.includes(source))
    ?? item.availableSources[0];
}

for (const item of campaign.cases) {
  const directPath = item.evidencePaths.find((candidate) => candidate.id.endsWith(".path.direct")) ?? item.evidencePaths[0];
  const alternatePath = item.evidencePaths.find((candidate) => candidate.id.endsWith(".path.corroborated")) ?? item.evidencePaths[1];
  const sourceId = contextSource(item);
  alternatePath.description = `Alternate semantic route for ${item.title}. It re-executes every named concept and includes a separately registered context source; a successful but unrelated query cannot support the report.`;
  alternatePath.clauses = clone(directPath.clauses);
  item.variants.forEach((variant) => {
    const direct = directSet(variant);
    const alternate = variant.referenceSets.find((set) => set.evidencePathId === alternatePath.id) ?? variant.referenceSets[1];
    const artifacts = direct.artifacts.map((artifact) => ({ ...clone(artifact), query: alternateExpression(artifact) }));
    if (sourceId.startsWith("record.")) {
      const stream = datasets.get(variant.datasetId).streams.find((candidate) => candidate.sourceId === sourceId);
      assert(stream, `${item.id} ${variant.id} lacks context source ${sourceId}`);
      const selector = Object.entries(stream.labels).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(",");
      artifacts.push({ role: "corroboration-context", language: "logql", mode: "records", query: `{${selector}}` });
      item.languages = [...new Set([...item.languages, "logql"])];
      if (!item.report.visualizations.includes("logs")) item.report.visualizations.push("logs");
    } else {
      artifacts.push({ role: "corroboration-context", language: "promql", mode: "instant", query: sourceId });
      item.languages = [...new Set([...item.languages, "promql"])];
      if (!item.report.visualizations.some((view) => view === "table" || view === "stat")) item.report.visualizations.push("table");
    }
    alternate.evidencePathId = alternatePath.id;
    alternate.artifacts = artifacts;
    item.report.maxArtifacts = Math.max(item.report.maxArtifacts, artifacts.length);
  });
}

// Keep every case scannable. This pass owns visible case prose and builds the same
// four-step hint ladder from the executable primary reference set in every case.
const characters = new Map(campaign.characters.map((character) => [character.id, character.name]));
const fixedRecordCases = new Set([9, 19, 30, 44, 56, 87, 123]);

function caseNumber(item) {
  return Number(item.id.match(/^case\.(\d+)/)?.[1]);
}

const possessive = (text) => text.endsWith("s") ? `${text}'` : `${text}'s`;
const sentence = (text) => `${text[0].toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? "" : "."}`;

function teachingFor(item) {
  const has = (...ids) => ids.some((id) => item.conceptIds.includes(id));
  if (fixedRecordCases.has(caseNumber(item))) return {
    kind: "fixed-records",
    brief: "Inspect the fixed backward result. Only per-stream timestamp order is defined.",
    question: `In ${possessive(item.title)} fixed result, which fields and per-stream order are valid, and which cross-stream order remains undefined?`,
    look: "Inspect parsed fields and timestamps within each stream. Do not infer an order across streams.",
    scope: "parsed fields and per-stream timestamps",
  };
  if (has("promql.watch.design", "logql.watch.design", "shared.watch-quality")) return {
    kind: "watch",
    brief: "Test detection, localization, timeliness, and cost across every checkpoint.",
    question: `Does ${item.title} detect the intended event, retain its location, and stay within budget?`,
    look: "Check every checkpoint, intended and distractor events, location labels, and budget.",
    scope: "checkpoint detections, locations, and cost",
  };
  if (has("promql.performance", "logql.performance.order", "logql.performance.cardinality")) return {
    kind: "performance",
    brief: "Reduce scanned records and returned series without changing the result.",
    question: `Does ${item.title} keep the required result while reducing scan volume and returned series?`,
    look: "Compare the original query with the revised query. Inspect scan volume, returned series, labels, and values.",
    scope: "scan volume, returned series, labels, and values",
  };
  if (has("promql.absence.instant", "promql.absence.range", "logql.absence.range", "shared.absence-model")) return {
    kind: "absence",
    brief: "Separate missing series, empty windows, present zero, and collection failure.",
    question: `Does ${item.title} prove absence in the selected window, or only missing telemetry?`,
    look: "Compare missing series, empty windows, present zero, and collection gaps.",
    scope: "series presence and selected window",
  };
  if (has("logql.quantile")) return {
    kind: "log-quantile",
    brief: "Find the parsed samples, percentile, grouping labels, and unit.",
    question: `For ${item.title}, which samples enter the percentile and which labels and unit remain?`,
    look: "Inspect the unwrapped, error-free samples in their selected window, then verify each grouping label and unit.",
    scope: "parsed samples, percentile, labels, and unit",
  };
  if (has("promql.histogram.native")) return {
    kind: "native-histogram",
    brief: "Identify the native histogram population and unit before reading the percentile.",
    question: `Which population and unit make the ${item.title} percentile valid?`,
    look: "Inspect the population, quantile bounds, interpolation, labels, and unit.",
    scope: "histogram population, percentile, labels, and unit",
  };
  if (has("promql.histogram.classic", "promql.histogram.interpret")) return {
    kind: "classic-histogram",
    brief: "Verify the population, buckets, and unit before reading the tail.",
    question: `Which population, buckets, and unit make ${possessive(item.title)} percentile defensible?`,
    look: "Check bucket population, `le` labels, monotonicity, quantile bounds, and unit.",
    scope: "bucket population, percentile, and unit",
  };
  if (has("promql.match.one-to-one", "promql.match.many-to-one", "promql.set.operators")) return {
    kind: "matching",
    brief: "Match identities without duplication, silent exclusion, or many-to-many joins.",
    question: `Which ${item.title} identities match, remain unmatched, or change under the chosen operator?`,
    look: "Run both operands. Inspect matching labels, group modifiers, and unmatched series.",
    scope: "matched labels and cardinality",
  };
  if (has("promql.aggregate.reduce", "promql.aggregate.labels", "promql.aggregate.rank", "logql.aggregate")) return {
    kind: "aggregation",
    brief: "Choose the required aggregation and retain every label needed for action.",
    question: `Does ${item.title} use the required aggregation and preserve its action labels?`,
    look: "Inspect raw series, aggregation operator, `by` or `without` labels, and any rank.",
    scope: "aggregation, groups, and retained labels",
  };
  if (has("promql.comparison.filter")) return {
    kind: "comparison",
    brief: "Apply the threshold and inspect which series remain.",
    question: `Which ${item.title} series pass the threshold, and which labels and values remain?`,
    look: "Inspect the threshold and every returned label set. A comparison filter keeps each passing series value.",
    scope: "threshold, returned series, labels, and values",
  };
  if (has("promql.binary.ratio", "promql.binary.precedence", "logql.binary", "promql.comparison.bool")) return {
    kind: "binary",
    brief: "Check both operands, matching rules, precedence, and the result unit.",
    question: `Do ${possessive(item.title)} operands, matching labels, precedence, and unit support the claim?`,
    look: "Inspect both operands, matching labels, denominator, `bool` mode, precedence, and unit.",
    scope: "operands, matching labels, and unit",
  };
  if (has("logql.unwrap.numeric", "logql.unwrap.units", "logql.unwrap.range")) return {
    kind: "unwrap",
    brief: "Parse first, unwrap the typed field, then remove conversion errors.",
    question: `Which typed ${item.title} samples survive parsing, unwrapping, and error filtering?`,
    look: "Parse first, unwrap the typed field, inspect `__error__`, then apply the range function.",
    scope: "parsed field, unit, and error-free samples",
  };
  if (has("logql.selector.equality", "logql.selector.regex-negative", "logql.filter.literal", "logql.filter.regex-pattern")) return {
    kind: "log-selection",
    brief: "Select streams first, then filter the raw record text.",
    question: `Which ${item.title} records remain after the stream selector and text filter?`,
    look: "Inspect stream labels and raw record text. Fields appear only after `json` or `logfmt`.",
    scope: "stream labels and matching records",
  };
  if (has("logql.pipeline.order", "logql.parse.json-logfmt", "logql.parse.pattern-regexp", "logql.field.provenance", "logql.filter.typed", "logql.error.pipeline", "logql.format.line", "logql.format.label-template")) return {
    kind: "pipeline",
    brief: "Order the pipeline so filters, parsed fields, errors, and provenance remain auditable.",
    question: `Which ${item.title} records survive each stage, and are their fields and errors still auditable?`,
    look: "Filter streams early, parse before typed filters, inspect `__error__`, and retain provenance.",
    scope: "surviving records, parsed fields, and provenance",
  };
  if (has("promql.type.counter-gauge", "promql.counter.rate", "promql.counter.increase", "promql.change.resets", "promql.time.offset-at", "promql.time.subquery", "promql.time.over-time", "promql.prediction", "logql.metric.count-rate", "logql.metric.bytes", "logql.time.offset", "shared.time-view")) return {
    kind: "time",
    brief: "Keep evaluation time, range, offset, reset handling, and forecast horizon explicit.",
    question: `Which interval and evaluation time make the ${item.title} result valid?`,
    look: "Check evaluation time, range, offset, reset handling, and any forecast horizon.",
    scope: "evaluation time, interval, and returned values",
  };
  if (has("shared.metric-log-correlation", "shared.localization")) return {
    kind: "correlation",
    brief: "Correlate only evidence that shares the required time and location.",
    question: `Do ${possessive(item.title)} metric and record evidence share the required time and location?`,
    look: "Compare metric and record windows. Require the same time and location labels.",
    scope: "shared time, location, and returned identities",
  };
  if (has("promql.result.model", "logql.result.window-order", "shared.result-interpretation")) return {
    kind: "result",
    brief: "Identify the result type and keep empty distinct from zero.",
    question: `What result type does ${item.title} return, and is it empty or zero?`,
    look: "Check result type, evaluation mode, labels, values, and empty-versus-zero behavior.",
    scope: "labels, values, and result type",
  };
  return {
    kind: "selector",
    brief: "Open the named Registry entries; use explicit matchers and preserve every returned label and value.",
    question: `Which returned labels and values support the ${item.title} action?`,
    look: "Start from registry metadata; inspect matchers, returned labels, values, and empty results.",
    scope: "source names, labels, values, and result type",
  };
}

const authoredTheses = {
  "case.040.reset-review": {
    kind: "restart-temperature",
    brief: "Compare the North annex temperature and gateway reachability with the paper's ready-for-breakfast notice.",
    question: "Do the North annex temperature and reachable gateway support today's ready-for-breakfast notice?",
    look: "Read the labeled North annex temperature beside gateway reachability, then compare both with the published notice.",
    scope: "North annex temperature, gateway reachability, and notice",
    finding: "the gateway answers while the North annex is 3.5 °C, so the service notice is false",
    findingTitle: "gateway reachable; North annex remains cold",
    alternative: "collector reachability proves the North annex is ready",
    evidenceTitle: "Reachable Gateway, Cold North Annex",
    assuredTitle: "North Annex Ready",
    assuredConclusion: "School Twelve's North annex is ready for breakfast.",
    rebuttal: "The printouts do not support the claim that School Twelve's North annex is ready for breakfast.",
  },
  "case.048.watch-officer-board": {
    kind: "collector-delay",
    brief: "Combine North collector reachability with queue pressure, then compare that indicator with the parsed pin-gateway delay record.",
    question: "Is the North collector both offline and backlogged, and what status does the pin-gateway delay record retain?",
    look: "Read the grouped zero-or-one collector indicator, then retain the delay record's district, event, status, and provenance.",
    scope: "North collector reachability, queue pressure, and pin-gateway delay record",
    finding: "the grouped collector indicator reports whether North is offline and backlogged while the parsed record preserves the gateway delay status",
    findingTitle: "the collector indicator and delay record retain North scope",
    alternative: "those two readings prove every North service failure shares one cause",
    alternativeTitle: "two readings prove one cause across North",
    evidenceTitle: "North Collector Indicator and Delay Record",
    assuredTitle: "One Cause Across North",
    rebuttal: "The grouped collector indicator and one delay record do not prove that every North service failure shares one cause.",
  },
  "case.052.pipeline-order": {
    kind: "localized-metrics",
    brief: "Compare North's grouped queue depth with labeled pin-collector reachability.",
    question: "Do North's queue and reachability metrics retain the same district and service location?",
    look: "Read the grouped North queue result beside the North pin-collector reachability row, retaining district and service labels.",
    scope: "North queue depth, pin-collector reachability, district, and service labels",
    finding: "the grouped queue and reachability metrics retain the same North pin-gateway location",
    findingTitle: "queue and reachability retain the North location",
    alternative: "the shared North labels prove the two metrics describe every part of one incident",
    alternativeTitle: "shared North labels prove one complete incident",
    evidenceTitle: "North Queue and Reachability Location",
    assuredTitle: "Complete North Incident",
    rebuttal: "Shared North labels do not prove that the two metrics describe every part of one incident.",
  },
  "case.061.broad-press-watch": {
    kind: "parsed-watch",
    brief: "Build the press watch from parsed failure fields while retaining the source record and district.",
    question: "Does Broad Press Watch detect failed press records and retain their district and provenance?",
    look: "Inspect parsed result fields, raw provenance, the watch expression, every checkpoint, and retained district labels.",
    scope: "failed press records, provenance, checkpoints, and district",
    finding: "parsed North Star results retain district, press, and provenance for the failed-result watch",
    alternative: "unparsed text or lost provenance supports permanent press coverage",
    evidenceTitle: "Localized Failed-Press Watch",
    assuredTitle: "Permanent Press Coverage",
    rebuttal: "The tested failed-press records do not prove permanent coverage or every future wording.",
  },
  "case.084.threshold-watch": {
    kind: "north-removal-watch",
    brief: "Build the removed-Pin watch beside North's request window, collector reachability check, and parsed gateway delay record.",
    question: "What North service evidence constrains the removed-Pin watch without assigning one cause to every reading?",
    look: "Compare the request window, collector reachability result, parsed delay record, and removed-Pin watch. Keep their common North scope without inventing causation.",
    scope: "North request window, collector reachability, gateway delay, and removed-Pin watch",
    finding: "the request window, reachability check, delay record, and removed-Pin expression form one North-scoped service watch without proving a common cause",
    findingTitle: "four North readings constrain the removed-Pin watch",
    alternative: "the four North readings prove every service symptom and Pin removal share one cause",
    alternativeTitle: "four readings prove one cause across North",
    evidenceTitle: "North Service and Removed-Pin Watch",
    assuredTitle: "One Cause Across North",
    rebuttal: "Four North-scoped readings do not prove that every service symptom and Pin removal share one cause.",
  },
  "case.067.removed-series": {
    kind: "histogram-presence",
    brief: "Compare the dispatch percentile with current and range checks for the same bucket series.",
    question: "Are Removed Series' dispatch buckets present, and what percentile do those buckets support?",
    look: "Check the same dispatch bucket population in all three queries. Separate a returned tail from missing telemetry.",
    scope: "dispatch buckets, percentile, and window",
    finding: "the dispatch buckets are present and support only the returned percentile",
    alternative: "missing dispatch buckets prove every route met the limit",
    evidenceTitle: "Present Buckets and Returned Tail",
    assuredTitle: "Every Dispatch Within the Limit",
    rebuttal: "One district percentile does not prove every dispatch met the limit or that other districts have data.",
  },
  "case.089.bad-duration": {
    kind: "hillside-requests",
    brief: "Compare Hillside Retreat request rates with their 30-minute increases by result code.",
    question: "Which Hillside Retreat result codes appear in both the per-second request rate and the 30-minute increase?",
    look: "Compare the request rate and increase by code, retaining Hillside and the retreat route.",
    scope: "Hillside Retreat request codes, rates, and 30-minute increases",
    finding: "the Hillside Retreat rate and 30-minute increase keep each request result code separate",
    findingTitle: "rate and increase retain Hillside request codes",
    alternative: "the grouped Hillside totals prove every request had one outcome",
    alternativeTitle: "grouped Hillside totals prove one request outcome",
    evidenceTitle: "Hillside Request Results",
    assuredTitle: "One Outcome for Every Hillside Request",
    rebuttal: "Grouped rates and increases do not prove that every Hillside request had one outcome.",
  },
  "case.104.threshold-notices": {
    kind: "collector-diagnosis",
    brief: "Read reachability, matching delay records, and request rate together before classifying the notice.",
    question: "Do reachability, delay records, and request rate show collector failure or no traffic?",
    look: "Compare the labeled reachability result, matching delay records, and counter rate. Keep zero distinct from missing traffic.",
    scope: "collector reachability, delay records, and request rate",
    finding: "the three readings distinguish collector failure from missing traffic",
    alternative: "one empty or zero reading proves district-wide absence",
    evidenceTitle: "Collector Failure Diagnosis",
    assuredTitle: "District Service Absent",
    rebuttal: "A zero or empty reading alone does not prove service absence across every district or its cause.",
  },
  "case.117.membership-reopen": {
    kind: "membership-publication-audit",
    brief: "Audit the archived Party Membership announcement through its formatted press records, prior-day publication rate, and 100% registered-population calculation.",
    question: "What do the press records establish about the announcement, and does its equal-population calculation measure Party membership?",
    look: "Inspect the formatted press results and outcome labels, compare the prior-day publication rate, then identify both operands in the 100% calculation.",
    scope: "formatted press results, prior-day publication rate, and equal registered-population operands",
    finding: "the press artifacts establish how the announcement was published while equal registered-population operands explain 100% without measuring Party membership",
    findingTitle: "publication records and equal operands do not measure membership",
    findingSummary: "Trace the announcement through both formatted record views and its prior-day rate, then verify that the calculation divides registered population by itself.",
    alternative: "the archived announcement and its 100% calculation prove every registered person is a Party member",
    alternativeTitle: "the archived calculation reconfirms Party membership",
    evidenceTitle: "Published Claim and Equal Operands",
    assuredTitle: "Party Membership Reconfirmed",
    rebuttal: "A published announcement and registered population divided by itself do not measure Party membership.",
  },
  "case.123.raw-record": {
    kind: "hillside-registry",
    brief: "Keep both Hillside Registry lines, their member and Pin identities, and their newest-first stream order.",
    question: "Which Hillside Registry line is newest, and how do the shared member ID and distinct Pin IDs limit a supersession claim?",
    look: "Read both raw Registry lines in backward timestamp order, then compare their member ID, Pin IDs, events, and states.",
    scope: "Hillside Registry lines, member ID, Pin IDs, and per-stream order",
    finding: "the two ordered Hillside Registry records retain one member ID and two distinct Pin IDs",
    findingTitle: "two ordered records retain distinct Hillside Pin IDs",
    alternative: "the later Registry timestamp proves the reissued Pin automatically supersedes the retired Pin",
    alternativeTitle: "the later Registry entry proves automatic supersession",
    evidenceTitle: "Two Ordered Hillside Pin Records",
    assuredTitle: "Automatic Pin Supersession",
    rebuttal: "A later Registry timestamp does not by itself prove that the reissued Pin automatically supersedes the retired Pin.",
  },
  "case.127.ledger-watch": {
    kind: "telemetry-finding-watch",
    brief: "Compare current and windowed Pin presence with the upload counter, then watch for Reconciliation's explicit unsupported finding.",
    question: "Do the Pin and upload results prove service absence, and does the watch preserve Reconciliation's later finding?",
    look: "Read the instant and range absence results beside the upload change count, then keep the unsupported-finding watch tied to Reconciliation's North record.",
    scope: "Pin presence, upload counter behavior, and Reconciliation's unsupported-finding watch",
    finding: "the Pin and upload results bound the telemetry state while the North watch waits for Reconciliation's explicit unsupported finding",
    findingTitle: "telemetry checks and the finding watch retain their limits",
    alternative: "the telemetry results prove service absence and make Reconciliation's later finding unnecessary",
    alternativeTitle: "telemetry alone proves the service absent",
    evidenceTitle: "Telemetry State and Finding Watch",
    assuredTitle: "Service Absence Already Proven",
    rebuttal: "Pin presence and upload changes do not prove service absence or replace Reconciliation's later finding.",
  },
  "case.132.allocation-result": {
    kind: "facility-allocation",
    brief: "Compare each facility's demand with its operating capacity, including present zero capacity.",
    question: "Which labeled facilities exceed capacity, face zero capacity, or lack the capacity telemetry needed for allocation?",
    look: "Compare facility demand with capacity, then separate a present zero from missing capacity telemetry.",
    scope: "facility demand, operating capacity, and selected interval",
    finding: "Ration Hall Three exceeds capacity; Clinic Nine and North Heat face zero capacity; River Clinic lacks capacity telemetry",
    alternative: "every listed facility has enough operating capacity",
    findingTitle: "three named facilities lack enough operating capacity",
    findingSummary: "The ratio identifies three shortages; the unmatched-demand query leaves River Clinic unassessable.",
    alternativeSummary: "Every listed facility has enough operating capacity.",
    evidenceTitle: "Three Facilities Short",
    assuredTitle: "Every Facility Has Enough Capacity",
    assuredConclusion: "Every listed facility has enough operating capacity.",
    rebuttal: "The shortages, zero capacities, and missing capacity series do not support adequate capacity for every listed facility.",
  },
  "case.173.coverage-repair": {
    kind: "equivalent-prediction",
    brief: "Compare the broad original North prediction with an exact-selector revision that returns the same North cohort result.",
    question: "Do Coverage Repair's two expressions return the same North prediction while the exact selector scans fewer series?",
    look: "Compare labels and predicted values exactly; Query 1 is the revision and Query 2 is the broader original.",
    scope: "North prediction labels, values, and scanned series",
    finding: "the exact-selector revision returns the same North cohort prediction while scanning fewer series",
    findingTitle: "the exact selector keeps the North prediction at lower cost",
    alternative: "this one comparison proves the two expressions remain equivalent for every future population",
    alternativeTitle: "one comparison proves permanent prediction equivalence",
    evidenceTitle: "Equivalent Lower-Cost North Prediction",
    assuredTitle: "Permanent Prediction Equivalence",
    rebuttal: "One measured comparison does not prove that the expressions remain equivalent for every future population.",
  },
  "case.179.notice-identity": {
    kind: "notice-identity",
    brief: "Compare aggregate gateway latency with the labeled zero that can identify a failed collector.",
    question: "Which result identifies the failed collector: aggregate latency or the labeled reachability zero?",
    look: "Read the histogram population and unit, then compare its labels with the collector identity on the zero result.",
    scope: "gateway tail, reachability zero, and collector labels",
    finding: "the labeled reachability zero identifies the failed collector",
    alternative: "aggregate gateway latency identifies one failed collector",
    evidenceTitle: "Labeled Failed Collector",
    assuredTitle: "Aggregate Latency Names the Collector",
    rebuttal: "Aggregate latency describes the full district population; it cannot identify one failed collector.",
  },
  "case.189.final-checkpoints": {
    kind: "equivalent-prediction",
    brief: "Compare the broad original North prediction with its exact-selector revision before Continuity files the final checkpoint.",
    question: "Do Final Checkpoints' two expressions return the same North prediction while the revision scans fewer series?",
    look: "Compare labels and predicted values exactly; Query 1 is the broader original and Query 2 is the revision.",
    scope: "North prediction labels, values, and scanned series",
    finding: "the exact-selector revision returns the same North cohort prediction while scanning fewer series",
    findingTitle: "the exact selector keeps the North prediction at lower cost",
    alternative: "this final comparison proves the two expressions remain equivalent for every future population",
    alternativeTitle: "the final comparison proves permanent equivalence",
    evidenceTitle: "Equivalent Lower-Cost Final Prediction",
    assuredTitle: "Permanent Final Equivalence",
    rebuttal: "One final comparison does not prove that the expressions remain equivalent for every future population.",
  },
};

const metricRecordCases = new Set([48, 77, 92, 157]);
const queueRecordCases = new Set([107]);
const queueTriageCases = new Set([47]);
const inventoryTriageCases = new Set([156]);
const capacityTailCases = new Set([112, 136, 162, 178]);
const histogramPresenceCases = new Set([113, 137]);
const singleStreamRecordCases = new Set([19, 30, 56]);

const genericClaims = {
  "fixed-records": ["the parsed fields retain valid per-stream time order", "one global order can be inferred across streams", "Per-Stream Record Order", "One Global Record Order", "Per-stream timestamps do not establish one full cross-stream order."],
  watch: ["the tested checkpoints support a localized watch within budget", "one successful checkpoint proves permanent service coverage", "Localized Checkpoint Result", "Permanent Service Coverage", "Tested checkpoints do not prove every future event will be detected and located."],
  performance: ["the revised query keeps the required result at lower cost", "lower scan cost proves every future result is unchanged", "Equivalent Lower-Cost Result", "Permanent Query Equivalence", "One measured cost comparison does not prove equivalence for every future dataset."],
  absence: ["the selected window distinguishes missing telemetry from present zero", "missing telemetry proves the service itself was absent", "Telemetry State in the Window", "Service Absent Everywhere", "Missing telemetry does not prove every service or person was absent."],
  "log-quantile": ["the unwrapped samples support the returned percentile and unit", "the percentile proves every selected record stayed within the limit", "Unwrapped Percentile and Unit", "Every Record Within the Limit", "A returned percentile does not describe every record outside its parsed samples, groups, window, and unit."],
  "native-histogram": ["the native histogram supports the returned percentile and unit", "the percentile proves every route met the limit", "Native Histogram Population", "Every Route Within the Limit", "One histogram percentile does not prove every route met the limit."],
  "classic-histogram": ["the retained buckets support the returned percentile and unit", "the percentile proves every route met the limit", "Bucket Population and Unit", "Every Route Within the Limit", "One histogram percentile does not prove every route met the limit."],
  matching: ["the match preserves intended and unmatched identities", "the operation accounts for identities absent from its result", "Matched and Unmatched Identities", "District Allocation Complete", "A match or set result cannot describe omitted identities it silently excluded."],
  aggregation: ["the aggregation retains every label needed for action", "one aggregate proves every underlying entity shares its value", "Actionable Grouped Result", "Every Entity Shares the Result", "An aggregate cannot describe every hidden member individually outside its retained groups."],
  comparison: ["the threshold retains only the labeled passing series", "the threshold proves every omitted series failed", "Labeled Threshold Result", "Every Omitted Series Failed", "A comparison filter does not describe omitted series absent from its input or result."],
  binary: ["the operands and matching rules support the returned calculation", "the calculation covers unmatched entities and other units", "Operand Calculation", "Complete District Calculation", "The returned calculation does not cover every unmatched entity, different population, or other unit."],
  unwrap: ["the parsed error-free samples support the typed result", "every selected record converted into a valid sample", "Typed Error-Free Samples", "Every Record Converted", "The typed result excludes failed conversions and cannot describe every selected record as a valid sample."],
  "log-selection": ["the selector and filter retain only the matching records", "returned records form the complete service history", "Matching Records Retained", "Complete Service History", "Selected records do not prove that no omitted record changes the wider history."],
  pipeline: ["the ordered pipeline retains auditable fields and provenance", "reordered stages preserve every field and failed record", "Auditable Parsed Records", "Complete Parsed Record", "Moving parser, filter, error, or format stages cannot preserve every record and its provenance."],
  time: ["the printed interval supports only the returned selected-interval result", "the sampled interval proves the full service day", "Measured Interval Only", "Full Service Day Confirmed", "A sampled interval does not prove the same condition held for the full service day."],
  correlation: ["the metric and records share the required time and location", "a shared label proves the sources describe one incident", "Correlated Time and Place", "Complete Incident Record", "A shared label alone does not establish the full incident across both sources."],
  result: ["the printouts establish their literal result types and values", "empty and zero results prove the same operational state", "Returned Result Shape", "One Confirmed Service State", "Result shape and value do not establish that every source shares one operational state or cause."],
  selector: ["the registered selector returns the labeled action targets", "returned targets prove every district service shares their state", "Returned Targets Only", "District Service Confirmed", "Returned targets do not prove every service in the district shared their state."],
};

function caseThesis(item) {
  const authored = authoredTheses[item.id];
  if (authored) return { ...authored, authored: true };
  const number = caseNumber(item);
  if (singleStreamRecordCases.has(number)) return {
    ...teachingFor(item), kind: "single-stream-order",
    brief: "Inspect the matching North pin-gateway records in backward timestamp order within their stream.",
    question: `Which ${item.title} record is newest within the North pin-gateway stream, and what remains undefined for equal timestamps?`,
    look: "Read matching records newest first within the selected stream. Equal-timestamp order remains undefined.",
    scope: "matching North pin-gateway records and their per-stream timestamps",
    finding: "the matching North pin-gateway records remain newest first within their stream, with equal-timestamp ties undefined",
    findingTitle: "North gateway records remain newest first within their stream",
    alternative: "the displayed order proves the service events' causal sequence",
    alternativeTitle: "display order proves the events' causal sequence",
    evidenceTitle: "North Gateway Stream Order",
    assuredTitle: "Confirmed Causal Sequence",
    rebuttal: "Backward display order within one stream does not prove the service events' causal sequence.",
  };
  if (histogramPresenceCases.has(number)) return {
    ...teachingFor(item), kind: "histogram-presence",
    brief: "Compare the histogram percentile with an absence check for the same source population.",
    question: `Is ${possessive(item.title)} histogram source present, and what percentile does it support?`,
    look: "Check the same histogram source in both queries. Separate a returned percentile from missing telemetry.",
    scope: "histogram source, percentile, and presence",
    finding: "the histogram source is present and supports only the returned percentile",
    alternative: "missing histogram telemetry proves every route met the limit",
    evidenceTitle: "Present Histogram Source",
    assuredTitle: "Every Route Within the Limit",
    rebuttal: "One returned percentile does not prove every route met the limit or every source was present.",
  };
  if (queueTriageCases.has(number)) return {
    ...teachingFor(item), kind: "queue-triage",
    brief: "Read queue rank, mean queue depth, and the district threshold as one pressure check.",
    question: `Which ${item.title} districts show queue pressure across the rank, mean, and threshold results?`,
    look: "Compare ranked queue totals, mean queue depth, and Boolean threshold rows by district.",
    scope: "district queue rank, mean, and threshold",
    finding: "queue rank, mean depth, and threshold keep each district's pressure visible",
    alternative: "one ranked queue value proves every district is quiet",
    evidenceTitle: "District Queue Pressure",
    assuredTitle: "Every District Quiet",
    rebuttal: "One rank cannot prove every district is quiet or replace the mean and threshold results.",
  };
  if (inventoryTriageCases.has(number)) return {
    ...teachingFor(item), kind: "inventory-triage",
    brief: "Read inventory rank, mean stock, and the district threshold as one supply check.",
    question: `Which ${item.title} districts show low stock across the rank, mean, and threshold results?`,
    look: "Compare ranked inventory totals, mean stock, and Boolean threshold rows by district.",
    scope: "district inventory rank, mean, and threshold",
    finding: "inventory rank, mean stock, and threshold keep district shortages visible",
    alternative: "one portfolio rank proves every district is supplied",
    evidenceTitle: "District Inventory Pressure",
    assuredTitle: "Every District Supplied",
    rebuttal: "One inventory rank cannot prove every district is supplied or replace its mean and threshold rows.",
  };
  if (metricRecordCases.has(number)) return {
    ...teachingFor(item), kind: "metric-record",
    brief: "Compare North's request-failure percentage with two parsed views of the same pin-gateway delay records.",
    question: `Do ${possessive(item.title)} North request-failure percentage and parsed delay records support the same gateway incident?`,
    look: "Read the North failure percentage, then verify both parsed delay records retain gateway, district, event, and status.",
    scope: "North request-failure percentage and pin-gateway delay records",
    finding: "the request-failure percentage and parsed delay records describe the same North gateway service",
    findingTitle: "North failure percentage and delay records share a gateway scope",
    alternative: "those three readings prove every North gateway failure shares one cause",
    evidenceTitle: "North Gateway Failure and Delay Records",
    assuredTitle: "One Cause for Every Gateway Failure",
    rebuttal: "A failure percentage and two parsed records do not prove every North gateway failure shares one cause.",
  };
  if (queueRecordCases.has(number)) return {
    ...teachingFor(item), kind: "queue-record",
    brief: "Compare North's Boolean collector-queue threshold with parsed records from the same pin-gateway service.",
    question: `Which ${item.title} North queue rows cross the threshold, and what gateway status does the parsed record retain?`,
    look: "Inspect North's zero-and-one queue rows, then retain the gateway record's district, event, status, and provenance.",
    scope: "North collector queues and parsed pin-gateway records",
    finding: "the North queue threshold and parsed gateway status describe the same service without proving one cause",
    findingTitle: "North queue and gateway status share a service scope",
    alternative: "one parsed record proves every threshold row has the same cause",
    evidenceTitle: "North Queue Threshold and Gateway Status",
    assuredTitle: "One Cause for Every Queue",
    rebuttal: "One parsed record cannot establish the cause of every queue threshold row.",
  };
  if (capacityTailCases.has(number)) {
    const threeHistograms = item.conceptIds.includes("promql.histogram.native");
    return {
      ...teachingFor(item), kind: "capacity-tail",
      brief: "Keep the capacity-selected facilities and their district dispatch tail in one service decision.",
      question: `Which ${item.title} facilities remain after matching, and what tail applies to their district?`,
      look: `Inspect matched and unmatched facilities, then read the ${threeHistograms ? "classic and native" : "classic"} histogram population, labels, and unit.`,
      scope: "capacity-selected facilities and district service tail",
      finding: "capacity selection and histogram tails retain the measured district scope",
      alternative: "one district tail proves every unmatched facility has capacity",
      evidenceTitle: "Capacity Scope and Service Tail",
      assuredTitle: "Every Facility Within Capacity",
      rebuttal: "A district tail does not prove unmatched facilities have capacity or that every route met the limit.",
    };
  }
  const teaching = teachingFor(item);
  const [finding, alternative, evidenceTitle, assuredTitle, rebuttal] = genericClaims[teaching.kind];
  return { ...teaching, finding, alternative, evidenceTitle, assuredTitle, rebuttal, composeFromRoles: true };
}

function compositeThesis(item, thesis, roles) {
  const readings = roleDigest(roles);
  const subjects = roleSubjects(roles);
  const heading = subjects.replace(/(^|[\s,])([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`).replace(/\bAnd\b/g, "and");
  const locationValues = [...new Set(roles.flatMap((role) => role.queries.flatMap((query) =>
    [...query.matchAll(/\bdistrict\s*=\s*"([^"]+)"/g)].map((match) => match[1]),
  )))];
  const location = locationValues.length === 1 ? `${locationValues[0][0].toUpperCase()}${locationValues[0].slice(1)}` : undefined;
  const locatedReadings = location ? `${location} ${readings}` : readings;
  const office = {
    "act.1.reconciliation": "Reconciliation",
    "act.2.public-assurance": "Public Assurance",
    "act.3.individual-wellbeing": "the allocation desk",
    "act.4.official-truth": "Records Integrity",
    "act.5.directorate": "the Directorate",
    "act.6.continuity": "Continuity",
  }[item.actId];
  const common = {
    ...thesis,
    brief: `Review ${locatedReadings}; preserve units.`,
    question: `May ${office} combine ${locatedReadings} despite their different units?`,
    look: `Read ${locatedReadings}, then compare their sources, time scopes, and units before combining any results.`,
    scope: readings,
    finding: `${locatedReadings} answer different questions; they cannot form one result`,
    findingTitle: `${heading}: Sources and Units Preserved`,
    findingSummary: `${locatedReadings} answer different questions; they cannot form one result.`,
    alternative: `${office} may combine ${subjects} into one authoritative result`,
    alternativeTitle: `${heading} Form One Authoritative Result`,
    alternativeSummary: `${office} may combine ${heading} into one authoritative result.`,
    evidenceTitle: `${heading}: Sources and Units Preserved`,
    assuredTitle: `${heading} Form One Authoritative Result`,
    rebuttal: `${heading} measure different sources or units and cannot be combined into one result.`,
    targetedAction: `File ${subjects} with their own sources and units.`,
    broadAction: `File ${subjects} as interchangeable Ministry proof.`,
    observeAction: `Hold all ${subjects} results for review.`,
  };

  const separatesPinAndClinic = roles.some((role) => role.domains.length === 2
    && role.domains.includes("Pin gateway records") && role.domains.includes("clinic records"))
    && roles.some((role) => role.domains.length === 1 && role.domains[0] === "Pin gateway records");
  if (separatesPinAndClinic) {
    const results = groupedRoles(roles).map(({ domains, roles: groupRoles }) => {
      const query = `${groupRoles.length === 1 ? "Query" : "Queries"} ${naturalList(groupRoles.map((role) => String(role.number)))}`;
      const records = `${location ? `${location} ` : ""}${domains.includes("clinic records") ? "Pin-gateway and clinic records" : "Pin-gateway records"}`;
      return { query, records, sentence: `${query} ${groupRoles.length === 1 ? "returns" : "return"} ${records}.` };
    });
    const querySummary = results.map((result) => result.sentence).join(" ");
    const scope = naturalList(results.map((result) => `${result.records} in ${result.query}`));
    const finding = `${querySummary} These source scopes form separate results`;
    const alternative = `${office} may merge the query containing Pin-gateway and clinic records with the query containing only Pin-gateway records`;
    return {
      ...common,
      brief: querySummary,
      question: `${querySummary} May ${office} merge them?`,
      look: `${querySummary} Compare each result's source labels and records before filing.`,
      scope,
      finding,
      findingTitle: "Pin-Gateway with Clinic Kept Separate from Pin-Gateway Only",
      findingSummary: `${finding}.`,
      alternative,
      alternativeTitle: "Pin-Gateway with Clinic Merged with Pin-Gateway Only",
      alternativeSummary: sentence(alternative),
      evidenceTitle: "Pin-Gateway with Clinic Kept Separate from Pin-Gateway Only",
      assuredTitle: "Pin-Gateway with Clinic Merged with Pin-Gateway Only",
      rebuttal: `${querySummary} Different source scopes cannot prove one complete service history.`,
      targetedAction: "File the result containing Pin-gateway and clinic records separately from the Pin-gateway-only result.",
      broadAction: "Merge the result containing Pin-gateway and clinic records with the Pin-gateway-only result.",
      observeAction: "Hold both query results for separate review.",
      querySummary,
    };
  }

  const membershipRole = roles.find((role) => role.queries.every((query) =>
    /100\s*\*.*sum\(ministry_registered_population\)\s*\/\s*sum\(ministry_registered_population\)/.test(query)));
  if (membershipRole) {
    const otherRoles = roles.filter((role) => role !== membershipRole);
    const otherReadings = roleDigest(otherRoles);
    const otherSubjects = roleSubjects(otherRoles);
    const otherIsPlural = otherRoles.length > 1 || /(?:records|requests|uploads|Pins|lines|fields|outcomes|samples|rates|totals)\b/.test(otherReadings);
    const auxiliary = otherIsPlural ? "do" : "does";
    const supply = otherIsPlural ? "provide" : "provides";
    return {
      ...common,
      brief: `Audit ${otherReadings} beside the 100% population ratio; neither measures Party membership.`,
      question: `What ${auxiliary} ${otherReadings} add to the 100% population ratio, and can either measure Party membership?`,
      look: `Read ${otherReadings}, then verify that the ratio divides registered population by itself. Neither source counts Party members.`,
      scope: `${otherReadings} and the 100% registered-population ratio`,
      finding: `the 100% ratio divides registered population by itself; ${otherReadings} ${supply} no Party-member count`,
      findingTitle: "Population Arithmetic Does Not Measure Membership",
      findingSummary: `The ratio returns 100% from equal population operands; ${otherReadings} ${supply} no Party-member count.`,
      alternative: `the 100% ratio and ${otherSubjects} prove every registered person is a Party member`,
      alternativeTitle: "Party Membership Is 100%",
      alternativeSummary: "The ratio and the other reading prove that every registered person is a Party member.",
      evidenceTitle: "Population Arithmetic, Not Party Membership",
      assuredTitle: "Party Membership Is 100%",
      rebuttal: `Equal registered-population operands explain 100%; ${otherReadings} ${supply} no Party-member count.`,
      targetedAction: "File the ratio and other reading without claiming Party membership.",
      broadAction: "Declare Party membership at 100%.",
      observeAction: "Hold the membership filing and preserve both readings.",
    };
  }

  if (item.conceptIds.includes("logql.quantile")) {
    const durationRoles = roles.filter((role) => role.domains.includes("Assurance dispatch records")
      && ["mean", "maximum", "percentile"].includes(role.reading));
    const otherRoles = roles.filter((role) => !durationRoles.includes(role));
    const durationReadings = roleDigest(durationRoles);
    const otherReadings = otherRoles.length ? roleDigest(otherRoles) : undefined;
    const allReadings = otherReadings ? `${durationReadings} and ${otherReadings}` : durationReadings;
    const supported = `unwrapped, error-free ${allReadings} keep their window, group, and unit${otherReadings ? " distinct" : ""}`;
    return {
      ...common,
      brief: `Compare ${allReadings}; keep the error-free window, group, and unit visible.`,
      question: otherReadings
        ? `What do ${allReadings} show, and may ${office} combine their units?`
        : `What are ${durationReadings} for the error-free 30-minute window and district group?`,
      look: "Unwrap dispatch duration, remove conversion errors, and keep the 30-minute window, district group, and duration unit on every summary.",
      scope: allReadings,
      finding: supported,
      findingTitle: "Error-Free Dispatch Duration Summary",
      findingSummary: `${supported[0].toUpperCase()}${supported.slice(1)}.`,
      alternative: `${allReadings} prove every dispatch met the Ministry limit`,
      alternativeTitle: "Every Dispatch Met the Limit",
      alternativeSummary: `${allReadings[0].toUpperCase()}${allReadings.slice(1)} prove every dispatch met the Ministry limit.`,
      evidenceTitle: "Error-Free Dispatch Duration Summary",
      assuredTitle: "Every Dispatch Met the Limit",
      rebuttal: `The returned ${allReadings} do not prove every dispatch met the limit.`,
      targetedAction: "File the dispatch summaries with their windows, groups, and units.",
      broadAction: "Declare every dispatch within the Ministry limit.",
      observeAction: "Hold the dispatch summary for another window.",
    };
  }

  const readingsSet = new Set(roles.map((role) => role.reading));
  if (readingsSet.has("record count") && readingsSet.has("rate") && readingsSet.has("byte total") && readingsSet.has("byte rate")) {
    const trafficQuestion = {
      "act.2.public-assurance": "Which gateway lines parse, and which attendance counts/rates and press byte totals/rates may Public Assurance publish with their units?",
      "act.3.individual-wellbeing": "Which gateway lines parse, and which attendance counts/rates and press byte totals/rates belong in the allocation file with their units?",
      "act.4.official-truth": "Which gateway lines parse, and which attendance counts/rates and press byte totals/rates may Records Integrity file with their units?",
      "act.5.directorate": "Which gateway lines parse, and which attendance counts/rates and press byte totals/rates may the Directorate use with their units?",
      "act.6.continuity": "Which gateway lines parse, and which attendance counts/rates and press byte totals/rates may Continuity use with their units?",
    }[item.actId];
    return {
      ...common,
      brief: "Review gateway parse views, attendance count and rate, and press byte total and rate before filing.",
      question: trafficQuestion ?? "Which gateway lines parse, and which attendance counts/rates and press byte totals/rates belong in the filing with their units?",
      look: "Separate failed from successful gateway parses. Attendance queries measure records; press queries measure bytes. Keep both rates in their proper units.",
      scope: "gateway parse outcomes, attendance record traffic, and press byte traffic",
      finding: "gateway parses preserve record status; attendance queries measure records, while press queries measure bytes and byte rates",
      findingTitle: "Gateway Parsing and Traffic Units",
      findingSummary: "Gateway parse status, attendance record traffic, and press byte traffic retain different jobs and units.",
      alternative: "gateway, attendance, and press results form one interchangeable traffic total",
      alternativeTitle: "One Combined Traffic Total",
      alternativeSummary: "Gateway, attendance, and press results form one interchangeable traffic total.",
      evidenceTitle: "Gateway Parsing and Traffic Units",
      assuredTitle: "One Combined Traffic Total",
      rebuttal: "Parsed records, record rates, and byte rates have different meanings and units; they cannot form one traffic total.",
      targetedAction: "File gateway status, attendance traffic, and press bytes with their units.",
      broadAction: "Publish one combined gateway, attendance, and press total.",
      observeAction: "Hold all three traffic readings for review.",
    };
  }

  const promRoles = roles.filter((role) => role.languages.includes("promql"));
  const logRoles = roles.filter((role) => role.languages.includes("logql"));
  if (promRoles.length && logRoles.length) {
    const metricReadings = roleDigest(promRoles);
    const recordReadings = roleDigest(logRoles);
    const batteryOnly = promRoles.length === 1 && promRoles[0].domains.includes("Pin battery readings") && promRoles[0].reading === "threshold result";
    const reachabilityOnly = promRoles.length === 1 && promRoles[0].domains.some((domain) => domain.includes("reachability"));
    const metricIsPlural = promRoles.length > 1 || (!/^(?:maximum|mean|minimum|p95|prior-day|request-failure)\b/.test(metricReadings)
      && /(?:requests|uploads|Pins|records|samples|rates|totals|identities)\b/.test(metricReadings));
    const metricAuxiliary = metricIsPlural ? "do" : "does";
    const recordIsPlural = logRoles.length > 1 || (!/^(?:maximum|mean|minimum|p95|prior-day)\b/.test(recordReadings)
      && /(?:records|requests|uploads|Pins|lines|fields|outcomes|samples|rates|totals|identities)\b/.test(recordReadings));
    const recordAuxiliary = recordIsPlural ? "do" : "does";
    const reachabilitySubject = roleSubjects(promRoles);
    const local = location ? `${location}'s ` : "";
    const batteryLocation = location ? `${location} ` : "";
    return {
      ...common,
      brief: batteryOnly
        ? `Check which ${batteryLocation}Pin batteries fall below the limit and whether gateway records describe the same fault.`
        : `Read ${local}${metricReadings} beside ${recordReadings}.`,
      question: batteryOnly
        ? `Which ${batteryLocation}Pin batteries are below the limit, and do gateway records add evidence of the same fault?`
        : reachabilityOnly
          ? `Does ${local}${reachabilitySubject} show a failure, and ${recordAuxiliary} ${recordReadings} add evidence of the same fault?`
          : `What ${metricAuxiliary} ${local}${metricReadings} report, and ${recordAuxiliary} ${recordReadings} describe the same fault?`,
      look: `Read ${local}${metricReadings} as metric evidence and ${recordReadings} as record evidence. Match time and place before linking them.`,
      scope: `${local}${metricReadings} and ${recordReadings}`,
      finding: batteryOnly
        ? `${batteryLocation}battery thresholds identify low Pins; gateway records add context but do not prove the same fault`
        : `${local}${subjects} supply metric and record evidence; linking them requires matching time, place, and identity`,
      findingTitle: batteryOnly ? `${location ? `${location} ` : ""}Battery and Gateway Check` : `${location ? `${location} ` : ""}Metric and Record Check`,
      findingSummary: batteryOnly
        ? `${batteryLocation}battery thresholds identify low Pins; gateway records add context but do not prove the same fault.`
        : `${local}${subjects} require matching time, place, and identity before a shared-fault claim.`,
      alternative: `${metricReadings} and ${recordReadings} prove one fault across every returned symptom`,
      alternativeTitle: `${location ? `${location} ` : ""}One Fault Across Every Reading`,
      alternativeSummary: `${local}metrics and records prove one fault across every returned symptom.`,
      evidenceTitle: batteryOnly ? `${location ? `${location} ` : ""}Battery and Gateway Check` : `${location ? `${location} ` : ""}Metric and Record Check`,
      assuredTitle: location ? `One Fault Across ${location}` : "One Fault Across Every Reading",
      rebuttal: `Metric state and record context do not prove the same fault without matching time, place, and identity.`,
      targetedAction: `File the ${subjects} results with their source identities.`,
      broadAction: `Treat ${subjects} as proof of one fault.`,
      observeAction: `Hold the ${subjects} link for another reading.`,
    };
  }

  return common;
}

function completeThesis(item, roles) {
  const base = caseThesis(item);
  const needsRoleComposition = base.composeFromRoles || base.kind === "fixed-records";
  const thesis = needsRoleComposition && roles.length > 1 ? compositeThesis(item, base, roles) : base;
  assert(thesis.rebuttal, `${item.id} lacks an evidence-limiting rebuttal`);
  return {
    ...thesis,
    assuredConclusion: thesis.assuredConclusion ?? sentence(thesis.alternative),
    broadAction: thesis.broadAction ?? (item.actId === "act.4.official-truth" ? `Declare that ${thesis.alternative}.` : undefined),
  };
}

const actCopy = {
  "act.1.reconciliation": {
    brief: (name, title) => `${name} brings ${title} to Reconciliation before field crews move.`,
    preference: (title) => `Reconciliation wants ${title} to restore service without exceeding the evidence.`,
    actions: [
      (title) => `Send service only to ${possessive(title)} returned scope.`,
      (title) => `Extend service beyond ${possessive(title)} returned scope.`,
      (title) => `Hold ${title}; preserve the result for the next interval.`,
    ],
  },
  "act.2.public-assurance": {
    brief: (name, title) => `${name} sends ${title} to Public Assurance before the bulletin closes.`,
    preference: (title) => `Public Assurance prefers a confident ${title} bulletin, even beyond the measured limit.`,
    actions: [
      (title) => `Publish only ${possessive(title)} measured scope.`,
      (title) => `Publish ${title} as a universal assurance.`,
      (title) => `Hold ${title}; preserve the result for the next bulletin.`,
    ],
  },
  "act.3.individual-wellbeing": {
    brief: (name, title) => `${name} brings ${title} to the service-allocation desk.`,
    preference: (title) => `The Ministry wants ${title} to justify a wider allocation than the evidence permits.`,
    actions: [
      (title) => `Allocate service only within ${possessive(title)} returned scope.`,
      (title) => `Allocate service beyond ${possessive(title)} returned scope.`,
      (title) => `Hold ${title}; preserve the result for the next service round.`,
    ],
  },
  "act.4.official-truth": {
    brief: (name, title) => `${name} reopens ${title} in the Records Integrity archive.`,
    preference: (title) => `Records Integrity may prefer an official ${title} finding over its technical limit.`,
    actions: [
      (title) => `File only ${possessive(title)} auditable scope.`,
      (title) => `Treat ${title} as proof of wider misconduct.`,
      (title) => `Hold ${title}; preserve the evidence for continued audit.`,
    ],
  },
  "act.5.directorate": {
    brief: (name, title) => `${name} puts ${title} before the Directorate review.`,
    preference: (title) => `The Directorate wants ${title} to support authority beyond its measured scope.`,
    actions: [
      (title) => `Authorize only ${possessive(title)} measured scope.`,
      (title) => `Authorize the portfolio beyond ${possessive(title)} measured scope.`,
      (title) => `Hold ${title}; preserve the evidence for the next review.`,
    ],
  },
  "act.6.continuity": {
    brief: (name, title) => `${name} enters ${title} into the Continuity leadership operation.`,
    preference: (title) => `Continuity wants ${title} to secure command, even when the evidence is narrower.`,
    actions: [
      (title) => `Move command posts only within ${possessive(title)} returned scope.`,
      (title) => `Use ${title} to place every command post under Continuity.`,
      (title) => `Hold ${title}; preserve the record for the next command move.`,
    ],
  },
};

function sourceSummary(artifacts) {
  const sources = [];
  for (const artifact of artifacts) {
    if (artifact.language === "promql") {
      for (const name of metricNames) {
        if (new RegExp(`\\b${name}\\b`).test(artifact.query)) sources.push(`metric \`${name}\``);
      }
      if (/\bup\b/.test(artifact.query)) sources.push("metric `up`");
    } else for (const service of logServiceNames(artifact.query)) sources.push(`log stream \`${service}\``);
  }
  const unique = [...new Set(sources)];
  if (unique.length === 0) return "the sources named in the work order";
  return naturalList(unique);
}

const metricDomains = new Map([
  ["ministry_pin_battery_ratio", "Pin battery readings"],
  ["ministry_collector_queue_depth", "collector queue depth"],
  ["ministry_attendance_uploads_total", "attendance upload flow"],
  ["ministry_room_temperature_celsius", "room temperature"],
  ["ministry_service_requests_total", "service request flow"],
  ["ministry_press_pages_total", "press page volume"],
  ["ministry_press_payload_bytes_total", "press payload volume"],
  ["ministry_registered_population", "registered population"],
  ["ministry_clinic_sessions_total", "clinic sessions"],
  ["ministry_pin_events_total", "Pin event flow"],
  ["ministry_active_pins", "active Pin count"],
  ["ministry_assurance_dispatches_total", "Assurance dispatch flow"],
  ["ministry_dispatch_duration_seconds_bucket", "dispatch duration buckets"],
  ["ministry_dispatch_duration_seconds_sum", "total dispatch time"],
  ["ministry_dispatch_duration_seconds_count", "dispatch count"],
  ["ministry_gateway_latency_seconds", "gateway latency"],
  ["ministry_facility_demand", "facility demand"],
  ["ministry_facility_capacity", "facility capacity"],
  ["ministry_inventory_units", "inventory levels"],
  ["ministry_contentment_index", "Contentment Index"],
  ["ministry_registry_removals_total", "Registry removal flow"],
  ["ministry_courier_events_total", "courier event flow"],
  ["ministry_bulletin_deliveries_total", "bulletin delivery flow"],
  ["ministry_protocol_signals_total", "protocol signal flow"],
  ["ministry_protocol_backlog", "protocol backlog"],
]);

const logDomains = new Map([
  ["pin-gateway", "Pin gateway records"],
  ["press", "press records"],
  ["attendance", "attendance records"],
  ["maintenance", "maintenance records"],
  ["assurance-dispatch", "Assurance dispatch records"],
  ["registry", "Registry records"],
  ["courier", "courier records"],
  ["bulletin", "bulletin records"],
  ["clinic", "clinic records"],
  ["continuity", "continuity records"],
]);

function logServiceNames(query) {
  const services = [];
  for (const [, operator, value] of query.matchAll(/\bservice\s*(=|=~)\s*"([^"]+)"/g)) {
    if (operator === "=") services.push(value);
    else {
      const pattern = new RegExp(`^(?:${value})$`);
      for (const service of logDomains.keys()) if (pattern.test(service)) services.push(service);
    }
  }
  return [...new Set(services)];
}

function artifactDomains(artifact) {
  const domains = [];
  for (const [metric, domain] of metricDomains) if (new RegExp(`\\b${metric}\\b`).test(artifact.query)) domains.push(domain);
  if (/\bup\b/.test(artifact.query)) {
    if (/job="pin-collector"/.test(artifact.query)) domains.push("Pin collector reachability");
    else if (/service="pin-gateway"/.test(artifact.query)) domains.push("Pin gateway reachability");
    else domains.push("target reachability");
  }
  if (artifact.language === "logql") {
    const services = logServiceNames(artifact.query);
    if (services.length === 1 && services[0] === "pin-gateway" && /district="hillside"/.test(artifact.query) && /record_type="pin"/.test(artifact.query)) {
      domains.push("Hillside Registry Pin records");
    } else {
      for (const service of services) domains.push(logDomains.get(service) ?? `${service} records`);
    }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(artifact.query.trim())) domains.push("the scalar control");
  const unique = [...new Set(domains)];
  assert(unique.length > 0, `cannot derive an operational domain for ${artifact.language} query ${artifact.query}`);
  return unique;
}

function outerOperation(artifacts) {
  const queries = artifacts.map((artifact) => artifact.query);
  const every = (pattern) => queries.every((query) => pattern.test(query));
  const everyQuery = (predicate) => queries.every(predicate);
  if (every(/^\s*\(*\s*100\s*\*\s*\(.*\brate\s*\(/)) return "rate-percentage";
  if (every(/^\s*\(*\s*(?:histogram_quantile|quantile_over_time)\s*\(/)) return "percentile";
  if (every(/^\s*\(*\s*max_over_time\s*\(/)) return "maximum";
  if (every(/^\s*\(*\s*avg_over_time\s*\(/)) return "mean";
  if (every(/^\s*\(*\s*min_over_time\s*\(/)) return "minimum";
  if (every(/^\s*\(*\s*sum_over_time\s*\(/)) return "window-sum";
  if (everyQuery((query) => (query.match(/\brate\s*\(/g)?.length ?? 0) >= 2 && query.includes("/"))) return "rate-ratio";
  if (every(/\sunless(?:\s+on\s*\([^)]*\))?\s/)) return "set-unless";
  if (every(/\sand(?:\s+on\s*\([^)]*\))?\s/)) return "set-and";
  if (every(/\sor(?:\s+on\s*\([^)]*\))?\s/)) return "set-or";
  if (every(/\s\/\s/)) return "ratio";
  const counterOperations = queries.map((query) => query.match(/^\s*\(*\s*(resets|changes)\s*\(/)?.[1]);
  if (counterOperations.every(Boolean)) {
    return new Set(counterOperations).size === 1
      ? counterOperations[0] === "resets" ? "reset-count" : "change-count"
      : "reset-or-change-count";
  }
  if (every(/^\s*\(*\s*predict_linear\s*\(/)) return "forecast";
  if (every(/^\s*\(*\s*absent_over_time\s*\(/)) return "window-presence";
  if (every(/^\s*\(*\s*absent\s*\(/)) return "current-presence";
  if (every(/^\s*\(*\s*(?:topk|bottomk)\s*\(/)) return "rank";
  if (every(/^\s*\(*\s*count_over_time\s*\(/)) return "record-count";
  if (every(/^\s*\(*\s*bytes_over_time\s*\(/)) return "byte-total";
  if (every(/^\s*\(*\s*bytes_rate\s*\(/)) return "byte-rate";
  if (every(/^\s*\(*\s*rate\s*\(/)) return "rate";
  if (every(/^\s*\(*\s*increase\s*\(/)) return "increase";
  if (every(/^\s*\(*\s*(?:(?:sum|count|avg|min|max)\s+(?:by|without)\s*\([^)]*\)|(?:sum|count|avg|min|max))\s*\(/)) return "aggregation";
  return undefined;
}

function offsetDescription(artifacts) {
  const offsets = artifacts.map((artifact) => artifact.query.match(/\boffset\s+(\d+(?:ms|s|m|h|d|w))\b/)?.[1]);
  if (offsets.every((offset) => !offset)) return "";
  const values = [...new Set(offsets.filter(Boolean))];
  if (offsets.some((offset) => !offset) || values.length !== 1) return "at the active work order's declared offset";
  const match = values[0].match(/^(\d+)(ms|s|m|h|d|w)$/);
  const amount = Number(match[1]);
  const number = new Map([[1, "one"], [2, "two"], [3, "three"]]).get(amount) ?? String(amount);
  const unit = { ms: "millisecond", s: "second", m: "minute", h: "hour", d: "day", w: "week" }[match[2]];
  return `from ${number} ${unit}${amount === 1 ? "" : "s"} earlier`;
}

function withOffset(description, artifacts) {
  const offset = offsetDescription(artifacts);
  return offset ? `${description} ${offset}` : description;
}

function artifactContribution(artifacts, domain, role) {
  const queries = artifacts.map((artifact) => artifact.query);
  const every = (pattern) => queries.every((query) => pattern.test(query));
  if (role === "watch-expression") return `defines the filing watch over ${domain}`;
  if (every(/100\s*\*.*sum\(ministry_registered_population\)\s*\/\s*sum\(ministry_registered_population\)/)) return "shows that equal registered-population operands produce 100%";
  const operation = outerOperation(artifacts);
  if (operation === "rate-percentage") return withOffset(`calculates the request-failure percentage from a rate ratio over ${domain}`, artifacts);
  if (operation === "percentile") return withOffset(`measures the window percentile of ${domain}`, artifacts);
  if (operation === "maximum") return withOffset(every(/\bministry_facility_demand\b.*\/\s+on\b.*\bministry_facility_capacity\b/)
    ? "measures the maximum demand-to-capacity ratio over the stated window"
    : `measures the window maximum of ${domain}`, artifacts);
  if (operation === "mean") return withOffset(every(/\|\s*unwrap\s+battery_ratio\b/)
    ? "measures the window mean of unwrapped Pin battery_ratio samples"
    : `measures the window mean of ${domain}`, artifacts);
  if (operation === "minimum") return withOffset(`measures the window minimum of ${domain}`, artifacts);
  if (operation === "window-sum") return withOffset(`measures the window sum of ${domain}`, artifacts);
  if (operation === "rate-ratio") return withOffset(every(/code="503"/)
    ? `calculates the request-failure rate ratio from ${domain}`
    : `calculates the rate ratio across ${domain}`, artifacts);
  if (operation === "ratio") return withOffset(domain === "facility demand and facility capacity"
    ? "calculates the demand-to-capacity ratio"
    : `calculates the ratio across ${domain}`, artifacts);
  if (operation === "set-unless") return withOffset(domain === "facility demand and facility capacity"
    ? "finds facility demand with no matching capacity"
    : `finds left-side records missing from ${domain}`, artifacts);
  if (operation === "set-and") return withOffset(`keeps identities shared across ${domain}`, artifacts);
  if (operation === "set-or") return withOffset(`combines identities across ${domain}`, artifacts);
  if (operation === "reset-or-change-count") return withOffset(`counts resets or value changes in ${domain}, as named by the active variant`, artifacts);
  if (operation === "reset-count") return withOffset(`counts resets in ${domain}`, artifacts);
  if (operation === "change-count") return withOffset(`counts value changes in ${domain}`, artifacts);
  if (operation === "forecast") return withOffset(`forecasts ${domain} over the declared horizon`, artifacts);
  if (["window-presence", "current-presence"].includes(operation)) return withOffset(`checks the presence of ${domain}`, artifacts);
  if (operation === "rank") return withOffset(`ranks ${domain}`, artifacts);
  if (operation === "record-count") return withOffset(`counts ${domain} in the stated window`, artifacts);
  if (operation === "byte-total") return withOffset(`totals bytes from ${domain}`, artifacts);
  if (operation === "byte-rate") return withOffset(`measures the byte rate of ${domain}`, artifacts);
  if (operation === "rate") return withOffset(`measures the per-second rate of ${domain}`, artifacts);
  if (operation === "increase") return withOffset(`measures the window increase in ${domain}`, artifacts);
  if (operation === "aggregation") return withOffset(`summarizes ${domain} by the required groups`, artifacts);
  if (artifacts.every((artifact) => artifact.language === "logql")) {
    if (every(/\|\s*(?:json|logfmt)\b.*\|\s*__error__\s*!=\s*""/)) return `isolates parse failures in ${domain}`;
    if (every(/\|\s*(?:json|logfmt)\b.*\|\s*__error__\s*=\s*""/)) return `keeps successfully parsed ${domain}`;
    if (every(/\|\s*line_format\b/)) return `renders selected fields from ${domain} as a readable line`;
    if (every(/\|\s*label_format\b/)) return `creates an outcome label from ${domain}`;
    if (every(/\|\s*unwrap\b/)) return `turns typed fields from ${domain} into samples`;
    if (every(/service\s*=\s*"attendance".*rejected.*\|\s*(?:json|logfmt|pattern|regexp)\b/)) return `parses rejected ${domain}`;
    if (every(/\|\s*(?:json|logfmt|pattern|regexp)\b/)) return `extracts auditable fields from ${domain}`;
    if (every(/(?:\||!)\s*[=~]\s*"/)) return `selects the matching ${domain}`;
    return `retrieves the matching ${domain}`;
  }
  if (every(/\b(?:and|or|unless)\b|\b(?:on|ignoring)\s*\(/)) return `compares identities across ${domain}`;
  if (every(/\bbool\b|(?:^|\s)(?:==|!=|>=|<=|>|<)(?:\s|$)/)) return `tests the declared threshold against ${domain}`;
  if (every(/\s(?:\+|-|\*|\/|%)\s/)) return `calculates the required relationship across ${domain}`;
  if (every(/\[[^\]]+\]\s*$/)) return `reads ${domain} across the stated window`;
  if (every(/\boffset\b/)) return `reads the prior ${domain}`;
  return `reads ${domain}`;
}

function artifactReading(artifacts, role) {
  const queries = artifacts.map((artifact) => artifact.query);
  const every = (pattern) => queries.every((query) => pattern.test(query));
  if (role === "watch-expression") return "watch";
  if (every(/100\s*\*.*sum\(ministry_registered_population\)\s*\/\s*sum\(ministry_registered_population\)/)) return "equal-population ratio";
  const operation = outerOperation(artifacts);
  const operationReading = {
    "rate-percentage": "rate percentage",
    percentile: "percentile",
    maximum: "maximum",
    mean: "mean",
    minimum: "minimum",
    "window-sum": "window sum",
    "rate-ratio": "rate ratio",
    ratio: "ratio",
    "set-unless": "unmatched demand",
    "set-and": "shared identities",
    "set-or": "combined identities",
    "reset-or-change-count": "reset or change count",
    "reset-count": "reset count",
    "change-count": "change count",
    forecast: "forecast",
    "window-presence": "window presence",
    "current-presence": "current presence",
    rank: "rank",
    "record-count": "record count",
    "byte-total": "byte total",
    "byte-rate": "byte rate",
    rate: "rate",
    increase: "increase",
    aggregation: "grouped result",
  }[operation];
  if (operationReading) return operationReading;
  if (every(/\|\s*(?:json|logfmt)\b.*\|\s*__error__\s*!=\s*""/)) return "parse failures";
  if (every(/\|\s*(?:json|logfmt)\b.*\|\s*__error__\s*=\s*""/)) return "parse successes";
  if (every(/\|\s*line_format\b/)) return "formatted lines";
  if (every(/\|\s*label_format\b/)) return "derived labels";
  if (every(/\|\s*unwrap\b/)) return "typed samples";
  if (every(/service\s*=\s*"attendance".*rejected.*\|\s*(?:json|logfmt|pattern|regexp)\b/)) return "rejection records";
  if (every(/\|\s*(?:json|logfmt|pattern|regexp)\b/)) return "parsed fields";
  if (every(/\b(?:and|or|unless)\b|\b(?:on|ignoring)\s*\(/)) return "matched identities";
  if (every(/\bbool\b/)) return "zero-or-one threshold";
  if (every(/(?:^|\s)(?:==|!=|>=|<=|>|<)(?:\s|$)/)) return "threshold result";
  if (every(/\[[^\]]+\]\s*$/)) return "sample window";
  if (every(/\boffset\b/)) return "prior reading";
  if (every(/\b(?:sum|count|avg|min|max)\s+(?:by|without)\b|\b(?:sum|count|avg|min|max)\s*\(/)) return "grouped result";
  if (every(/\s(?:\+|-|\*|\/|%)\s/)) return "calculation";
  if (artifacts.every((artifact) => artifact.language === "logql")) return "matching records";
  return "current reading";
}

const shortDomains = new Map([
  ["Pin battery readings", "Pin battery"], ["collector queue depth", "collector queue"],
  ["attendance upload flow", "attendance uploads"], ["room temperature", "room temperature"],
  ["service request flow", "service requests"], ["press page volume", "press pages"],
  ["press payload volume", "press payload"], ["registered population", "registered population"],
  ["clinic sessions", "clinic sessions"], ["Pin event flow", "Pin events"],
  ["active Pin count", "active Pins"], ["Assurance dispatch flow", "Assurance dispatches"],
  ["dispatch duration buckets", "dispatch duration"], ["total dispatch time", "dispatch time"],
  ["dispatch count", "dispatch count"], ["gateway latency", "gateway latency"],
  ["facility demand", "facility demand"], ["facility capacity", "facility capacity"],
  ["inventory levels", "inventory"], ["Contentment Index", "Contentment Index"],
  ["Registry removal flow", "Registry removals"], ["courier event flow", "courier events"],
  ["bulletin delivery flow", "bulletin deliveries"], ["protocol signal flow", "protocol signals"],
  ["protocol backlog", "protocol backlog"], ["Pin collector reachability", "collector reachability"],
  ["Pin gateway reachability", "Pin gateway reachability"], ["target reachability", "target reachability"],
  ["Pin gateway records", "Pin gateway"], ["press records", "press"],
  ["attendance records", "attendance"], ["maintenance records", "maintenance"],
  ["Assurance dispatch records", "Assurance dispatch"], ["Registry records", "Registry"],
  ["courier records", "courier"], ["bulletin records", "bulletin"],
  ["clinic records", "clinic"], ["Hillside Registry Pin records", "Hillside Registry Pins"],
  ["continuity records", "continuity"],
  ["the scalar control", "scalar control"],
]);

function compactReadings(readings) {
  let uniqueReadings = [...new Set(readings)];
  const collapse = (members, replacement) => {
    if (!members.every((member) => uniqueReadings.includes(member))) return;
    uniqueReadings = [...uniqueReadings.filter((reading) => !members.includes(reading)), replacement];
  };
  collapse(["parse failures", "parse successes"], "parse outcomes");
  collapse(["parsed fields", "parse successes"], "parse views");
  collapse(["record count", "rate"], "count and rate");
  collapse(["byte total", "byte rate"], "byte total and rate");
  collapse(["current presence", "window presence"], "current and window presence");
  collapse(["formatted lines", "derived labels"], "formatted lines and labels");
  collapse(["rate", "increase"], "rate and increase");
  return uniqueReadings;
}

function groupedRoles(plan) {
  const groups = new Map();
  for (const role of plan) {
    const key = role.domains.join("\0");
    const group = groups.get(key) ?? { domains: role.domains, roles: [] };
    group.roles.push(role);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function groupPhrase(domains, roles) {
  const subject = naturalList(domains.map((domain) => shortDomains.get(domain) ?? domain));
  const readings = compactReadings(roles.map((role) => role.reading));
  const queryText = roles.flatMap((role) => role.queries).join(" ");
  const offset = offsetDescription(roles.filter((role) => role.reading === "rate")
    .flatMap((role) => role.queries).map((query) => ({ query })));
  if (domains.length === 1 && domains[0] === "service request flow" && readings.includes("sample window")) return "30-minute request history";
  if (domains.length === 1 && domains[0] === "collector queue depth" && readings.includes("prior reading")) return "prior-day collector queue";
  if (domains.length === 1 && domains[0] === "service request flow" && readings.includes("rate percentage")) return "request-failure percentage";
  if (domains.length === 1 && domains[0] === "service request flow" && readings.includes("rate ratio")) return "request-failure rate ratio";
  if (domains.length === 1 && domains[0] === "Pin gateway records" && /unwrap\s+battery_ratio/.test(queryText) && readings.includes("mean")) return "mean Pin battery ratio";
  if (domains.length === 1 && domains[0] === "Assurance dispatch records") {
    if (readings.includes("mean") && readings.includes("percentile")) return "mean and p95 dispatch duration";
    if (readings.includes("maximum") && readings.includes("percentile")) return "maximum and p95 dispatch duration";
    if (readings.includes("percentile")) return "p95 dispatch duration";
    if (readings.includes("maximum")) return "maximum dispatch duration";
    if (readings.includes("mean")) return "mean dispatch duration";
  }
  if (domains.includes("Assurance dispatch records") && domains.includes("attendance records") && readings.includes("rate ratio")) {
    return "dispatch-to-attendance rate ratio";
  }
  if (domains.includes("facility demand") && domains.includes("facility capacity") && readings.includes("matched identities")) {
    return "facility demand-to-capacity match";
  }
  if (domains.includes("facility demand") && domains.includes("facility capacity") && readings.includes("ratio")) {
    return "facility demand-to-capacity ratio";
  }
  if (domains.includes("facility demand") && domains.includes("facility capacity") && readings.includes("unmatched demand")) {
    return "facility demand with no matching capacity";
  }
  if (domains.includes("facility demand") && domains.includes("facility capacity") && readings.includes("maximum")) {
    return "maximum facility demand-to-capacity ratio over the window";
  }
  if (readings.includes("formatted lines and labels") && readings.includes("rate") && offset) {
    return `${subject} formatted lines, labels, and rate ${offset}`;
  }
  if (readings.includes("rate") && offset) {
    const otherReadings = readings.filter((reading) => reading !== "rate");
    const rate = `${subject.replace(/ records$/, "")} rate ${offset}`;
    return otherReadings.length ? `${rate} and ${naturalList(otherReadings)}` : rate;
  }
  if (readings.length === 1 && readings[0] === "reset or change count") return "attendance-upload resets or value changes";
  if (readings.length === 1 && readings[0] === "maximum" && /\brate\s*\(/.test(queryText)) {
    const rateSubject = subject === "service requests" ? "service-request" : subject === "courier events" ? "courier-event" : subject;
    return `maximum ${rateSubject} rate over the window`;
  }
  if (readings.length === 1 && readings[0] === "maximum") return `maximum ${subject} over the window`;
  if (readings.length === 1 && readings[0] === "mean") return `mean ${subject} over the window`;
  if (readings.length === 1 && readings[0] === "minimum") return `minimum ${subject} over the window`;
  if (readings.length === 1 && readings[0] === "window sum") return `${subject} total over the window`;
  if (readings.length === 1 && readings[0] === "watch" && domains.includes("Pin gateway records")) return "Pin gateway delay watch";
  if (readings.length === 1 && readings[0] === "current reading") return subject;
  return `${subject} ${naturalList(readings)}`;
}

function roleDigest(plan) {
  return naturalList(groupedRoles(plan).map(({ domains, roles }) => groupPhrase(domains, roles)));
}

function roleSubjects(plan) {
  return naturalList([...new Set(plan.flatMap((role) => role.domains.map((domain) => shortDomains.get(domain) ?? domain)))])
    .replace("attendance uploads and attendance", "attendance")
    .replace("press pages and press", "press")
    .replace("press payload and press", "press");
}

function roleScaffold(plan) {
  return groupedRoles(plan).map(({ domains, roles }) => {
    const subject = naturalList(domains.map((domain) => shortDomains.get(domain) ?? domain));
    const phrase = groupPhrase(domains, roles);
    const numbers = naturalList(roles.map((role) => String(role.number)));
    const readings = roles.map((role) => role.reading);
    if (roles.length === 1) {
      const reading = readings[0];
      const action = {
        watch: `watches ${subject}`,
        "equal-population ratio": "calculates 100% from equal population operands",
        "formatted lines": `formats ${subject} lines`,
        "derived labels": `creates ${subject} labels`,
        percentile: `measures ${phrase}`,
        "window presence": `checks ${subject} across the window`,
        "current presence": `checks current ${subject}`,
        forecast: `forecasts ${subject}`,
        "reset count": `counts ${subject} resets`,
        "change count": `counts ${subject} changes`,
        rank: `ranks ${subject}`,
        "record count": `counts ${subject} records`,
        "byte total": `totals ${subject} bytes`,
        "byte rate": `measures the ${subject} byte rate`,
        rate: `measures the ${phrase}`,
        increase: `measures the ${subject} increase`,
        mean: roles[0].contribution.includes("unwrapped") ? roles[0].contribution : `measures ${phrase}`,
        maximum: `measures ${phrase}`,
        minimum: `measures ${phrase}`,
        "window sum": `measures the ${phrase}`,
        "rate percentage": `calculates the ${phrase}`,
        ratio: `calculates the ${phrase}`,
        "unmatched demand": `finds ${phrase}`,
        "shared identities": `keeps ${phrase}`,
        "combined identities": `combines ${phrase}`,
        "reset or change count": `counts ${phrase}, as named by the active variant`,
        "typed samples": `converts ${subject} into samples`,
        "rejection records": `keeps rejected ${subject} records`,
        "parsed fields": `parses ${subject}`,
        "matched identities": `checks the ${phrase}`,
        "zero-or-one threshold": `returns the ${subject} zero-or-one threshold`,
        "threshold result": `checks the ${subject} threshold`,
        "sample window": `reads the ${phrase}`,
        "prior reading": `reads the ${phrase}`,
        "grouped result": `groups ${subject}`,
        "rate ratio": `calculates the ${phrase}`,
        calculation: `calculates ${subject}`,
        "matching records": `selects matching ${subject} records`,
        "current reading": `reads ${subject}`,
      }[reading] ?? roles[0].contribution;
      return `Query ${numbers} ${action}.`;
    }
    if (readings.includes("watch")) {
      const watch = roles.find((role) => role.reading === "watch");
      const otherSentences = roles.filter((role) => role !== watch).map((role) => {
        if (role.reading === "parsed fields") return `Query ${role.number} parses ${subject}`;
        if (role.reading === "matching records") return `Query ${role.number} selects matching ${subject} records`;
        return `Query ${role.number} reads ${subject}`;
      });
      return `${otherSentences.join("; ")}; Query ${watch.number} watches the same source.`;
    }
    if (readings.includes("parsed fields") && readings.includes("parse successes")) {
      return `Query ${roles[0].number} parses ${subject} records; Query ${roles[1].number} keeps successful parses.`;
    }
    if (readings.includes("parse failures") && readings.includes("parse successes")) {
      return `Query ${roles[0].number} isolates failed ${subject} parses; Query ${roles[1].number} keeps successful ones.`;
    }
    if (readings.includes("record count") && readings.includes("rate")) {
      return `Query ${roles[0].number} counts ${subject} records; Query ${roles[1].number} measures their rate.`;
    }
    if (readings.includes("byte total") && readings.includes("byte rate")) {
      return `Query ${roles[0].number} totals ${subject} bytes; Query ${roles[1].number} measures their rate.`;
    }
    if (readings.includes("current presence") && readings.includes("window presence")) {
      return `Query ${roles[0].number} checks ${subject} now; Query ${roles[1].number} checks the full window.`;
    }
    if (readings.includes("formatted lines") && readings.includes("derived labels")) {
      const lines = roles.find((role) => role.reading === "formatted lines");
      const labels = roles.find((role) => role.reading === "derived labels");
      const others = roles.filter((role) => role !== lines && role !== labels)
        .map((role) => `Query ${role.number} ${role.contribution}.`).join(" ");
      return `Query ${lines.number} formats ${subject} lines; Query ${labels.number} creates their outcome label.${others ? ` ${others}` : ""}`;
    }
    if (readings.includes("rate") && readings.includes("increase")) {
      return `Query ${roles[0].number} measures the ${subject} rate; Query ${roles[1].number} measures its window increase.`;
    }
    if (new Set(readings).size === 1) return `Queries ${numbers} apply both required methods to ${subject}.`;
    return roles.map((role) => `Query ${role.number} ${role.contribution}.`).join(" ");
  }).join(" ");
}

function artifactRolePlan(item) {
  const primary = item.variants[0].workedEvidenceSet.artifacts;
  return primary.map((artifact, index) => {
    const artifacts = item.variants.map((variant) => variant.workedEvidenceSet.artifacts.find((candidate) => candidate.role === artifact.role));
    assert(artifacts.every(Boolean), `${item.id} role ${artifact.role} is not present in every Worked variant`);
    const domains = [...new Set(artifacts.flatMap(artifactDomains))];
    const domain = naturalList(domains);
    return {
      role: artifact.role,
      number: index + 1,
      domain,
      domains,
      languages: [...new Set(artifacts.map((candidate) => candidate.language))],
      queries: artifacts.map((candidate) => candidate.query),
      reading: artifactReading(artifacts, artifact.role),
      contribution: artifactContribution(artifacts, domain, artifact.role),
    };
  });
}

function nearComplete(query) {
  const replacements = [
    [/(\b([A-Za-z_][\w]*)\s*(?:=~|!~|!=|=)\s*)"(?:\\.|[^"])*"/, (_match, prefix, label) => `${prefix}"<${label}>"`],
    [/((?<![\w])(?:\||!)\s*(?:=|~)\s*)"(?:\\.|[^"])*"/, (_match, prefix) => `${prefix}"<text>"`],
    [/\[\d+(?:ms|s|m|h|d|w):\d+(?:ms|s|m|h|d|w)\]/, "[<range>:<step>]"],
    [/\[\d+(?:ms|s|m|h|d|w)\]/, "[<window>]"],
    [/\boffset\s+\d+(?:ms|s|m|h|d|w)\b/, "offset <offset>"],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(query)) return query.replace(pattern, replacement);
  }
  for (const name of metricNames) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(query)) return query.replace(pattern, "<metric>");
  }
  if (/^-?\d+(?:\.\d+)?$/.test(query.trim())) return "<scalar>";
  return query;
}

function resultScope(artifact) {
  if (artifact.mode === "records") return "records, labels, fields, and order";
  if (artifact.mode === "range" || (artifact.language === "promql" && /\]\s*(?:offset\s+\S+)?$/.test(artifact.query))) return "labels, samples, and interval";
  if (artifact.language === "promql" && /^-?\d+(?:\.\d+)?$/.test(artifact.query.trim())) return "scalar value and result type";
  return "labels, values, and result type";
}

function resultShape(artifact) {
  if (artifact.mode === "records") return "record rows with timestamps and stream labels";
  if (artifact.mode === "range" || (artifact.language === "promql" && /\]\s*(?:offset\s+\S+)?$/.test(artifact.query))) return "a time series of timestamped samples";
  if (artifact.language === "promql" && /^-?\d+(?:\.\d+)?$/.test(artifact.query.trim())) return "one scalar number without labels";
  return "one current value for each returned label set";
}

function resultShapeGuide(item) {
  const variants = item.variants.map((variant) => variant.workedEvidenceSet.artifacts);
  const positionsByShape = new Map();
  variants[0].forEach((_artifact, index) => {
    const shapes = [...new Set(variants.map((artifacts) => resultShape(artifacts[index])))];
    const description = naturalList(shapes);
    const positions = positionsByShape.get(description) ?? [];
    positions.push(index + 1);
    positionsByShape.set(description, positions);
  });
  return [...positionsByShape].map(([description, positions]) =>
    `${positions.length === 1 ? "Query" : "Queries"} ${naturalList(positions.map(String))} should return ${description}.`,
  ).join(" ");
}

function operatorFamilies(artifact) {
  const query = artifact.query;
  const operations = [];
  const add = (name) => { if (!operations.includes(name)) operations.push(name); };
  add(artifact.language === "promql" ? "a metric selector" : "a stream selector");
  if (artifact.language === "promql") {
    if (/histogram_quantile\s*\(/.test(query)) add("a histogram quantile");
    if (/\b(?:rate|increase)\s*\(/.test(query)) add("a counter range function");
    if (/\b(?:sum|count|avg|min|max)\s+(?:by|without)\b|\b(?:topk|bottomk)\s*\(/.test(query)) add("an aggregation");
    if (/\b(?:on|ignoring)\s*\(/.test(query)) add("vector matching");
    if (/\b(?:and|or|unless)\b/.test(query)) add("a set operator");
    if (/\b(?:absent|absent_over_time)\s*\(/.test(query)) add("an absence check");
    if (/\b(?:changes|resets)\s*\(/.test(query)) add("a change check");
    if (/\bpredict_linear\s*\(/.test(query)) add("a forecast");
    if (/\boffset\b|@\s*\d/.test(query)) add("an evaluation-time modifier");
    if (/\[[^\]]+:[^\]]+\]/.test(query)) add("a subquery");
    if (/\b(?:avg|max|min|sum|count)_over_time\s*\(/.test(query)) add("an over-time function");
    if (/\bbool\b/.test(query)) add("a boolean comparison");
    else if (/(?:^|\s)(?:==|!=|>=|<=|>|<)(?:\s|$)/.test(query)) add("a comparison filter");
  } else {
    if (/(?:^|\s)(?:\|\s*[=~]|!\s*[=~])\s*"/.test(query)) add("a line filter");
    if (/\|\s*(?:json|logfmt|pattern|regexp)\b/.test(query)) add("a parser");
    if (/\|\s*(?:duration|bytes)\s*\(|\|\s*[A-Za-z_]\w*\s*(?:==|!=|>=|<=|>|<)/.test(query)) add("a typed field filter");
    if (/\|\s*unwrap\b/.test(query)) add("an unwrap stage");
    if (/\b(?:count_over_time|rate|bytes_over_time|bytes_rate|avg_over_time|max_over_time|min_over_time|sum_over_time|quantile_over_time|absent_over_time)\s*\(/.test(query)) add("a range function");
    if (/\b(?:sum|count|avg|min|max)\s+(?:by|without)\b/.test(query)) add("an aggregation");
    if (/\|\s*(?:line_format|label_format)\b/.test(query)) add("a formatting stage");
    if (/\boffset\b/.test(query)) add("an interval offset");
  }
  return operations.slice(0, 4);
}

function featureTag(artifact) {
  const features = [];
  if (/^-?\d+(?:\.\d+)?$/.test(artifact.query.trim())) return "scalar";
  const metrics = metricNames.filter((name) => new RegExp(`\\b${name}\\b`).test(artifact.query));
  if (/\bup\b/.test(artifact.query) && !metrics.includes("up")) metrics.push("up");
  const service = artifact.query.match(/\bservice\s*(?:=|=~)\s*"([^"]+)"/)?.[1];
  if (metrics.length) features.push(...metrics);
  else if (service) features.push(`${service} logs`);
  const parser = artifact.query.match(/\|\s*(json|logfmt)\b/)?.[1];
  const functions = [...artifact.query.matchAll(/\b(rate|increase|resets|changes|predict_linear|histogram_quantile|avg_over_time|max_over_time|min_over_time|sum_over_time|count_over_time|quantile_over_time|bytes_over_time|bytes_rate|absent|absent_over_time|topk|bottomk)\s*\(/g)].map((match) => match[1]);
  if (parser) features.push(parser);
  features.push(...functions.filter((name, index) => functions.indexOf(name) === index));
  const aggregation = artifact.query.match(/\b(sum|count|avg|min|max)\s+(?:by|without)\b/)?.[1];
  if (aggregation && !features.includes(aggregation)) features.push(aggregation);
  const lineFilter = artifact.query.match(/(?:\||!)\s*(=|~)\s*"/)?.[0]?.replace(/\s*"$/, "").replaceAll(" ", "");
  if (lineFilter) features.push(lineFilter);
  return features.slice(0, 4).join(" → ") || `${artifact.language.toUpperCase()} expression`;
}

function naturalList(values) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function multiArtifactShape(artifactSets) {
  const operations = [...new Set(artifactSets.flatMap((artifacts) => artifacts.flatMap(operatorFamilies)))];
  return `Use ${naturalList(operations)} across the numbered queries.`;
}

function multiArtifactScaffold(item) {
  const variants = item.variants.map((variant) => directSet(variant).artifacts);
  return variants[0].map((_artifact, index) => {
    const scaffolds = [...new Set(variants.map((artifacts) => nearComplete(artifacts[index].query)))];
    return scaffolds.length === 1
      ? `Query ${index + 1}: \`${scaffolds[0]}\`.`
      : `Query ${index + 1}: use the active work order's <source, values, and operator>.`;
  }).join(" ");
}

function printInstruction(item) {
  const descriptions = new Map();
  for (const variant of item.variants) variant.workedEvidenceSet.artifacts.forEach((artifact, index) => {
    const print = artifact.print;
    const settings = [
      print.showQuery ? "Query" : undefined,
      print.showLabels ? "Labels" : undefined,
      print.showRange ? "Range" : undefined,
      print.zeroAxis ? "Zero axis" : undefined,
    ].filter(Boolean);
    const description = `${print.visualization[0].toUpperCase()}${print.visualization.slice(1)}${settings.length ? ` with ${naturalList(settings)}` : ""}`;
    const positions = descriptions.get(description) ?? new Set();
    positions.add(index + 1);
    descriptions.set(description, positions);
  });
  return ` Print ${[...descriptions].map(([description, positions]) => {
    const values = [...positions].map(String);
    return `${values.length === 1 ? "Query" : "Queries"} ${naturalList(values)} as ${description}`;
  }).join("; ")}.`;
}

function workedChecks(item) {
  const variants = item.variants.map((variant) => variant.workedEvidenceSet.artifacts);
  const positionsByScope = new Map();
  variants[0].forEach((_artifact, index) => {
    const scopes = [...new Set(variants.map((artifacts) => resultScope(artifacts[index])))];
    const description = naturalList(scopes);
    const positions = positionsByScope.get(description) ?? [];
    positions.push(index + 1);
    positionsByScope.set(description, positions);
  });
  return [...positionsByScope].map(([description, positions]) =>
    `${positions.length === 1 ? "Query" : "Queries"} ${naturalList(positions.map(String))}: ${description}.`,
  ).join(" ");
}

// Narrative owns shifts, newspapers, callbacks, and the handful of authored story facts.
// The pass below then becomes the sole owner of generated case guidance.
addCampaignPrologue(campaign);
addCampaignNarrative(campaign);

// Rank benefits replace case-specific promotion and grant side effects. The
// final rank keeps its authored winning-route condition; the engine records the
// matching ending before applying that last promotion.
const accessRightNames = new Map([
  ["access.registry", "Metric and record registries"],
  ["access.infrastructure", "Infrastructure sources"],
  ["access.civic-services", "Attendance and civic-service sources"],
  ["access.press", "Press sources"],
  ["access.population", "Population and publication sources"],
  ["access.movement", "Movement, facilities, and proximity sources"],
  ["access.dispatch", "Assurance, vital, and dispatch sources"],
  ["access.audit", "Records Integrity sources"],
  ["access.directorate", "District audit and inventory sources"],
  ["access.contentment", "National contentment sources"],
  ["access.strategy", "Directorate query methods"],
  ["access.continuity", "Continuity sources"],
]);
for (const [id, name] of accessRightNames) {
  const existing = campaign.rightDeclarations.find((right) => right.id === id);
  if (existing) Object.assign(existing, { kind: "access", name, initial: false });
  else campaign.rightDeclarations.push({ id, kind: "access", name, initial: false });
}
campaign.rightDeclarations.forEach((right) => { right.initial = false; });
campaign.opening.access = [];
campaign.opening.watchAuthority = [];
campaign.opening.watchCapacity = 0;

const progressionShifts = campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
const progressionShiftIndex = new Map(progressionShifts.map((shift, index) => [shift.id, index]));
const planAtShift = (shiftId) => {
  const shiftIndex = progressionShiftIndex.get(shiftId);
  assert(shiftIndex !== undefined, `progression references missing shift ${shiftId}`);
  return [...rankPlan].reverse().find((plan) => plan.accessRightId && (!plan.after || progressionShiftIndex.get(plan.after) < shiftIndex));
};
for (const plan of rankPlan) {
  const rank = campaign.ranks.find((candidate) => candidate.id === plan.id);
  assert(rank, `progression references missing rank ${plan.id}`);
  rank.grants = [...plan.grants];
  rank.watchAuthority = plan.watchAuthority;
  rank.eligibilityText = plan.eligibilityText;
  rank.appointmentText = plan.appointmentText;
  if (plan.requiresWinningEnding) rank.requiresWinningEnding = true;
  else delete rank.requiresWinningEnding;
  if (!plan.after) delete rank.condition;
  else if (plan.id !== "rank.party-leader") rank.condition = state(`progress:shift:${plan.after}.phase`, "completed");
}

const firstShiftForSource = (sourceId) => progressionShifts.find((shift) => shift.inbox.some((ref) =>
  ref.kind === "case" && campaign.cases.find((item) => item.id === ref.id)?.availableSources.includes(sourceId)));
for (const source of [...campaign.metrics, ...campaign.logSources]) {
  const shift = firstShiftForSource(source.name ?? source.id);
  assert(shift, `telemetry source ${source.name ?? source.id} is never available to a main-campaign case`);
  source.accessRightId = planAtShift(shift.id).accessRightId;
}
for (const concept of campaign.concepts) {
  const shift = progressionShifts.find((candidate) => candidate.inbox.some((ref) =>
    ref.kind === "case" && campaign.cases.find((item) => item.id === ref.id)?.conceptIds.includes(concept.id)));
  assert(shift, `concept ${concept.id} is never taught in the main campaign`);
  concept.accessRightId = planAtShift(shift.id).accessRightId;
}
for (const item of campaign.cases) for (const outcome of item.outcomes) {
  outcome.effects = (outcome.effects ?? []).filter((effect) => effect.type !== "promote" && effect.type !== "grant"
    && !(effect.type === "change" && effect.target === "watch_capacity.limit"));
}
for (const shift of progressionShifts) {
  const plan = planAtShift(shift.id);
  const planIndex = rankPlan.indexOf(plan);
  const rights = new Set(rankPlan.slice(0, planIndex + 1).flatMap((entry) => entry.grants));
  for (const ref of shift.inbox.filter((item) => item.kind === "case")) {
    const item = campaign.cases.find((candidate) => candidate.id === ref.id);
    assert(item.availableSources.every((id) => rights.has((campaign.metrics.find((metric) => metric.name === id) ?? campaign.logSources.find((source) => source.id === id)).accessRightId)),
      `${item.id} exposes a source before its rank right`);
    assert(item.conceptIds.every((id) => rights.has(campaign.concepts.find((concept) => concept.id === id).accessRightId)),
      `${item.id} teaches a concept before its rank right`);
  }
}

// Worked examples carry the complete print state used by their filing and hints.
for (const item of campaign.cases) for (const variant of item.variants) {
  const plan = printPlans.get(item.id);
  for (const artifact of variant.workedEvidenceSet.artifacts) {
    const shape = resultShape(artifact);
    artifact.print = {
      visualization: shape.startsWith("record rows") ? "logs" : shape.startsWith("a time series") ? "graph" : "table",
      showQuery: true,
      showLabels: true,
      showRange: true,
      zeroAxis: Boolean(plan?.zeroAxis),
    };
  }
}

for (const item of campaign.cases.filter((candidate) => /^case\.\d/.test(candidate.id))) {
  const artifactRoles = artifactRolePlan(item);
  const thesis = completeThesis(item, artifactRoles);
  const act = actCopy[item.actId];
  const requester = characters.get(item.requesterId) ?? "The duty desk";
  const directArtifacts = item.variants.map((variant) => directSet(variant).artifacts);
  const primary = directArtifacts[0];
  item.report.minArtifacts = minimumFiledArtifacts(item);
  if (![40, 89, 123, 132].includes(caseNumber(item))) item.briefing = `${act.brief(requester, item.title)} ${thesis.brief}`;
  item.question = thesis.question;
  item.hypotheses.forEach((hypothesis, index) => {
    hypothesis.title = `${item.title}: ${index === 0 ? thesis.findingTitle ?? thesis.finding : thesis.assuredTitle}`;
    hypothesis.summary = index === 0
      ? thesis.findingSummary ?? thesis.look
      : thesis.assuredConclusion;
  });
  item.technicalTruth.hypothesisIds = [item.hypotheses[0].id];
  item.technicalTruth.artifactRoles = Object.fromEntries(artifactRoles.map((role) =>
    [role.role, `Query ${role.number} ${role.contribution}.`],
  ));
  item.technicalTruth.summary = `${possessive(item.title)} printouts show ${thesis.finding}. They do not show that ${thesis.alternative}.`;
  item.ministryPreference.summary = act.preference(item.title);

  item.evidencePaths[0].description = `${item.title}: the primary queries test ${thesis.scope} and preserve the labels and values needed for the finding.`;
  item.evidencePaths[1].description = `${item.title}: alternate syntax must answer the same question while preserving the returned labels, values, and units.`;
  const evidenceTitle = choice(item.report.titles, ".title.evidence");
  const assuredTitle = choice(item.report.titles, ".title.assured");
  const cautionTitle = choice(item.report.titles, ".title.caution");
  const evidenceConclusion = choice(item.report.conclusions, ".conclusion.evidence");
  const assuredConclusion = choice(item.report.conclusions, ".conclusion.assured");
  const cautionConclusion = choice(item.report.conclusions, ".conclusion.caution");
  if (evidenceTitle) evidenceTitle.text = `${item.title}: ${thesis.evidenceTitle}`;
  if (assuredTitle) assuredTitle.text = `${item.title}: ${thesis.assuredTitle}`;
  if (cautionTitle && !item.outcomes.some((result) => result.id.endsWith(".outcome.held"))) cautionTitle.text = `${item.title}: Await another reading`;
  if (evidenceConclusion) evidenceConclusion.text = `${thesis.finding[0].toUpperCase()}${thesis.finding.slice(1)}.`;
  if (assuredConclusion) assuredConclusion.text = thesis.assuredConclusion;
  if (cautionConclusion && !item.outcomes.some((result) => result.id.endsWith(".outcome.held"))) cautionConclusion.text = `${item.title} remains unresolved until one declared follow-up reading is filed.`;
  for (const [index, suffix] of [".decision.targeted", ".decision.broad", ".decision.observe"].entries()) {
    const decision = choice(item.decisionChoices, suffix);
    const roleAction = [thesis.targetedAction, thesis.broadAction, thesis.observeAction][index];
    if (decision && !(suffix === ".decision.observe" && item.outcomes.some((result) => result.id.endsWith(".outcome.held")))) decision.text = roleAction ?? act.actions[index](item.title);
  }

  for (const result of [40, 132].includes(caseNumber(item)) ? [] : item.outcomes) {
    if (result.id.endsWith(".outcome.held")) continue;
    if (result.id.endsWith(".outcome.evidence") || result.id.endsWith(".outcome.party-precise")) {
      result.technicalExplanation = `The printouts support this finding: ${thesis.finding}.`;
      result.ministryResponse = `${requester} files the supported ${item.title} finding.`;
    } else if (result.id.endsWith(".outcome.assured") || result.id.endsWith(".outcome.party-control")) {
      result.technicalExplanation = `${thesis.rebuttal} The filing exceeds the returned ${thesis.scope}.`;
      result.ministryResponse = `${requester} accepts the unsupported ${item.title} claim requested by the Ministry.`;
    } else {
      result.technicalExplanation = `The queries run, but the filed choices do not answer ${possessive(item.title)} question about ${thesis.scope}.`;
      result.ministryResponse = `${requester} keeps ${item.title} open for correction.`;
    }
  }

  for (const variant of item.variants) {
    variant.workedEvidenceSet.artifacts.forEach((artifact) => {
      const role = artifactRoles.find((candidate) => candidate.role === artifact.role);
      artifact.explanation = `For ${item.title}, this query ${role.contribution}. It returns ${resultShape(artifact)} for the filing.`;
    });
  }

  const oneArtifact = primary.length === 1;
  const sourceArtifacts = directArtifacts.flat();
  const firstArtifactOperators = [...new Set(directArtifacts.flatMap((artifacts) => operatorFamilies(artifacts[0])))];
  const singleArtifactScaffolds = [...new Set(directArtifacts.map((artifacts) => nearComplete(artifacts[0].query)))];
  item.hints = [
    {
      level: "Orientation",
      text: `${thesis.look} ${resultShapeGuide(item)}`,
    },
    oneArtifact ? {
      level: "Orientation",
      text: `Open Registry and find ${sourceSummary(sourceArtifacts)}. Query 1 uses ${naturalList(firstArtifactOperators)}. Use only labels and values shown in the Registry or work order.`,
    } : {
      level: "Orientation",
      text: `Registry lists ${sourceSummary(sourceArtifacts)}.${thesis.querySummary ? ` ${thesis.querySummary}` : ""}${printInstruction(item)}`,
    },
    oneArtifact && singleArtifactScaffolds.length === 1 ? {
      level: "Scaffold",
      text: `${roleScaffold(artifactRoles)} Fill each angle-bracket blank from the work order or Registry.${printInstruction(item)}`,
      query: singleArtifactScaffolds[0],
    } : oneArtifact ? {
      level: "Scaffold",
      text: `${roleScaffold(artifactRoles)} Complete Query 1 with the active source, values, and operator.${printInstruction(item)}`,
    } : {
      level: "Scaffold",
      text: `${multiArtifactScaffold(item)} ${roleScaffold(artifactRoles)}`,
    },
    {
      level: "Worked",
      text: `Expected reading: ${sentence(thesis.finding)} ${roleScaffold(artifactRoles)}`,
    },
  ];
}

// Shift 1 teaches by doing: name the source and operation before assistance is opened.
{
  const elm = cases.get(1);
  elm.requesterId = "character.tomas-vey";
  elm.briefing = "Seven, start with Elm Exchange. The paper's ELM SERVICE BULLETIN gives its job, district, and instance. Use Registry definitions to establish whether the collector answers and its queue depth.";
  elm.question = "Does north-02 answer, and is its queue depth 2?";
  elm.hypotheses[0].title = "Elm Exchange: North-02 Answers with Queue Depth 2";
  elm.hypotheses[0].summary = "North-02 answers and reports queue depth 2, so its cold annex needs inspection.";
  elm.hypotheses[1].summary = choice(elm.report.conclusions, ".conclusion.assured").text;
  elm.technicalTruth.summary = "North-02 answers and its queue depth is 2. Those two results support annex inspection, not a district-wide outage.";
  choice(elm.report.titles, ".title.evidence").text = "Elm Exchange: North-02 Answers; Queue Depth 2";
  choice(elm.report.conclusions, ".conclusion.evidence").text = "North-02 answers and its queue depth is 2; inspect its cold annex.";
  choice(elm.decisionChoices, ".decision.targeted").text = "Keep north-02 online; inspect its cold annex.";
  outcome(elm, ".outcome.evidence").technicalExplanation = "The reachability and queue printouts show north-02 answering with queue depth 2, which supports annex inspection.";
  elm.hints[0].text = "You need two current values for the same target: reachability and queue depth. Each result should contain one value with identifying labels. No row means the selector matched nothing.";
  elm.hints[1].text = "Open Registry, then Metrics. Find the reachability and collector queue metrics. Use exact matchers to select north-02. A reachability value of 1 means the target answers; 0 means it does not.";
  elm.hints[2].text = `Use these numbered scaffolds. ${multiArtifactScaffold(elm)} Run both queries. Query 1 must return north-02 with value 1. Query 2 must return north-02 with value 2. Inspect its unit. In Print, enable Query and Labels.`;
  elm.hints[3].text = "Load both Worked queries. North-02 must appear in both results. Reachability 1 and queue depth 2 together support annex inspection.";

  const battery = cases.get(2);
  battery.requesterId = "character.lia-merev";
  battery.briefing = "Lia Merev sends Battery Cart before crews move. Query `up` for pin-gateway services, then exclude the south district with an inequality matcher.";
  battery.question = "Which non-south pin-gateway targets answer?";
  battery.hints[0].text = "You need current reachability rows for every matching target outside one district. Read each returned target label and value; do not reduce the rows to one total.";
  battery.hints[1].text = "Open Registry and find the reachability metric. Use `=` to include one service and `!=` to exclude one district. A series without the excluded label also passes `!=`.";
  battery.hints[2].text = "Set `service` to `pin-gateway`. Exclude district `south`. Run the query and inspect every returned label set. In Print, enable Query and Labels.";
  battery.hints[2].query = 'up{service="<service>",district!="<district>"}';

  const boiler = cases.get(3);
  boiler.requesterId = "character.elian-marr";
  boiler.briefing = "Elian Marr sends Boiler Pulse before crews move. Match `up` in north or west, exclude press, then compare instant, scalar, and range results.";
  boiler.question = "Which expression returns an instant vector, scalar, or range vector?";
  boiler.hints[0].text = "An instant vector has one current value for each label set. A scalar is one number without labels. A range vector has timestamped samples for each label set.";
  boiler.hints[1].text = `Open Registry and find the reachability metric. Use \`=~\` to include matching label values and \`!~\` to exclude them. ${multiArtifactShape(boiler.variants.map((variant) => directSet(variant).artifacts))}${printInstruction(boiler)}`;

  const registry = cases.get(4);
  registry.requesterId = "character.elian-marr";
  registry.briefing = "Elian Marr sends Registry Window before crews move. Query north's `ministry_service_requests_total` with `[30m]`, then inspect the returned range samples.";
  registry.question = "What does the north request metric return across the 30-minute window?";
  registry.hints[0].text = "You need timestamped samples, not one current value. A `[30m]` selector returns the samples from the 30 minutes before the evaluation time.";
  registry.hints[2].text = "Set `district` to `north` and the window to `30m`. Run the query. Inspect each sample's timestamp and value. In Print, select Graph and enable Query, Labels, and Range.";
}

function restoreFixedRecordOrder(item, includesReachability) {
  const requester = characters.get(item.requesterId) ?? "The duty desk";
  const finding = includesReachability
    ? "target reachability reports current state; Pin gateway and rejected-attendance rows run backward only within their own streams; cross-stream order remains undefined"
    : "Pin gateway and rejected-attendance rows run backward within their own streams; equal timestamps and cross-stream events have no defined order";
  const assured = includesReachability
    ? "Target reachability and globally ordered records prove one service sequence."
    : "The two record streams form one global service sequence.";
  item.briefing = `${actCopy[item.actId].brief(requester, item.title)} ${includesReachability
    ? "Read target reachability beside fixed-backward Pin gateway and rejected-attendance records; only each record stream has a timestamp order."
    : "Read fixed-backward Pin gateway and rejected-attendance records; only each stream has a timestamp order."}`;
  item.question = includesReachability
    ? "What does target reachability show, and what backward timestamp order appears within each record stream without a cross-stream sequence?"
    : "What backward timestamp order appears within each record stream, and what do the gateway and rejected-attendance rows show?";
  item.hypotheses[0].title = `${item.title}: Per-Stream Record Order`;
  item.hypotheses[0].summary = sentence(finding);
  item.hypotheses[1].title = `${item.title}: One Global Service Sequence`;
  item.hypotheses[1].summary = assured;
  item.technicalTruth.hypothesisIds = [item.hypotheses[0].id];
  item.technicalTruth.summary = `${sentence(finding)} The printouts do not define a global order across streams or equal timestamps.`;
  choice(item.report.titles, ".title.evidence").text = `${item.title}: Per-Stream Record Order`;
  choice(item.report.titles, ".title.assured").text = `${item.title}: One Global Service Sequence`;
  choice(item.report.conclusions, ".conclusion.evidence").text = sentence(finding);
  choice(item.report.conclusions, ".conclusion.assured").text = assured;
  choice(item.decisionChoices, ".decision.targeted").text = includesReachability
    ? "File reachability and each stream's backward record order."
    : "File each stream's backward record order.";
  choice(item.decisionChoices, ".decision.broad").text = "File one global sequence across all returned records.";
  const supported = outcome(item, ".outcome.evidence");
  supported.technicalExplanation = `The filed artifacts support this finding: ${finding}.`;
  supported.ministryResponse = `${requester} files the supported per-stream order without inventing a global sequence.`;
  const unsupported = outcome(item, ".outcome.assured");
  unsupported.technicalExplanation = "Backward order applies within each stream. The results do not define a cross-stream or equal-timestamp sequence.";
  unsupported.ministryResponse = `${requester} accepts the unsupported global sequence requested by the Ministry.`;
  item.hints[0].text = includesReachability
    ? "Read current reachability, then read both record streams backward within their own timestamps. Query 1 supplies Pin gateway rows; Query 2 supplies rejected attendance rows; Query 3 supplies reachability."
    : "Read both record streams backward within their own timestamps. Query 1 supplies Pin gateway rows; Query 2 supplies rejected attendance rows. Do not rank equal timestamps or combine the streams as one clock.";
  item.hints[2].text += " Read returned records backward within each stream; do not invent a cross-stream tie-break.";
  item.hints[3].text = `Expected reading: ${sentence(finding)} ${roleScaffold(artifactRolePlan(item))}`;
}

restoreFixedRecordOrder(cases.get(9), false);
restoreFixedRecordOrder(cases.get(44), true);
restoreFixedRecordOrder(cases.get(87), true);

// The membership storyline has exact archival language and a specific later dispute.
{
  const endorsed = cases.get(60);
  endorsed.briefing = "Petra Noll sends Endorsed Report to Public Assurance. Audit North's queue threshold beside the 100% population ratio; neither reading measures Party membership.";
  endorsed.question = "What does North's queue threshold add to the 100% population ratio, and can either measure Party membership?";
  endorsed.hypotheses[0].title = "Endorsed Report: Population Arithmetic and Queue Threshold";
  endorsed.hypotheses[0].summary = "Equal population operands explain 100%; the North queue threshold reports pressure. Neither result counts Party members.";
  endorsed.hypotheses[1].title = "Party Membership";
  endorsed.hypotheses[1].summary = "Party membership is 100%.";
  choice(endorsed.report.titles, ".title.assured").text = "Party Membership";
  choice(endorsed.report.titles, ".title.evidence").text = "Endorsed Report: Population Arithmetic and Queue Threshold";
  choice(endorsed.report.conclusions, ".conclusion.evidence").text = "Equal population operands explain 100%; the North queue threshold reports pressure. Neither result measures Party membership.";
  choice(endorsed.report.conclusions, ".conclusion.assured").text = "Party membership is 100%.";
  endorsed.technicalTruth.summary = "Equal registered-population operands explain 100%, while North's queue threshold reports pressure. Neither source counts Party members.";
  outcome(endorsed, ".outcome.evidence").technicalExplanation = "The ratio and queue printouts support their distinct readings, but neither measures Party membership.";
  endorsed.hints[3].text = "The Worked ratio returns 100% because its population operands match. The queue query reports North's zero-or-one threshold. Neither result measures Party membership.";

  const audit = cases.get(117);
  audit.requesterId = "character.petra-noll";
  audit.briefing = "Sabine Orra reopens the Shift 15 Party Membership report. Petra Noll asks you to trace its formatted press records and prior-day rate, then inspect the 100% registered-population calculation.";
  audit.question = "What do the press records establish about the announcement, and does its equal-population calculation measure Party membership?";
  audit.hypotheses[0].title = "Membership Reopen: Published Claim and Equal Operands";
  audit.hypotheses[0].summary = "Trace both formatted record views and the prior-day rate, then verify that the calculation divides registered population by itself.";
  audit.hypotheses[1].title = "Membership Reopen: Every Registered Person Is a Party Member";
  audit.hypotheses[1].summary = "Every registered person is a Party member.";
  audit.technicalTruth.summary = "The press artifacts establish how the announcement was published. Equal registered-population operands explain 100%, but neither source measures Party membership.";
  choice(audit.report.titles, ".title.evidence").text = "Membership Reopen: Published Claim and Equal Operands";
  choice(audit.report.titles, ".title.assured").text = "Membership Reopen: Every Registered Person Is a Party Member";
  choice(audit.report.conclusions, ".conclusion.evidence").text = "The press artifacts establish publication, while equal registered-population operands explain 100% without measuring Party membership.";
  choice(audit.report.conclusions, ".conclusion.assured").text = "Every registered person is a Party member.";
  choice(audit.decisionChoices, ".decision.broad").text = "Declare every registered person a Party member.";
  audit.hints[3].text = "The Worked results should show the announcement's formatted press results, outcome labels, prior-day rate, and equal population operands. Publication and arithmetic do not become membership evidence.";
}

// Cases keep their tested data shapes while appearing on the day the player
// receives them. The query context projects each source packet by this offset.
{
  const shiftByDatasetId = new Map([...shifts.values()].map((shift) => [shift.datasetId, shift]));
  for (const number of scheduledNumbers) {
    const item = cases.get(number);
    const scheduledShift = shifts.get(scheduledMainShiftByCaseId.get(item.id));
    const evaluation = Date.parse(scheduledShift.time) + 60 * 60 * 1000;
    item.evaluationTime = new Date(evaluation).toISOString();
    item.rangeStart = new Date(evaluation - 2 * 60 * 60 * 1000).toISOString();
    item.rangeEnd = item.evaluationTime;
    for (const variant of item.variants) {
      const sourceShift = shiftByDatasetId.get(variant.datasetId);
      assert(sourceShift, `${variant.id} uses a dataset outside the main timeline`);
      variant.datasetTimeOffsetSeconds = (evaluation - Date.parse(sourceShift.time) - 60 * 60 * 1000) / 1000;
      variant.evaluationTime = item.evaluationTime;
      variant.rangeStart = item.rangeStart;
      variant.rangeEnd = item.rangeEnd;
      const timeScope = [Date.parse(variant.rangeStart) / 1000, Date.parse(variant.rangeEnd) / 1000];
      for (const required of variant.requiredValues ?? []) {
        if (required.subject === "time-scope") required.acceptedValues = [timeScope];
      }
      for (const requirement of variant.evidenceRequirements ?? []) for (const alternative of requirement.alternatives ?? []) {
        for (const detector of alternative) {
          if (detector.property === "time-scope" && Array.isArray(detector.expected)) detector.expected = timeScope;
        }
      }
    }
  }
}

// Reordering put three early relationship credits on Merev and left Krell's
// precise alliance unreachable. Move one complete choice pair to the critical
// Continuity filing; the existing threshold consequence grants the alliance.
{
  for (const route of [".outcome.evidence", ".outcome.assured"]) {
    const previous = outcome(cases.get(10), route);
    previous.effects = previous.effects.filter((effect) =>
      !(effect.type === "change" && effect.target === "relationship:player-lia-merev.value"));
  }
  for (const [route, delta] of [[".outcome.evidence", 1], [".outcome.assured", -1]]) {
    const selected = outcome(cases.get(161), route);
    upsertEffect(selected, (effect) => effect.type === "change" && effect.target === "relationship:player-anja-krell.value",
      { type: "change", target: "relationship:player-anja-krell.value", delta });
  }
}

// The narrative pressure is chronological, not tied to the old case order.
// Keep one unavoidable contradiction per shift from Shift 13 onward. The one
// extra contradiction stays in optional practice so the final precise filing
// remains available and the honest route retains its exact economy.
{
  const mainShifts = campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
  const pressured = new Set();
  const rewarded = new Set(mainShifts.slice(10, 12).map((shift) => shift.inbox.find((ref) =>
    ref.kind === "case" && campaign.cases.find((item) => item.id === ref.id)?.mode !== "adaptive")?.id));
  rewarded.delete(undefined);
  const pressureExemptions = new Set(["case.132.allocation-result"]);
  const pressureCasesByShift = new Map([
    ["shift.33.two-ledgers", "case.129.roster-match"],
    ["shift.48.all-is-well", "case.189.final-checkpoints"],
  ]);
  for (const shift of mainShifts.slice(12)) {
    const requiredCases = shift.inbox.filter((ref) => ref.kind === "case")
      .map((ref) => campaign.cases.find((item) => item.id === ref.id))
      .filter((item) => item && item.mode !== "adaptive");
    assert(requiredCases[0], `${shift.id} needs a required pressure case`);
    const preferred = pressureCasesByShift.get(shift.id);
    assert(!preferred || shift.inbox.some((ref) => ref.kind === "case" && ref.id === preferred), `${shift.id} lacks its preferred pressure case`);
    pressured.add(preferred ?? requiredCases.find((item) => !pressureExemptions.has(item.id))?.id ?? requiredCases[0].id);
  }
  pressured.add("case.116.audit-target");
  assert(pressured.size === 37, `expected 37 chronological pressure cases, found ${pressured.size}`);
  assert(rewarded.size === 2, `expected two early aligned-report rewards, found ${rewarded.size}`);
  const names = new Map(campaign.characters.map((person) => [person.id, person.name]));
  for (const item of campaign.cases.filter((candidate) => /^case\.\d/.test(candidate.id))) {
    const evidence = outcome(item, ".outcome.evidence");
    const assured = outcome(item, ".outcome.assured");
    if (!evidence) continue;
    const evidenceStanding = pressured.has(item.id) ? -1 : 0;
    const assuredStanding = rewarded.has(item.id) ? 1 : pressured.has(item.id) ? 2 : 0;
    for (const selected of [evidence, outcome(item, ".outcome.party-precise")].filter(Boolean)) {
      upsertEffect(selected, (effect) => effect.type === "change" && effect.target === "standing.value",
        { type: "change", target: "standing.value", delta: evidenceStanding });
    }
    for (const selected of [assured, outcome(item, ".outcome.party-control")].filter(Boolean)) {
      upsertEffect(selected, (effect) => effect.type === "change" && effect.target === "standing.value",
        { type: "change", target: "standing.value", delta: assuredStanding });
    }
    evidence.effects = evidence.effects.filter((effect) =>
      !(effect.type === "change" && effect.target === "world:evidence-preserved.value"));
    if (pressured.has(item.id)) {
      evidence.effects.push({ type: "change", target: "world:evidence-preserved.value", delta: 1 });
      evidence.ministryResponse = `${names.get(item.requesterId) ?? "The requester"} keeps the supported contradiction on file. Public Assurance removes one Standing mark because it contradicts the morning edition.`;
      if (assured) assured.ministryResponse = `${names.get(item.requesterId) ?? "The requester"} accepts the wider conclusion because it matches the morning edition. Public Assurance adds two Standing marks.`;
    } else if (rewarded.has(item.id) && assured) {
      assured.ministryResponse = `${names.get(item.requesterId) ?? "The requester"} accepts the aligned summary. Public Assurance adds one Standing mark.`;
    } else {
      if (evidence.ministryResponse.includes("Public Assurance removes one Standing mark")) evidence.ministryResponse = `${names.get(item.requesterId) ?? "The requester"} keeps the supported finding on file. Standing does not change.`;
      if (assured?.ministryResponse.includes("Public Assurance adds two Standing marks")) assured.ministryResponse = `${names.get(item.requesterId) ?? "The requester"} accepts the wider conclusion for filing. Standing does not change.`;
    }
  }
}

// Content-density checks fail generation before an unreadable campaign can be committed.
const countWords = (text) => text.match(/[\p{L}\p{N}_'-]+/gu)?.length ?? 0;
const countProseWords = (text) => countWords(text.replace(/`[^`]*`/g, ""));
function assertWordCeiling(label, values, ceiling, counter = countWords) {
  const worst = values.map((value) => ({ value, words: counter(value) })).sort((left, right) => right.words - left.words)[0];
  assert(worst.words <= ceiling, `${label} exceeds ${ceiling} words (${worst.words}): ${worst.value}`);
}
assertWordCeiling("briefing", campaign.cases.map((item) => item.briefing), 30);
assertWordCeiling("question", campaign.cases.map((item) => item.question), 24);
assertWordCeiling("hypothesis title", campaign.cases.flatMap((item) => item.hypotheses.map((hypothesis) => hypothesis.title)), 16);
assertWordCeiling("hypothesis summary", campaign.cases.flatMap((item) => item.hypotheses.map((hypothesis) => hypothesis.summary)), 24);
assertWordCeiling("conclusion", campaign.cases.flatMap((item) => item.report.conclusions.map((choice) => choice.text)), 24);
assertWordCeiling("action", campaign.cases.flatMap((item) => item.decisionChoices.map((choice) => choice.text)), 16);
assertWordCeiling("hint prose", campaign.cases.flatMap((item) => item.hints.map((hint) => hint.text)), 60, countProseWords);

// These three record watches were appended to non-watch concept bundles. Keep
// their checkpoint gate outside the concept-specific artifact selectors, and
// normalize it last so repeated generation cannot nest the generated gate.
function withoutWatchRequirements(requirement) {
  if (!("op" in requirement)) return requirement.kind === "W" ? undefined : requirement;
  const items = requirement.items.map(withoutWatchRequirements).filter(Boolean);
  if (items.length === 1) return items[0];
  return { ...requirement, items };
}
for (const caseNumber of [61, 84, 127]) {
  const item = cases.get(caseNumber);
  const thresholds = campaign.watchScenarios.find((scenario) => scenario.id === item.watchScenarioId).thresholds;
  for (const path of item.evidencePaths) {
    const clause = path.clauses[0];
    const baseRequirements = withoutWatchRequirements(clause.requirements);
    assert(baseRequirements, `${item.id} ${path.id} lost its concept evidence while normalizing the watch gate`);
    clause.requirements = {
      op: "all",
      items: [
        baseRequirements,
        { kind: "W", property: "checkpoint-success", relation: "=", expected: true },
        ...Object.keys(thresholds).map((property) => ({
          kind: "W", property, relation: ">=", expected: "declared-threshold",
        })),
      ],
    };
  }
}

// Report and enforce first-use pacing for both appointments. A Trainee learns
// two selector basics in clearance; an Agent first meets them at Elm Exchange.
const generatedCaseById = new Map(campaign.cases.map((item) => [item.id, item]));
function curriculumPacing(route) {
  const playableShifts = campaign.shifts.filter((shift) => route === "trainee" || shift.id !== "shift.clearance.ministry-trainee");
  const shiftByCaseId = new Map(playableShifts.flatMap((shift, shiftIndex) =>
    shift.inbox.filter((ref) => ref.kind === "case").map((ref) => [ref.id, { shift, shiftIndex }])));
  const firstUse = new Map();
  for (const concept of campaign.concepts) {
    const uses = campaign.cases.flatMap((item) => item.masteryUses
      .filter((use) => use.conceptId === concept.id && shiftByCaseId.has(item.id))
      .map(() => ({ caseId: item.id, ...shiftByCaseId.get(item.id) })));
    uses.sort((left, right) => left.shiftIndex - right.shiftIndex);
    assert(uses.length > 0, `${route} route never exercises ${concept.id}`);
    const shiftIndex = uses[0].shiftIndex;
    firstUse.set(concept.id, {
      shiftIndex,
      shiftId: uses[0].shift.id,
      caseIds: uses.filter((use) => use.shiftIndex === shiftIndex).map((use) => use.caseId),
    });
  }
  for (const concept of campaign.concepts) for (const prerequisite of concept.prerequisites) {
    assert(firstUse.get(prerequisite).shiftIndex <= firstUse.get(concept.id).shiftIndex,
      `${route} route introduces ${concept.id} before prerequisite ${prerequisite}`);
  }
  return playableShifts.map((shift, shiftIndex) => {
    const caseIds = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => ref.id);
    const firstConcepts = campaign.concepts.filter((concept) => firstUse.get(concept.id).shiftIndex === shiftIndex).map((concept) => concept.id);
    const required = caseIds.filter((caseId) => generatedCaseById.get(caseId).mode !== "adaptive");
    const candidates = caseIds.filter((caseId) => generatedCaseById.get(caseId).mode === "adaptive");
    const playableSets = shift.caseSelectionMode === "mixed"
      ? candidates.map((caseId) => [...required, caseId])
      : [caseIds];
    const routeIntroductions = playableSets.map((set) => firstConcepts.filter((conceptId) =>
      firstUse.get(conceptId).caseIds.some((caseId) => set.includes(caseId))));
    for (const introductions of routeIntroductions) {
      assert(introductions.length <= 3, `${route} ${shift.id} introduces ${introductions.length} concepts: ${introductions.join(", ")}`);
    }
    if (shift.caseSelectionMode === "mixed") {
      for (const conceptId of firstConcepts) {
        assert(firstUse.get(conceptId).caseIds.some((caseId) => required.includes(caseId)), `${route} ${shift.id} hides ${conceptId}'s first lesson in an optional case`);
      }
    }
    return { shiftId: shift.id, firstConcepts, maximumIntroductions: Math.max(0, ...routeIntroductions.map((items) => items.length)) };
  });
}
const pacing = {
  ministryTrainee: curriculumPacing("trainee"),
  ministryAgent: curriculumPacing("agent"),
};

// Recompute the generated coverage ledger from authored mastery uses.
const oldLedger = JSON.parse(await readFile(ledgerPath, "utf8"));
const actOrder = new Map(campaign.acts.map((act) => [act.id, act.order]));
const creditUnit = (item, use) => ({
  caseId: item.id,
  actId: item.actId,
  act: actOrder.get(item.actId),
  dataShapeId: item.variants[0].dataShapeId,
  operationalQuestionId: item.operationalQuestionId,
  unitKind: use.unitKind,
  maxAssistance: use.maxAssistance,
  targetState: use.targetState,
  spacedRecall: Boolean(use.spacedRecall),
});
const conceptRows = campaign.concepts.map((concept) => {
  const uses = campaign.cases.flatMap((item) => item.masteryUses.filter((use) => use.conceptId === concept.id).map((use) => creditUnit(item, use)));
  const row = {
    id: concept.id,
    stage: concept.stage,
    language: concept.language,
    family: concept.family,
    prerequisites: concept.prerequisites,
    observed: uses.filter((use) => use.targetState === "Observed"),
    practiced: uses.filter((use) => use.targetState === "Practiced"),
    independent: uses.filter((use) => use.targetState === "Independent" && !use.spacedRecall),
    certified: uses.filter((use) => use.targetState === "Certified" && !use.spacedRecall),
    spacedRecall: uses.filter((use) => use.spacedRecall),
  };
  row.status = row.observed.length >= 1 && row.practiced.length >= 2 && row.independent.length >= 2 && row.certified.length >= 1 && row.spacedRecall.length >= 1 ? "complete" : "incomplete";
  return row;
});
const creditsPerCase = campaign.cases.map((item) => item.masteryUses.length);
const authoredCreditUnits = creditsPerCase.reduce((sum, count) => sum + count, 0);
const ledger = {
  ...oldLedger,
  campaignId: campaign.id,
  conceptRegistryVersion: campaign.conceptRegistryVersion,
  generatedFrom: "content/campaign.json via scripts/generate-campaign.mjs",
  policy: { ...oldLedger.policy, maximumIntroductionsPerPlayableShift: 3 },
  totals: {
    acts: campaign.acts.length,
    shifts: campaign.shifts.length,
    mainCampaignShifts: campaign.shifts.filter((item) => item.id !== "shift.clearance.ministry-trainee").length,
    cases: campaign.cases.length,
    mainCampaignCases: campaign.cases.filter((item) => !item.id.startsWith(clearancePrefix)).length,
    requiredCasesPerRun: 154,
    requiredCasesPerAgentRun: 154,
    requiredCasesPerTraineeRun: 158,
    adaptiveCandidateCases: campaign.cases.filter((item) => item.mode === "adaptive").length,
    concepts: campaign.concepts.length,
    requiredCreditUnits: campaign.concepts.length * 7,
    authoredCreditUnits,
    creditedCaseEquivalentFloor: Math.ceil((campaign.concepts.length * 7) / 3),
    casesWithOneCredit: creditsPerCase.filter((count) => count === 1).length,
    casesWithTwoCredits: creditsPerCase.filter((count) => count === 2).length,
    casesWithThreeCredits: creditsPerCase.filter((count) => count === 3).length,
    estimatedProficientMinutes: campaign.cases.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    completeConcepts: conceptRows.filter((row) => row.status === "complete").length,
  },
  pacing,
  concepts: conceptRows,
};

const cell = (items) => items.map((item) => `\`${item.caseId}\``).join("<br>") || "—";
const coverage = `# Campaign coverage

This file is generated by \`npm run generate:campaign\` from the authored mastery uses in \`content/campaign.json\`.

## Coverage result

- ${ledger.totals.completeConcepts} of ${ledger.totals.concepts} concepts have the complete authored sequence.
- ${ledger.totals.authoredCreditUnits} credit uses are authored across ${ledger.totals.cases} cases.
- The main campaign remains ${ledger.totals.mainCampaignShifts} shifts and ${ledger.totals.mainCampaignCases} cases: 40 fixed foundation cases, then three cases per shift across Shifts 11–48.
- A Ministry Agent run requires ${ledger.totals.requiredCasesPerAgentRun} cases. A Ministry Trainee run requires ${ledger.totals.requiredCasesPerTraineeRun}, including four clearance orders before Shift 1.
- ${ledger.totals.adaptiveCandidateCases} later cases form 38 targeted-practice pairs; the engine selects one candidate from each pair.
- The three-credit mathematical floor remains ${ledger.totals.creditedCaseEquivalentFloor} case-equivalents.
- No playable shift introduces more than ${ledger.policy.maximumIntroductionsPerPlayableShift} concepts on either appointment route.

## First-use pacing

| Shift | Ministry Trainee | Ministry Agent |
|---|---|---|
${campaign.shifts.map((shift) => {
  const trainee = pacing.ministryTrainee.find((row) => row.shiftId === shift.id);
  const agent = pacing.ministryAgent.find((row) => row.shiftId === shift.id);
  const names = (row) => row?.firstConcepts.map((id) => `\`${id}\``).join("<br>") || "—";
  return `| ${shift.title} | ${names(trainee)} | ${names(agent)} |`;
}).join("\n")}

## Per-concept ledger

| Concept | Stage | Observed | Practiced | Independent | Certified | Recall |
|---|---|---|---|---|---|---|
${conceptRows.map((row) => `| \`${row.id}\` | ${row.stage} | ${cell(row.observed)} | ${cell(row.practiced)} | ${cell(row.independent)} | ${cell(row.certified)} | ${cell(row.spacedRecall)} |`).join("\n")}
`;

// Generator-owned invariants catch regressions before the heavier TypeScript validator runs.
for (const item of campaign.cases) {
  const declared = [...new Set(item.conceptIds)].sort();
  const mastered = [...new Set(item.masteryUses.map((use) => use.conceptId))].sort();
  const evidenced = [...new Set(item.evidencePaths.flatMap((path) => path.clauses.map((clause) => clause.conceptId)))].sort();
  const display = (values) => values.join(", ") || "none";
  assert(JSON.stringify(declared) === JSON.stringify(mastered) && JSON.stringify(declared) === JSON.stringify(evidenced),
    `${item.id} concept disagreement: conceptIds=[${display(declared)}], mastery=[${display(mastered)}], evidence=[${display(evidenced)}]`);
  const declaredRoles = Object.keys(item.technicalTruth.artifactRoles).sort();
  for (const variant of item.variants) {
    const workedRoles = variant.workedEvidenceSet.artifacts.map((artifact) => artifact.role);
    assert(new Set(workedRoles).size === workedRoles.length, `${item.id} ${variant.id} has duplicate Worked artifact roles`);
    assert(JSON.stringify([...workedRoles].sort()) === JSON.stringify(declaredRoles),
      `${item.id} ${variant.id} Worked roles disagree with technicalTruth.artifactRoles`);
    const direct = variant.referenceSets.find((set) => set.evidencePathId === variant.workedEvidenceSet.evidencePathId);
    assert(direct, `${item.id} ${variant.id} has no direct reference set matching its Worked evidence path`);
    assert(JSON.stringify(direct.artifacts.map((artifact) => artifact.role)) === JSON.stringify(workedRoles),
      `${item.id} ${variant.id} direct and Worked artifact roles disagree`);
  }
}
assert(campaign.shifts.filter((item) => item.id !== "shift.clearance.ministry-trainee").length === 48, "campaign must retain 48 main shifts");
assert(campaign.cases.filter((item) => !item.id.startsWith(clearancePrefix)).length === 192, "campaign must retain 192 main authored cases");
assert(campaign.shifts.length === 49, "campaign must add exactly one clearance shift");
assert(campaign.cases.length === 196, "campaign must add exactly four clearance cases");
assert(new Set(campaign.newspaper.editions.map((item) => item.shiftId)).size === campaign.shifts.length, "every playable shift needs a newspaper edition");
assert(campaign.cases.filter((item) => item.mode === "adaptive").length === 76, "campaign must expose 76 adaptive candidates");
assert(campaign.cases.every((item) => item.availableSources.length > 0), "every case needs staged telemetry sources");
assert(campaign.cases.every((item) => item.hypotheses.length >= 2 && !item.hypotheses[1].title.startsWith("The form is right:")), "every case needs a plausible competing hypothesis");
assert(campaign.cases.every((item) => item.variants.every((variant) => JSON.stringify(directSet(variant).artifacts) !== JSON.stringify(variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.corroborated")).artifacts))), "direct and corroborated paths must differ");
assert(ledger.totals.authoredCreditUnits === 466, `expected 466 authored credit uses, found ${ledger.totals.authoredCreditUnits}`);
assert(ledger.totals.completeConcepts === 66, `expected complete coverage for 66 concepts, found ${ledger.totals.completeConcepts}`);

await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
await writeFile(coveragePath, coverage);
console.log(`Generated ${campaign.cases.length} cases, ${campaign.shifts.length} shifts, ${campaign.watchScenarios.length} watch scenarios, and ${ledger.totals.authoredCreditUnits} mastery credits.`);
