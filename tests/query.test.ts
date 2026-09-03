import { describe, expect, it } from "vitest";
import { executeQuery, type QueryContext } from "../src/query";

const context: QueryContext = {
  timestamp: 900,
  metrics: [
    { metric: "up", labels: { district: "north", service: "gateway", instance: "a" }, type: "gauge", source: "scrape:a", samples: [{ timestamp: 900, value: 0, eventIds: ["outage"] }] },
    { metric: "up", labels: { district: "south", service: "gateway", instance: "b" }, type: "gauge", source: "scrape:b", samples: [{ timestamp: 900, value: 1 }] },
    { metric: "requests_total", labels: { district: "north", result: "ok" }, type: "counter", unit: "requests", source: "gateway", samples: [{ timestamp: 610, value: 0 }, { timestamp: 750, value: 100 }, { timestamp: 800, value: 10, eventIds: ["restart"] }, { timestamp: 900, value: 60 }] },
    { metric: "temperature", labels: { district: "north" }, type: "gauge", unit: "celsius", samples: [{ timestamp: 600, value: 10 }, { timestamp: 750, value: 20 }, { timestamp: 900, value: 30 }] },
    { metric: "demand", labels: { district: "north", facility: "clinic", service: "heat" }, type: "gauge", samples: [{ timestamp: 900, value: 2 }] },
    { metric: "capacity", labels: { district: "north", facility: "clinic", service: "heat", priority_band: "urgent" }, type: "gauge", samples: [{ timestamp: 900, value: 4 }] },
    { metric: "latency_bucket", labels: { district: "north", le: "1" }, type: "classic-histogram", unit: "seconds", samples: [{ timestamp: 610, value: 0 }, { timestamp: 900, value: 80 }] },
    { metric: "latency_bucket", labels: { district: "north", le: "+Inf" }, type: "classic-histogram", unit: "seconds", samples: [{ timestamp: 610, value: 0 }, { timestamp: 900, value: 100 }] },
    {
      metric: "native_latency", labels: { district: "north" }, type: "native-histogram", unit: "seconds",
      samples: [{ timestamp: 900, value: { count: 100, sum: 80, interpolation: "linear", zeroThreshold: 0.01, zeroCount: 0, buckets: [{ lower: 0, upper: 1, count: 80 }, { lower: 1, upper: 2, count: 20 }] } }],
    },
  ],
  logs: [
    {
      id: "pin:north", labels: { service: "pin-gateway", district: "north" }, source: "record.pin_gateway",
      records: [
        { id: "r1", timestamp: 810, line: '{"event":"ok","duration":"500ms","payload_bytes":"1KB"}', metadata: { member_id: "m1" } },
        { id: "r2", timestamp: 850, line: "not json", eventIds: ["malformed"] },
        { id: "r3", timestamp: 890, line: '{"event":"removal","duration":"2s","payload_bytes":"2KB"}', metadata: { member_id: "m2" }, eventIds: ["removal"] },
      ],
    },
    {
      id: "pin:south", labels: { service: "pin-gateway", district: "south" }, source: "record.pin_gateway",
      records: [{ id: "r4", timestamp: 870, line: '{"event":"ok","duration":"1s","payload_bytes":"1KB"}', metadata: { member_id: "m3" } }],
    },
  ],
};

function success(language: "promql" | "logql", query: string, custom: QueryContext = context) {
  const execution = executeQuery(language, query, custom);
  expect(execution.ok, execution.ok ? undefined : execution.error.message).toBe(true);
  if (!execution.ok) throw new Error(execution.error.message);
  return execution;
}

describe("PromQL", () => {
  it("selects and filters real instant-vector values", () => {
    const execution = success("promql", 'up{service="gateway",district=~"north|east"} == 0');
    expect(execution.result).toMatchObject({ type: "instant-vector", series: [{ labels: { district: "north" }, value: 0 }] });
    expect(execution.facts.lineage.events).toContain("outage");
  });

  it("timestamps instant-vector elements at evaluation time", () => {
    const execution = success("promql", "temperature", { ...context, timestamp: 875 });
    expect(execution.result).toMatchObject({ type: "instant-vector", series: [{ timestamp: 875, value: 20 }] });
    expect(execution.facts.lineage.metricSamples.map((sample) => sample.timestamp)).toEqual([750]);
  });

  it("keeps false matches with the bool modifier", () => {
    const execution = success("promql", 'up{service="gateway"} == bool 0');
    expect(execution.result.type).toBe("instant-vector");
    if (execution.result.type === "instant-vector") expect(execution.result.series.map((series) => series.value)).toEqual([1, 0]);
  });

  it("requires bool for scalar comparisons", () => {
    expect(executeQuery("promql", "1 == 1", context)).toMatchObject({
      ok: false,
      error: { kind: "execution", message: "scalar comparisons require the bool modifier" },
    });
    expect(success("promql", "1 == bool 1").result).toMatchObject({ type: "scalar", value: 1 });
  });

  it("handles counter resets in rate and increase", () => {
    const rate = success("promql", "rate(requests_total[5m])");
    const increase = success("promql", "increase(requests_total[5m])");
    if (rate.result.type !== "instant-vector" || increase.result.type !== "instant-vector") throw new Error("wrong result type");
    expect(rate.result.series[0]!.value).toBeCloseTo(160 / 300, 5);
    expect(increase.result.series[0]!.value).toBeCloseTo(160, 5);
  });

  it("aggregates with grouping and preserves many-to-one labels", () => {
    const aggregate = success("promql", "sum by (district) (up)");
    expect(aggregate.result).toMatchObject({ type: "instant-vector", series: [{ labels: { district: "north" }, value: 0 }, { labels: { district: "south" }, value: 1 }] });
    const match = success("promql", "demand * on (district, facility, service) group_left (priority_band) capacity");
    expect(match.result).toMatchObject({ type: "instant-vector", series: [{ labels: { priority_band: "urgent" }, value: 8 }] });
  });

  it("reports count aggregations as dimensionless counts", () => {
    const promql = success("promql", "count(requests_total)");
    const logql = success("logql", 'count(rate({service="pin-gateway",district="north"}[5m]))');
    if (promql.result.type !== "instant-vector" || logql.result.type !== "instant-vector") throw new Error("wrong result type");
    expect(promql.result.series[0]!.unit).toBe("count");
    expect(logql.result.series[0]!.unit).toBe("count");
  });

  it("cancels equal units in vector ratios", () => {
    const promql = success("promql", "100 * (sum(rate(requests_total[5m])) / sum(rate(requests_total[5m])))");
    const logql = success("logql", 'sum(rate({service="pin-gateway",district="north"}[5m])) / sum(rate({service="pin-gateway",district="north"}[5m]))');
    expect(promql.result).toMatchObject({ type: "instant-vector", series: [{ value: 100 }] });
    expect(logql.result).toMatchObject({ type: "instant-vector", series: [{ value: 1 }] });
    if (promql.result.type !== "instant-vector" || logql.result.type !== "instant-vector") throw new Error("wrong result type");
    expect(promql.result.series[0]!.unit).toBe("ratio");
    expect(logql.result.series[0]!.unit).toBe("ratio");
  });

  it("supports set operators, absence, time modifiers, subqueries, and range output", () => {
    expect(success("promql", 'up{district="north"} and on(service) up{district="south"}').result).toMatchObject({ type: "instant-vector", series: [{ value: 0 }] });
    expect(success("promql", 'absent(up{district="missing"})').result).toMatchObject({ type: "instant-vector", series: [{ value: 1 }] });
    expect(success("promql", "temperature @ 600").result).toMatchObject({ type: "instant-vector", series: [{ value: 10 }] });
    expect(success("promql", "avg_over_time(temperature[5m:1m])").result.type).toBe("instant-vector");
    expect(success("promql", "temperature", { ...context, start: 600, end: 900, step: 150 }).result.type).toBe("range-vector");
  });

  it("calculates classic and native histogram quantiles", () => {
    const classic = success("promql", "histogram_quantile(0.9, sum by (le) (rate(latency_bucket[5m])))");
    const native = success("promql", "histogram_quantile(0.9, native_latency)");
    if (classic.result.type !== "instant-vector" || native.result.type !== "instant-vector") throw new Error("wrong result type");
    expect(classic.result.series[0]!.value).toBe(1);
    expect(native.result.series[0]!.value).toBe(1.5);
  });

  it("supports changes, resets, prediction, and ranking", () => {
    expect(success("promql", "changes(requests_total[5m])").result).toMatchObject({ series: [{ value: 3 }] });
    expect(success("promql", "resets(requests_total[5m])").result).toMatchObject({ series: [{ value: 1 }] });
    expect(success("promql", "predict_linear(temperature[5m], 300)").result).toMatchObject({ series: [{ value: 50 }] });
    expect(success("promql", "topk(1, up)").result).toMatchObject({ series: [{ labels: { district: "south" } }] });
    expect(success("promql", "scalar(sum(up))").result).toMatchObject({ type: "scalar", value: 1 });
  });
});

describe("LogQL", () => {
  it("selects records, filters lines, parses fields, and retains provenance", () => {
    const execution = success("logql", '{service="pin-gateway",district="north"} |= "removal" | json | duration > 1s', { ...context, start: 800, end: 901, direction: "forward" });
    expect(execution.result).toMatchObject({ type: "records", streams: [{ records: [{ id: "r3", sourceId: "record.pin_gateway", eventIds: ["removal"], fields: { event: "removal", member_id: "m2" } }] }] });
    expect(execution.facts.lineage.fieldOrigins.member_id).toContain("structured-metadata");
    expect(execution.facts.lineage.fieldOrigins.event).toContain("extracted-field");
  });

  it("propagates parser errors and permits both authentic remedies", () => {
    const failed = executeQuery("logql", 'count_over_time({service="pin-gateway",district="north"} | json [5m])', context);
    expect(failed).toMatchObject({ ok: false, error: { kind: "execution" } });
    expect(failed.facts.lineage.parserErrors).toHaveLength(1);
    const filtered = success("logql", 'count_over_time({service="pin-gateway",district="north"} | json | __error__="" [5m])');
    expect(filtered.result).toMatchObject({ series: [{ value: 2 }] });
    expect(filtered.facts.lineage.parserErrors).toMatchObject([{ recordId: "r2", handled: true }]);
    expect(success("logql", 'count_over_time({service="pin-gateway",district="north"} | json | drop __error__ [5m])').result).toMatchObject({ series: [{ value: 3 }] });
  });

  it("evaluates count, rate, byte, unwrap, quantile, and aggregation functions", () => {
    expect(success("logql", 'rate({service="pin-gateway"} [5m])').result).toMatchObject({ series: [{ value: 0.01 }, { value: 1 / 300 }] });
    expect(success("logql", 'bytes_over_time({service="pin-gateway",district="south"} [5m])').result.type).toBe("instant-vector");
    const quantile = success("logql", 'quantile_over_time(0.5, {service="pin-gateway"} | json | unwrap duration(duration) | __error__="" [5m])');
    expect(quantile.result).toMatchObject({ series: [{ value: 1.25 }, { value: 1 }] });
    expect(success("logql", 'sum by (district) (count_over_time({service="pin-gateway"} [5m]))').result).toMatchObject({ series: [{ labels: { district: "north" }, value: 3 }, { labels: { district: "south" }, value: 1 }] });
    expect(success("logql", 'quantile_over_time(0.5, {service="pin-gateway"} | json | unwrap duration(duration) | __error__="" [5m]) by (service)').result).toMatchObject({ series: [{ labels: { service: "pin-gateway" }, value: 1 }] });
  });

  it("supports pattern and regexp parsing plus formatting without losing raw lines", () => {
    const logfmtContext: QueryContext = { timestamp: 10, start: 0, end: 11, logs: [{ labels: { service: "worker" }, records: [{ id: "w1", timestamp: 5, line: "status=ok elapsed=2s" }] }] };
    const pattern = success("logql", '{service="worker"} | pattern "status=<status> elapsed=<elapsed>" | line_format "{{.status}}/{{.elapsed}}"', logfmtContext);
    expect(pattern.result).toMatchObject({ streams: [{ records: [{ line: "status=ok elapsed=2s", displayLine: "ok/2s" }] }] });
    expect(success("logql", '{service="worker"} | regexp "status=(?P<status>[A-Za-z]+)" | label_format result="{{.status}}"', logfmtContext).result).toMatchObject({ streams: [{ records: [{ labels: { result: "ok" } }] }] });
  });

  it("supports conversion filters and records byte scan cost", () => {
    const execution = success("logql", '{service="pin-gateway"} | json | duration(duration) > 1s | bytes(payload_bytes) >= 2KB | __error__=""', { ...context, start: 800, end: 901 });
    expect(execution.result).toMatchObject({ streams: [{ records: [{ id: "r3" }] }] });
    expect(execution.facts.cost.scannedBytes).toBeGreaterThan(0);
  });

  it("returns records in requested per-stream order with a global limit", () => {
    const execution = success("logql", '{service="pin-gateway"}', { ...context, start: 800, end: 901, direction: "backward", limit: 2 });
    expect(execution.result.type).toBe("records");
    if (execution.result.type === "records") expect(execution.result.streams.flatMap((stream) => stream.records).map((record) => record.id).sort()).toEqual(["r3", "r4"]);
  });
});

it("distinguishes unsupported constructs from malformed syntax", () => {
  expect(executeQuery("promql", "sort(up)", context)).toMatchObject({ ok: false, error: { kind: "unsupported" } });
  expect(executeQuery("promql", "up{", context)).toMatchObject({ ok: false, error: { kind: "syntax" } });
  expect(executeQuery("logql", '{service="pin-gateway"} | decolorize', context)).toMatchObject({ ok: false, error: { kind: "unsupported" } });
  expect(executeQuery("promql", '{district=~".*"}', context)).toMatchObject({ ok: false, error: { kind: "syntax" } });
  expect(executeQuery("logql", '{service!="missing"}', context)).toMatchObject({ ok: false, error: { kind: "syntax" } });
  expect(executeQuery("promql", "1 + on(district) up", context)).toMatchObject({ ok: false, error: { kind: "execution", message: "vector matching modifiers require two instant vectors" } });
  expect(executeQuery("promql", "up and group_left up", context)).toMatchObject({ ok: false, error: { kind: "syntax", message: "group modifiers are not valid on set operators" } });
  expect(executeQuery("logql", '1 + on(district) rate({service="pin-gateway"}[5m])', context)).toMatchObject({ ok: false, error: { kind: "execution", message: "vector matching modifiers require two instant vectors" } });
  expect(executeQuery("logql", 'rate({service="pin-gateway"}[5m]) and group_left rate({service="pin-gateway"}[5m])', context)).toMatchObject({ ok: false, error: { kind: "syntax", message: "group modifiers are not valid on set operators" } });
});
