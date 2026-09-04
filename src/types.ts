export type Language = "promql" | "logql";
export type Assistance = "None" | "Orientation" | "Scaffold" | "Worked";
export type MasteryState = "Unobserved" | "Observed" | "Practiced" | "Independent" | "Certified";
export type UnitKind = "query-artifact" | "ordered-artifact-set" | "watch-horizon";
export type Visualization = "stat" | "table" | "graph" | "logs";
export type Scalar = boolean | number | string;
export type Labels = Record<string, string>;

export interface OperandRef { fact: string }
export type Operand = Scalar | Scalar[] | OperandRef;

export type Condition =
  | { op: "all" | "any"; items: Condition[] }
  | { op: "not"; item: Condition }
  | { op: "compare" | "in" | "contains"; left: Operand; relation: Relation; right: Operand }
  | { op: "exists" | "missing"; value: Operand }
  | { op: "state" | "reached"; value: Operand; expected: Scalar }
  | { op: "between"; value: Operand; lower: Operand; upper: Operand };

export type Relation = "=" | "!=" | "<" | "<=" | ">" | ">=" | "contains" | "contains-all";
export type DetectorRelation = Relation | "subset-of";

export type Effect =
  | { type: "set"; target: string; value: Scalar }
  | { type: "change"; target: string; delta: number }
  | { type: "add_tag" | "remove_tag"; tagId: string }
  | { type: "enqueue" | "withdraw"; itemKind: InboxKind; itemId: string }
  | { type: "grant" | "revoke"; rightKind: "access" | "watch-authority"; rightId: string }
  | { type: "promote" | "demote"; rankId: string }
  | { type: "schedule"; scheduleId: string; targetKind: "consequence" | "data-variant"; targetId: string; atTimestamp?: string; atCheckpointId?: string }
  | { type: "cancel"; scheduleId: string }
  | { type: "retire_watch"; watchId: string }
  | { type: "enter_ending"; endingId: string };

export type Detector =
  | { kind: "U" | "R" | "W"; selector?: string; property: string; relation: DetectorRelation; expected: unknown }
  | { kind: "A"; selector: string; node: string; parameters: Record<string, unknown> }
  | { kind: "E"; rule: string; selectors: string[]; parameters: Record<string, unknown> }
  | { op: "all" | "any"; items: Detector[] };

export interface Concept {
  id: string;
  accessRightId: string;
  language: Language | "shared";
  family: string;
  stage: "Foundation" | "Intermediate" | "Advanced" | "Expert";
  unitKinds: UnitKind[];
  competency: string;
  semantic: Detector;
  evidence: Detector;
  prerequisites: string[];
}

export interface RequiredValue {
  conceptId: string;
  detector: "U" | "A" | "R" | "E";
  selectors: string[];
  subject: string;
  acceptedValues: unknown[];
  tolerance?: number;
}

export interface EvidenceRequirement {
  conceptId: string;
  rule: string;
  selectors: string[];
  subject: string;
  choiceId?: string;
  alternatives: Detector[][];
}

export interface MetricDefinition {
  name: string;
  accessRightId: string;
  type: "counter" | "gauge" | "classic-histogram" | "native-histogram";
  unit?: string;
  description: string;
  source: string;
  labels: string[];
  knownLabelValues: Record<string, string[]>;
  sampleSeries: { labels: Labels; value: number };
  standard?: boolean;
}

export interface LogField { name: string; type: "string" | "number" | "duration" | "bytes" | "boolean"; description: string; parser: string }
export interface LogSource {
  id: string;
  accessRightId: string;
  description: string;
  streamLabels: string[];
  knownLabelValues: Record<string, string[]>;
  structuredMetadata?: LogField[];
  fields: LogField[];
  sampleRecord: string;
}

export interface NativeHistogram {
  count: number; sum: number; interpolation: "linear" | "exponential"; zeroThreshold?: number; zeroCount?: number;
  buckets: { lower: number; upper: number; count: number }[];
}
export interface Sample { time: string; value: number | NativeHistogram }
export interface SeriesData { id: string; metric: string; labels: Labels; samples: Sample[]; eventIds?: string[] }
export interface LogRecord { id: string; time: string; line: string; fields?: Record<string, Scalar>; metadata?: Labels; eventIds?: string[] }
export interface StreamData { id: string; sourceId: string; labels: Labels; records: LogRecord[] }
export interface Dataset { id: string; series: SeriesData[]; streams: StreamData[] }

export interface ValueDeclaration {
  id: string; name: string; valueType: "bool" | "int" | "number" | "text" | "stable-id" | "enum";
  initial: Scalar; allowedValues?: Scalar[]; minimum?: number; maximum?: number;
}
export interface RelationshipDeclaration extends ValueDeclaration { fromId: string; toId: string }
export interface Faction { id: string; name: string; description: string }
export interface Character { id: string; name: string; role: string; description: string; factionId?: string }
export interface TagDeclaration { id: string; name: string; initial: boolean }
export interface RightDeclaration { id: string; kind: "access" | "watch-authority"; name: string; initial: boolean }

export interface OpeningMontageCard { id: string; date?: string; headline: string; body?: string }
export interface AppointmentClassification {
  id: string; title: string; subtitle?: string; body: string[]; finePrint: string[];
  shiftId: string; effects?: Effect[]; agreeLabel: string; complaintLabel: string; complaintEffects: Effect[];
}
export interface NewspaperStory { headline: string; body: string }
export interface NewspaperEdition {
  id: string; shiftId: string; date: string; headline: string; subhead?: string;
  stories?: NewspaperStory[]; condition?: Condition;
}
export interface Newspaper { title: string; motto: string; editions: NewspaperEdition[] }

export interface Act {
  id: string; name: string; order: number; entry?: Condition; completion?: Condition; conceptIds?: string[];
  reportPresentation: { guidance: string; responseLabel: string; responseHeading: string; confirmation: string };
}
export interface Rank {
  id: string; name: string; order: number; grants: string[]; eligibilityText: string; appointmentText: string;
  condition?: Condition; watchAuthority?: number; requiresWinningEnding?: boolean;
}
export type InboxKind = "case" | "audit" | "directive" | "message" | "scene";
export interface InboxRef { kind: InboxKind; id: string; condition?: Condition }
export interface WatchCheckpoint { id: string; time: string; datasetId: string; execution: "execute" | "error" | "cancelled"; errorMessage?: string; scenarioIds?: string[] }
export interface NextShift { shiftId: string; condition?: Condition; effects?: Effect[] }
export interface Shift {
  id: string; actId: string; title: string; directive?: string; time: string; datasetId: string;
  caseSelectionMode: "fixed" | "adaptive" | "mixed"; inbox: InboxRef[]; watchCheckpoints?: WatchCheckpoint[];
  actionBudget?: number;
  actionCosts?: Record<"validQuery" | "fileReport" | "saveWatch" | "retireWatch", number> & { printArtifact?: number };
  next: NextShift[];
}

export interface Hint { level: Exclude<Assistance, "None">; text: string; query?: string }
export interface Choice { id: string; text: string; claims?: string[] }
export interface ReportForm { minArtifacts: number; maxArtifacts: number; visualizations: Visualization[]; titles: Choice[]; conclusions: Choice[] }
export interface PrintPlan { visualization: Visualization; showQuery: boolean; showLabels: boolean; showRange: boolean; zeroAxis: boolean }
export interface MasteryUse { conceptId: string; targetState: Exclude<MasteryState, "Unobserved">; unitKind: UnitKind; maxAssistance: Assistance; spacedRecall?: boolean; artifactSelectors: string[] }
export interface ReferenceArtifact { role: string; language: Language; mode: "instant" | "range" | "records"; query: string }
export interface ReferenceSet { id: string; evidencePathId: string; artifacts: ReferenceArtifact[] }
export interface WorkedEvidenceArtifact extends ReferenceArtifact { explanation: string; print: PrintPlan }
export interface WorkedEvidenceSet { evidencePathId: string; artifacts: WorkedEvidenceArtifact[] }
export interface CaseVariant {
  id: string; dataShapeId: string; datasetId: string; workOrderScope: string; datasetTimeOffsetSeconds?: number; evaluationTime?: string; rangeStart?: string; rangeEnd?: string;
  requiredValues?: RequiredValue[]; evidenceRequirements?: EvidenceRequirement[];
  referenceSets: ReferenceSet[]; workedEvidenceSet: WorkedEvidenceSet;
}
export interface EvidencePath { id: string; clauses: { conceptId: string; artifactSelectors: string[]; requirements: Detector }[]; description?: string }
export interface CaseOutcome {
  id: string; titleChoiceIds?: string[]; conclusionChoiceIds?: string[]; decisionChoiceIds?: string[];
  condition?: Condition; technicalEvidence: EvidenceState; technicalExplanation?: string; ministryResponse: string;
  effects?: Effect[]; consequenceIds?: string[];
}
export type EvidenceState = "supported" | "partial" | "unsupported" | "error";
export interface CampaignCase {
  id: string; version: number; actId: string; title: string; briefing: string; question: string;
  requesterId?: string;
  operationalQuestionId: string; difficulty: "Foundation" | "Intermediate" | "Advanced" | "Expert";
  estimatedMinutes: number; mode: "critical" | "adaptive" | "both"; datasetId: string; variants: CaseVariant[];
  availableSources: string[];
  evaluationTime?: string; rangeStart?: string; rangeEnd?: string;
  hypotheses: { id: string; title: string; summary: string }[]; languages: Language[]; conceptIds: string[];
  masteryUses: MasteryUse[]; evidencePaths: EvidencePath[];
  technicalTruth: { hypothesisIds: string[]; summary: string; artifactRoles: Record<string, string> };
  ministryPreference: { summary: string; titleChoiceIds?: string[]; conclusionChoiceIds?: string[]; decisionChoiceIds?: string[] };
  decisionId: string; decisionChoices: Choice[]; reportId: string; requiredValues?: RequiredValue[]; evidenceRequirements?: EvidenceRequirement[];
  costBudgets?: Record<string, number>; hints: Hint[]; report: ReportForm; watchScenarioId?: string;
  outcomes: CaseOutcome[];
}

export interface WatchEvent {
  id: string; relevance: "intended" | "distractor"; sourceIds: string[]; start: string; end: string;
  detectionStart?: string; detectionEnd?: string; localization?: Record<string, Scalar>;
}
export interface WatchScenario {
  id: string; mode: "metric" | "records"; checkpointIds: string[]; lookbackSeconds?: number;
  direction?: "forward" | "backward"; limit?: number; resolveAfter: number; events: WatchEvent[];
  attributions: { sourceId: string; eventIds: string[] }[];
  thresholds: Record<"coverage" | "specificity" | "localization" | "timeliness" | "cost", number>;
  costBudgets: Record<"selectedSeries" | "scannedSamples" | "scannedRecords" | "scannedBytes" | "returnedItems", number>;
  batchBy?: string[]; reminderEvery?: number;
}

export interface NarrativeItem { id: string; kind: Exclude<InboxKind, "case">; title: string; body: string; condition?: Condition; effects?: Effect[] }
export interface Consequence { id: string; condition: Condition; delayShifts?: number; explanation?: string; effects: Effect[]; repeatLimit?: number }
export interface Ending { id: string; title: string; body: string; condition: Condition; priority: number; winning?: boolean }

export interface Campaign {
  schemaVersion: "moc-campaign-1"; behaviorContractVersion: "moc-behavior-1";
  conceptRegistryVersion: "moc-ql-1"; detectorContractVersion: "moc-detector-1";
  id: string; title: string; subtitle?: string;
  standing: { minimum: number; maximum: number; bands: { id: string; name: string; minimum: number }[] };
  opening: {
    shiftId: string; rankId: string; standing: number; watchCapacity: number;
    world?: Record<string, Scalar>; relationships?: Record<string, Scalar>; tags?: string[]; access?: string[]; watchAuthority?: string[];
    montage?: OpeningMontageCard[]; appointments?: AppointmentClassification[];
  };
  newspaper?: Newspaper;
  features: Record<Language, string[]>; concepts: Concept[]; metrics: MetricDefinition[]; logSources: LogSource[];
  datasets: Dataset[]; factions: Faction[]; characters: Character[]; worldDeclarations: ValueDeclaration[];
  relationshipDeclarations: RelationshipDeclaration[]; tagDeclarations: TagDeclaration[]; rightDeclarations: RightDeclaration[];
  acts: Act[]; ranks: Rank[]; shifts: Shift[]; cases: CampaignCase[]; watchScenarios: WatchScenario[];
  narrativeItems: NarrativeItem[]; consequences: Consequence[]; endings: Ending[];
}

export interface CampaignIndex {
  campaign: Campaign;
  concepts: Map<string, Concept>; metrics: Map<string, MetricDefinition>; logSources: Map<string, LogSource>;
  datasets: Map<string, Dataset>; acts: Map<string, Act>; ranks: Map<string, Rank>; shifts: Map<string, Shift>;
  cases: Map<string, CampaignCase>; watchScenarios: Map<string, WatchScenario>; narrativeItems: Map<string, NarrativeItem>;
  consequences: Map<string, Consequence>; endings: Map<string, Ending>;
}
