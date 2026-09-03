export type QueryLanguage = "promql" | "logql";

export type Labels = Record<string, string>;

export type HistogramBucket = {
  lower: number;
  upper: number;
  count: number;
  lowerBound?: never;
  upperBound?: never;
} | {
  lowerBound: number;
  upperBound: number;
  count: number;
  lower?: never;
  upper?: never;
};

export interface HistogramValue {
  kind?: "histogram";
  count: number;
  sum: number;
  buckets: HistogramBucket[];
  interpolation: "linear" | "exponential";
  zeroThreshold?: number;
  zeroCount?: number;
  /** Accepted for adapters that explicitly mark native buckets non-cumulative. */
  cumulative?: false;
}

export type SampleValue = number | HistogramValue;

export interface MetricSample {
  timestamp: number;
  value: SampleValue;
  eventIds?: string[];
}

export interface MetricSeries {
  id?: string;
  metric: string;
  labels: Labels;
  type?: "counter" | "gauge" | "classic-histogram" | "native-histogram";
  unit?: string;
  source?: string;
  samples: MetricSample[];
}

export interface LogRecord {
  id: string;
  timestamp: number;
  line: string;
  metadata?: Labels;
  eventIds?: string[];
}

export interface LogStream {
  id?: string;
  labels: Labels;
  source?: string;
  records: LogRecord[];
}

export interface QueryContext {
  timestamp: number;
  start?: number;
  end?: number;
  step?: number;
  lookback?: number;
  direction?: "forward" | "backward";
  limit?: number;
  metrics?: MetricSeries[];
  logs?: LogStream[];
}

export interface ScalarResult {
  type: "scalar";
  timestamp: number;
  value: number;
}

export interface VectorPoint {
  labels: Labels;
  timestamp: number;
  value: SampleValue;
  unit?: string;
}

export interface InstantVectorResult {
  type: "instant-vector";
  series: VectorPoint[];
}

export interface MatrixSeries {
  labels: Labels;
  values: Array<{ timestamp: number; value: SampleValue }>;
  unit?: string;
}

export interface RangeVectorResult {
  type: "range-vector";
  series: MatrixSeries[];
}

export interface ResultRecord extends LogRecord {
  labels: Labels;
  fields: Record<string, string | number>;
  fieldOrigins: Record<string, "indexed-label" | "structured-metadata" | "extracted-field">;
  displayLine: string;
  error?: string;
  streamId: string;
  sourceId?: string;
}

export interface RecordStreamResult {
  streamId: string;
  labels: Labels;
  records: ResultRecord[];
}

export interface RecordsResult {
  type: "records";
  direction: "forward" | "backward";
  streams: RecordStreamResult[];
}

export type QueryValue = ScalarResult | InstantVectorResult | RangeVectorResult | RecordsResult;

export type SemanticNode =
  | { kind: "metric-selector"; metric?: string; matchers: MatcherFact[]; metricType?: MetricSeries["type"] }
  | { kind: "stream-selector"; matchers: MatcherFact[] }
  | { kind: "range-selector"; seconds: number; resolution?: number }
  | { kind: "function" | "range-function"; name: string; inputKind?: string }
  | { kind: "aggregation"; operator: string; grouping: "none" | "by" | "without"; labels: string[] }
  | { kind: "binary"; operator: string; bool: boolean }
  | { kind: "set-operator"; operator: "and" | "or" | "unless" }
  | { kind: "vector-match"; matching: "default" | "on" | "ignoring"; labels: string[]; cardinality: "one-to-one" | "many-to-one" | "one-to-many"; include: string[] }
  | { kind: "time-modifier"; modifier: "offset" | "at"; value: number | string }
  | { kind: "offset"; seconds: number }
  | { kind: "group-modifier"; side: "left" | "right"; cardinality: "many-to-one" | "one-to-many"; include: string[] }
  | { kind: "subquery"; range: number; resolution?: number }
  | { kind: "line-filter"; operator: string }
  | { kind: "parser"; parser: "json" | "logfmt" | "pattern" | "regexp" }
  | { kind: "label-filter"; label: string; operator: string; valueType: "string" | "number" | "duration" | "bytes" }
  | { kind: "unwrap"; field: string; conversion: "number" | "duration" | "bytes" }
  | { kind: "formatter"; formatter: "line_format" | "label_format" }
  | { kind: "drop"; labels: string[] }
  | { kind: "pipeline-order"; stages: string[]; expected?: "filter-before-parser" | "parser-before-filter" };

export interface MatcherFact {
  label: string;
  operator: "=" | "!=" | "=~" | "!~";
  value: string;
}

export interface QueryCost {
  seriesScanned: number;
  samplesScanned: number;
  streamsScanned: number;
  recordsScanned: number;
  scannedBytes: number;
  returned: number;
}

export interface QueryLineage {
  metricSeries: string[];
  metricSamples: Array<{ seriesId: string; timestamp: number }>;
  logStreams: string[];
  records: string[];
  sources: string[];
  events: string[];
  operands: Array<{ operator: string; left: string[]; right: string[] }>;
  fieldOrigins: Record<string, Array<"indexed-label" | "structured-metadata" | "extracted-field">>;
  parserErrors: Array<{ recordId: string; stage: string; error: string; handled: boolean }>;
  warnings: string[];
}

export interface QueryFacts {
  semantic: SemanticNode[];
  cost: QueryCost;
  lineage: QueryLineage;
}

export interface QueryError {
  kind: "syntax" | "unsupported" | "execution";
  message: string;
  position?: number;
}

export type QueryExecution =
  | { ok: true; language: QueryLanguage; result: QueryValue; facts: QueryFacts }
  | { ok: false; language: QueryLanguage; error: QueryError; facts: QueryFacts };
