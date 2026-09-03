import type { Language } from "./types";

export const SUPPORTED_FEATURES: Record<Language, ReadonlySet<string>> = {
  promql: new Set([
    "selector", "matcher.regex", "range", "comparison", "comparison.bool", "counter.rate", "counter.increase",
    "aggregate", "binary", "vector-match", "set", "histogram.classic", "histogram.native", "absence", "offset",
    "at", "subquery", "over-time", "changes-resets", "predict-linear", "performance", "watch",
  ]),
  logql: new Set([
    "selector", "matcher.regex", "filter.literal", "filter.regex", "filter.pattern", "parse.json", "parse.logfmt",
    "parse.pattern", "parse.regexp", "filter.typed", "pipeline-errors", "metric.count-rate", "metric.bytes", "unwrap",
    "quantile", "aggregate", "binary", "vector-match", "format.line", "format.label", "offset", "absence",
    "performance", "watch",
  ]),
};

export const DETECTOR_VOCABULARY = {
  U: new Set(["kind", "artifact-count", "language-sequence", "result-types", "assistance"]),
  R: new Set(["status", "result-type", "empty", "value-domain", "unit", "retained-labels", "retained-fields", "time-scope", "population-scope", "stream-count", "per-stream-order", "pipeline-error-count", "series-count", "record-count", "selected-series", "scanned-samples", "scanned-records", "scanned-bytes", "returned-items", "print-query", "print-labels", "print-range", "print-zero-axis", "visualization"]),
  W: new Set(["checkpoint-success", "coverage", "specificity", "localization", "timeliness", "cost", "candidate-count", "notice-lifecycle"]),
  A: new Map<string, ReadonlySet<string>>([
    ["metric-selector", new Set(["metric-type"])], ["label-matcher", new Set(["operator"])], ["range-selector", new Set()],
    ["comparison", new Set(["operator", "bool"])], ["function", new Set(["name", "input-kind"])],
    ["aggregation", new Set(["operator", "grouping"])], ["binary", new Set(["operator"])],
    ["vector-match", new Set(["labels", "cardinality"])], ["group-modifier", new Set(["side"])],
    ["set-operator", new Set(["operator"])], ["time-modifier", new Set(["kind"])], ["subquery", new Set()],
    ["stream-selector", new Set()], ["stream-matcher", new Set(["operator"])], ["line-filter", new Set(["operator"])],
    ["parser", new Set(["kind"])], ["label-filter", new Set(["value-type", "label"])],
    ["pipeline-order", new Set(["expected"])], ["range-function", new Set(["name", "input-kind"])],
    ["unwrap", new Set(["conversion"])], ["formatter", new Set(["kind"])], ["drop", new Set(["label"])],
    ["offset", new Set()],
  ]),
  E: new Map<string, ReadonlySet<string>>([
    ["schema-selection", new Set(["source", "name-supplied"])], ["result-interpretation", new Set(["subjects"])],
    ["scope", new Set(["dimension", "expected", "missing-labels", "nonempty-selector", "alignment"])],
    ["localization", new Set(["expected"])], ["operation-fit", new Set(["dimension", "expected"])],
    ["numeric-value", new Set(["expected", "tolerance", "denominator"])], ["reset-handling", new Set(["expected"])],
    ["absence-model", new Set(["distinctions"])],
    ["provenance", new Set(["expected", "raw-records", "field-as-stream-label", "distinctions"])],
    ["correlation", new Set(["provenance"])], ["claim-support", new Set(["subjects"])],
    ["performance", new Set(["budgets", "dimension"])], ["ordering", new Set(["scope", "equal-timestamp-tie"])],
    ["pipeline-errors", new Set(["expected", "failing-stage-before-remedy", "metric-result-error-free"])],
    ["watch-quality", new Set(["all-dimensions", "explanation"])],
  ]),
} as const;
