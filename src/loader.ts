import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import campaignSchema from "../schemas/campaign.schema.json";
import { DETECTOR_VOCABULARY, SUPPORTED_FEATURES } from "./capabilities";
import type {
  Campaign,
  CampaignIndex,
  Concept,
  Condition,
  Detector,
  Effect,
  Operand,
  RequiredValue,
  EvidenceRequirement,
  CampaignCase,
} from "./types";

export class CampaignLoadError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Campaign pack rejected:\n${problems.map((problem) => `• ${problem}`).join("\n")}`);
    this.name = "CampaignLoadError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(campaignSchema);

const relationSet = new Set(["=", "!=", "<", "<=", ">", ">=", "contains", "contains-all", "subset-of"]);
const selectorPattern = /^(artifact(?:\[[1-9]\d*\])?|promql|logql|watch-expression)$/;
const masterySelectorPattern = /^(artifact\[[1-9]\d*\]|promql|logql|watch-expression)$/;

function checkArtifactSelectors(item: CampaignCase, selectors: string[], path: string, problems: string[]): void {
  if (!selectors.length) problems.push(`${path} has no artifact selectors`);
  if (new Set(selectors).size !== selectors.length) problems.push(`${path} has duplicate artifact selectors`);
  selectors.forEach((selector) => {
    if (!masterySelectorPattern.test(selector)) problems.push(`${path} has ambiguous selector "${selector}"`);
    const slot = /^artifact\[([1-9]\d*)\]$/.exec(selector)?.[1];
    if (slot && Number(slot) > item.report.maxArtifacts) problems.push(`${path} selector "${selector}" exceeds report.maxArtifacts`);
    if ((selector === "promql" || selector === "logql") && !item.languages.includes(selector)) problems.push(`${path} selects disabled language "${selector}"`);
  });
}

function resolveReferenceSelectors(selectors: string[], artifacts: ReadonlyArray<{ role: string; language: "promql" | "logql" }>): number[] | undefined {
  const resolved: number[] = [];
  for (const selector of selectors) {
    const slot = /^artifact\[([1-9]\d*)\]$/.exec(selector)?.[1];
    const matches = slot ? (Number(slot) <= artifacts.length ? [Number(slot) - 1] : [])
      : selector === "promql" || selector === "logql" ? artifacts.flatMap((artifact, index) => artifact.language === selector ? [index] : [])
        : selector === "watch-expression" ? artifacts.flatMap((artifact, index) => artifact.role === selector ? [index] : []) : [];
    if (matches.length !== 1 || resolved.includes(matches[0]!)) return undefined;
    resolved.push(matches[0]!);
  }
  return resolved;
}

const factFields: Record<string, ReadonlySet<string>> = {
  context: new Set(["campaign_time", "act_id", "shift_id", "case_id", "seed", "rank_id"]),
  standing: new Set(["value", "band_id"]),
  watch_capacity: new Set(["limit", "used", "available"]),
  clock: new Set(["enabled", "budget", "used", "remaining"]),
  relationship: new Set(["value"]), world: new Set(["value"]), tag: new Set(["present"]),
  access: new Set(["granted"]), watch_authority: new Set(["granted"]),
  progress: new Set(["phase", "outcome", "started_at", "completed_at"]),
  mastery: new Set(["state", "credit_count", "spaced_recall_met"]),
  attempt: new Set(["state", "assistance", "unit_kind", "artifact_ids", "watch_id", "concept_ids", "behavior_requirement_ids", "evidence_requirement_ids", "behavior_pass", "evidence_pass", "credit_awarded", "data_shape_id", "operational_question_id"]),
  decision: new Set(["choice_id", "decided_at"]),
  artifact: new Set(["state", "language", "result_kind", "empty", "scalar_value", "evaluation_start", "evaluation_end", "visualization_id", "print_query", "print_labels", "print_range", "print_zero_axis", "retained_labels", "retained_fields", "observations", "source_ids", "event_ids", "costs", "evidence"]),
  assessment: new Set(["state", "rule_id", "artifact_ids", "measured_value"]),
  report: new Set(["artifact_ids", "title_choice_id", "conclusion_choice_id", "filed_at", "evaluation_start", "evaluation_end", "visualization_id", "evidence"]),
  watch: new Set(["state", "artifact_id", "last_successful_checkpoint_id", "last_checkpoint_state", "candidate_count", "notice_ids", "event_ids", "coverage", "specificity", "localization", "timeliness", "cost"]),
  notice: new Set(["state", "generation", "occurrence_count", "candidate_count", "event_ids", "localization", "first_seen", "last_seen", "resolved_at"]),
  event: new Set(["relevance", "detected", "localized", "timely", "candidate_count", "window_start", "window_end", "required_localization", "detected_localization"]),
};

function schemaProblems(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
}

function byId<T extends { id: string }>(items: T[], label: string, problems: string[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    if (result.has(item.id)) problems.push(`${label} contains duplicate id "${item.id}"`);
    else result.set(item.id, item);
  }
  return result;
}

function requireRef(map: ReadonlyMap<string, unknown>, id: string, path: string, problems: string[]): void {
  if (!map.has(id)) problems.push(`${path} references missing id "${id}"`);
}

function requireRightRef(
  rights: ReadonlyMap<string, { kind: string }>, id: string, expectedKind: "access" | "watch-authority" | undefined,
  path: string, problems: string[],
): void {
  requireRef(rights, id, path, problems);
  const right = rights.get(id);
  if (right && expectedKind && right.kind !== expectedKind) problems.push(`${path} must reference ${expectedKind === "access" ? "an" : "a"} ${expectedKind} right`);
}

function checkFact(fact: string, campaign: Campaign, path: string, problems: string[]): void {
  const dot = fact.lastIndexOf(".");
  const record = fact.slice(0, dot);
  const field = fact.slice(dot + 1);
  const parts = record.split(":");
  const kind = parts[0] ?? "";
  const allowed = factFields[kind];
  if (!allowed?.has(field)) {
    problems.push(`${path} uses unsupported fact field "${fact}"`);
    return;
  }
  const id = parts.at(-1);
  if (!id || parts.length === 1) return;
  const ids = (() => {
    if (kind === "world") return campaign.worldDeclarations.map((item) => item.id);
    if (kind === "relationship") return campaign.relationshipDeclarations.map((item) => item.id);
    if (kind === "tag") return campaign.tagDeclarations.map((item) => item.id);
    if (kind === "access") return campaign.rightDeclarations.filter((item) => item.kind === "access").map((item) => item.id);
    if (kind === "watch_authority") return campaign.rightDeclarations.filter((item) => item.kind === "watch-authority").map((item) => item.id);
    if (kind === "mastery") return campaign.concepts.map((item) => item.id);
    if (kind === "decision") return campaign.cases.map((item) => item.decisionId);
    if (kind === "report") return campaign.cases.map((item) => item.reportId);
    return undefined;
  })();
  if (ids && !ids.includes(id)) problems.push(`${path} references undeclared ${kind} id "${id}"`);
}

function checkOperand(operand: Operand, campaign: Campaign, path: string, problems: string[]): void {
  if (operand && typeof operand === "object" && !Array.isArray(operand) && "fact" in operand) {
    checkFact(operand.fact, campaign, path, problems);
  }
}

function checkCondition(condition: Condition | undefined, campaign: Campaign, path: string, problems: string[]): void {
  if (!condition) return;
  if (condition.op === "all" || condition.op === "any") {
    condition.items.forEach((item, index) => checkCondition(item, campaign, `${path}.items[${index}]`, problems));
  } else if (condition.op === "not") {
    checkCondition(condition.item, campaign, `${path}.item`, problems);
  } else if (condition.op === "exists" || condition.op === "missing") {
    checkOperand(condition.value, campaign, `${path}.value`, problems);
  } else if (condition.op === "state" || condition.op === "reached") {
    checkOperand(condition.value, campaign, `${path}.value`, problems);
  } else if (condition.op === "between") {
    checkOperand(condition.value, campaign, `${path}.value`, problems);
    checkOperand(condition.lower, campaign, `${path}.lower`, problems);
    checkOperand(condition.upper, campaign, `${path}.upper`, problems);
  } else if ("left" in condition) {
    checkOperand(condition.left, campaign, `${path}.left`, problems);
    checkOperand(condition.right, campaign, `${path}.right`, problems);
  }
}

interface RefMaps {
  ranks: ReadonlyMap<string, unknown>; cases: ReadonlyMap<string, unknown>; narratives: ReadonlyMap<string, { kind: string }>;
  consequences: ReadonlyMap<string, unknown>; endings: ReadonlyMap<string, unknown>; checkpoints: ReadonlyMap<string, unknown>;
  tags: ReadonlyMap<string, unknown>; rights: ReadonlyMap<string, { kind: string }>; variants: ReadonlyMap<string, unknown>;
}

function checkEffect(effect: Effect, maps: RefMaps, campaign: Campaign, path: string, problems: string[]): void {
  if (effect.type === "set" || effect.type === "change") {
    const allowed = effect.type === "set"
      ? /^(world|relationship):[a-z0-9._-]+\.value$/
      : /^(standing\.value|watch_capacity\.limit|(world|relationship):[a-z0-9._-]+\.value)$/;
    if (!allowed.test(effect.target)) problems.push(`${path}.target is not permitted for ${effect.type}`);
    else checkFact(effect.target, campaign, `${path}.target`, problems);
  } else if (effect.type === "add_tag" || effect.type === "remove_tag") {
    requireRef(maps.tags, effect.tagId, `${path}.tagId`, problems);
  } else if (effect.type === "enqueue" || effect.type === "withdraw") {
    const map = effect.itemKind === "case" ? maps.cases : maps.narratives;
    requireRef(map, effect.itemId, `${path}.itemId`, problems);
    const item = maps.narratives.get(effect.itemId);
    if (effect.itemKind !== "case" && item && item.kind !== effect.itemKind) problems.push(`${path}.itemKind does not match narrative item "${effect.itemId}"`);
  } else if (effect.type === "grant" || effect.type === "revoke") {
    requireRef(maps.rights, effect.rightId, `${path}.rightId`, problems);
    const right = maps.rights.get(effect.rightId);
    if (right && right.kind !== effect.rightKind) problems.push(`${path}.rightKind does not match "${effect.rightId}"`);
  } else if (effect.type === "promote" || effect.type === "demote") {
    requireRef(maps.ranks, effect.rankId, `${path}.rankId`, problems);
  } else if (effect.type === "schedule") {
    requireRef(effect.targetKind === "consequence" ? maps.consequences : maps.variants, effect.targetId, `${path}.targetId`, problems);
    if (effect.atCheckpointId) requireRef(maps.checkpoints, effect.atCheckpointId, `${path}.atCheckpointId`, problems);
  } else if (effect.type === "enter_ending") {
    requireRef(maps.endings, effect.endingId, `${path}.endingId`, problems);
  }
}

function checkDetector(detector: Detector, path: string, problems: string[]): void {
  if ("op" in detector) {
    detector.items.forEach((item, index) => checkDetector(item, `${path}.items[${index}]`, problems));
    return;
  }
  if ("relation" in detector && !relationSet.has(detector.relation)) problems.push(`${path}.relation is unsupported`);
  const selectors = detector.kind === "E" ? detector.selectors : detector.selector ? [detector.selector] : [];
  for (const selector of selectors) if (!selectorPattern.test(selector)) problems.push(`${path} has invalid selector "${selector}"`);
  if (detector.kind === "U" || detector.kind === "R" || detector.kind === "W") {
    if (!DETECTOR_VOCABULARY[detector.kind].has(detector.property)) problems.push(`${path} has unknown ${detector.kind} property "${detector.property}"`);
  } else if (detector.kind === "A") {
    const allowed = DETECTOR_VOCABULARY.A.get(detector.node);
    if (!allowed) problems.push(`${path} has unknown A node "${detector.node}"`);
    else for (const key of Object.keys(detector.parameters)) if (!allowed.has(key)) problems.push(`${path} has unknown ${detector.node} parameter "${key}"`);
  } else if (detector.kind === "E") {
    const allowed = DETECTOR_VOCABULARY.E.get(detector.rule);
    if (!allowed) problems.push(`${path} has unknown E rule "${detector.rule}"`);
    else for (const key of Object.keys(detector.parameters)) if (!allowed.has(key)) problems.push(`${path} has unknown ${detector.rule} parameter "${key}"`);
  }
}

const sameSelectors = (left: string[], right: string[]): boolean => left.length === right.length && left.every((value, index) => value === right[index]);

function detectorLeaves(detector: Detector): Detector[] {
  return "op" in detector ? detector.items.flatMap(detectorLeaves) : [detector];
}

const bareResultShapeProperties = new Set(["status", "result-type"]);

function onlyChecksBareResultShape(detector: Detector): boolean {
  const leaves = detectorLeaves(detector);
  return leaves.length > 0 && leaves.every((leaf) =>
    !("op" in leaf) && leaf.kind === "R" && bareResultShapeProperties.has(leaf.property),
  );
}

function hasRicherConceptContract(concept: Pick<Concept, "semantic" | "evidence">): boolean {
  return [...detectorLeaves(concept.semantic), ...detectorLeaves(concept.evidence)].some((leaf) =>
    !("op" in leaf) && (leaf.kind !== "R" || !bareResultShapeProperties.has(leaf.property)),
  );
}

function requireValue(
  values: RequiredValue[], conceptId: string, detector: RequiredValue["detector"], selectors: string[], subject: string,
  path: string, problems: string[],
): void {
  const matches = values.filter((item) => item.conceptId === conceptId && item.detector === detector && item.subject === subject && sameSelectors(item.selectors, selectors));
  if (matches.length !== 1) problems.push(`${path} requires exactly one requiredValue for ${conceptId}/${detector}/${selectors.join(",")}/${subject}; found ${matches.length}`);
}

function requireEvidence(
  values: EvidenceRequirement[], conceptId: string, rule: string, selectors: string[], subject: string,
  choiceId: string | undefined, path: string, problems: string[],
): void {
  const matches = values.filter((item) => item.conceptId === conceptId && item.rule === rule && item.subject === subject && item.choiceId === choiceId && sameSelectors(item.selectors, selectors));
  if (matches.length !== 1) problems.push(`${path} requires exactly one evidenceRequirement for ${conceptId}/${rule}/${selectors.join(",")}/${subject}${choiceId ? `/${choiceId}` : ""}; found ${matches.length}`);
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function checkRequirementLeaves(
  item: CampaignCase, variant: CampaignCase["variants"][number], conceptId: string, leaves: Detector[], problems: string[],
): void {
  const requiredValues = [...(item.requiredValues ?? []), ...(variant.requiredValues ?? [])];
  const evidenceRequirements = [...(item.evidenceRequirements ?? []), ...(variant.evidenceRequirements ?? [])];
  const prefix = `case ${item.id} variant ${variant.id}`;
  for (const leaf of leaves) {
    if ("op" in leaf) continue;
    const selectors = leaf.kind === "U" ? ["unit"] : leaf.kind === "E" ? leaf.selectors : leaf.selector ? [leaf.selector] : [];
    if ((leaf.kind === "U" || leaf.kind === "R" || leaf.kind === "W") && leaf.expected === "case-required") {
      if (leaf.kind !== "W") requireValue(requiredValues, conceptId, leaf.kind, selectors, leaf.property, prefix, problems);
    } else if (leaf.kind === "A") {
      for (const [parameter, expected] of Object.entries(leaf.parameters)) {
        if (expected === "case-required") requireValue(requiredValues, conceptId, "A", selectors, `${leaf.node}.${parameter}`, prefix, problems);
      }
    } else if (leaf.kind === "E") {
      const rule = leaf.rule;
      const parameters = leaf.parameters;
      if (rule === "schema-selection") {
        requireValue(requiredValues, conceptId, "E", selectors, "accepted-source-sets", prefix, problems);
        requireValue(requiredValues, conceptId, "E", selectors, "supplied-source-ids", prefix, problems);
      } else if (rule === "result-interpretation") {
        strings(parameters.subjects).forEach((subject) => requireEvidence(evidenceRequirements, conceptId, rule, selectors, subject, undefined, prefix, problems));
      } else if (rule === "scope" || rule === "operation-fit") {
        strings(parameters.dimension).forEach((subject) => requireEvidence(evidenceRequirements, conceptId, rule, selectors, subject, undefined, prefix, problems));
      } else if (rule === "localization" && parameters.expected === "case-required") {
        requireValue(requiredValues, conceptId, "E", selectors, "required-values", prefix, problems);
      } else if (rule === "numeric-value" && parameters.expected === "case-required") {
        requireValue(requiredValues, conceptId, "E", selectors, "expected", prefix, problems);
      } else if (rule === "absence-model") {
        strings(parameters.distinctions).forEach((subject) => requireEvidence(evidenceRequirements, conceptId, rule, selectors, subject, undefined, prefix, problems));
      } else if (rule === "provenance" && parameters.expected === "case-required") {
        requireEvidence(evidenceRequirements, conceptId, rule, selectors, "expected", undefined, prefix, problems);
      } else if (rule === "claim-support") {
        for (const subject of strings(parameters.subjects)) {
          const choices = subject === "title" ? item.report.titles : subject === "conclusion" ? item.report.conclusions : [];
          choices.forEach((choice) => requireEvidence(evidenceRequirements, conceptId, rule, selectors, subject, choice.id, prefix, problems));
        }
      } else if (rule === "performance" && parameters.dimension === "cardinality") {
        requireEvidence(evidenceRequirements, conceptId, rule, selectors, "cardinality", undefined, prefix, problems);
      } else if (rule === "watch-quality" && parameters.explanation === "all-dimensions") {
        requireEvidence(evidenceRequirements, conceptId, rule, selectors, "all-dimensions", undefined, prefix, problems);
      }
    }
  }
}

function checkCaseRequirements(item: CampaignCase, concepts: ReadonlyMap<string, { semantic: Detector; evidence: Detector }>, problems: string[]): void {
  for (const variant of item.variants) {
    const evidenceRequirements = [...(item.evidenceRequirements ?? []), ...(variant.evidenceRequirements ?? [])];
    evidenceRequirements.forEach((requirement, index) => requirement.alternatives.flat().forEach((detector, detectorIndex) => checkDetector(detector, `case ${item.id} variant ${variant.id}.evidenceRequirements[${index}].alternatives[${detectorIndex}]`, problems)));
    for (const conceptId of item.conceptIds) {
      const concept = concepts.get(conceptId);
      if (concept) checkRequirementLeaves(item, variant, conceptId, [...detectorLeaves(concept.semantic), ...detectorLeaves(concept.evidence)], problems);
    }
    for (const path of item.evidencePaths) for (const clause of path.clauses) {
      checkRequirementLeaves(item, variant, clause.conceptId, detectorLeaves(clause.requirements), problems);
    }
  }
}

export function loadCampaign(input: unknown): CampaignIndex {
  if (!validateSchema(input)) throw new CampaignLoadError(schemaProblems(validateSchema.errors));
  const campaign = input as unknown as Campaign;
  const problems: string[] = [];

  for (const language of ["promql", "logql"] as const) {
    for (const feature of campaign.features[language]) {
      if (!SUPPORTED_FEATURES[language].has(feature)) problems.push(`features.${language} contains unsupported capability "${feature}"`);
    }
  }

  const standing = campaign.standing;
  if (standing.minimum >= standing.maximum) problems.push("standing.minimum must be less than standing.maximum");
  if (campaign.opening.standing < standing.minimum || campaign.opening.standing > standing.maximum) problems.push("opening.standing is outside the campaign Standing bounds");
  if (standing.bands[0]?.minimum !== standing.minimum) problems.push("standing.bands must begin at standing.minimum");
  const bandIds = new Set<string>();
  standing.bands.forEach((band, index) => {
    if (bandIds.has(band.id)) problems.push(`standing.bands contains duplicate id "${band.id}"`);
    bandIds.add(band.id);
    if (band.minimum < standing.minimum || band.minimum > standing.maximum) problems.push(`standing band "${band.id}" is outside the campaign bounds`);
    if (index > 0 && band.minimum <= standing.bands[index - 1]!.minimum) problems.push("standing.bands must be ordered by increasing minimum");
  });

  const concepts = byId(campaign.concepts, "concepts", problems);
  const metrics = new Map(campaign.metrics.map((metric) => [metric.name, metric]));
  if (metrics.size !== campaign.metrics.length) problems.push("metrics contains duplicate names");
  const logSources = byId(campaign.logSources, "logSources", problems);
  const datasets = byId(campaign.datasets, "datasets", problems);
  const acts = byId(campaign.acts, "acts", problems);
  const ranks = byId(campaign.ranks, "ranks", problems);
  const shifts = byId(campaign.shifts, "shifts", problems);
  const cases = byId(campaign.cases, "cases", problems);
  const watchScenarios = byId(campaign.watchScenarios, "watchScenarios", problems);
  const narrativeItems = byId(campaign.narrativeItems, "narrativeItems", problems);
  const consequences = byId(campaign.consequences, "consequences", problems);
  const endings = byId(campaign.endings, "endings", problems);
  const factions = byId(campaign.factions, "factions", problems);
  const characters = byId(campaign.characters, "characters", problems);
  const tags = byId(campaign.tagDeclarations, "tagDeclarations", problems);
  const rights = byId(campaign.rightDeclarations, "rightDeclarations", problems);
  byId(campaign.opening.montage ?? [], "opening.montage", problems);
  const appointments = byId(campaign.opening.appointments ?? [], "opening.appointments", problems);
  const newspaperEditions = byId(campaign.newspaper?.editions ?? [], "newspaper.editions", problems);
  byId(campaign.worldDeclarations, "worldDeclarations", problems);
  byId(campaign.relationshipDeclarations, "relationshipDeclarations", problems);
  const variants = byId(campaign.cases.flatMap((item) => item.variants), "case variants", problems);

  requireRef(shifts, campaign.opening.shiftId, "opening.shiftId", problems);
  requireRef(ranks, campaign.opening.rankId, "opening.rankId", problems);
  campaign.opening.access?.forEach((id, index) => requireRightRef(rights, id, "access", `opening.access[${index}]`, problems));
  campaign.opening.watchAuthority?.forEach((id, index) => requireRightRef(rights, id, "watch-authority", `opening.watchAuthority[${index}]`, problems));
  campaign.ranks.forEach((rank, rankIndex) => rank.grants.forEach((id, grantIndex) =>
    requireRightRef(rights, id, undefined, `ranks[${rankIndex}].grants[${grantIndex}]`, problems)));
  appointments.forEach((appointment) => requireRef(shifts, appointment.shiftId, `appointment ${appointment.id}.shiftId`, problems));
  newspaperEditions.forEach((edition) => requireRef(shifts, edition.shiftId, `newspaper edition ${edition.id}.shiftId`, problems));
  campaign.characters.forEach((item, index) => item.factionId && requireRef(factions, item.factionId, `characters[${index}].factionId`, problems));
  campaign.relationshipDeclarations.forEach((item, index) => {
    if (!characters.has(item.fromId) && !factions.has(item.fromId)) problems.push(`relationshipDeclarations[${index}].fromId is missing`);
    if (!characters.has(item.toId) && !factions.has(item.toId)) problems.push(`relationshipDeclarations[${index}].toId is missing`);
  });

  campaign.concepts.forEach((concept, index) => {
    requireRightRef(rights, concept.accessRightId, "access", `concepts[${index}].accessRightId`, problems);
    concept.prerequisites.forEach((id) => requireRef(concepts, id, `concepts[${index}].prerequisites`, problems));
    checkDetector(concept.semantic, `concepts[${index}].semantic`, problems);
    checkDetector(concept.evidence, `concepts[${index}].evidence`, problems);
  });

  const sourceIds = new Set<string>();
  const personLabelPattern = /^(?:person|person_id|member|member_id|citizen|citizen_id|pin|pin_id|identity|identity_id|name|user|user_id)$/i;
  for (const metric of campaign.metrics) {
    requireRightRef(rights, metric.accessRightId, "access", `metric ${metric.name}.accessRightId`, problems);
    for (const label of metric.labels) if (personLabelPattern.test(label)) problems.push(`metric "${metric.name}" uses prohibited person-identity label "${label}"`);
    for (const label of Object.keys(metric.knownLabelValues)) if (!metric.labels.includes(label)) problems.push(`metric "${metric.name}" has values for undeclared label "${label}"`);
    if (metric.type === "classic-histogram" && !metric.labels.includes("le")) problems.push(`classic histogram metric "${metric.name}" must declare the le label`);
    if (metric.type === "native-histogram" && metric.labels.includes("le")) problems.push(`native histogram metric "${metric.name}" cannot synthesize an le label`);
  }
  for (const source of campaign.logSources) requireRightRef(rights, source.accessRightId, "access", `log source ${source.id}.accessRightId`, problems);
  for (const [datasetIndex, dataset] of campaign.datasets.entries()) {
    byId(dataset.series, `datasets[${datasetIndex}].series`, problems);
    byId(dataset.streams, `datasets[${datasetIndex}].streams`, problems);
    for (const series of dataset.series) {
      sourceIds.add(series.id);
      requireRef(metrics, series.metric, `datasets[${datasetIndex}].series.${series.id}.metric`, problems);
      const metric = metrics.get(series.metric);
      for (const [sampleIndex, sample] of series.samples.entries()) {
        const histogram = typeof sample.value === "object" ? sample.value : undefined;
        if (metric?.type === "native-histogram" && !histogram) problems.push(`native histogram series "${series.id}" sample ${sampleIndex} needs a native histogram value`);
        if (metric?.type !== "native-histogram" && histogram) problems.push(`non-native metric "${series.metric}" cannot use a native histogram value`);
        if (histogram) {
          let previousUpper = Number.NEGATIVE_INFINITY;
          let population = histogram.zeroCount ?? 0;
          for (const bucket of histogram.buckets) {
            if (!(bucket.lower < bucket.upper) || bucket.lower < previousUpper) problems.push(`native histogram series "${series.id}" has unordered or overlapping buckets`);
            previousUpper = bucket.upper;
            population += bucket.count;
          }
          if (Math.abs(population - histogram.count) > 1e-9) problems.push(`native histogram series "${series.id}" bucket population does not equal count`);
        }
      }
    }
    for (const stream of dataset.streams) {
      sourceIds.add(stream.id);
      requireRef(logSources, stream.sourceId, `datasets[${datasetIndex}].streams.${stream.id}.sourceId`, problems);
      byId(stream.records, `datasets[${datasetIndex}].streams.${stream.id}.records`, problems);
      for (const record of stream.records) {
        sourceIds.add(record.id);
      }
    }
  }

  const checkpointItems = campaign.shifts.flatMap((shift) => shift.watchCheckpoints ?? []);
  const checkpoints = byId(checkpointItems, "watch checkpoints", problems);
  for (const [shiftIndex, shift] of campaign.shifts.entries()) {
    requireRef(acts, shift.actId, `shifts[${shiftIndex}].actId`, problems);
    requireRef(datasets, shift.datasetId, `shifts[${shiftIndex}].datasetId`, problems);
    if ((shift.actionBudget === undefined) !== (shift.actionCosts === undefined)) problems.push(`shift "${shift.id}" must declare actionBudget and actionCosts together`);
    if (shift.actionBudget !== undefined && shift.actionCosts) {
      const authoredCases = shift.inbox.flatMap((ref) => ref.kind === "case" && !ref.condition ? [cases.get(ref.id)] : []).filter((item): item is CampaignCase => Boolean(item));
      const required = shift.caseSelectionMode === "fixed" ? authoredCases : authoredCases.filter((item) => item.mode !== "adaptive");
      const adaptive = shift.caseSelectionMode === "fixed" ? [] : authoredCases.filter((item) => item.mode === "adaptive");
      const caseCost = (item: CampaignCase) => item.report.minArtifacts * shift.actionCosts!.validQuery + shift.actionCosts!.fileReport;
      const minimum = required.reduce((total, item) => total + caseCost(item), 0) + (adaptive.length ? Math.min(...adaptive.map(caseCost)) : 0);
      if (shift.actionBudget < minimum) problems.push(`shift "${shift.id}" actionBudget ${shift.actionBudget} cannot cover its minimum required case work (${minimum})`);
    }
    shift.inbox.forEach((item, itemIndex) => {
      requireRef(item.kind === "case" ? cases : narrativeItems, item.id, `shifts[${shiftIndex}].inbox[${itemIndex}].id`, problems);
      checkCondition(item.condition, campaign, `shifts[${shiftIndex}].inbox[${itemIndex}].condition`, problems);
    });
    (shift.watchCheckpoints ?? []).forEach((checkpoint, checkpointIndex) => {
      requireRef(datasets, checkpoint.datasetId, `shifts[${shiftIndex}].watchCheckpoints[${checkpointIndex}].datasetId`, problems);
      checkpoint.scenarioIds?.forEach((id) => requireRef(watchScenarios, id, `checkpoint ${checkpoint.id}.scenarioIds`, problems));
    });
    shift.next.forEach((next, nextIndex) => {
      requireRef(shifts, next.shiftId, `shifts[${shiftIndex}].next[${nextIndex}].shiftId`, problems);
      checkCondition(next.condition, campaign, `shifts[${shiftIndex}].next[${nextIndex}].condition`, problems);
    });
  }

  const reportIds = new Set<string>();
  const decisionIds = new Set<string>();
  for (const [caseIndex, item] of campaign.cases.entries()) {
    requireRef(acts, item.actId, `cases[${caseIndex}].actId`, problems);
    requireRef(datasets, item.datasetId, `cases[${caseIndex}].datasetId`, problems);
    item.availableSources.forEach((id) => {
      if (!metrics.has(id) && !logSources.has(id)) problems.push(`case ${item.id}.availableSources references missing telemetry source "${id}"`);
    });
    if (reportIds.has(item.reportId)) problems.push(`cases contains duplicate reportId "${item.reportId}"`); else reportIds.add(item.reportId);
    if (decisionIds.has(item.decisionId)) problems.push(`cases contains duplicate decisionId "${item.decisionId}"`); else decisionIds.add(item.decisionId);
    const hypothesisIds = new Set(item.hypotheses.map((hypothesis) => hypothesis.id));
    item.technicalTruth.hypothesisIds.forEach((id) => { if (!hypothesisIds.has(id)) problems.push(`case "${item.id}" technicalTruth references missing hypothesis "${id}"`); });
    item.conceptIds.forEach((id) => requireRef(concepts, id, `case ${item.id}.conceptIds`, problems));
    if (!item.hints.some((hint) => hint.level === "Worked")) problems.push(`case ${item.id} has no Worked assistance step`);
    item.masteryUses.forEach((use, useIndex) => {
      requireRef(concepts, use.conceptId, `case ${item.id}.masteryUses`, problems);
      const concept = concepts.get(use.conceptId);
      if (concept && !concept.unitKinds.includes(use.unitKind)) problems.push(`case ${item.id}.masteryUses[${useIndex}] uses unsupported unit kind for concept "${use.conceptId}"`);
      checkArtifactSelectors(item, use.artifactSelectors, `case ${item.id}.masteryUses[${useIndex}]`, problems);
      if (use.unitKind === "query-artifact" && (use.artifactSelectors.length !== 1 || use.artifactSelectors[0] === "watch-expression")) problems.push(`case ${item.id}.masteryUses[${useIndex}] query-artifact must select exactly one filed artifact`);
      if (use.unitKind === "ordered-artifact-set" && use.artifactSelectors.some((selector) => selector === "watch-expression")) problems.push(`case ${item.id}.masteryUses[${useIndex}] ordered-artifact-set cannot select a watch expression`);
      if (use.unitKind === "watch-horizon" && (use.artifactSelectors.length !== 1 || use.artifactSelectors[0] !== "watch-expression")) problems.push(`case ${item.id}.masteryUses[${useIndex}] watch-horizon must select watch-expression`);
    });
    byId(item.variants, `case ${item.id}.variants`, problems);
    const evidencePaths = byId(item.evidencePaths, `case ${item.id}.evidencePaths`, problems);
    const evidencePathIds = new Set(evidencePaths.keys());
    item.evidencePaths.forEach((path, pathIndex) => {
      const clauseConcepts = new Set<string>();
      path.clauses.forEach((clause, clauseIndex) => {
        if (!item.conceptIds.includes(clause.conceptId)) problems.push(`case ${item.id}.evidencePaths[${pathIndex}].clauses[${clauseIndex}] references concept "${clause.conceptId}" outside the case`);
        if (clauseConcepts.has(clause.conceptId)) problems.push(`case ${item.id}.evidencePaths[${pathIndex}] has duplicate clause concept "${clause.conceptId}"`);
        clauseConcepts.add(clause.conceptId);
        const concept = concepts.get(clause.conceptId);
        if (concept && hasRicherConceptContract(concept) && onlyChecksBareResultShape(clause.requirements)) {
          problems.push(`case ${item.id}.evidencePaths[${pathIndex}].clauses[${clauseIndex}] reduces nontrivial concept "${clause.conceptId}" to status/result-type checks`);
        }
        checkArtifactSelectors(item, clause.artifactSelectors, `case ${item.id}.evidencePaths[${pathIndex}].clauses[${clauseIndex}]`, problems);
        checkDetector(clause.requirements, `case ${item.id}.evidencePaths[${pathIndex}].clauses[${clauseIndex}].requirements`, problems);
      });
    });
    const referenceSignatures = new Map<string, string>();
    item.variants.forEach((variant, variantIndex) => {
      requireRef(datasets, variant.datasetId, `case ${item.id} variant ${variant.id}.datasetId`, problems);
      const sets = byId(variant.referenceSets, `case ${item.id} variant ${variant.id}.referenceSets`, problems);
      for (const set of variant.referenceSets) {
        if (!evidencePathIds.has(set.evidencePathId)) problems.push(`case ${item.id} variant ${variant.id} reference set "${set.id}" names missing evidence path "${set.evidencePathId}"`);
        if (set.artifacts.length < item.report.minArtifacts || set.artifacts.length > item.report.maxArtifacts) problems.push(`case ${item.id} variant ${variant.id} reference set "${set.id}" must fit report artifact bounds`);
        const roles = new Set<string>();
        for (const artifact of set.artifacts) {
          if (roles.has(artifact.role)) problems.push(`case ${item.id} variant ${variant.id} reference set "${set.id}" has duplicate role "${artifact.role}"`);
          roles.add(artifact.role);
          if (!item.languages.includes(artifact.language)) problems.push(`case ${item.id} variant ${variant.id} reference set "${set.id}" uses disabled language "${artifact.language}"`);
          if (artifact.mode === "records" && artifact.language !== "logql") problems.push(`case ${item.id} variant ${variant.id} reference role "${artifact.role}" uses records mode outside LogQL`);
        }
        const path = evidencePaths.get(set.evidencePathId);
        path?.clauses.forEach((clause) => {
          const selected = resolveReferenceSelectors(clause.artifactSelectors, set.artifacts);
          if (!selected) {
            problems.push(`case ${item.id} variant ${variant.id} reference set "${set.id}" cannot resolve clause selectors for concept "${clause.conceptId}"`);
            return;
          }
          const language = concepts.get(clause.conceptId)?.language;
          if (language && language !== "shared" && selected.some((index) => set.artifacts[index]?.language !== language)) {
            problems.push(`case ${item.id} variant ${variant.id} reference set "${set.id}" selects an artifact outside concept "${clause.conceptId}" language ${language}`);
          }
        });
        const signature = JSON.stringify([set.evidencePathId, ...set.artifacts.map((artifact) => [artifact.role, artifact.language, artifact.mode])]);
        if (variantIndex === 0) referenceSignatures.set(set.id, signature);
        else if (referenceSignatures.get(set.id) !== signature) problems.push(`case ${item.id} reference set "${set.id}" changes its path or ordered role/language/mode signature across variants`);
      }
      const worked = variant.workedEvidenceSet;
      if (!evidencePathIds.has(worked.evidencePathId)) problems.push(`case ${item.id} variant ${variant.id} worked evidence names missing evidence path "${worked.evidencePathId}"`);
      if (worked.artifacts.length < item.report.minArtifacts || worked.artifacts.length > item.report.maxArtifacts) problems.push(`case ${item.id} variant ${variant.id} worked evidence must fit report artifact bounds`);
      const workedRoles = new Set<string>();
      for (const artifact of worked.artifacts) {
        if (workedRoles.has(artifact.role)) problems.push(`case ${item.id} variant ${variant.id} worked evidence has duplicate role "${artifact.role}"`);
        workedRoles.add(artifact.role);
        if (!item.languages.includes(artifact.language)) problems.push(`case ${item.id} variant ${variant.id} worked evidence uses disabled language "${artifact.language}"`);
        if (artifact.mode === "records" && artifact.language !== "logql") problems.push(`case ${item.id} variant ${variant.id} worked role "${artifact.role}" uses records mode outside LogQL`);
        if (artifact.mode === "records" && !item.report.visualizations.includes("logs")) problems.push(`case ${item.id} variant ${variant.id} worked role "${artifact.role}" needs the logs result view`);
        if (artifact.mode === "range" && !item.report.visualizations.includes("graph")) problems.push(`case ${item.id} variant ${variant.id} worked role "${artifact.role}" needs the graph result view`);
        if (artifact.mode === "instant" && !item.report.visualizations.some((view) => view === "table" || view === "stat")) problems.push(`case ${item.id} variant ${variant.id} worked role "${artifact.role}" needs a table or stat result view`);
      }
      const declaredRoles = Object.keys(item.technicalTruth.artifactRoles).sort();
      const orderedWorkedRoles = worked.artifacts.map((artifact) => artifact.role);
      if (JSON.stringify([...orderedWorkedRoles].sort()) !== JSON.stringify(declaredRoles)) {
        problems.push(`case ${item.id} variant ${variant.id} Worked roles must match technicalTruth.artifactRoles`);
      }
      const direct = variant.referenceSets.find((set) => set.evidencePathId === worked.evidencePathId);
      if (!direct) {
        problems.push(`case ${item.id} variant ${variant.id} has no reference set matching its Worked evidence path`);
      } else if (JSON.stringify(direct.artifacts.map((artifact) => artifact.role)) !== JSON.stringify(orderedWorkedRoles)) {
        problems.push(`case ${item.id} variant ${variant.id} direct and Worked artifact roles must match in order`);
      }
      evidencePaths.get(worked.evidencePathId)?.clauses.forEach((clause) => {
        const selected = resolveReferenceSelectors(clause.artifactSelectors, worked.artifacts);
        if (!selected) {
          problems.push(`case ${item.id} variant ${variant.id} worked evidence cannot resolve clause selectors for concept "${clause.conceptId}"`);
          return;
        }
        const language = concepts.get(clause.conceptId)?.language;
        if (language && language !== "shared" && selected.some((index) => worked.artifacts[index]?.language !== language)) {
          problems.push(`case ${item.id} variant ${variant.id} worked evidence selects an artifact outside concept "${clause.conceptId}" language ${language}`);
        }
      });
      for (const pathId of evidencePathIds) if (!variant.referenceSets.some((set) => set.evidencePathId === pathId)) problems.push(`case ${item.id} variant ${variant.id} has no reference set for evidence path "${pathId}"`);
      if (variantIndex > 0) {
        for (const setId of referenceSignatures.keys()) if (!sets.has(setId)) problems.push(`case ${item.id} variant ${variant.id} is missing reference set "${setId}"`);
        for (const setId of sets.keys()) if (!referenceSignatures.has(setId)) problems.push(`case ${item.id} variant ${variant.id} adds unmatched reference set "${setId}"`);
      }
    });
    checkCaseRequirements(item, concepts, problems);
    if (item.watchScenarioId) requireRef(watchScenarios, item.watchScenarioId, `case ${item.id}.watchScenarioId`, problems);
    const titleIds = new Set(item.report.titles.map((choice) => choice.id));
    const conclusionIds = new Set(item.report.conclusions.map((choice) => choice.id));
    const decisionChoiceIds = new Set(item.decisionChoices.map((choice) => choice.id));
    if (decisionChoiceIds.size !== item.decisionChoices.length) problems.push(`case "${item.id}" has duplicate decision choice ids`);
    item.outcomes.forEach((outcome, outcomeIndex) => {
      outcome.titleChoiceIds?.forEach((id) => { if (!titleIds.has(id)) problems.push(`case ${item.id} outcome ${outcome.id} references missing title "${id}"`); });
      outcome.conclusionChoiceIds?.forEach((id) => { if (!conclusionIds.has(id)) problems.push(`case ${item.id} outcome ${outcome.id} references missing conclusion "${id}"`); });
      outcome.decisionChoiceIds?.forEach((id) => { if (!decisionChoiceIds.has(id)) problems.push(`case ${item.id} outcome ${outcome.id} references missing decision choice "${id}"`); });
      outcome.consequenceIds?.forEach((id) => requireRef(consequences, id, `case ${item.id}.outcomes[${outcomeIndex}].consequenceIds`, problems));
      checkCondition(outcome.condition, campaign, `case ${item.id}.outcomes[${outcomeIndex}].condition`, problems);
    });
    const fallbackCount = item.outcomes.filter((outcome) => !outcome.condition && !(outcome.titleChoiceIds?.length) && !(outcome.conclusionChoiceIds?.length) && !(outcome.decisionChoiceIds?.length)).length;
    if (fallbackCount !== 1) problems.push(`case "${item.id}" must have exactly one unconditional fallback outcome`);
  }

  for (const [scenarioIndex, scenario] of campaign.watchScenarios.entries()) {
    scenario.checkpointIds.forEach((id) => requireRef(checkpoints, id, `watchScenarios[${scenarioIndex}].checkpointIds`, problems));
    const localEvents = new Set(scenario.events.map((event) => event.id));
    if (!scenario.events.some((event) => event.relevance === "intended") || !scenario.events.some((event) => event.relevance === "distractor")) {
      problems.push(`watch scenario "${scenario.id}" needs at least one intended and one distractor event`);
    }
    scenario.events.forEach((event) => event.sourceIds.forEach((id) => { if (!sourceIds.has(id)) problems.push(`watch event "${event.id}" references missing source "${id}"`); }));
    scenario.attributions.forEach((attribution) => {
      if (!sourceIds.has(attribution.sourceId)) problems.push(`watch scenario "${scenario.id}" attribution references missing source "${attribution.sourceId}"`);
      attribution.eventIds.forEach((id) => { if (!localEvents.has(id)) problems.push(`watch scenario "${scenario.id}" attribution references foreign event "${id}"`); });
    });
  }

  const refMaps: RefMaps = { ranks, cases, narratives: narrativeItems, consequences, endings, checkpoints, tags, rights, variants };
  const owners: { conditions: (Condition | undefined)[]; effects: (Effect[] | undefined)[]; label: string }[] = [
    ...campaign.acts.map((item) => ({ conditions: [item.entry, item.completion], effects: [], label: `act ${item.id}` })),
    ...campaign.ranks.map((item) => ({ conditions: [item.condition], effects: [], label: `rank ${item.id}` })),
    ...campaign.narrativeItems.map((item) => ({ conditions: [item.condition], effects: [item.effects], label: `narrative ${item.id}` })),
    ...campaign.consequences.map((item) => ({ conditions: [item.condition], effects: [item.effects], label: `consequence ${item.id}` })),
    ...campaign.endings.map((item) => ({ conditions: [item.condition], effects: [], label: `ending ${item.id}` })),
    ...(campaign.opening.appointments ?? []).map((item) => ({ conditions: [], effects: [item.effects, item.complaintEffects], label: `appointment ${item.id}` })),
    ...(campaign.newspaper?.editions ?? []).map((item) => ({ conditions: [item.condition], effects: [], label: `newspaper edition ${item.id}` })),
  ];
  owners.forEach((owner) => {
    owner.conditions.forEach((condition, index) => checkCondition(condition, campaign, `${owner.label}.condition[${index}]`, problems));
    owner.effects.forEach((effects) => effects?.forEach((effect, index) => checkEffect(effect, refMaps, campaign, `${owner.label}.effects[${index}]`, problems)));
  });
  campaign.cases.forEach((item, index) => item.requesterId && requireRef(characters, item.requesterId, `cases[${index}].requesterId`, problems));
  campaign.cases.forEach((item) => item.outcomes.forEach((outcome) => outcome.effects?.forEach((effect, index) => checkEffect(effect, refMaps, campaign, `case ${item.id} outcome ${outcome.id}.effects[${index}]`, problems))));
  campaign.shifts.forEach((shift) => shift.next.forEach((next) => next.effects?.forEach((effect, index) => checkEffect(effect, refMaps, campaign, `shift ${shift.id}.next ${next.shiftId}.effects[${index}]`, problems))));

  if (problems.length) throw new CampaignLoadError(problems);
  return { campaign, concepts, metrics, logSources, datasets, acts, ranks, shifts, cases, watchScenarios, narrativeItems, consequences, endings };
}

export function loadCampaignJson(text: string): CampaignIndex {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (error) { throw new CampaignLoadError([`invalid JSON: ${error instanceof Error ? error.message : String(error)}`]); }
  return loadCampaign(parsed);
}
