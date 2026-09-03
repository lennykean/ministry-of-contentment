import { afterEach, describe, expect, it } from "vitest";
import {
  authoredQueryForm, executionControls, formatUtcDateTimeLocal, formatUtcTimestamp, formForExecutionMode,
  navigateQueryHistory, parseUtcDateTimeLocal, queryHistoryDirection,
} from "../src/query-controls";

const opening = "2041-01-06T09:00:00Z";
const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("UTC query controls", () => {
  it("round-trips the authored opening timestamp independently of host timezone", () => {
    for (const timezone of ["Pacific/Honolulu", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      const timestamp = Date.UTC(2041, 0, 6, 9, 0, 0) / 1000;
      expect(formatUtcDateTimeLocal(timestamp)).toBe("2041-01-06T09:00:00");
      expect(parseUtcDateTimeLocal("2041-01-06T09:00:00")).toBe(timestamp);
    }
  });

  it("initializes the exact authored evaluation time and two-hour range", () => {
    expect(authoredQueryForm(opening, "2041-01-06T07:00:00Z", opening, "table")).toEqual({
      timestamp: Date.UTC(2041, 0, 6, 9) / 1000,
      range: 7200,
      visualization: "table",
    });
  });

  it("renders campaign timestamps as UTC in every host timezone", () => {
    for (const timezone of ["America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = timezone;
      expect(formatUtcTimestamp(opening)).toBe("2041-01-06 09:00:00 UTC");
      expect(formatUtcTimestamp(Date.parse(opening) / 1000)).toBe("2041-01-06 09:00:00 UTC");
    }
  });

  it("switches the editor view to each worked artifact's declared execution mode", () => {
    const base = authoredQueryForm(opening, "2041-01-06T07:00:00Z", opening, "table");
    expect(formForExecutionMode(base, "instant").visualization).toBe("table");
    expect(formForExecutionMode(base, "range").visualization).toBe("graph");
    expect(formForExecutionMode(base, "records").visualization).toBe("logs");
    expect(formForExecutionMode(base, "records").timestamp).toBe(base.timestamp);
    expect(formForExecutionMode(base, "records").range).toBe(7200);
  });
});

describe("execution context shapes", () => {
  const form = { timestamp: 10_000, range: 7200, visualization: "table" as const };

  it("gives instant PromQL no range tuple", () => {
    expect(executionControls("promql", "up == 0", form)).toEqual({
      timestamp: 10_000, visualization: "table",
    });
  });

  it("gives raw LogQL a bounded record range without a metric step", () => {
    expect(executionControls("logql", '{service="gateway"} |= "failed"', { ...form, visualization: "logs" })).toEqual({
      timestamp: 10_000, start: 2800, end: 10_000, lookback: 7200, direction: "backward", limit: 100, visualization: "logs",
    });
  });

  it("gives graph metrics a complete stepped range", () => {
    for (const [language, expression] of [
      ["promql", "rate(requests_total[5m])"],
      ["logql", 'rate({service="gateway"}[5m])'],
    ] as const) {
      expect(executionControls(language, expression, { ...form, visualization: "graph" })).toEqual({
        timestamp: 10_000, start: 2800, end: 10_000, step: 120, visualization: "graph",
      });
    }
  });

  it("does not turn a raw LogQL record query into a stepped metric query when graph is selected", () => {
    expect(executionControls("logql", '{service="gateway"} | json', { ...form, visualization: "graph" })).toEqual({
      timestamp: 10_000, start: 2800, end: 10_000, lookback: 7200, direction: "backward", limit: 100, visualization: "graph",
    });
  });
});

describe("query history", () => {
  it("leaves multiline cursor movement alone until the caret reaches an edge line", () => {
    const query = "sum(\n  up\n)";
    expect(queryHistoryDirection(query, 7, 7, "ArrowUp", 2)).toBeUndefined();
    expect(queryHistoryDirection(query, 4, 4, "ArrowUp", 2)).toBe("older");
    expect(queryHistoryDirection(query, 4, 4, "ArrowDown", 2)).toBeUndefined();
    expect(queryHistoryDirection(query, query.length, query.length, "ArrowDown", 2)).toBe("newer");
    expect(queryHistoryDirection(query, 0, 2, "ArrowUp", 2)).toBeUndefined();
    expect(queryHistoryDirection(query, 0, 0, "ArrowUp", 0)).toBeUndefined();
  });

  it("walks backward, clamps, then restores the current draft", () => {
    const history = ["up", "rate(requests_total[5m])"];
    let step = navigateQueryHistory(history, "draft", undefined, "older");
    expect(step.value).toBe("rate(requests_total[5m])");
    step = navigateQueryHistory(history, step.value, step.navigation, "older");
    expect(step.value).toBe("up");
    step = navigateQueryHistory(history, step.value, step.navigation, "older");
    expect(step.value).toBe("up");
    step = navigateQueryHistory(history, step.value, step.navigation, "newer");
    step = navigateQueryHistory(history, step.value, step.navigation, "newer");
    expect(step.value).toBe("draft");
    step = navigateQueryHistory(history, "edited draft", step.navigation, "older");
    step = navigateQueryHistory(history, step.value, step.navigation, "newer");
    expect(step.value).toBe("edited draft");
  });

  it("keeps an empty history on the current draft", () => {
    expect(navigateQueryHistory([], "draft", undefined, "older").value).toBe("draft");
  });
});
