import { describe, expect, it } from "vitest";
import { evaluateDetector, type DetectorArtifact, type DetectorContext } from "../src/detectors";
import { executeQuery, type QueryContext, type SemanticNode } from "../src/query";

function context(semantic: SemanticNode[]): DetectorContext {
  const artifact: DetectorArtifact = {
    id: "artifact.one",
    language: "logql",
    execution: {
      ok: true,
      language: "logql",
      result: { type: "instant-vector", series: [] },
      facts: {
        semantic,
        cost: { seriesScanned: 0, samplesScanned: 0, streamsScanned: 0, recordsScanned: 0, scannedBytes: 0, returned: 0 },
        lineage: { metricSeries: [], metricSamples: [], logStreams: [], records: [], sources: [], events: [], operands: [], fieldOrigins: {}, parserErrors: [], warnings: [] },
      },
    },
  };
  return { artifacts: [artifact], unitKind: "query-artifact", assistance: "None", requiredValues: [], evidenceRequirements: [] };
}

describe("detector parameter alternatives", () => {
  const facts = context([
    { kind: "stream-selector", matchers: [{ label: "job", operator: "=~", value: "api|worker" }] },
    { kind: "function", name: "rate", inputKind: "counter-range" },
    { kind: "parser", parser: "json" },
    { kind: "vector-match", matching: "on", labels: ["district"], cardinality: "one-to-one", include: [] },
  ]);

  it.each([
    ["stream-matcher", "operator", ["!=", "=~", "!~"]],
    ["function", "name", ["increase", "rate"]],
    ["parser", "kind", ["logfmt", "json"]],
  ])("accepts a scalar %s.%s from a declared alternatives array", (node, parameter, alternatives) => {
    expect(evaluateDetector({ kind: "A", selector: "artifact", node, parameters: { [parameter]: alternatives } }, facts)).toBe(true);
  });

  it("keeps exact semantics for a collection-valued parameter", () => {
    expect(evaluateDetector({ kind: "A", selector: "artifact", node: "vector-match", parameters: { labels: ["district"] } }, facts)).toBe(true);
    expect(evaluateDetector({ kind: "A", selector: "artifact", node: "vector-match", parameters: { labels: ["district", "service"] } }, facts)).toBe(false);
  });

  it("compares result collections with typed subset membership and no scalar coercion", () => {
    const values = context([]);
    const prior = values.artifacts[0]!.execution;
    values.artifacts[0]!.execution = {
      ok: true, language: "logql",
      result: { type: "instant-vector", series: [{ labels: {}, timestamp: 1, value: 1 }] }, facts: prior.facts,
    };
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "empty", relation: "=", expected: false }, values)).toBe(true);
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "value-domain", relation: "subset-of", expected: [0, 1] }, values)).toBe(true);
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "value-domain", relation: "subset-of", expected: [0, "1"] }, values)).toBe(false);
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "value-domain", relation: "subset-of", expected: 1 }, values)).toBe(false);
  });

  it("reports successful per-stream ordering as the requested direction contract", () => {
    for (const direction of ["forward", "backward"] as const) {
      const records = context([]);
      const prior = records.artifacts[0]!.execution;
      records.artifacts[0]!.execution = { ok: true, language: "logql", result: { type: "records", direction, streams: [] }, facts: prior.facts };
      expect(evaluateDetector({ kind: "R", selector: "artifact", property: "per-stream-order", relation: "=", expected: "requested" }, records)).toBe(true);
    }
  });

  it("assesses what a filed printout actually shows", () => {
    const printed = context([]);
    printed.artifacts[0]!.print = { visualization: "table", showQuery: true, showLabels: false, showRange: true, zeroAxis: false };
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "print-query", relation: "=", expected: true }, printed)).toBe(true);
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "print-labels", relation: "=", expected: true }, printed)).toBe(false);
    expect(evaluateDetector({ kind: "R", selector: "artifact", property: "visualization", relation: "=", expected: "table" }, printed)).toBe(true);
  });

  it("allows an intentional record error before an error-free metric remedy", () => {
    const queryContext: QueryContext = {
      timestamp: 100,
      start: 0,
      end: 101,
      logs: [{
        id: "stream.one", source: "record.fixture", labels: { job: "fixture" },
        records: [
          { id: "good", timestamp: 90, line: "{\"value\":1}" },
          { id: "bad", timestamp: 95, line: "not json" },
        ],
      }],
    };
    const artifacts: DetectorArtifact[] = [
      { id: "inspection", language: "logql", execution: executeQuery("logql", '{job="fixture"} | json', queryContext) },
      { id: "remedy", language: "logql", execution: executeQuery("logql", 'count_over_time({job="fixture"} | json | __error__="" [5m])', queryContext) },
    ];
    expect(artifacts[0]!.execution).toMatchObject({ ok: true, facts: { lineage: { parserErrors: [{ handled: false }] } } });
    expect(artifacts[1]!.execution).toMatchObject({ ok: true, result: { type: "instant-vector" }, facts: { lineage: { parserErrors: [{ handled: true }] } } });
    expect(evaluateDetector({
      kind: "E", rule: "pipeline-errors", selectors: ["artifact"],
      parameters: { "failing-stage-before-remedy": true, "metric-result-error-free": true },
    }, { ...context([]), artifacts, unitKind: "ordered-artifact-set" })).toBe(true);

    artifacts[1] = { id: "broken-metric", language: "logql", execution: executeQuery("logql", 'count_over_time({job="fixture"} | json [5m])', queryContext) };
    expect(evaluateDetector({
      kind: "E", rule: "pipeline-errors", selectors: ["artifact"],
      parameters: { "failing-stage-before-remedy": true, "metric-result-error-free": true },
    }, { ...context([]), artifacts, unitKind: "ordered-artifact-set" })).toBe(false);
  });

  it("requires classic bucket rate and sum-by-le before histogram quantile", () => {
    const queryContext: QueryContext = {
      timestamp: 300,
      metrics: [
        { id: "bucket.one", metric: "latency_bucket", type: "classic-histogram", labels: { le: "1" }, samples: [{ timestamp: 0, value: 0 }, { timestamp: 300, value: 8 }] },
        { id: "bucket.inf", metric: "latency_bucket", type: "classic-histogram", labels: { le: "+Inf" }, samples: [{ timestamp: 0, value: 0 }, { timestamp: 300, value: 10 }] },
      ],
    };
    const makeContext = (query: string): DetectorContext => ({
      conceptId: "promql.histogram.classic",
      artifacts: [{ id: "histogram", language: "promql", execution: executeQuery("promql", query, queryContext) }],
      unitKind: "query-artifact", assistance: "None", requiredValues: [],
      evidenceRequirements: [{
        conceptId: "promql.histogram.classic", rule: "operation-fit", selectors: ["artifact"], subject: "histogram-buckets",
        alternatives: [[{ kind: "U", property: "artifact-count", relation: "=", expected: 1 }]],
      }],
    });
    const detector: import("../src/types").Detector = { kind: "E", rule: "operation-fit", selectors: ["artifact"], parameters: { dimension: "histogram-buckets" } };
    expect(evaluateDetector(detector, makeContext("histogram_quantile(0.9, sum by (le) (rate(latency_bucket[5m])))"))).toBe(true);
    expect(evaluateDetector(detector, makeContext("histogram_quantile(0.9, rate(latency_bucket[5m]))"))).toBe(false);
  });

  it("requires correlation artifacts to share provenance and overlapping represented time", () => {
    const first = context([]).artifacts[0]!;
    first.timestamp = 100;
    first.execution.facts.lineage.events = ["incident.shared"];
    const second = structuredClone(first);
    second.id = "artifact.two";
    second.timestamp = undefined;
    second.start = 90;
    second.end = 110;
    const detector = { kind: "E", rule: "correlation", selectors: ["artifact"], parameters: { provenance: "overlap" } } as import("../src/types").Detector;
    const facts = { ...context([]), artifacts: [first, second], unitKind: "ordered-artifact-set" as const };
    expect(evaluateDetector(detector, facts)).toBe(true);
    second.start = 101;
    expect(evaluateDetector(detector, facts)).toBe(false);
    second.start = 90;
    second.execution.facts.lineage.events = ["incident.other"];
    expect(evaluateDetector(detector, facts)).toBe(false);
  });

  it("rejects empty and non-finite ratios as safe denominators", () => {
    const detector = { kind: "E", rule: "numeric-value", selectors: ["artifact"], parameters: { denominator: "safe" } } as import("../src/types").Detector;
    const facts = context([]);
    const execution = facts.artifacts[0]!.execution;
    if (!execution.ok) throw new Error("fixture execution failed");
    execution.facts.lineage.operands = [{ operator: "/", left: ["left"], right: ["right"] }];
    expect(evaluateDetector(detector, facts)).toBe(false);
    execution.result = { type: "instant-vector", series: [{ labels: {}, timestamp: 1, value: Number.POSITIVE_INFINITY }] };
    expect(evaluateDetector(detector, facts)).toBe(false);
    execution.result.series[0]!.value = 1;
    expect(evaluateDetector(detector, facts)).toBe(true);
  });
});
