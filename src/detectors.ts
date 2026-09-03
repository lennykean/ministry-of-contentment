import type { QueryExecution, QueryValue, SemanticNode } from "./query/types";
import type { Assistance, Detector, DetectorRelation, EvidenceRequirement, RequiredValue, UnitKind } from "./types";

export interface DetectorArtifact {
  id: string;
  role?: string;
  language: "promql" | "logql";
  execution: QueryExecution;
  unit?: string;
  timestamp?: number;
  start?: number;
  end?: number;
  sourceIds?: string[];
  print?: {
    visualization: string;
    showQuery: boolean;
    showLabels: boolean;
    showRange: boolean;
    zeroAxis: boolean;
  };
}

export interface WatchFacts {
  checkpointSuccess: boolean;
  coverage: number;
  specificity: number;
  localization: number;
  timeliness: number;
  cost: number;
  candidateCount: number;
  noticeLifecycle: string;
}

export interface DetectorContext {
  conceptId?: string;
  artifacts: DetectorArtifact[];
  unitKind: UnitKind;
  assistance: Assistance;
  requiredValues: RequiredValue[];
  evidenceRequirements: EvidenceRequirement[];
  titleChoiceId?: string;
  conclusionChoiceId?: string;
  costBudgets?: Record<string, number>;
  watch?: WatchFacts;
  watchThresholds?: Partial<Record<"coverage" | "specificity" | "localization" | "timeliness" | "cost", number>>;
}

const masteryOrder = ["Unobserved", "Observed", "Practiced", "Independent", "Certified"];

function equivalent(left: unknown, right: unknown): boolean {
  if (typeof left === "number" && typeof right === "number") return Object.is(left, right) || Math.abs(left - right) < 1e-12;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    if (left.every((value) => typeof value === "string") && right.every((value) => typeof value === "string")) {
      return [...left].sort().every((value, index) => value === [...right].sort()[index]);
    }
    return left.every((value, index) => equivalent(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return equivalent(leftEntries, rightEntries);
  }
  return left === right;
}

function compare(left: unknown, relation: DetectorRelation, right: unknown): boolean {
  if (relation === "=") return equivalent(left, right);
  if (relation === "!=") return !equivalent(left, right);
  if (relation === "subset-of") {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return left.every((item) => right.some((allowed) => equivalent(item, allowed)));
  }
  if (relation === "contains" || relation === "contains-all") {
    const values = Array.isArray(left) ? left : typeof left === "string" ? [left] : [];
    const expected = relation === "contains-all" && Array.isArray(right) ? right : [right];
    return expected.every((item) => values.some((value) => equivalent(value, item)));
  }
  if ((typeof left !== "number" && typeof left !== "string") || (typeof right !== "number" && typeof right !== "string")) return false;
  if (relation === "<") return left < right;
  if (relation === "<=") return left <= right;
  if (relation === ">") return left > right;
  return left >= right;
}

function selectors(detector: Exclude<Detector, { op: "all" | "any" }>): string[] {
  if (detector.kind === "U" || detector.kind === "W") return ["unit"];
  if (detector.kind === "E") return detector.selectors;
  return detector.selector ? [detector.selector] : ["unit"];
}

function selectArtifacts(selector: string, context: DetectorContext): DetectorArtifact[] {
  if (selector === "artifact") return context.artifacts;
  if (selector === "promql" || selector === "logql") return context.artifacts.filter((artifact) => artifact.language === selector);
  if (selector === "watch-expression") {
    const named = context.artifacts.filter((artifact) => artifact.role === selector);
    return named.length ? named : context.artifacts.slice(0, 1);
  }
  const index = /^artifact\[([1-9]\d*)\]$/.exec(selector)?.[1];
  return index ? context.artifacts.slice(Number(index) - 1, Number(index)) : [];
}

function selected(detector: Exclude<Detector, { op: "all" | "any" }>, context: DetectorContext): DetectorArtifact[] {
  const values = selectors(detector);
  return values.flatMap((selector) => selectArtifacts(selector, context));
}

function resultType(result: QueryValue): string { return result.type; }

function resultItems(result: QueryValue): Array<{ labels?: Record<string, string>; value?: unknown; fields?: Record<string, unknown> }> {
  if (result.type === "scalar") return [{ value: result.value }];
  if (result.type === "instant-vector") return result.series;
  if (result.type === "range-vector") return result.series.flatMap((series) => series.values.map((value) => ({ labels: series.labels, value: value.value })));
  return result.streams.flatMap((stream) => stream.records);
}

function resultProperty(artifact: DetectorArtifact, property: string): unknown {
  const execution = artifact.execution;
  if (property === "status") return execution.ok ? "successful" : execution.error.kind === "execution" ? "errored" : execution.error.kind;
  if (!execution.ok) return undefined;
  if (property === "print-query") return artifact.print?.showQuery;
  if (property === "print-labels") return artifact.print?.showLabels;
  if (property === "print-range") return artifact.print?.showRange;
  if (property === "print-zero-axis") return artifact.print?.zeroAxis;
  if (property === "visualization") return artifact.print?.visualization;
  const result = execution.result;
  const items = resultItems(result);
  if (property === "result-type") return resultType(result);
  if (property === "empty") return items.length === 0;
  if (property === "value-domain") return [...new Set(items.map((item) => item.value).filter((value): value is number => typeof value === "number"))].sort();
  if (property === "unit") return artifact.unit ?? (result.type === "instant-vector" || result.type === "range-vector" ? result.series[0]?.unit : undefined);
  if (property === "retained-labels") return [...new Set(items.flatMap((item) => Object.keys(item.labels ?? {})))];
  if (property === "retained-fields") return [...new Set(items.flatMap((item) => Object.keys(item.fields ?? {})))];
  if (property === "time-scope") return artifact.start !== undefined || artifact.end !== undefined ? [artifact.start, artifact.end] : undefined;
  if (property === "series-count") return result.type === "instant-vector" || result.type === "range-vector" ? result.series.length : 0;
  if (property === "stream-count") return result.type === "records" ? result.streams.length : 0;
  if (property === "record-count") return result.type === "records" ? result.streams.reduce((sum, stream) => sum + stream.records.length, 0) : 0;
  if (property === "pipeline-error-count") return execution.facts.lineage.parserErrors.filter((error) => !error.handled).length;
  if (property === "selected-series") return execution.facts.cost.seriesScanned;
  if (property === "scanned-samples") return execution.facts.cost.samplesScanned;
  if (property === "scanned-records") return execution.facts.cost.recordsScanned;
  if (property === "scanned-bytes") return execution.facts.cost.scannedBytes;
  if (property === "returned-items") return execution.facts.cost.returned;
  if (property === "per-stream-order") return result.type === "records" ? "requested" : undefined;
  return undefined;
}

function unitProperty(property: string, context: DetectorContext): unknown {
  if (property === "kind") return context.unitKind;
  if (property === "artifact-count") return context.artifacts.length;
  if (property === "language-sequence") return context.artifacts.map((artifact) => artifact.language);
  if (property === "result-types") return context.artifacts.flatMap((artifact) => artifact.execution.ok ? [artifact.execution.result.type] : [artifact.execution.error.kind]);
  if (property === "assistance") return context.assistance;
  return undefined;
}

function watchProperty(property: string, context: DetectorContext): unknown {
  if (!context.watch) return undefined;
  const key = ({
    "checkpoint-success": "checkpointSuccess", "candidate-count": "candidateCount", "notice-lifecycle": "noticeLifecycle",
  } as Record<string, keyof WatchFacts>)[property] ?? property as keyof WatchFacts;
  return context.watch[key];
}

function requiredValue(detector: "U" | "A" | "R" | "E", subject: string, selectedBy: string[], context: DetectorContext): RequiredValue | undefined {
  const matches = context.requiredValues.filter((item) => item.conceptId === context.conceptId && item.detector === detector && item.subject === subject && equivalent(item.selectors, selectedBy));
  return matches.length === 1 ? matches[0] : undefined;
}

function evidenceRequirement(rule: string, subject: string, selectedBy: string[], context: DetectorContext, choiceId?: string): EvidenceRequirement | undefined {
  const matches = context.evidenceRequirements.filter((item) => item.conceptId === context.conceptId && item.rule === rule && item.subject === subject && item.choiceId === choiceId && equivalent(item.selectors, selectedBy));
  return matches.length === 1 ? matches[0] : undefined;
}

function evidencePass(rule: string, subject: string, selectedBy: string[], context: DetectorContext, choiceId?: string): boolean {
  const requirement = evidenceRequirement(rule, subject, selectedBy, context, choiceId);
  return Boolean(requirement?.alternatives.some((alternative) => alternative.every((detector) => evaluateDetector(detector, context))));
}

function expectedPass(actual: unknown, relation: DetectorRelation, expected: unknown, kind: "U" | "A" | "R", subject: string, selectedBy: string[], context: DetectorContext): boolean {
  if (expected !== "case-required") {
    if (kind === "A" && relation === "=" && !Array.isArray(actual) && Array.isArray(expected)) return expected.some((allowed) => equivalent(actual, allowed));
    return compare(actual, relation, expected);
  }
  const requirement = requiredValue(kind, subject, selectedBy, context);
  return Boolean(requirement?.acceptedValues.some((value) => {
    if (requirement.tolerance !== undefined && typeof actual === "number" && typeof value === "number") return Math.abs(actual - value) <= requirement.tolerance!;
    return compare(actual, relation, value);
  }));
}

function semanticFacts(artifact: DetectorArtifact): Array<SemanticNode | { kind: "label-matcher" | "stream-matcher"; operator: string }> {
  if (!artifact.execution.ok) return artifact.execution.facts.semantic;
  const result: Array<SemanticNode | { kind: "label-matcher" | "stream-matcher"; operator: string }> = [];
  for (const node of artifact.execution.facts.semantic) {
    result.push(node);
    if (node.kind === "metric-selector") result.push(...node.matchers.map((matcher) => ({ kind: "label-matcher" as const, operator: matcher.operator })));
    if (node.kind === "stream-selector") result.push(...node.matchers.map((matcher) => ({ kind: "stream-matcher" as const, operator: matcher.operator })));
  }
  return result;
}

function nodeParameter(node: SemanticNode | { kind: string; operator: string }, key: string): unknown {
  const record = node as unknown as Record<string, unknown>;
  if (key === "bool") return record.bool ?? false;
  if (key === "grouping") return record.grouping;
  if (key === "side") return record.cardinality === "many-to-one" ? "left" : record.cardinality === "one-to-many" ? "right" : undefined;
  if (key === "kind") return record.modifier ?? record.parser ?? record.formatter;
  if (key === "name") return record.name;
  if (key === "input-kind") return record.inputKind;
  if (key === "labels") return record.labels;
  if (key === "value-type") return record.valueType;
  if (key === "conversion") return record.conversion;
  if (key === "label") return Array.isArray(record.labels) ? record.labels : record.label;
  if (key === "metric-type") return record.metricType;
  return record[key];
}

function evaluateA(detector: Extract<Detector, { kind: "A" }>, context: DetectorContext): boolean {
  const selectedBy = [detector.selector];
  const artifacts = selectArtifacts(detector.selector, context);
  if (artifacts.length !== 1) return false;
  return semanticFacts(artifacts[0]!).some((node) => {
    const actualKind = node.kind === "binary" && "bool" in node && typeof node.bool === "boolean" && detector.node === "comparison" ? "comparison" : node.kind;
    if (actualKind !== detector.node) return false;
    return Object.entries(detector.parameters).every(([key, expected]) => expectedPass(nodeParameter(node, key), "=", expected, "A", `${detector.node}.${key}`, selectedBy, context));
  });
}

function evaluateE(detector: Extract<Detector, { kind: "E" }>, context: DetectorContext): boolean {
  const artifacts = selected(detector, context);
  const parameters = detector.parameters;
  const subjects = (value: unknown): string[] => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  if (detector.rule === "result-interpretation") return subjects(parameters.subjects).every((subject) => evidencePass(detector.rule, subject, detector.selectors, context));
  if (detector.rule === "scope" || detector.rule === "operation-fit") {
    const dimensions = subjects(parameters.dimension);
    if (detector.rule === "operation-fit" && dimensions.includes("histogram-buckets") && artifacts.some((artifact) => {
      if (!artifact.execution.ok) return true;
      const nodes = artifact.execution.facts.semantic;
      const quantile = nodes.findIndex((node) => node.kind === "function" && node.name === "histogram_quantile" && node.inputKind === "classic-histogram");
      const aggregation = nodes.findIndex((node, index) => index < quantile && node.kind === "aggregation" && node.operator === "sum" && node.grouping === "by" && node.labels.includes("le"));
      const rate = nodes.findIndex((node, index) => index < aggregation && node.kind === "function" && node.name === "rate" && node.inputKind === "classic-bucket-range");
      return rate < 0 || aggregation < 0 || quantile < 0;
    })) return false;
    return dimensions.every((subject) => evidencePass(detector.rule, subject, detector.selectors, context));
  }
  if (detector.rule === "absence-model") return subjects(parameters.distinctions).every((subject) => evidencePass(detector.rule, subject, detector.selectors, context));
  if (detector.rule === "schema-selection") {
    const accepted = requiredValue("E", "accepted-source-sets", detector.selectors, context);
    const supplied = requiredValue("E", "supplied-source-ids", detector.selectors, context);
    const sources = [...new Set(artifacts.flatMap((artifact) => artifact.execution.facts.lineage.sources))];
    const sourceMatch = Boolean(accepted?.acceptedValues.some((value) => equivalent(sources, value)));
    const suppliedIds = supplied?.acceptedValues.flatMap((value) => Array.isArray(value) ? value : [value]) ?? [];
    const hasSupplied = sources.some((source) => suppliedIds.includes(source));
    return sourceMatch && hasSupplied === Boolean(parameters["name-supplied"]);
  }
  if (detector.rule === "localization") {
    const required = requiredValue("E", "required-values", detector.selectors, context);
    const items = artifacts.flatMap((artifact) => artifact.execution.ok ? resultItems(artifact.execution.result) : []);
    return Boolean(required?.acceptedValues.some((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
      return items.some((item) => Object.entries(candidate as Record<string, unknown>).every(([key, value]) => item.labels?.[key] === value || item.fields?.[key] === value));
    }));
  }
  if (detector.rule === "numeric-value") {
    if (parameters.denominator === "safe") return artifacts.every((artifact) => {
      if (!artifact.execution.ok) return false;
      const values = resultItems(artifact.execution.result).map((item) => item.value).filter((value): value is number => typeof value === "number");
      return values.length > 0 && values.every(Number.isFinite)
        && artifact.execution.facts.lineage.operands.every((operand) => operand.right.length > 0);
    });
    const required = requiredValue("E", "expected", detector.selectors, context);
    const actual = artifacts.flatMap((artifact) => artifact.execution.ok ? resultItems(artifact.execution.result).map((item) => item.value).filter((value): value is number => typeof value === "number") : []);
    return Boolean(required?.acceptedValues.some((value) => equivalent(actual.length === 1 ? actual[0] : actual, value)));
  }
  if (detector.rule === "reset-handling") return artifacts.every((artifact) => semanticFacts(artifact).some((node) => node.kind === "function" && ["rate", "increase", "resets", "changes"].includes(String((node as { name?: string }).name))));
  if (detector.rule === "provenance") {
    if (!artifacts.length || artifacts.some((artifact) => !artifact.execution.ok)) return false;
    if (parameters.expected === "case-required" && !evidencePass(detector.rule, "expected", detector.selectors, context)) return false;
    if (parameters["raw-records"] === "available" && artifacts.some((artifact) => {
      if (!artifact.execution.ok || artifact.execution.result.type !== "records") return true;
      const records = artifact.execution.result.streams.flatMap((stream) => stream.records);
      return !records.length || records.some((record) => typeof record.line !== "string" || !artifact.execution.facts.lineage.records.includes(record.id));
    })) return false;
    if (parameters["field-as-stream-label"] === false && artifacts.some((artifact) => {
      const matcherLabels = artifact.execution.facts.semantic.flatMap((node) => node.kind === "stream-selector" ? node.matchers.map((matcher) => matcher.label) : []);
      return matcherLabels.some((label) => !artifact.execution.facts.lineage.fieldOrigins[label]?.includes("indexed-label"));
    })) return false;
    const requested = subjects(parameters.distinctions);
    const observed = new Set(artifacts.flatMap((artifact) => Object.values(artifact.execution.facts.lineage.fieldOrigins).flat()));
    if (requested.some((origin) => !observed.has(origin as "indexed-label" | "structured-metadata" | "extracted-field"))) return false;
    return true;
  }
  if (detector.rule === "correlation") {
    const eventSets = artifacts.map((artifact) => new Set(artifact.execution.facts.lineage.events));
    if (eventSets.length < 2 || ![...eventSets[0]!].some((event) => eventSets.slice(1).every((events) => events.has(event)))) return false;
    const intervals = artifacts.map((artifact) => {
      const start = artifact.start ?? artifact.timestamp;
      const end = artifact.end ?? artifact.timestamp;
      return start === undefined || end === undefined ? undefined : [start, end] as const;
    });
    if (intervals.some((interval) => !interval)) return false;
    return Math.max(...intervals.map((interval) => interval![0])) <= Math.min(...intervals.map((interval) => interval![1]));
  }
  if (detector.rule === "claim-support") return subjects(parameters.subjects).every((subject) => evidencePass(detector.rule, subject, detector.selectors, context, subject === "title" ? context.titleChoiceId : context.conclusionChoiceId));
  if (detector.rule === "performance") {
    const budgets = context.costBudgets;
    if (!budgets) return false;
    return artifacts.every((artifact) => {
      const cost = artifact.execution.facts.cost;
      return cost.seriesScanned <= (budgets.selectedSeries ?? Infinity)
        && cost.samplesScanned <= (budgets.scannedSamples ?? Infinity)
        && cost.recordsScanned <= (budgets.scannedRecords ?? Infinity)
        && cost.scannedBytes <= (budgets.scannedBytes ?? Infinity)
        && cost.returned <= (budgets.returnedItems ?? Infinity);
    }) && (parameters.dimension !== "cardinality" || evidencePass(detector.rule, "cardinality", detector.selectors, context));
  }
  if (detector.rule === "ordering") return artifacts.every((artifact) => artifact.execution.ok && artifact.execution.result.type === "records");
  if (detector.rule === "pipeline-errors") {
    if (!artifacts.length || artifacts.some((artifact) => !artifact.execution.ok)) return false;
    const outputRetainsError = (artifact: DetectorArtifact) => artifact.execution.ok && artifact.execution.result.type === "records"
      && artifact.execution.result.streams.some((stream) => stream.records.some((record) => Boolean(record.error || record.fields.__error__)));
    if (parameters.expected === "handled" && artifacts.some((artifact) =>
      artifact.execution.facts.lineage.parserErrors.some((error) => !error.handled) || outputRetainsError(artifact),
    )) return false;
    if (parameters["failing-stage-before-remedy"] === true) {
      const stageIndex = (artifact: DetectorArtifact, stage: string): number => artifact.execution.facts.semantic.findIndex((node) =>
        (node.kind === "parser" && node.parser === stage) || node.kind === stage,
      );
      const remedyIndex = (artifact: DetectorArtifact): number => artifact.execution.facts.semantic.findIndex((node) =>
        (node.kind === "label-filter" && node.label === "__error__") || (node.kind === "drop" && node.labels.includes("__error__")),
      );
      const remedied = artifacts.some((later, laterIndex) => {
        const remedy = remedyIndex(later);
        if (remedy < 0) return false;
        const handled = later.execution.facts.lineage.parserErrors.filter((error) => error.handled && stageIndex(later, error.stage) >= 0 && stageIndex(later, error.stage) < remedy);
        return artifacts.slice(0, laterIndex).some((earlier) => earlier.execution.facts.lineage.parserErrors.some((error) =>
          !error.handled && handled.some((candidate) => candidate.recordId === error.recordId && candidate.stage === error.stage),
        ));
      });
      if (!remedied) return false;
    }
    if (parameters["metric-result-error-free"] === true && artifacts.some((artifact) =>
      artifact.execution.ok && artifact.execution.result.type !== "records"
      && artifact.execution.facts.lineage.parserErrors.some((error) => !error.handled),
    )) return false;
    return true;
  }
  if (detector.rule === "watch-quality") {
    if (!context.watch) return false;
    const scores = [context.watch.coverage, context.watch.specificity, context.watch.localization, context.watch.timeliness, context.watch.cost];
    if (parameters["all-dimensions"] === "pass" && scores.some((score) => score < 1)) return false;
    return parameters.explanation !== "all-dimensions" || evidencePass(detector.rule, "all-dimensions", detector.selectors, context);
  }
  return false;
}

export function evaluateDetector(detector: Detector, context: DetectorContext): boolean {
  if ("op" in detector) return detector.op === "all" ? detector.items.every((item) => evaluateDetector(item, context)) : detector.items.some((item) => evaluateDetector(item, context));
  if (detector.kind === "U") return expectedPass(unitProperty(detector.property, context), detector.relation, detector.expected, "U", detector.property, ["unit"], context);
  if (detector.kind === "W") {
    const expected = detector.expected === "declared-threshold" && detector.property in (context.watchThresholds ?? {})
      ? context.watchThresholds?.[detector.property as keyof NonNullable<DetectorContext["watchThresholds"]>]
      : detector.expected;
    return compare(watchProperty(detector.property, context), detector.relation, expected);
  }
  if (detector.kind === "R") {
    const artifacts = selectArtifacts(detector.selector ?? "artifact", context);
    return artifacts.length === 1 && expectedPass(resultProperty(artifacts[0]!, detector.property), detector.relation, detector.expected, "R", detector.property, [detector.selector ?? "artifact"], context);
  }
  if (detector.kind === "A") return evaluateA(detector, context);
  return "rule" in detector ? evaluateE(detector, context) : false;
}

export function strongestAssistance(levels: Assistance[]): Assistance {
  const order: Assistance[] = ["None", "Orientation", "Scaffold", "Worked"];
  return levels.reduce((highest, level) => order.indexOf(level) > order.indexOf(highest) ? level : highest, "None");
}

export function reachedMastery(actual: string, expected: string): boolean {
  return masteryOrder.indexOf(actual) >= masteryOrder.indexOf(expected);
}
