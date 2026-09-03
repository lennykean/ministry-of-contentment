import { evaluateDetector, reachedMastery, strongestAssistance, type DetectorArtifact, type DetectorContext, type WatchFacts } from "./detectors";
import type { QueryContext, QueryExecution, QueryLanguage, HistogramValue, MetricSeries, LogStream } from "./query/types";
import type {
  Assistance, CampaignCase, CampaignIndex, CaseOutcome, Choice, Condition, Consequence, Effect, EvidenceState, InboxKind,
  MasteryState, NewspaperEdition, ReferenceArtifact, Scalar, Visualization, WatchCheckpoint, WorkedEvidenceArtifact,
} from "./types";

export interface QueryControls {
  timestamp: number;
  start?: number;
  end?: number;
  step?: number;
  lookback?: number;
  direction?: "forward" | "backward";
  limit?: number;
  visualization: Visualization;
}

export interface PrintOptions {
  visualization: Visualization;
  showQuery: boolean;
  showLabels: boolean;
  showRange: boolean;
  zeroAxis: boolean;
}

export interface SavedArtifact extends DetectorArtifact {
  caseId: string;
  variantId: string;
  expression: string;
  controls: QueryControls;
  assistance: Assistance;
  createdAt: string;
  filed: boolean;
  evidence?: EvidenceState;
  replayOfId?: string;
  role?: string;
  authoredPrint?: PrintOptions;
  print?: PrintOptions;
}

export function replayResultFor(artifactId: string, replay: SavedArtifact | undefined): SavedArtifact | undefined {
  return replay?.replayOfId === artifactId ? replay : undefined;
}

export interface FiledReport {
  id: string;
  caseId: string;
  variantId: string;
  artifactIds: string[];
  titleChoiceId: string;
  conclusionChoiceId: string;
  decisionChoiceId: string;
  visualization: Visualization;
  evidence: EvidenceState;
  outcomeId: string;
  technicalExplanation: string;
  ministryResponse: string;
  filedAt: string;
  filedShiftId: string;
  campaignTime: string;
  evaluationStart?: number;
  evaluationEnd?: number;
  pendingWatch?: boolean;
}

export interface AssessmentRecord {
  id: string;
  caseId: string;
  state: EvidenceState;
  artifactIds: string[];
  measuredValue?: number;
}

export interface AttemptRecord {
  id: string;
  caseId: string;
  state: "successful" | "errored" | "cancelled";
  assistance: Assistance;
  unitKind: "query-artifact" | "ordered-artifact-set" | "watch-horizon";
  artifactIds: string[];
  conceptIds: string[];
  behaviorPass: boolean;
  evidencePass: boolean;
  creditAwarded: boolean;
  dataShapeId: string;
  operationalQuestionId: string;
  mainCampaign: boolean;
}

export interface MasteryCredit {
  caseId: string;
  variantId: string;
  dataShapeId: string;
  operationalQuestionId: string;
  assistance: Assistance;
  targetState: Exclude<MasteryState, "Unobserved">;
  unitKind: "query-artifact" | "ordered-artifact-set" | "watch-horizon";
  spacedRecall: boolean;
  mainCampaign: boolean;
}

export interface MasteryRecord { state: MasteryState; credits: MasteryCredit[] }

export interface WatchRecord {
  id: string;
  caseId: string;
  scenarioId: string;
  artifactId: string;
  reportId: string;
  state: "active" | "retired" | "revoked";
  lastSuccessfulCheckpointId?: string;
  lastCheckpointState?: "successful" | "errored" | "cancelled";
  seenRecordIds: string[];
  executions: { checkpointId: string; state: "successful" | "errored" | "cancelled"; cost?: QueryExecution["facts"]["cost"] }[];
  scores?: WatchFacts;
}

export interface NoticeRecord {
  id: string;
  watchId: string;
  key: string;
  generation: number;
  state: "open" | "resolved";
  occurrenceCount: number;
  candidateCount: number;
  eventIds: string[];
  localization: Record<string, Scalar>;
  firstSeen: string;
  lastSeen: string;
  resolvedAt?: string;
  absentEvaluations: number;
  summary: string;
  memberIds: string[];
}

export interface MemoRecord {
  id: string;
  consequenceId?: string;
  endingId?: string;
  from: string;
  text: string;
  campaignTime: string;
  shiftNumber: number;
  read: boolean;
}

export interface WatchError { watchId: string; checkpointId: string; message: string; time: string }
export interface ScheduledItem { id: string; targetKind: "consequence" | "data-variant"; targetId: string; dueShift?: number; atTimestamp?: string; atCheckpointId?: string; cancelled?: boolean }
export interface StandingChange { value: number; delta: number; reason: string; campaignTime: string; shiftId: string }

export interface GameState {
  version: 1;
  campaignId: string;
  seed: number;
  currentShiftId: string;
  shiftNumber: number;
  appointmentId?: string | null;
  rankId: string;
  standing: number;
  standingHistory: StandingChange[];
  watchCapacity: number;
  world: Record<string, Scalar>;
  relationships: Record<string, Scalar>;
  tags: string[];
  rights: string[];
  completedCases: string[];
  readNarrative: string[];
  readNewspapers: string[];
  currentVariants: Record<string, string>;
  assistance: Record<string, Assistance>;
  revealedHints: Record<string, number[]>;
  artifacts: SavedArtifact[];
  reports: FiledReport[];
  assessments: AssessmentRecord[];
  attempts: AttemptRecord[];
  watches: WatchRecord[];
  notices: NoticeRecord[];
  watchErrors: WatchError[];
  memos: MemoRecord[];
  mastery: Record<string, MasteryRecord>;
  pendingInbox: { kind: InboxKind; id: string }[];
  withdrawnInbox: string[];
  scheduled: ScheduledItem[];
  consequenceRuns: Record<string, number>;
  progress: Record<string, { phase: "unavailable" | "available" | "active" | "completed"; outcome?: "succeeded" | "failed" | "cancelled" | "withdrawn"; startedAt?: string; completedAt?: string }>;
  clockUsed: number;
  adaptiveSelections: Record<string, { caseId: string; reason: string }>;
  lastAdaptiveCaseId?: string;
  activeCaseId?: string;
  endingId?: string;
  shiftStart?: GameState | string;
  updatedAt: string;
  nextArtifact: number;
  nextWatch: number;
  nextNotice: number;
}

export type QueryRunner = (language: QueryLanguage, expression: string, context: QueryContext) => QueryExecution;

const assistanceOrder: Assistance[] = ["None", "Orientation", "Scaffold", "Worked"];
const unknown = Symbol("unknown");
type FactValue = Scalar | Scalar[] | typeof unknown | undefined;
type Truth = boolean | typeof unknown;
type ClockAction = "validQuery" | "fileReport" | "saveWatch" | "retireWatch" | "printArtifact";

function now(): string { return new Date().toISOString(); }
function campaignTime(value: string): number { return Date.parse(value); }
function sortedLabels(labels: Record<string, string>): string { return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join(","); }
function hash(value: string): number { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }
function includes<T>(values: T[] | undefined, value: T): boolean { return !values?.length || values.includes(value); }
function findLast<T>(values: T[], predicate: (value: T) => boolean): T | undefined {
  for (let position = values.length - 1; position >= 0; position -= 1) if (predicate(values[position]!)) return values[position];
  return undefined;
}

function resultCount(execution: QueryExecution): number {
  if (!execution.ok) return 0;
  if (execution.result.type === "scalar") return 1;
  if (execution.result.type === "instant-vector" || execution.result.type === "range-vector") return execution.result.series.length;
  return execution.result.streams.reduce((total, stream) => total + stream.records.length, 0);
}

/** Views a result may be printed in. A failed query has no result shape to constrain, so any view prints its error. */
export function printableViews(artifact: SavedArtifact): Visualization[] {
  if (!artifact.execution.ok) return ["stat", "table", "graph", "logs"];
  const result = artifact.execution.result;
  if (result.type === "scalar") return ["stat", "table"];
  if (result.type === "instant-vector") return result.series.length === 1 ? ["table", "stat"] : ["table"];
  if (result.type === "range-vector") return ["graph", "table"];
  return ["logs"];
}

function memoTitle(text: string): string {
  const sentence = (/^[^.!?]*[.!?]?/.exec(text.trim())?.[0] ?? text).trim();
  return sentence.length > 60 ? `${sentence.slice(0, 59).trimEnd()}…` : sentence;
}

function noticeTitle(notice: NoticeRecord): string {
  const location = ["facility", "instance", "district", "service", "press", "cohort"]
    .find((key) => notice.localization[key] !== undefined);
  const count = notice.candidateCount;
  return `${count} candidate${count === 1 ? "" : "s"}${location ? ` · ${location}=${String(notice.localization[location])}` : ""}`;
}

function syncRankBenefits(index: CampaignIndex, state: GameState): void {
  const rank = index.ranks.get(state.rankId);
  if (!rank) return;
  const rankOwned = new Set(index.campaign.ranks.flatMap((item) => item.grants));
  const earned = index.campaign.ranks.filter((item) => item.order <= rank.order).flatMap((item) => item.grants);
  state.rights = [...new Set([...state.rights.filter((id) => !rankOwned.has(id)), ...earned])];
  if (rank.watchAuthority !== undefined) state.watchCapacity = rank.watchAuthority;
}

function setRank(index: CampaignIndex, state: GameState, rankId: string): void {
  state.rankId = rankId;
  syncRankBenefits(index, state);
}

export function createGameState(index: CampaignIndex, seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const campaign = index.campaign;
  const mastery = Object.fromEntries(campaign.concepts.map((concept) => [concept.id, { state: "Unobserved" as const, credits: [] }]));
  const state: GameState = {
    version: 1,
    campaignId: campaign.id,
    seed,
    currentShiftId: campaign.opening.shiftId,
    shiftNumber: 1,
    appointmentId: campaign.opening.appointments?.length ? null : undefined,
    rankId: campaign.opening.rankId,
    standing: campaign.opening.standing,
    standingHistory: [],
    watchCapacity: campaign.opening.watchCapacity,
    world: Object.fromEntries(campaign.worldDeclarations.map((item) => [item.id, campaign.opening.world?.[item.id] ?? item.initial])),
    relationships: Object.fromEntries(campaign.relationshipDeclarations.map((item) => [item.id, campaign.opening.relationships?.[item.id] ?? item.initial])),
    tags: [...new Set([...campaign.tagDeclarations.filter((item) => item.initial).map((item) => item.id), ...(campaign.opening.tags ?? [])])],
    rights: [...new Set([...campaign.rightDeclarations.filter((item) => item.initial).map((item) => item.id), ...(campaign.opening.access ?? []), ...(campaign.opening.watchAuthority ?? [])])],
    completedCases: [], readNarrative: [], readNewspapers: [], currentVariants: {}, assistance: {}, revealedHints: {}, artifacts: [], reports: [], assessments: [], attempts: [], watches: [], notices: [], watchErrors: [], memos: [], mastery,
    pendingInbox: [], withdrawnInbox: [], scheduled: [], consequenceRuns: {}, progress: {}, clockUsed: 0, adaptiveSelections: {}, updatedAt: now(), nextArtifact: 1, nextWatch: 1, nextNotice: 1,
  };
  syncRankBenefits(index, state);
  return state;
}

function cloneState(state: GameState): GameState { return structuredClone(state); }

function chargeAction(index: CampaignIndex, state: GameState, action: ClockAction): void {
  const shift = index.shifts.get(state.currentShiftId);
  if (shift?.actionBudget === undefined || !shift.actionCosts) return;
  const cost = shift.actionCosts[action] ?? 0;
  if (state.clockUsed + cost > shift.actionBudget) throw new Error(`This action costs ${cost} clock units; only ${shift.actionBudget - state.clockUsed} remain`);
  state.clockUsed += cost;
}

function retireWatchRecord(state: GameState, watchId: string): void {
  const watch = state.watches.find((item) => item.id === watchId);
  if (!watch || watch.state !== "active") throw new Error(`Cannot retire missing or inactive watch ${watchId}`);
  watch.state = "retired";
  for (const notice of state.notices.filter((item) => item.watchId === watch.id && item.state === "open")) {
    notice.state = "resolved";
    notice.resolvedAt = notice.lastSeen;
  }
}

function reportFacts(state: GameState, id: string, field: string): FactValue {
  const report = state.reports.find((item) => item.id === id);
  if (!report) return undefined;
  if (field === "artifact_ids") return report.artifactIds;
  if (field === "title_choice_id") return report.titleChoiceId;
  if (field === "conclusion_choice_id") return report.conclusionChoiceId;
  if (field === "filed_at") return report.filedAt;
  if (field === "visualization_id") return report.visualization;
  if (field === "evidence") return report.evidence;
  if (field === "evaluation_start") return report.evaluationStart === undefined ? undefined : new Date(report.evaluationStart * 1000).toISOString();
  if (field === "evaluation_end") return report.evaluationEnd === undefined ? undefined : new Date(report.evaluationEnd * 1000).toISOString();
  return undefined;
}

function artifactFacts(state: GameState, id: string, field: string): FactValue {
  const artifact = state.artifacts.find((item) => item.id === id && item.filed);
  if (!artifact) return undefined;
  const result = artifact.execution.ok ? artifact.execution.result : undefined;
  if (field === "state") return artifact.execution.ok ? "successful" : "errored";
  if (field === "language") return artifact.language;
  if (field === "result_kind") return result?.type;
  if (field === "empty") return result ? resultCount(artifact.execution) === 0 : undefined;
  if (field === "scalar_value") return result?.type === "scalar" ? result.value : undefined;
  if (field === "evaluation_start") return artifact.start === undefined ? undefined : new Date(artifact.start * 1000).toISOString();
  if (field === "evaluation_end") return artifact.end === undefined ? undefined : new Date(artifact.end * 1000).toISOString();
  if (field === "visualization_id") return artifact.print?.visualization ?? artifact.controls.visualization;
  if (field === "print_query") return artifact.print?.showQuery;
  if (field === "print_labels") return artifact.print?.showLabels;
  if (field === "print_range") return artifact.print?.showRange;
  if (field === "print_zero_axis") return artifact.print?.zeroAxis;
  if (field === "retained_labels" && result) {
    const labels = result.type === "records" ? result.streams.flatMap((stream) => stream.records.flatMap((record) => Object.keys(record.labels)))
      : result.type === "instant-vector" || result.type === "range-vector" ? result.series.flatMap((series) => Object.keys(series.labels)) : [];
    return [...new Set(labels)];
  }
  if (field === "retained_fields" && result?.type === "records") return [...new Set(result.streams.flatMap((stream) => stream.records.flatMap((record) => Object.keys(record.fields))))];
  if (field === "source_ids") return artifact.execution.facts.lineage.sources;
  if (field === "event_ids") return artifact.execution.facts.lineage.events;
  if (field === "costs") {
    const cost = artifact.execution.facts.cost;
    return [`selected-series=${cost.seriesScanned}`, `scanned-samples=${cost.samplesScanned}`, `scanned-records=${cost.recordsScanned}`, `scanned-bytes=${cost.scannedBytes}`, `returned-items=${cost.returned}`];
  }
  if (field === "observations") return [];
  if (field === "evidence") return artifact.evidence;
  return undefined;
}

function noticeFacts(state: GameState, id: string, field: string): FactValue {
  const notice = state.notices.find((item) => item.id === id);
  if (!notice) return undefined;
  if (field === "state") return notice.state;
  if (field === "generation") return notice.generation;
  if (field === "occurrence_count") return notice.occurrenceCount;
  if (field === "candidate_count") return notice.candidateCount;
  if (field === "event_ids") return notice.eventIds;
  if (field === "localization") return Object.entries(notice.localization).map(([key, value]) => `${key}=${String(value)}`);
  if (field === "first_seen") return notice.firstSeen;
  if (field === "last_seen") return notice.lastSeen;
  if (field === "resolved_at") return notice.resolvedAt;
  return undefined;
}

function factValue(index: CampaignIndex, state: GameState, fact: string): FactValue {
  const dot = fact.lastIndexOf(".");
  const record = fact.slice(0, dot);
  const field = fact.slice(dot + 1);
  const parts = record.split(":");
  if (record === "standing") return field === "value" ? state.standing : [...index.campaign.standing.bands].reverse().find((band) => state.standing >= band.minimum)?.id;
  if (record === "watch_capacity") return field === "limit" ? state.watchCapacity : field === "used" ? state.watches.filter((watch) => watch.state === "active").length : state.watchCapacity - state.watches.filter((watch) => watch.state === "active").length;
  if (record === "clock") {
    const budget = index.shifts.get(state.currentShiftId)?.actionBudget;
    return field === "enabled" ? budget !== undefined : field === "budget" ? budget : field === "used" ? state.clockUsed : budget === undefined ? undefined : budget - state.clockUsed;
  }
  if (record === "context") {
    const shift = index.shifts.get(state.currentShiftId);
    return ({ campaign_time: shift?.time, act_id: shift?.actId, shift_id: shift?.id, case_id: state.activeCaseId, seed: state.seed, rank_id: state.rankId } as Record<string, FactValue>)[field];
  }
  const id = parts.at(-1) ?? "";
  if (parts[0] === "world") return state.world[id];
  if (parts[0] === "relationship") return state.relationships[id];
  if (parts[0] === "tag") return state.tags.includes(id);
  if (parts[0] === "access" || parts[0] === "watch_authority") return state.rights.includes(id);
  if (parts[0] === "mastery") {
    const recordValue = state.mastery[id];
    return field === "state" ? recordValue?.state : field === "credit_count" ? recordValue?.credits.length : recordValue?.credits.some((credit) => credit.spacedRecall) ?? false;
  }
  if (parts[0] === "decision") {
    const report = findLast(state.reports, (item) => index.cases.get(item.caseId)?.decisionId === id);
    return field === "choice_id" ? report?.decisionChoiceId : report?.filedAt;
  }
  if (parts[0] === "report") return reportFacts(state, id, field);
  if (parts[0] === "artifact") return artifactFacts(state, id, field);
  if (parts[0] === "assessment") {
    const assessment = findLast(state.assessments, (item) => item.id === id);
    if (!assessment) return undefined;
    if (field === "state") return assessment.state;
    if (field === "rule_id") return assessment.id;
    if (field === "artifact_ids") return assessment.artifactIds;
    if (field === "measured_value") return assessment.measuredValue;
  }
  if (parts[0] === "attempt") {
    const attempt = state.attempts.find((item) => item.id === id);
    if (!attempt) return undefined;
    const values: Record<string, FactValue> = {
      state: attempt.state, assistance: attempt.assistance, unit_kind: attempt.unitKind, artifact_ids: attempt.artifactIds,
      concept_ids: attempt.conceptIds, behavior_pass: attempt.behaviorPass, evidence_pass: attempt.evidencePass,
      credit_awarded: attempt.creditAwarded, data_shape_id: attempt.dataShapeId, operational_question_id: attempt.operationalQuestionId,
    };
    return values[field];
  }
  if (parts[0] === "progress") {
    const progress = state.progress[`${parts[1]}:${id}`];
    return field === "phase" ? progress?.phase ?? "unavailable" : field === "outcome" ? progress?.outcome : field === "started_at" ? progress?.startedAt : progress?.completedAt;
  }
  if (parts[0] === "watch") {
    const watch = state.watches.find((item) => item.id === id);
    if (!watch) return undefined;
    if (field === "state") return watch.state;
    if (field === "artifact_id") return watch.artifactId;
    if (field === "last_successful_checkpoint_id") return watch.lastSuccessfulCheckpointId;
    if (field === "last_checkpoint_state") return watch.lastCheckpointState;
    if (field === "candidate_count") return state.notices.filter((notice) => notice.watchId === id).reduce((sum, notice) => sum + notice.candidateCount, 0);
    if (field === "notice_ids") return state.notices.filter((notice) => notice.watchId === id).map((notice) => notice.id);
    if (field === "event_ids") return [...new Set(state.notices.filter((notice) => notice.watchId === id).flatMap((notice) => notice.eventIds))];
    if (watch.scores && field in watch.scores) return watch.scores[field as keyof WatchFacts] as FactValue;
  }
  if (parts[0] === "notice") return noticeFacts(state, id, field);
  if (parts[0] === "event") {
    const event = index.campaign.watchScenarios.flatMap((scenario) => scenario.events).find((item) => item.id === id);
    if (!event) return undefined;
    const notices = state.notices.filter((notice) => notice.eventIds.includes(id));
    const localized = notices.some((notice) => Object.entries(event.localization ?? {}).every(([key, value]) => notice.localization[key] === value));
    const timely = notices.some((notice) => (!event.detectionStart || campaignTime(notice.firstSeen) >= campaignTime(event.detectionStart)) && (!event.detectionEnd || campaignTime(notice.firstSeen) < campaignTime(event.detectionEnd)));
    const values: Record<string, FactValue> = {
      relevance: event.relevance, detected: notices.length > 0, localized, timely,
      candidate_count: notices.reduce((sum, notice) => sum + notice.candidateCount, 0), window_start: event.start,
      window_end: event.end, required_localization: Object.entries(event.localization ?? {}).map(([key, value]) => `${key}=${String(value)}`),
      detected_localization: [...new Set(notices.flatMap((notice) => Object.entries(notice.localization).map(([key, value]) => `${key}=${String(value)}`)))],
    };
    return values[field];
  }
  return unknown;
}

function operand(index: CampaignIndex, state: GameState, value: unknown): FactValue {
  return value && typeof value === "object" && !Array.isArray(value) && "fact" in value ? factValue(index, state, String((value as { fact: string }).fact)) : value as FactValue;
}

function compare(left: FactValue, relation: string, right: FactValue): Truth {
  if (left === unknown || right === unknown || left === undefined || right === undefined) return unknown;
  if (relation === "=" || relation === "!=") {
    const equal = JSON.stringify(left) === JSON.stringify(right);
    return relation === "=" ? equal : !equal;
  }
  if (relation === "contains" || relation === "contains-all") {
    const values = Array.isArray(left) ? left : [left];
    const expected = relation === "contains-all" && Array.isArray(right) ? right : [right];
    return expected.every((item) => values.some((value) => value === item));
  }
  if ((typeof left !== "number" && typeof left !== "string") || (typeof right !== "number" && typeof right !== "string")) return false;
  if (relation === "<") return left < right;
  if (relation === "<=") return left <= right;
  if (relation === ">") return left > right;
  return left >= right;
}

function conditionTruth(index: CampaignIndex, state: GameState, condition?: Condition): Truth {
  if (!condition) return true;
  if (condition.op === "all") {
    const values = condition.items.map((item) => conditionTruth(index, state, item));
    return values.includes(false) ? false : values.every((value) => value === true) ? true : unknown;
  }
  if (condition.op === "any") {
    const values = condition.items.map((item) => conditionTruth(index, state, item));
    return values.includes(true) ? true : values.every((value) => value === false) ? false : unknown;
  }
  if (condition.op === "not") {
    const value = conditionTruth(index, state, condition.item);
    return value === unknown ? unknown : !value;
  }
  if (condition.op === "exists" || condition.op === "missing") {
    const value = operand(index, state, condition.value);
    return condition.op === "exists" ? value !== undefined && value !== unknown : value === undefined || value === unknown;
  }
  if (condition.op === "state") return compare(operand(index, state, condition.value), "=", condition.expected);
  if (condition.op === "reached") {
    const value = operand(index, state, condition.value);
    return value === unknown || value === undefined ? unknown : reachedMastery(String(value), String(condition.expected));
  }
  if (condition.op === "between") {
    const value = operand(index, state, condition.value);
    const lower = compare(value, ">=", operand(index, state, condition.lower));
    const upper = compare(value, "<=", operand(index, state, condition.upper));
    return lower === false || upper === false ? false : lower === true && upper === true ? true : unknown;
  }
  if (!("left" in condition)) return unknown;
  const left = operand(index, state, condition.left);
  const right = operand(index, state, condition.right);
  if (left === unknown || right === unknown || left === undefined || right === undefined) return unknown;
  if (condition.op === "in") return Array.isArray(right) ? right.includes(left as Scalar) : false;
  if (condition.op === "contains") return Array.isArray(left) ? left.includes(right as Scalar) : false;
  return compare(left, condition.relation, right);
}

export function evaluateCondition(index: CampaignIndex, state: GameState, condition?: Condition): boolean {
  return conditionTruth(index, state, condition) === true;
}

function applyEffect(index: CampaignIndex, state: GameState, effect: Effect, reason: string): void {
  if (effect.type === "set" || effect.type === "change") {
    const [record, tail] = effect.target.split(":");
    const id = tail?.split(".")[0];
    if (effect.target === "standing.value" && effect.type === "change") {
      const previous = state.standing;
      state.standing = Math.max(index.campaign.standing.minimum, Math.min(index.campaign.standing.maximum, previous + effect.delta));
      if (state.standing !== previous) state.standingHistory.push({
        value: state.standing, delta: state.standing - previous, reason,
        campaignTime: index.shifts.get(state.currentShiftId)?.time ?? state.updatedAt, shiftId: state.currentShiftId,
      });
    }
    else if (effect.target === "watch_capacity.limit" && effect.type === "change") state.watchCapacity += effect.delta;
    else if ((record === "world" || record === "relationship") && id) {
      const declarations = record === "world" ? index.campaign.worldDeclarations : index.campaign.relationshipDeclarations;
      const declaration = declarations.find((item) => item.id === id);
      if (!declaration) throw new Error(`Effect target ${effect.target} is missing`);
      const current = record === "world" ? state.world[id] : state.relationships[id];
      const value = effect.type === "set" ? effect.value : typeof current === "number" ? current + effect.delta : Number.NaN;
      const expected = declaration.valueType === "bool" ? "boolean" : declaration.valueType === "int" || declaration.valueType === "number" ? "number" : "string";
      if (typeof value !== expected || (typeof value === "number" && (!Number.isFinite(value) || (declaration.valueType === "int" && !Number.isInteger(value))))) throw new Error(`Effect value for ${effect.target} has the wrong type`);
      if (record === "world") state.world[id] = value; else state.relationships[id] = value;
    } else throw new Error(`Effect target ${effect.target} is not writable`);
  } else if (effect.type === "add_tag") state.tags = [...new Set([...state.tags, effect.tagId])];
  else if (effect.type === "remove_tag") state.tags = state.tags.filter((id) => id !== effect.tagId);
  else if (effect.type === "enqueue") {
    if (!state.pendingInbox.some((item) => item.kind === effect.itemKind && item.id === effect.itemId)) state.pendingInbox.push({ kind: effect.itemKind, id: effect.itemId });
    state.withdrawnInbox = state.withdrawnInbox.filter((id) => id !== effect.itemId);
  }
  else if (effect.type === "withdraw") {
    state.pendingInbox = state.pendingInbox.filter((item) => item.id !== effect.itemId);
    state.withdrawnInbox = [...new Set([...state.withdrawnInbox, effect.itemId])];
  }
  else if (effect.type === "grant") state.rights = [...new Set([...state.rights, effect.rightId])];
  else if (effect.type === "revoke") state.rights = state.rights.filter((id) => id !== effect.rightId);
  else if (effect.type === "promote" || effect.type === "demote") {
    const current = index.ranks.get(state.rankId);
    const target = index.ranks.get(effect.rankId);
    if (!current || !target) throw new Error(`${effect.type} references a missing rank`);
    if (target.id === current.id) return;
    const step = effect.type === "promote" ? 1 : -1;
    if (target.order !== current.order + step) throw new Error(`${effect.type} may only move to the adjacent rank`);
    setRank(index, state, target.id);
  }
  else if (effect.type === "retire_watch") {
    retireWatchRecord(state, effect.watchId);
  }
  else if (effect.type === "enter_ending") {
    if (state.endingId && state.endingId !== effect.endingId) throw new Error(`Conflicting ending ${effect.endingId}`);
    state.endingId = effect.endingId;
  }
  else if (effect.type === "cancel") {
    const scheduled = state.scheduled.find((item) => item.id === effect.scheduleId && !item.cancelled);
    if (!scheduled) throw new Error(`Cannot cancel missing schedule ${effect.scheduleId}`);
    scheduled.cancelled = true;
  }
  else if (effect.type === "schedule") {
    if (state.scheduled.some((item) => item.id === effect.scheduleId && !item.cancelled)) throw new Error(`Schedule ${effect.scheduleId} already exists`);
    state.scheduled.push({ id: effect.scheduleId, targetKind: effect.targetKind, targetId: effect.targetId, atTimestamp: effect.atTimestamp, atCheckpointId: effect.atCheckpointId });
  }
  validateBounds(index, state);
}

function validateBounds(index: CampaignIndex, state: GameState): void {
  if (state.standing < index.campaign.standing.minimum || state.standing > index.campaign.standing.maximum) throw new Error("Effect put Standing outside its campaign bounds");
  const declarations = [...index.campaign.worldDeclarations.map((item) => ({ ...item, collection: state.world })), ...index.campaign.relationshipDeclarations.map((item) => ({ ...item, collection: state.relationships }))];
  for (const declaration of declarations) {
    const value = declaration.collection[declaration.id];
    if (value === undefined) throw new Error(`Effect target ${declaration.id} is missing`);
    if (declaration.allowedValues && !declaration.allowedValues.includes(value)) throw new Error(`Effect put ${declaration.id} outside its allowed values`);
    if (typeof value === "number" && declaration.minimum !== undefined && value < declaration.minimum) throw new Error(`Effect put ${declaration.id} below its minimum`);
    if (typeof value === "number" && declaration.maximum !== undefined && value > declaration.maximum) throw new Error(`Effect put ${declaration.id} above its maximum`);
  }
}

function applyEffects(index: CampaignIndex, state: GameState, effects: Effect[] = [], reason = "Ministry action"): GameState {
  const next = cloneState(state);
  effects.forEach((effect) => applyEffect(index, next, effect, reason));
  return next;
}

function variantFor(state: GameState, item: CampaignCase): CampaignCase["variants"][number] {
  const selected = state.currentVariants[item.id];
  if (selected) return item.variants.find((variant) => variant.id === selected) ?? item.variants[0]!;
  return item.variants[hash(`${state.seed}:${item.id}:${state.reports.filter((report) => report.caseId === item.id).length}`) % item.variants.length]!;
}

export function buildQueryContext(index: CampaignIndex, datasetId: string, controls: QueryControls, allowedSources?: Iterable<string>, timeOffsetSeconds = 0): QueryContext {
  const dataset = index.datasets.get(datasetId);
  if (!dataset) throw new Error(`Missing dataset ${datasetId}`);
  const allowed = allowedSources ? new Set(allowedSources) : undefined;
  const shiftEmbeddedTimes = (line: string) => timeOffsetSeconds === 0 ? line : line.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g,
    (value) => new Date(Date.parse(value) + timeOffsetSeconds * 1000).toISOString(),
  );
  const metrics: MetricSeries[] = dataset.series.filter((series) => !allowed || allowed.has(series.metric)).map((series) => {
    const definition = index.metrics.get(series.metric);
    return {
      id: series.id, metric: series.metric, labels: series.labels, type: definition?.type, unit: definition?.unit, source: series.metric,
      samples: series.samples.map((sample) => ({
        timestamp: Date.parse(sample.time) / 1000 + timeOffsetSeconds,
        value: typeof sample.value === "number" ? sample.value : {
          kind: "histogram", count: sample.value.count, sum: sample.value.sum, cumulative: false, interpolation: sample.value.interpolation,
          buckets: sample.value.buckets.map((bucket) => ({ lowerBound: bucket.lower, upperBound: bucket.upper, count: bucket.count })),
        } satisfies HistogramValue,
        eventIds: series.eventIds,
      })),
    };
  });
  const logs: LogStream[] = dataset.streams.filter((stream) => !allowed || allowed.has(stream.sourceId)).map((stream) => ({
    id: stream.id, labels: stream.labels, source: stream.sourceId,
    records: stream.records.map((record) => ({ id: record.id, timestamp: Date.parse(record.time) / 1000 + timeOffsetSeconds, line: shiftEmbeddedTimes(record.line), metadata: record.metadata, eventIds: record.eventIds })),
  }));
  return { timestamp: controls.timestamp, start: controls.start, end: controls.end, step: controls.step, lookback: controls.lookback, direction: controls.direction, limit: controls.limit, metrics, logs };
}

type AuthoredArtifact = ReferenceArtifact | WorkedEvidenceArtifact;

function seconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value) / 1000;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function authoredControls(item: CampaignCase, variant: CampaignCase["variants"][number]): QueryControls {
  const timestamp = seconds(variant.evaluationTime ?? item.evaluationTime);
  if (timestamp === undefined) throw new Error("has no valid evaluation time");
  const start = seconds(variant.rangeStart ?? item.rangeStart);
  const end = seconds(variant.rangeEnd ?? item.rangeEnd);
  if ((start === undefined) !== (end === undefined) || (start !== undefined && end !== undefined && start >= end)) throw new Error("has an invalid authored range");
  return { timestamp, start, end, visualization: "table" };
}

export function controlsFor(base: QueryControls, reference: AuthoredArtifact): QueryControls {
  if (reference.mode === "instant") return { timestamp: base.timestamp, visualization: "table" };
  if (base.start === undefined || base.end === undefined) throw new Error(`${reference.mode} reference needs an authored range`);
  if (reference.mode === "records") return {
    timestamp: base.timestamp, start: base.start, end: base.end, lookback: base.end - base.start,
    direction: "backward", limit: 100, visualization: "logs",
  };
  return {
    timestamp: base.timestamp, start: base.start, end: base.end,
    step: Math.max(1, Math.floor((base.end - base.start) / 60)), visualization: "graph",
  };
}

export function executeAuthoredArtifact(
  index: CampaignIndex, item: CampaignCase, variant: CampaignCase["variants"][number],
  reference: AuthoredArtifact, controls: QueryControls, setId: string, position: number, assistance: "None" | "Worked",
  run: QueryRunner,
): SavedArtifact {
  const execution = run(reference.language, reference.query, buildQueryContext(index, variant.datasetId, controls, undefined, variant.datasetTimeOffsetSeconds));
  const print = "print" in reference ? reference.print
    : { visualization: controls.visualization, showQuery: true, showLabels: true, showRange: true, zeroAxis: true };
  return {
    id: `reference.${setId}.${position}`, role: reference.role, caseId: item.id, variantId: variant.id, language: reference.language,
    expression: reference.query, controls, execution, assistance,
    print,
    createdAt: variant.evaluationTime ?? item.evaluationTime ?? "", filed: false,
    timestamp: controls.timestamp, start: controls.start, end: controls.end, sourceIds: execution.facts.lineage.sources,
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonical(entry)]));
  if (typeof value !== "number") return value;
  if (!Number.isFinite(value)) return { $number: Number.isNaN(value) ? "NaN" : value > 0 ? "+Infinity" : "-Infinity" };
  return Object.is(value, -0) ? 0 : value;
}

const timeSemantics = new Set(["range-selector", "time-modifier", "offset", "subquery"]);

function comparableArtifact(artifact: SavedArtifact): unknown {
  const { timestamp, start, end, step, lookback, direction, limit } = artifact.controls;
  const resultType = artifact.execution.ok ? artifact.execution.result.type : undefined;
  const controls = resultType === "records"
    ? { start: start ?? timestamp - (lookback ?? 0), end: end ?? timestamp, direction, limit }
    : start !== undefined || end !== undefined ? { start, end, step } : { timestamp };
  return canonical({
    language: artifact.language,
    controls,
    result: artifact.execution.ok ? artifact.execution.result : artifact.execution.error,
    lineage: artifact.execution.facts.lineage,
    timeSemantics: artifact.execution.facts.semantic.filter((node) => timeSemantics.has(node.kind)),
  });
}

function artifactsMatch(actual: SavedArtifact[], expected: SavedArtifact[]): boolean {
  return actual.length === expected.length && actual.every((artifact, index) =>
    JSON.stringify(comparableArtifact(artifact)) === JSON.stringify(comparableArtifact(expected[index]!)));
}

function referenceArtifacts(
  index: CampaignIndex, item: CampaignCase, variant: CampaignCase["variants"][number], run: QueryRunner,
): Array<{ evidencePathId: string; artifacts: SavedArtifact[] }> {
  try {
    const base = authoredControls(item, variant);
    return variant.referenceSets.map((set) => ({
      evidencePathId: set.evidencePathId,
      artifacts: set.artifacts.map((reference, position) => executeAuthoredArtifact(
        index, item, variant, reference, controlsFor(base, reference), set.id, position + 1, "None", run,
      )),
    }));
  } catch {
    return [];
  }
}

export function matchingReferencePaths(
  index: CampaignIndex, item: CampaignCase, variant: CampaignCase["variants"][number], artifacts: SavedArtifact[], run: QueryRunner,
): Set<string> {
  return new Set(referenceArtifacts(index, item, variant, run)
    .filter((reference) => artifactsMatch(artifacts, reference.artifacts))
    .map((reference) => reference.evidencePathId));
}

function matchesMasteryReference(
  index: CampaignIndex, item: CampaignCase, variant: CampaignCase["variants"][number],
  use: CampaignCase["masteryUses"][number], artifacts: SavedArtifact[], run: QueryRunner,
): boolean {
  const selected = resolveArtifactSelectors(use.artifactSelectors, artifacts);
  return Boolean(selected?.length && referenceArtifacts(index, item, variant, run).some((reference) => {
    const expected = resolveArtifactSelectors(use.artifactSelectors, reference.artifacts);
    return expected !== undefined && artifactsMatch(selected, expected);
  }));
}

export function assessCaseEvidence(
  item: CampaignCase, variant: CampaignCase["variants"][number], artifacts: SavedArtifact[], titleChoiceId?: string,
  conclusionChoiceId?: string, watch?: WatchFacts, watchThresholds?: DetectorContext["watchThresholds"], matchingPaths?: ReadonlySet<string>,
): { state: EvidenceState; assessments: AssessmentRecord[]; queryErrors: string[]; failedConceptIds: string[] } {
  const queryErrors = artifacts.flatMap((artifact) => artifact.execution.ok ? [] : [`${artifact.id}: ${artifact.execution.error.message}`]);
  if (queryErrors.length) return {
    state: "error", queryErrors, failedConceptIds: [],
    assessments: item.evidencePaths.map((path) => ({ id: path.id, caseId: item.id, state: "error", artifactIds: artifacts.map((artifact) => artifact.id) })),
  };
  const requiredValues = [...(item.requiredValues ?? []), ...(variant.requiredValues ?? [])];
  const evidenceRequirements = [...(item.evidenceRequirements ?? []), ...(variant.evidenceRequirements ?? [])];
  const paths = item.evidencePaths.map((path) => {
    const failedConceptIds: string[] = [];
    for (const clause of path.clauses) {
      const selected = resolveArtifactSelectors(clause.artifactSelectors, artifacts);
      const unitKind = clause.artifactSelectors.includes("watch-expression") ? "watch-horizon" : selected?.length === 1 ? "query-artifact" : "ordered-artifact-set";
      const pass = selected !== undefined && evaluateDetector(clause.requirements, {
        conceptId: clause.conceptId, artifacts: selected, unitKind,
        assistance: strongestAssistance(selected.map((artifact) => artifact.assistance)), requiredValues, evidenceRequirements,
        titleChoiceId, conclusionChoiceId, costBudgets: item.costBudgets, watch, watchThresholds,
      });
      if (!pass) failedConceptIds.push(clause.conceptId);
    }
    return {
      assessment: { id: path.id, caseId: item.id, state: failedConceptIds.length || (matchingPaths && !matchingPaths.has(path.id)) ? "unsupported" as const : "supported" as const, artifactIds: artifacts.map((artifact) => artifact.id) },
      failedConceptIds: [...new Set(failedConceptIds)],
    };
  });
  const assessments = paths.map((path) => path.assessment);
  const stateValue = assessments.some((assessment) => assessment.state === "supported") ? "supported" : artifacts.some((artifact) => resultCount(artifact.execution) > 0) ? "partial" : "unsupported";
  const closestPath = [...paths].sort((left, right) => left.failedConceptIds.length - right.failedConceptIds.length)[0];
  return { state: stateValue, assessments, queryErrors: [], failedConceptIds: closestPath?.failedConceptIds ?? [] };
}

function technicalEvidence(index: CampaignIndex, run: QueryRunner, state: GameState, item: CampaignCase, artifacts: SavedArtifact[], titleChoiceId: string, conclusionChoiceId: string) {
  const variant = variantFor(state, item);
  return assessCaseEvidence(item, variant, artifacts, titleChoiceId, conclusionChoiceId, undefined, undefined, matchingReferencePaths(index, item, variant, artifacts, run));
}

function resolveArtifactSelectors(selectors: string[], artifacts: SavedArtifact[]): SavedArtifact[] | undefined {
  const resolved: SavedArtifact[] = [];
  for (const selector of selectors) {
    const slot = /^artifact\[([1-9]\d*)\]$/.exec(selector)?.[1];
    const matches = slot ? artifacts.slice(Number(slot) - 1, Number(slot))
      : selector === "promql" || selector === "logql" ? artifacts.filter((artifact) => artifact.language === selector)
        : selector === "watch-expression" ? (artifacts.some((artifact) => artifact.role) ? artifacts.filter((artifact) => artifact.role === selector) : artifacts.slice(0, 1)) : [];
    if (matches.length !== 1 || resolved.includes(matches[0]!)) return undefined;
    resolved.push(matches[0]!);
  }
  return resolved;
}

export function assessMasteryUse(
  index: CampaignIndex, item: CampaignCase, variant: CampaignCase["variants"][number],
  use: CampaignCase["masteryUses"][number], artifacts: SavedArtifact[], watch?: WatchFacts,
  titleChoiceId?: string, conclusionChoiceId?: string, referencePass = true,
): { selected: SavedArtifact[]; assistance: Assistance; behaviorPass: boolean; evidencePass: boolean; assistancePass: boolean; creditAwarded: boolean } {
  const concept = index.concepts.get(use.conceptId);
  const selected = resolveArtifactSelectors(use.artifactSelectors, artifacts) ?? [];
  const assistance = strongestAssistance(selected.map((artifact) => artifact.assistance));
  const requiredValues = [...(item.requiredValues ?? []), ...(variant.requiredValues ?? [])];
  const evidenceRequirements = [...(item.evidenceRequirements ?? []), ...(variant.evidenceRequirements ?? [])];
  const context = {
    conceptId: concept?.id, artifacts: selected, unitKind: use.unitKind, assistance, requiredValues, evidenceRequirements,
    costBudgets: item.costBudgets, watch, watchThresholds: item.watchScenarioId ? index.watchScenarios.get(item.watchScenarioId)?.thresholds : undefined,
    titleChoiceId, conclusionChoiceId,
  };
  const executionPass = Boolean(concept) && selected.length > 0 && selected.every((artifact) => artifact.execution.ok);
  const behaviorPass = executionPass && evaluateDetector(concept!.semantic, context);
  const evidencePass = executionPass && referencePass && evaluateDetector(concept!.evidence, context);
  const assistancePass = assistanceOrder.indexOf(assistance) <= assistanceOrder.indexOf(use.maxAssistance);
  return { selected, assistance, behaviorPass, evidencePass, assistancePass, creditAwarded: behaviorPass && evidencePass && assistancePass };
}

function matchesOutcome(index: CampaignIndex, state: GameState, outcome: CaseOutcome, evidence: EvidenceState, title: string, conclusion: string, decision: string): boolean {
  return includes(outcome.titleChoiceIds, title) && includes(outcome.conclusionChoiceIds, conclusion) && includes(outcome.decisionChoiceIds, decision)
    && evaluateCondition(index, state, outcome.condition) && outcome.technicalEvidence === evidence;
}

function isFallbackOutcome(outcome: CaseOutcome): boolean {
  return !outcome.condition && !outcome.titleChoiceIds?.length && !outcome.conclusionChoiceIds?.length && !outcome.decisionChoiceIds?.length;
}

function resultValue(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toPrecision(4).replace(/0+$/, "").replace(/\.$/, "");
  if (value && typeof value === "object" && "count" in value && "sum" in value) return `histogram count ${String(value.count)}, sum ${String(value.sum)}`;
  return String(value);
}

function resultLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).slice(0, 4).map(([key, value]) => `${key}="${value}"`);
  return entries.length ? `{${entries.join(", ")}${Object.keys(labels).length > entries.length ? ", …" : ""}}` : "no labels";
}

function resultSummary(artifacts: SavedArtifact[]): string {
  return artifacts.map((artifact, index) => {
    if (!artifact.execution.ok) return `Printout ${index + 1} failed before returning data.`;
    const result = artifact.execution.result;
    if (result.type === "scalar") return `Printout ${index + 1} returned scalar ${resultValue(result.value)}.`;
    if (result.type === "instant-vector") {
      const first = result.series[0];
      return `Printout ${index + 1} returned an instant vector with ${result.series.length} series${first ? `; first: ${resultLabels(first.labels)} = ${resultValue(first.value)}` : ""}.`;
    }
    if (result.type === "range-vector") {
      const first = result.series[0];
      const samples = result.series.reduce((total, series) => total + series.values.length, 0);
      return `Printout ${index + 1} returned a range vector with ${result.series.length} series and ${samples} samples${first ? `; first labels: ${resultLabels(first.labels)}` : ""}.`;
    }
    const records = result.streams.flatMap((stream) => stream.records);
    const first = records[0];
    const line = first?.displayLine;
    const clipped = line && line.length > 72 ? `${line.slice(0, 71)}…` : line;
    return `Printout ${index + 1} returned ${records.length} records in ${result.streams.length} streams${first ? `; first: ${resultLabels(first.labels)} “${clipped}”` : ""}.`;
  }).join(" ");
}

function outcomeFor(
  index: CampaignIndex, state: GameState, item: CampaignCase, evidence: EvidenceState,
  title: string, conclusion: string, decision: string, allowSpecific = evidence !== "error",
): { outcome: CaseOutcome; evidence: EvidenceState; completesCase: boolean } {
  const quality: Record<EvidenceState, number> = { error: 0, unsupported: 1, partial: 2, supported: 3 };
  if (allowSpecific) {
    const exact = item.outcomes.find((outcome) => !isFallbackOutcome(outcome) && matchesOutcome(index, state, outcome, evidence, title, conclusion, decision));
    if (exact) return { outcome: exact, evidence, completesCase: true };
    const choice = item.outcomes.find((outcome) =>
      Boolean(outcome.titleChoiceIds?.length || outcome.conclusionChoiceIds?.length || outcome.decisionChoiceIds?.length)
      && includes(outcome.titleChoiceIds, title) && includes(outcome.conclusionChoiceIds, conclusion)
      && includes(outcome.decisionChoiceIds, decision) && evaluateCondition(index, state, outcome.condition)
      && quality[outcome.technicalEvidence] <= quality[evidence],
    );
    if (choice) return { outcome: choice, evidence: choice.technicalEvidence, completesCase: true };
  }
  const fallback = item.outcomes.find(isFallbackOutcome)!;
  return {
    outcome: fallback,
    evidence: evidence === "error" || quality[evidence] <= quality[fallback.technicalEvidence] ? evidence : fallback.technicalEvidence,
    completesCase: item.outcomes.every(isFallbackOutcome),
  };
}

function reportDiagnostic(
  index: CampaignIndex, item: CampaignCase, assessment: ReturnType<typeof assessCaseEvidence>,
  artifacts: SavedArtifact[], title: string, conclusion: string, decision: string, fallbackExplanation?: string,
): string {
  if (assessment.queryErrors.length) return `This attempt has query errors: ${assessment.queryErrors.join("; ")} Correct the query and file a new attempt.`;
  const fields = [
    ["title", (outcome: CaseOutcome) => includes(outcome.titleChoiceIds, title)],
    ["conclusion", (outcome: CaseOutcome) => includes(outcome.conclusionChoiceIds, conclusion)],
    ["recommended action", (outcome: CaseOutcome) => includes(outcome.decisionChoiceIds, decision)],
  ] as const;
  const mismatches = item.outcomes.filter((outcome) => !isFallbackOutcome(outcome))
    .map((outcome) => fields.filter(([, matches]) => !matches(outcome)).map(([name]) => name))
    .sort((left, right) => left.length - right.length)[0] ?? [];
  if (mismatches.length) {
    const names = mismatches.length === 1 ? mismatches[0] : `${mismatches.slice(0, -1).join(", ")} and ${mismatches.at(-1)}`;
    const selected = [item.report.titles.find((choice) => choice.id === title)?.text, item.report.conclusions.find((choice) => choice.id === conclusion)?.text, item.decisionChoices.find((choice) => choice.id === decision)?.text].filter(Boolean);
    return `The selected ${names} ${mismatches.length === 1 ? "points" : "point"} to a different finding than the other report choices. You filed: ${selected.map((text) => `“${text}”`).join(" / ")}. Make all three describe one finding, then file again.`;
  }
  if (assessment.failedConceptIds.length) {
    const competencies = assessment.failedConceptIds.map((id) => index.concepts.get(id)?.competency ?? id);
    return `${resultSummary(artifacts)} The evidence does not yet prove: ${competencies.join("; ")} Correct the query, print settings, or report scope, then file again.`;
  }
  return `${fallbackExplanation ?? "The evidence ran, but the selected title, conclusion, and action do not match an authored outcome."} Correct the report choices and file a new attempt.`;
}

function recomputeMastery(record: MasteryRecord): void {
  if (!record.credits.length) { record.state = "Unobserved"; return; }
  record.state = "Observed";
  const solved = record.credits.filter((credit) => credit.assistance !== "Worked");
  const distinct = (credits: MasteryCredit[]) => new Set(credits.map((credit) => `${credit.dataShapeId}:${credit.operationalQuestionId}`)).size;
  if (distinct(solved) >= 2) record.state = "Practiced";
  const independent = solved.filter((credit) => credit.assistance === "None");
  if (record.state === "Practiced" && distinct([...solved.slice(0, 2), ...independent]) >= 4 && distinct(independent) >= 2) record.state = "Independent";
  if (record.state === "Independent" && independent.some((credit) => credit.targetState === "Certified" && credit.mainCampaign && credit.spacedRecall)) record.state = "Certified";
}

export class GameEngine {
  state: GameState;

  constructor(public readonly index: CampaignIndex, private readonly run: QueryRunner, state?: GameState) {
    this.state = state?.campaignId === index.campaign.id ? cloneState(state) : createGameState(index);
    this.state.assessments ??= [];
    this.state.attempts ??= [];
    this.state.standingHistory ??= [];
    this.state.revealedHints ??= {};
    this.state.clockUsed ??= 0;
    this.state.adaptiveSelections ??= {};
    this.state.memos ??= [];
    this.state.readNewspapers ??= [];
    this.state.rights ??= [];
    syncRankBenefits(this.index, this.state);
    for (const watch of this.state.watches) watch.executions ??= [];
    for (const notice of this.state.notices) notice.memberIds ??= [];
    if (!this.state.progress[`shift:${this.state.currentShiftId}`]) this.enterShift(this.state.currentShiftId, false);
    this.state.shiftStart ??= this.shiftSnapshot();
  }

  currentShift() { return this.index.shifts.get(this.state.currentShiftId)!; }

  shiftStartingStanding(): number {
    const start = typeof this.state.shiftStart === "string" ? JSON.parse(this.state.shiftStart) as GameState : this.state.shiftStart;
    return start?.standing ?? this.state.standing;
  }

  conditionSatisfied(condition?: Condition): boolean { return evaluateCondition(this.index, this.state, condition); }

  appointmentPending(): boolean { return this.state.appointmentId === null; }

  private chooseAppointment(id: string, complaint: boolean): void {
    if (!this.appointmentPending()) throw new Error("The appointment has already been decided");
    const appointment = this.index.campaign.opening.appointments?.find((item) => item.id === id);
    if (!appointment) throw new Error(`Unknown appointment ${id}`);
    let next = createGameState(this.index, this.state.seed);
    next.appointmentId = id;
    next.currentShiftId = appointment.shiftId;
    next = applyEffects(this.index, next, complaint ? appointment.complaintEffects : appointment.effects, `${appointment.title}: ${complaint ? appointment.complaintLabel : appointment.agreeLabel}`);
    this.state = next;
    this.enterShift(appointment.shiftId, false);
    this.resolveRanksAndEndings();
    this.state.shiftStart = this.shiftSnapshot();
    this.touch();
  }

  acceptAppointment(id: string): void { this.chooseAppointment(id, false); }

  fileAppointmentComplaint(id: string): void { this.chooseAppointment(id, true); }

  currentNewspaper(): NewspaperEdition | undefined {
    if (this.appointmentPending()) return undefined;
    return this.index.campaign.newspaper?.editions.find((edition) => edition.shiftId === this.state.currentShiftId && evaluateCondition(this.index, this.state, edition.condition));
  }

  newspaperRead(id: string): boolean { return this.state.readNewspapers.includes(id); }

  readNewspaper(id: string): void {
    const edition = this.currentNewspaper();
    if (!edition || edition.id !== id) throw new Error(`Newspaper edition ${id} is not available`);
    if (!this.newspaperRead(id)) this.state.readNewspapers.push(id);
    this.touch();
  }

  locked(): boolean { return this.state.endingId !== undefined; }

  private requireOpenConsole(): void {
    if (this.appointmentPending()) throw new Error("Accept an appointment before opening the console.");
    if (this.locked()) throw new Error("The console is closed.");
  }

  private pushMemo(text: string, from: string, source: { consequenceId?: string; endingId?: string }): void {
    this.state.memos.push({
      id: `memo.${this.state.memos.length + 1}`, ...source, from,
      text: text.startsWith(`${from}:`) ? text.slice(from.length + 1).trimStart() : text,
      campaignTime: this.currentShift().time, shiftNumber: this.state.shiftNumber, read: false,
    });
  }

  private runConsequence(consequence: Consequence): void {
    const count = this.state.consequenceRuns[consequence.id] ?? 0;
    if (count >= (consequence.repeatLimit ?? 1) || !evaluateCondition(this.index, this.state, consequence.condition)) return;
    this.state = applyEffects(this.index, this.state, consequence.effects, consequence.explanation ?? `Consequence: ${consequence.id}`);
    this.state.consequenceRuns[consequence.id] = count + 1;
    if (!consequence.explanation) return;
    const speaker = this.index.campaign.characters.filter((character) => consequence.explanation!.startsWith(character.name)).sort((left, right) => right.name.length - left.name.length)[0];
    this.pushMemo(consequence.explanation, speaker?.name ?? "The Ministry", { consequenceId: consequence.id });
  }

  restartShift(): void {
    this.requireOpenConsole();
    if (!this.state.shiftStart) throw new Error("No shift checkpoint is available");
    this.state = typeof this.state.shiftStart === "string" ? JSON.parse(this.state.shiftStart) as GameState : cloneState(this.state.shiftStart);
    this.state.shiftStart = this.shiftSnapshot();
    this.touch();
  }

  private shiftSnapshot(): GameState {
    const snapshot = cloneState(this.state);
    delete snapshot.shiftStart;
    return snapshot;
  }

  availableSources(caseId?: string): string[] {
    const caseIds = caseId ? [caseId] : this.inbox().filter((item) => item.kind === "case").map((item) => item.id);
    return [...new Set(caseIds.flatMap((id) => this.index.cases.get(id)?.availableSources ?? []))].filter((id) => {
      const source = this.index.metrics.get(id) ?? this.index.logSources.get(id);
      return source !== undefined && this.state.rights.includes(source.accessRightId);
    });
  }

  canAccessConcept(conceptId: string): boolean {
    const concept = this.index.concepts.get(conceptId);
    return concept !== undefined && this.state.rights.includes(concept.accessRightId);
  }

  caseDatasetId(caseId: string): string { return this.caseVariant(caseId).datasetId; }

  actionCost(action: ClockAction): number { return this.currentShift().actionCosts?.[action] ?? 0; }

  clockRemaining(): number | undefined {
    const budget = this.currentShift().actionBudget;
    return budget === undefined ? undefined : budget - this.state.clockUsed;
  }

  clock(): { enabled: boolean; budget: number; used: number; remaining: number; minutesPerUnit: number; shiftStart: string; shiftMinutes: number } | undefined {
    const shift = this.currentShift();
    const budget = shift.actionBudget;
    if (budget === undefined) return undefined;
    const shiftMinutes = 540;
    return {
      enabled: true, budget, used: this.state.clockUsed, remaining: budget - this.state.clockUsed,
      minutesPerUnit: shiftMinutes / budget, shiftStart: shift.time, shiftMinutes,
    };
  }

  inbox(): { kind: InboxKind | "notice" | "watch-error" | "memo"; id: string; title: string; done: boolean }[] {
    const shift = this.currentShift();
    let authored = [...shift.inbox, ...this.state.pendingInbox.map((item) => ({ ...item, condition: undefined }))].filter((item) => !this.state.withdrawnInbox.includes(item.id) && evaluateCondition(this.index, this.state, item.condition));
    if (shift.caseSelectionMode !== "fixed") {
      const nonPractice = authored.filter((ref) => ref.kind !== "case" || this.index.cases.get(ref.id)?.mode !== "adaptive");
      const practice = authored.filter((ref) => ref.kind === "case" && this.index.cases.get(ref.id)?.mode === "adaptive");
      const availablePractice = practice.filter((ref) => !this.state.completedCases.includes(ref.id));
      let selected = this.state.adaptiveSelections[shift.id];
      const selectedCaseId = selected?.caseId;
      if (!selectedCaseId || !practice.some((ref) => ref.id === selectedCaseId)) {
        const alternatives = availablePractice.length > 1 ? availablePractice.filter((ref) => ref.id !== this.state.lastAdaptiveCaseId) : availablePractice;
        const masteryRank = (caseId: string) => {
          const item = this.index.cases.get(caseId);
          const records = item?.conceptIds.map((id) => this.state.mastery[id]).filter((value): value is MasteryRecord => Boolean(value)) ?? [];
          if (records.some((record) => record.state === "Observed" && record.credits.length > 0 && record.credits.every((credit) => credit.assistance === "Worked"))) return 0;
          const order: MasteryState[] = ["Unobserved", "Observed", "Practiced", "Independent", "Certified"];
          return 1 + Math.min(...records.map((record) => order.indexOf(record.state)));
        };
        const picked = [...alternatives].sort((left, right) => masteryRank(left.id) - masteryRank(right.id) || hash(`${this.state.seed}:${shift.id}:${left.id}`) - hash(`${this.state.seed}:${shift.id}:${right.id}`))[0];
        if (picked) {
          const order: MasteryState[] = ["Unobserved", "Observed", "Practiced", "Independent", "Certified"];
          const concept = this.index.cases.get(picked.id)?.conceptIds.map((id) => this.index.concepts.get(id)).filter((value) => value !== undefined)
            .sort((left, right) => order.indexOf(this.state.mastery[left.id]?.state ?? "Unobserved") - order.indexOf(this.state.mastery[right.id]?.state ?? "Unobserved"))[0];
          const current = concept ? this.state.mastery[concept.id]?.state ?? "Unobserved" : undefined;
          selected = { caseId: picked.id, reason: concept ? `${concept.competency} is currently ${current}` : "Practice offered for a developing concept" };
          this.state.adaptiveSelections[shift.id] = selected;
          this.state.lastAdaptiveCaseId = picked.id;
        }
      }
      authored = selected ? [...nonPractice, ...practice.filter((ref) => ref.id === selected.caseId)] : nonPractice;
    }
    const nextCase = authored.find((item) => item.kind === "case" && !this.state.completedCases.includes(item.id));
    if (nextCase) authored = authored.filter((item) =>
      item.kind !== "case" || this.state.completedCases.includes(item.id) || item.id === nextCase.id);
    const result = authored.map((item) => ({
      kind: item.kind, id: item.id,
      title: item.kind === "case" ? this.index.cases.get(item.id)?.title ?? item.id : this.index.narrativeItems.get(item.id)?.title ?? item.id,
      done: item.kind === "case" ? this.state.completedCases.includes(item.id) : this.state.readNarrative.includes(item.id),
    }));
    const notices = this.state.notices.filter((notice) => notice.state === "open").map((notice) => ({ kind: "notice" as const, id: notice.id, title: noticeTitle(notice), done: false }));
    const activeWatchIds = new Set(this.state.watches.filter((watch) => watch.state === "active").map((watch) => watch.id));
    const errors = this.state.watchErrors.filter((error) => activeWatchIds.has(error.watchId)).map((error) => ({ kind: "watch-error" as const, id: `${error.watchId}:${error.checkpointId}`, title: error.message, done: false }));
    const memos = this.state.memos.map((memo) => ({ kind: "memo" as const, id: memo.id, title: memoTitle(memo.text), done: memo.read }));
    return [...notices, ...errors, ...memos, ...result];
  }

  caseVariant(caseId: string) {
    const item = this.index.cases.get(caseId);
    if (!item) throw new Error(`Unknown case ${caseId}`);
    const variant = this.state.shiftNumber === 1 && !this.state.currentVariants[caseId] ? item.variants[0]! : variantFor(this.state, item);
    this.state.currentVariants[caseId] = variant.id;
    this.state.activeCaseId = caseId;
    this.state.progress[`case:${caseId}`] ??= { phase: "active", startedAt: this.currentShift().time };
    return variant;
  }

  adaptiveReason(caseId: string): string | undefined {
    return Object.values(this.state.adaptiveSelections).find((selection) => selection.caseId === caseId)?.reason;
  }

  revealHint(caseId: string, hintIndex: number): void {
    this.requireOpenConsole();
    const item = this.index.cases.get(caseId);
    const hint = item?.hints[hintIndex];
    if (!item || !hint) return;
    this.state.assistance[caseId] = strongestAssistance([this.state.assistance[caseId] ?? "None", hint.level]);
    this.state.revealedHints[caseId] = [...new Set([...(this.state.revealedHints[caseId] ?? []), hintIndex])];
    this.touch();
  }

  isHintRevealed(caseId: string, hintIndex: number): boolean { return this.state.revealedHints[caseId]?.includes(hintIndex) ?? false; }

  runQuery(
    caseId: string, language: QueryLanguage, expression: string, controls: QueryControls,
    replay = false, waiveClock = false, role?: string, authoredPrint?: PrintOptions,
  ): SavedArtifact {
    if (!replay) this.requireOpenConsole();
    const item = this.index.cases.get(caseId);
    if (!item) throw new Error(`Unknown case ${caseId}`);
    if (!item.languages.includes(language)) throw new Error(`${language} is not enabled for this case`);
    const variant = this.caseVariant(caseId);
    const execution = this.run(language, expression, buildQueryContext(this.index, variant.datasetId, controls, this.availableSources(caseId), variant.datasetTimeOffsetSeconds));
    const artifact: SavedArtifact = {
      id: `artifact.${this.state.nextArtifact}`, role, caseId, variantId: variant.id, language, expression, controls,
      execution, assistance: this.state.assistance[caseId] ?? "None", createdAt: new Date(controls.timestamp * 1000).toISOString(), filed: false,
      timestamp: controls.timestamp, start: controls.start, end: controls.end, sourceIds: execution.facts.lineage.sources,
      ...(authoredPrint ? { authoredPrint: { ...authoredPrint } } : {}),
    };
    if (!replay) {
      if (execution.ok && !waiveClock) chargeAction(this.index, this.state, "validQuery");
      this.state.nextArtifact += 1;
      this.state.artifacts.push(artifact);
      this.touch();
    }
    return artifact;
  }

  printArtifact(caseId: string, artifactId: string, options: PrintOptions): SavedArtifact {
    this.requireOpenConsole();
    const artifact = this.state.artifacts.find((candidate) => candidate.id === artifactId && candidate.caseId === caseId);
    if (!artifact) throw new Error("That result is missing or belongs to another case");
    if (artifact.filed) throw new Error("A filed artifact keeps the view it was printed with");
    const views = printableViews(artifact);
    if (!views.includes(options.visualization)) throw new Error(`A ${artifact.execution.ok ? artifact.execution.result.type : "failed"} result prints as ${views.join(" or ")}, not ${options.visualization}`);
    chargeAction(this.index, this.state, "printArtifact");
    artifact.print = { ...options };
    this.touch();
    return artifact;
  }

  trashPrintout(caseId: string, artifactId: string): SavedArtifact {
    this.requireOpenConsole();
    const artifact = this.state.artifacts.find((candidate) => candidate.id === artifactId && candidate.caseId === caseId);
    if (!artifact) throw new Error("That result is missing or belongs to another case");
    if (artifact.filed) throw new Error("Filed evidence cannot be trashed");
    if (!artifact.print) throw new Error("That result is not printed");
    delete artifact.print;
    this.touch();
    return artifact;
  }

  fileReport(caseId: string, artifactIds: string[], titleChoiceId: string, conclusionChoiceId: string, decisionChoiceId: string, visualization?: Visualization): FiledReport {
    this.requireOpenConsole();
    const item = this.index.cases.get(caseId);
    if (!item) throw new Error(`Unknown case ${caseId}`);
    if (this.state.completedCases.includes(caseId)) throw new Error("This case is already filed");
    if (new Set(artifactIds).size !== artifactIds.length) throw new Error("File each evidence artifact only once");
    if (artifactIds.length < item.report.minArtifacts || artifactIds.length > item.report.maxArtifacts) throw new Error(`File ${item.report.minArtifacts}–${item.report.maxArtifacts} evidence artifacts`);
    const artifacts = artifactIds.map((id) => this.state.artifacts.find((artifact) => artifact.id === id && artifact.caseId === caseId));
    if (artifacts.some((artifact) => !artifact)) throw new Error("A filed artifact is missing or belongs to another case");
    const evidenceArtifacts = artifacts as SavedArtifact[];
    if (evidenceArtifacts.some((artifact) => !artifact.print)) throw new Error("Print every pinned result before filing");
    const view = visualization ?? evidenceArtifacts[0]!.print!.visualization;
    if (!item.report.titles.some((choice) => choice.id === titleChoiceId) || !item.report.conclusions.some((choice) => choice.id === conclusionChoiceId) || !item.decisionChoices.some((choice) => choice.id === decisionChoiceId)) throw new Error("Invalid report choice");
    if (!item.report.visualizations.includes(view)) throw new Error("This report form does not allow that visualization");
    const variant = this.caseVariant(caseId);
    const attemptNumber = this.state.reports.filter((report) => report.caseId === caseId).length + 1;
    let next = cloneState(this.state);
    chargeAction(this.index, next, "fileReport");
    const assessment = technicalEvidence(this.index, this.run, next, item, evidenceArtifacts, titleChoiceId, conclusionChoiceId);
    const pendingWatch = Boolean(item.watchScenarioId);
    const filedAt = variant.evaluationTime ?? item.evaluationTime ?? this.currentShift().time;
    const starts = evidenceArtifacts.map((artifact) => artifact.start).filter((value): value is number => value !== undefined);
    const ends = evidenceArtifacts.map((artifact) => artifact.end).filter((value): value is number => value !== undefined);
    const provisional: FiledReport = {
      id: item.reportId, caseId, variantId: variant.id, artifactIds, titleChoiceId, conclusionChoiceId, decisionChoiceId, visualization: view,
      evidence: assessment.state, outcomeId: "", technicalExplanation: "", ministryResponse: "", filedAt,
      filedShiftId: next.currentShiftId, campaignTime: filedAt,
      evaluationStart: starts.length ? Math.min(...starts) : undefined, evaluationEnd: ends.length ? Math.max(...ends) : undefined,
      pendingWatch,
    };
    next.reports.push(provisional);
    next.assessments.push(...assessment.assessments);
    const resolved = outcomeFor(this.index, next, item, assessment.state, titleChoiceId, conclusionChoiceId, decisionChoiceId, !pendingWatch && assessment.state !== "error");
    const matched = resolved.outcome;
    const completesCase = pendingWatch || resolved.completesCase;
    if (!completesCase) provisional.id = `${item.reportId}.attempt.${attemptNumber}`;
    provisional.evidence = resolved.evidence;
    provisional.outcomeId = matched.id;
    provisional.technicalExplanation = pendingWatch ? "The filed query is awaiting its authored checkpoint horizon."
      : resolved.completesCase ? matched.technicalExplanation ?? `Filed evidence is ${assessment.state}.`
        : reportDiagnostic(this.index, item, assessment, evidenceArtifacts, titleChoiceId, conclusionChoiceId, decisionChoiceId, matched.technicalExplanation);
    provisional.ministryResponse = pendingWatch ? "The report is filed. Its standing-query result has not been assessed yet." : matched.ministryResponse;
    next.artifacts.forEach((artifact) => { if (artifactIds.includes(artifact.id)) { artifact.filed = true; artifact.evidence = resolved.evidence; } });
    if (completesCase) {
      next.completedCases.push(caseId);
      next.progress[`case:${caseId}`] = { phase: "completed", outcome: resolved.evidence === "supported" ? "succeeded" : "failed", completedAt: provisional.filedAt };
    } else {
      next.progress[`case:${caseId}`] = { ...next.progress[`case:${caseId}`], phase: "active", outcome: "failed" };
    }
    if (!pendingWatch) {
      next = applyEffects(this.index, next, matched.effects, `${item.title}: ${matched.ministryResponse}`);
      matched.consequenceIds?.forEach((id) => next.scheduled.push({ id: `scheduled.${caseId}.${id}`, targetKind: "consequence", targetId: id, dueShift: next.shiftNumber + (this.index.consequences.get(id)?.delayShifts ?? 0) }));
    }
    this.state = next;
    this.awardMastery(item, evidenceArtifacts, undefined, true, titleChoiceId, conclusionChoiceId);
    this.resolveRanksAndEndings();
    this.touch();
    return this.state.reports.find((report) => report.id === provisional.id)!;
  }

  reportPreview(caseId: string, artifactIds: string[]): {
    titles: Record<string, EvidenceState | "unknown">;
    conclusions: Record<string, EvidenceState | "unknown">;
    preferred: { titleChoiceIds: string[]; conclusionChoiceIds: string[]; decisionChoiceIds: string[]; standingDelta: number } | undefined;
  } {
    const item = this.index.cases.get(caseId);
    if (!item) throw new Error(`Unknown case ${caseId}`);
    const variant = variantFor(this.state, item);
    const artifacts = artifactIds.map((id) => this.state.artifacts.find((artifact) => artifact.id === id && artifact.caseId === caseId)).filter((artifact): artifact is SavedArtifact => Boolean(artifact));
    const matchingPaths = matchingReferencePaths(this.index, item, variant, artifacts, this.run);
    const partner = (choice: Choice, others: Choice[]) => others.find((other) => other.claims?.some((claim) => choice.claims?.includes(claim))) ?? others[0];
    const assess = (title?: string, conclusion?: string): EvidenceState | "unknown" =>
      artifacts.length ? assessCaseEvidence(item, variant, artifacts, title, conclusion, undefined, undefined, matchingPaths).state : "unknown";
    const raise = (outcome: CaseOutcome) => (outcome.effects ?? []).reduce((sum, effect) => sum + (effect.type === "change" && effect.target === "standing.value" ? effect.delta : 0), 0);
    const preferred = item.outcomes.filter((outcome) => raise(outcome) > 0).sort((left, right) => raise(right) - raise(left))[0];
    return {
      titles: Object.fromEntries(item.report.titles.map((choice) => [choice.id, assess(choice.id, partner(choice, item.report.conclusions)?.id)])),
      conclusions: Object.fromEntries(item.report.conclusions.map((choice) => [choice.id, assess(partner(choice, item.report.titles)?.id, choice.id)])),
      preferred: preferred && {
        titleChoiceIds: preferred.titleChoiceIds ?? [], conclusionChoiceIds: preferred.conclusionChoiceIds ?? [],
        decisionChoiceIds: preferred.decisionChoiceIds ?? [], standingDelta: raise(preferred),
      },
    };
  }

  private awardMastery(
    item: CampaignCase, artifacts: SavedArtifact[], watch?: WatchFacts, mainCampaign = true,
    titleChoiceId?: string, conclusionChoiceId?: string,
  ): void {
    const variant = variantFor(this.state, item);
    const filed = findLast(this.state.reports, (report) => report.caseId === item.id);
    for (const use of item.masteryUses) {
      const concept = this.index.concepts.get(use.conceptId);
      if (!concept || !concept.unitKinds.includes(use.unitKind)) continue;
      const { selected, assistance, behaviorPass, evidencePass, creditAwarded: detectorCredit } = assessMasteryUse(
        this.index, item, variant, use, artifacts, watch,
        titleChoiceId ?? filed?.titleChoiceId, conclusionChoiceId ?? filed?.conclusionChoiceId,
        matchesMasteryReference(this.index, item, variant, use, artifacts, this.run),
      );
      const prerequisitesMet = concept.prerequisites.every((id) => (this.state.mastery[id]?.state ?? "Unobserved") !== "Unobserved");
      const creditAwarded = detectorCredit && prerequisitesMet;
      this.state.attempts.push({
        id: `attempt.${item.id}.${concept.id}.${this.state.attempts.length + 1}`, caseId: item.id,
        state: selected.length > 0 && selected.every((artifact) => artifact.execution.ok) ? "successful" : "errored", assistance, unitKind: use.unitKind,
        artifactIds: selected.map((artifact) => artifact.id), conceptIds: [concept.id], behaviorPass, evidencePass,
        creditAwarded, dataShapeId: variant.dataShapeId, operationalQuestionId: item.operationalQuestionId, mainCampaign,
      });
      if (!creditAwarded) continue;
      const record = this.state.mastery[concept.id] ?? { state: "Unobserved" as const, credits: [] };
      const duplicate = record.credits.some((credit) => credit.caseId === item.id && credit.variantId === variant.id && credit.targetState === use.targetState);
      const targetState = !mainCampaign && use.targetState === "Certified" ? "Independent" : use.targetState;
      if (!duplicate) record.credits.push({ caseId: item.id, variantId: variant.id, dataShapeId: variant.dataShapeId, operationalQuestionId: item.operationalQuestionId, assistance, targetState, unitKind: use.unitKind, spacedRecall: use.spacedRecall ?? false, mainCampaign });
      recomputeMastery(record);
      this.state.mastery[concept.id] = record;
    }
  }

  saveWatch(caseId: string, artifactId: string): WatchRecord {
    this.requireOpenConsole();
    const item = this.index.cases.get(caseId);
    const report = this.state.reports.find((candidate) => candidate.caseId === caseId && candidate.artifactIds.includes(artifactId));
    const artifact = this.state.artifacts.find((candidate) => candidate.id === artifactId);
    if (!item?.watchScenarioId || !report || !artifact) throw new Error("Only eligible filed evidence can become a standing query");
    if (this.state.watches.filter((watch) => watch.state === "active").length >= this.state.watchCapacity) throw new Error("No standing-query capacity remains");
    const scenario = this.index.watchScenarios.get(item.watchScenarioId);
    if (!scenario) throw new Error("The standing-query scenario is missing");
    const timestamp = Date.parse(this.currentShift().time) / 1000;
    if (scenario.mode === "records" && (artifact.language !== "logql" || !scenario.lookbackSeconds || scenario.lookbackSeconds <= 0)) throw new Error("A record watch requires LogQL and a bounded lookback window");
    const probeControls: QueryControls = scenario.mode === "records"
      ? { timestamp, start: timestamp - scenario.lookbackSeconds!, end: timestamp, lookback: scenario.lookbackSeconds, direction: scenario.direction, limit: scenario.limit, visualization: artifact.controls.visualization }
      : { timestamp, visualization: artifact.controls.visualization };
    const variant = this.caseVariant(caseId);
    const probe = this.run(artifact.language, artifact.expression, buildQueryContext(this.index, variant.datasetId, probeControls, this.availableSources(caseId), variant.datasetTimeOffsetSeconds));
    const requiredType = scenario.mode === "records" ? "records" : "instant-vector";
    if (!probe.ok || probe.result.type !== requiredType) throw new Error(probe.ok ? `This standing query must return ${requiredType}` : probe.error.message);
    const next = cloneState(this.state);
    chargeAction(this.index, next, "saveWatch");
    const watch: WatchRecord = { id: `watch.${next.nextWatch++}`, caseId, scenarioId: item.watchScenarioId, artifactId, reportId: report.id, state: "active", seenRecordIds: [], executions: [] };
    next.watches.push(watch);
    this.state = next;
    this.touch();
    return watch;
  }

  retireWatch(watchId: string): void {
    this.requireOpenConsole();
    const next = cloneState(this.state);
    const watch = next.watches.find((item) => item.id === watchId && item.state === "active");
    if (!watch) throw new Error("That standing query is not active");
    chargeAction(this.index, next, "retireWatch");
    retireWatchRecord(next, watchId);
    this.state = next;
    this.touch();
  }

  replaceWatch(watchId: string, caseId: string, artifactId: string): WatchRecord {
    const before = cloneState(this.state);
    try { this.retireWatch(watchId); return this.saveWatch(caseId, artifactId); }
    catch (error) { this.state = before; throw error; }
  }

  readItem(id: string): void {
    const memo = this.state.memos.find((candidate) => candidate.id === id);
    if (memo) { memo.read = true; this.touch(); return; }
    this.requireOpenConsole();
    const item = this.index.narrativeItems.get(id);
    if (!item || this.state.readNarrative.includes(id)) return;
    this.state = applyEffects(this.index, this.state, item.effects, `Acknowledged: ${item.title}`);
    this.state.readNarrative.push(id);
    this.state.progress[`${item.kind}:${id}`] = { phase: "completed", outcome: "succeeded", completedAt: this.currentShift().time };
    this.resolveRanksAndEndings();
    this.touch();
  }

  shiftWorkComplete(): boolean {
    return this.inbox().filter((item) => item.kind !== "notice" && item.kind !== "watch-error" && item.kind !== "memo").every((item) => item.done);
  }

  clockExpired(): boolean {
    const remaining = this.clockRemaining();
    return remaining !== undefined && remaining <= 0;
  }

  canAdvance(): boolean { return this.shiftWorkComplete() || this.clockExpired(); }

  advanceShift(): void {
    this.requireOpenConsole();
    const workComplete = this.shiftWorkComplete();
    if (!workComplete && !this.clockExpired()) throw new Error("Complete the required case work and acknowledge official inbox items before ending the shift");
    for (const checkpoint of this.currentShift().watchCheckpoints ?? []) this.evaluateCheckpoint(checkpoint);
    const branch = this.currentShift().next.find((next) => evaluateCondition(this.index, this.state, next.condition));
    this.state.progress[`shift:${this.state.currentShiftId}`] = { ...this.state.progress[`shift:${this.state.currentShiftId}`], phase: "completed", outcome: workComplete ? "succeeded" : "failed", completedAt: this.currentShift().time };
    if (!branch) { this.runScheduled(this.state.shiftNumber + 1); this.resolveRanksAndEndings(); this.touch(); return; }
    this.state = applyEffects(this.index, this.state, branch.effects, `Shift closed: ${this.currentShift().title}`);
    this.state.shiftNumber = branch.shiftId === this.index.campaign.opening.shiftId ? 1 : this.state.shiftNumber + 1;
    this.enterShift(branch.shiftId, true);
    this.runScheduled();
    this.resolveRanksAndEndings();
    this.state.shiftStart = this.shiftSnapshot();
    this.touch();
  }

  private enterShift(shiftId: string, evaluateWatches: boolean): void {
    this.state.currentShiftId = shiftId;
    this.state.activeCaseId = undefined;
    this.state.clockUsed = 0;
    const shift = this.index.shifts.get(shiftId);
    if (!shift) throw new Error(`Unknown shift ${shiftId}`);
    this.state.progress[`shift:${shiftId}`] = { phase: "active", startedAt: shift.time };
    if (evaluateWatches) for (const checkpoint of shift.watchCheckpoints ?? []) this.evaluateCheckpoint(checkpoint);
  }

  private evaluateCheckpoint(checkpoint: WatchCheckpoint): void {
    this.executeDueSchedules(undefined, checkpoint.id);
    for (const watch of this.state.watches.filter((item) => item.state === "active")) {
      const scenario = this.index.watchScenarios.get(watch.scenarioId);
      const artifact = this.state.artifacts.find((item) => item.id === watch.artifactId);
      if (!scenario || !artifact || !scenario.checkpointIds.includes(checkpoint.id) || (checkpoint.scenarioIds?.length && !checkpoint.scenarioIds.includes(scenario.id)) || watch.executions.some((item) => item.checkpointId === checkpoint.id)) continue;
      if (checkpoint.execution !== "execute") {
        watch.lastCheckpointState = checkpoint.execution === "error" ? "errored" : "cancelled";
        watch.executions.push({ checkpointId: checkpoint.id, state: checkpoint.execution === "error" ? "errored" : "cancelled" });
        if (!this.state.watchErrors.some((item) => item.watchId === watch.id && item.checkpointId === checkpoint.id)) this.state.watchErrors.push({ watchId: watch.id, checkpointId: checkpoint.id, message: checkpoint.errorMessage ?? `Standing query ${checkpoint.execution}`, time: checkpoint.time });
        this.finishWatchHorizon(watch, scenario, checkpoint, artifact);
        continue;
      }
      const timestamp = Date.parse(checkpoint.time) / 1000;
      const controls: QueryControls = scenario.mode === "records"
        ? { timestamp, start: timestamp - (scenario.lookbackSeconds ?? 3600), end: timestamp, lookback: scenario.lookbackSeconds, direction: scenario.direction, limit: scenario.limit, visualization: artifact.controls.visualization }
        : { timestamp, visualization: artifact.controls.visualization };
      const availableSources = this.availableSources(watch.caseId);
      const execution = this.run(artifact.language, artifact.expression, buildQueryContext(this.index, checkpoint.datasetId, controls, availableSources));
      if (!execution.ok) {
        watch.lastCheckpointState = "errored";
        watch.executions.push({ checkpointId: checkpoint.id, state: "errored", cost: execution.facts.cost });
        if (!this.state.watchErrors.some((item) => item.watchId === watch.id && item.checkpointId === checkpoint.id)) this.state.watchErrors.push({ watchId: watch.id, checkpointId: checkpoint.id, message: execution.error.message, time: checkpoint.time });
        this.finishWatchHorizon(watch, scenario, checkpoint, artifact);
        continue;
      }
      const activeKeys = new Set<string>();
      if (execution.result.type === "instant-vector") {
        for (const series of execution.result.series) {
          const key = `${watch.id}:metric:${sortedLabels(series.labels)}`;
          activeKeys.add(key);
          const events = this.metricCandidateEvents(scenario.id, checkpoint.datasetId, execution, series.labels);
          this.addNotice(watch, key, key, events, series.labels, checkpoint.time, `${artifact.expression} returned ${String(series.value)}`);
        }
      } else if (execution.result.type === "records") {
        const localEvents = new Set(scenario.events.map((event) => event.id));
        for (const stream of execution.result.streams) for (const record of stream.records) {
          const sourceIds = new Set([record.id, stream.streamId, record.sourceId].filter((id): id is string => Boolean(id)));
          const events = [...new Set([
            ...(record.eventIds ?? []).filter((id) => localEvents.has(id)),
            ...scenario.attributions.filter((item) => sourceIds.has(item.sourceId)).flatMap((item) => item.eventIds),
          ])];
          const keyIds = events.length ? events : [record.id];
          for (const keyId of keyIds) activeKeys.add(`${watch.id}:log:${keyId}`);
          if (watch.seenRecordIds.includes(record.id)) continue;
          watch.seenRecordIds.push(record.id);
          for (const keyId of keyIds) this.addNotice(watch, `${watch.id}:log:${keyId}`, record.id, events, { ...stream.labels, ...record.fields }, checkpoint.time, record.displayLine);
        }
      }
      for (const notice of this.state.notices.filter((item) => item.watchId === watch.id && item.state === "open")) {
        if (activeKeys.has(notice.key)) notice.absentEvaluations = 0;
        else if (++notice.absentEvaluations >= scenario.resolveAfter) { notice.state = "resolved"; notice.resolvedAt = checkpoint.time; }
      }
      watch.lastSuccessfulCheckpointId = checkpoint.id;
      watch.lastCheckpointState = "successful";
      watch.executions.push({ checkpointId: checkpoint.id, state: "successful", cost: execution.facts.cost });
      this.finishWatchHorizon(watch, scenario, checkpoint, artifact);
    }
    this.finalizePendingWatchReports(checkpoint.id);
  }

  private finishWatchHorizon(watch: WatchRecord, scenario: CampaignIndex["campaign"]["watchScenarios"][number], checkpoint: WatchCheckpoint, artifact: SavedArtifact): void {
    if (checkpoint.id !== scenario.checkpointIds.at(-1)) return;
    watch.scores = this.scoreWatch(watch);
    const item = this.index.cases.get(watch.caseId);
    if (item) this.awardMastery(item, [artifact], watch.scores);
  }

  private finalizePendingWatchReports(checkpointId: string): void {
    const pendingIds = this.state.reports.filter((report) => report.pendingWatch).map((report) => report.id);
    for (const reportId of pendingIds) {
      const report = this.state.reports.find((candidate) => candidate.id === reportId);
      const item = report ? this.index.cases.get(report.caseId) : undefined;
      const scenario = item?.watchScenarioId ? this.index.watchScenarios.get(item.watchScenarioId) : undefined;
      if (!report || !item || !scenario || scenario.checkpointIds.at(-1) !== checkpointId) continue;
      const watch = this.state.watches.find((candidate) => candidate.reportId === report.id && candidate.scores);
      const artifacts = report.artifactIds.map((id) => this.state.artifacts.find((artifact) => artifact.id === id)).filter((artifact): artifact is SavedArtifact => Boolean(artifact));
      const assessedArtifacts = watch ? artifacts.map((artifact) => ({
        ...artifact,
        role: artifact.id === watch.artifactId ? "watch-expression" : artifact.role === "watch-expression" ? undefined : artifact.role,
      })) : artifacts;
      const variant = item.variants.find((candidate) => candidate.id === report.variantId) ?? item.variants[0]!;
      const assessed = assessCaseEvidence(
        item, variant, assessedArtifacts, report.titleChoiceId, report.conclusionChoiceId, watch?.scores, scenario.thresholds,
        matchingReferencePaths(this.index, item, variant, assessedArtifacts, this.run),
      );
      const assessment = watch ? assessed : { state: "unsupported" as const, assessments: assessed.assessments.map((candidate) => ({ ...candidate, state: "unsupported" as const })) };
      let next = cloneState(this.state);
      const nextReport = next.reports.find((candidate) => candidate.id === report.id)!;
      const resolved = outcomeFor(this.index, next, item, assessment.state, report.titleChoiceId, report.conclusionChoiceId, report.decisionChoiceId, Boolean(watch) && assessment.state !== "error");
      const matched = resolved.outcome;
      nextReport.evidence = resolved.evidence;
      nextReport.outcomeId = matched.id;
      nextReport.technicalExplanation = matched.technicalExplanation ?? `Filed evidence is ${assessment.state}.`;
      nextReport.ministryResponse = matched.ministryResponse;
      nextReport.pendingWatch = false;
      for (const candidate of assessment.assessments) {
        const position = next.assessments.findIndex((existing) => existing.id === candidate.id);
        if (position >= 0) next.assessments[position] = candidate; else next.assessments.push(candidate);
      }
      next.artifacts.forEach((artifact) => { if (report.artifactIds.includes(artifact.id)) artifact.evidence = resolved.evidence; });
      next.progress[`case:${item.id}`] = { ...next.progress[`case:${item.id}`], phase: "completed", outcome: resolved.evidence === "supported" ? "succeeded" : "failed" };
      next = applyEffects(this.index, next, matched.effects, `${item.title}: ${matched.ministryResponse}`);
      matched.consequenceIds?.forEach((id) => next.scheduled.push({ id: `scheduled.${item.id}.${id}`, targetKind: "consequence", targetId: id, dueShift: next.shiftNumber + (this.index.consequences.get(id)?.delayShifts ?? 0) }));
      this.state = next;
    }
    this.resolveRanksAndEndings();
  }

  private metricCandidateEvents(scenarioId: string, datasetId: string, execution: Extract<QueryExecution, { ok: true }>, labels: Record<string, string>): string[] {
    const scenario = this.index.watchScenarios.get(scenarioId);
    const dataset = this.index.datasets.get(datasetId);
    if (!scenario || !dataset) return [];
    const lineage = new Set(execution.facts.lineage.metricSeries);
    const sources = dataset.series.filter((series) => lineage.has(series.id) && Object.entries(labels).every(([key, value]) => key === "__name__" ? series.metric === value : series.labels[key] === value));
    const localEvents = new Set(scenario.events.map((event) => event.id));
    return [...new Set(sources.flatMap((series) => [
      ...(series.eventIds ?? []),
      ...scenario.attributions.filter((item) => item.sourceId === series.id).flatMap((item) => item.eventIds),
    ]).filter((id) => localEvents.has(id)))];
  }

  private addNotice(watch: WatchRecord, key: string, candidateId: string, eventIds: string[], localization: Record<string, Scalar>, time: string, summary: string): void {
    let notice = this.state.notices.find((item) => item.key === key && item.state === "open");
    if (!notice) {
      const prior = this.state.notices.filter((item) => item.key === key);
      notice = { id: `notice.${this.state.nextNotice++}`, watchId: watch.id, key, generation: prior.length + 1, state: "open", occurrenceCount: 0, candidateCount: 0, eventIds: [], localization: {}, firstSeen: time, lastSeen: time, absentEvaluations: 0, summary, memberIds: [] };
      this.state.notices.push(notice);
    }
    notice.occurrenceCount += 1;
    if (!notice.memberIds.includes(candidateId)) {
      notice.memberIds.push(candidateId);
      notice.candidateCount += 1;
    }
    notice.lastSeen = time;
    notice.eventIds = [...new Set([...notice.eventIds, ...eventIds])];
    notice.localization = { ...notice.localization, ...localization };
  }

  private scoreWatch(watch: WatchRecord): WatchFacts {
    const scenario = this.index.watchScenarios.get(watch.scenarioId)!;
    const notices = this.state.notices.filter((notice) => notice.watchId === watch.id);
    const intended = scenario.events.filter((event) => event.relevance === "intended");
    const distractors = scenario.events.filter((event) => event.relevance === "distractor");
    const detected = (eventId: string) => notices.some((notice) => notice.eventIds.includes(eventId));
    const localized = intended.filter((event) => notices.some((notice) => notice.eventIds.includes(event.id) && Object.entries(event.localization ?? {}).every(([key, value]) => notice.localization[key] === value))).length;
    const timely = intended.filter((event) => notices.some((notice) => notice.eventIds.includes(event.id) && (!event.detectionStart || campaignTime(notice.firstSeen) >= campaignTime(event.detectionStart)) && (!event.detectionEnd || campaignTime(notice.firstSeen) < campaignTime(event.detectionEnd)))).length;
    const unattributed = notices.filter((notice) => !notice.eventIds.length).length;
    const distractorHits = distractors.filter((event) => detected(event.id)).length;
    const cost = watch.executions.filter((item) => item.state === "successful" && item.cost).reduce((sum, item) => ({
      seriesScanned: sum.seriesScanned + item.cost!.seriesScanned,
      samplesScanned: sum.samplesScanned + item.cost!.samplesScanned,
      streamsScanned: sum.streamsScanned + item.cost!.streamsScanned,
      recordsScanned: sum.recordsScanned + item.cost!.recordsScanned,
      scannedBytes: sum.scannedBytes + item.cost!.scannedBytes,
      returned: sum.returned + item.cost!.returned,
    }), { seriesScanned: 0, samplesScanned: 0, streamsScanned: 0, recordsScanned: 0, scannedBytes: 0, returned: 0 });
    const ratio = (budget: number, measured: number) => measured === 0 ? 1 : budget / measured;
    const ratios = [
      ratio(scenario.costBudgets.selectedSeries, cost.seriesScanned), ratio(scenario.costBudgets.scannedSamples, cost.samplesScanned),
      ratio(scenario.costBudgets.scannedRecords, cost.recordsScanned), ratio(scenario.costBudgets.scannedBytes, cost.scannedBytes),
      ratio(scenario.costBudgets.returnedItems, cost.returned),
    ];
    const candidateUnits = new Set(notices.flatMap((notice) => notice.eventIds.length ? notice.eventIds : [notice.key]));
    const checkpoints = new Map(this.index.campaign.shifts.flatMap((shift) => shift.watchCheckpoints ?? []).map((checkpoint) => [checkpoint.id, checkpoint]));
    return {
      checkpointSuccess: scenario.checkpointIds.every((id) => {
        const checkpoint = checkpoints.get(id);
        const execution = watch.executions.find((candidate) => candidate.checkpointId === id);
        if (!checkpoint || !execution) return false;
        if (checkpoint.execution === "execute") return execution.state === "successful";
        return execution.state === (checkpoint.execution === "error" ? "errored" : "cancelled");
      }),
      coverage: intended.filter((event) => detected(event.id)).length / Math.max(intended.length, 1),
      specificity: (distractors.length - distractorHits) / Math.max(distractors.length + unattributed, 1),
      localization: localized / Math.max(intended.length, 1), timeliness: timely / Math.max(intended.length, 1),
      cost: Math.min(1, ...ratios), candidateCount: candidateUnits.size, noticeLifecycle: "complete",
    };
  }

  simulateReferenceWatch(caseId: string, artifact: SavedArtifact): WatchFacts {
    const item = this.index.cases.get(caseId);
    const scenario = item?.watchScenarioId ? this.index.watchScenarios.get(item.watchScenarioId) : undefined;
    if (!item || !scenario) throw new Error("Reference watch requires a declared watch scenario");
    const original = this.state;
    try {
      this.state = structuredClone(original);
      const stored = { ...artifact, id: "artifact.reference-watch", caseId, filed: true };
      this.state.artifacts = [stored];
      this.state.watches = [{
        id: "watch.reference", caseId, scenarioId: scenario.id, artifactId: stored.id, reportId: item.reportId,
        state: "active", seenRecordIds: [], executions: [],
      }];
      for (const checkpointId of scenario.checkpointIds) {
        const checkpoint = this.index.campaign.shifts.flatMap((shift) => shift.watchCheckpoints ?? []).find((candidate) => candidate.id === checkpointId);
        if (!checkpoint) throw new Error(`Missing watch checkpoint ${checkpointId}`);
        this.evaluateCheckpoint(checkpoint);
      }
      const watch = this.state.watches[0];
      if (!watch?.scores) throw new Error("Reference watch horizon did not produce scores");
      return watch.scores;
    } finally {
      this.state = original;
    }
  }

  private executeDueSchedules(atTimestamp?: string, atCheckpointId?: string, throughShift = this.state.shiftNumber): void {
    const due = this.state.scheduled.filter((item) => !item.cancelled && (
      (item.dueShift !== undefined && item.dueShift <= throughShift)
      || (atTimestamp !== undefined && item.atTimestamp !== undefined && campaignTime(item.atTimestamp) <= campaignTime(atTimestamp))
      || (atCheckpointId !== undefined && item.atCheckpointId === atCheckpointId)
    )).map((item) => item.id);
    for (const id of due) {
      const scheduled = this.state.scheduled.find((item) => item.id === id && !item.cancelled);
      if (!scheduled) continue;
      if (scheduled.targetKind === "data-variant") {
        const owner = this.index.campaign.cases.find((item) => item.variants.some((variant) => variant.id === scheduled.targetId));
        if (owner) this.state.currentVariants[owner.id] = scheduled.targetId;
      } else {
        const consequence = this.index.consequences.get(scheduled.targetId);
        if (consequence) this.runConsequence(consequence);
      }
      const current = this.state.scheduled.find((item) => item.id === id);
      if (current) current.cancelled = true;
    }
  }

  private runScheduled(throughShift = this.state.shiftNumber): void {
    this.executeDueSchedules(this.currentShift().time, undefined, throughShift);
    for (const consequence of this.index.campaign.consequences) if (!consequence.delayShifts) this.runConsequence(consequence);
  }

  private resolveRanksAndEndings(): void {
    const ending = (this.state.endingId ? this.index.endings.get(this.state.endingId) : undefined)
      ?? [...this.index.endings.values()].filter((item) => evaluateCondition(this.index, this.state, item.condition)).sort((a, b) => b.priority - a.priority)[0];
    if (ending) {
      this.state.endingId = ending.id;
      if (!this.state.memos.some((memo) => memo.endingId === ending.id)) {
        this.pushMemo(ending.body, ending.id === "ending.assurance-custody" ? "Well-being Assurance" : "The Ministry", { endingId: ending.id });
      }
    }
    const current = this.index.ranks.get(this.state.rankId);
    const next = current && [...this.index.ranks.values()].find((rank) => rank.order === current.order + 1);
    if (!next || !evaluateCondition(this.index, this.state, next.condition)) return;
    if (!next.requiresWinningEnding || (ending?.winning ?? false)) setRank(this.index, this.state, next.id);
  }

  archiveReports(): FiledReport[] { return [...this.state.reports].reverse(); }
  replayQuery(reportId: string, artifactId: string, expression: string): SavedArtifact {
    const report = this.state.reports.find((item) => item.id === reportId);
    const original = this.state.artifacts.find((item) => item.id === artifactId && report?.artifactIds.includes(item.id));
    if (!report || !original) throw new Error("Archived evidence not found");
    const replay = this.runQuery(report.caseId, original.language, expression, original.controls, true);
    replay.id = `replay.${original.id}.${this.state.attempts.length + 1}`;
    replay.replayOfId = original.id;
    if (replay.execution.ok) this.awardMastery(this.index.cases.get(report.caseId)!, [replay], undefined, false);
    this.touch();
    return replay;
  }

  serialize(): string { return JSON.stringify(this.state); }
  private touch(): void { this.state.updatedAt = now(); }
}

export const saveKey = (campaignId: string) => `ministry-of-contentment:${campaignId}:save-v1`;

export function loadStoredState(index: CampaignIndex, storage: Pick<Storage, "getItem"> = localStorage): GameState | undefined {
  const value = storage.getItem(saveKey(index.campaign.id));
  if (!value) return undefined;
  try { const state = JSON.parse(value) as GameState; return state.version === 1 && state.campaignId === index.campaign.id ? state : undefined; }
  catch { return undefined; }
}

export function storeState(index: CampaignIndex, state: GameState, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(saveKey(index.campaign.id), JSON.stringify(state));
}

export function clearStoredState(index: CampaignIndex, storage: Pick<Storage, "removeItem"> = localStorage): void {
  storage.removeItem(saveKey(index.campaign.id));
}
