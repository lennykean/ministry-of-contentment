import { describe, expect, it } from "vitest";
import type { SavedArtifact } from "../src/game";
import { renderPicture, renderPinnedStack, transcriptEntry } from "../src/ui/printouts";

function printedArtifact(id: string, expression: string): SavedArtifact {
  return {
    id, caseId: "case.one", variantId: "variant.one", expression, language: "promql",
    controls: { timestamp: 1, visualization: "stat" }, assistance: "None", createdAt: new Date(1000).toISOString(), filed: false,
    execution: {
      ok: true, language: "promql",
      result: { type: "instant-vector", series: [{ labels: { instance: id }, timestamp: 1, value: 1 }] },
      facts: {
        semantic: [],
        cost: { seriesScanned: 1, samplesScanned: 1, streamsScanned: 0, recordsScanned: 0, scannedBytes: 0, returned: 1 },
        lineage: { metricSeries: [], metricSamples: [], logStreams: [], records: [], sources: [], events: [], operands: [], fieldOrigins: {}, parserErrors: [], warnings: [] },
      },
    },
    print: { visualization: "stat", showQuery: true, showLabels: true, showRange: false, zeroAxis: false },
  };
}

describe("printed query results", () => {
  it("shows the computed unit beside numeric values", () => {
    const html = renderPicture({
      type: "instant-vector",
      series: [{ labels: { district: "north" }, timestamp: 1, value: 1, unit: "reachability" }],
    }, { visualization: "stat", showQuery: true, showLabels: true, showRange: true, zeroAxis: false });

    expect(html).toContain("1 reachability");
  });

  it("renders the selected pinned printout on the report", () => {
    const printed = [printedArtifact("one", "up{instance=\"one\"}"), printedArtifact("two", "up{instance=\"two\"}")];
    const html = renderPinnedStack(printed, printed, "two", false);

    expect(html).toContain("2 printouts attached to this report");
    expect(html).toContain("up{instance=&quot;two&quot;}");
    expect(html).toContain("Pinned · evidence 2");
    expect(html).toContain('data-action="next-pinned"');
  });

  it("uses series as both the singular and plural label", () => {
    const artifact = printedArtifact("one", "up");
    if (artifact.execution.ok) artifact.execution.result = {
      type: "instant-vector",
      series: [
        { labels: { instance: "one" }, timestamp: 1, value: 1 },
        { labels: { instance: "two" }, timestamp: 1, value: 0 },
      ],
    };

    const html = transcriptEntry(artifact, true);
    expect(html).toContain("2 SERIES");
    expect(html).not.toContain("SERIESS");
  });

  it("does not mask visible query results or errors from assistive technology", () => {
    const artifact = printedArtifact("one", "up");
    expect(transcriptEntry(artifact, true)).not.toContain("aria-label=");
    const facts = artifact.execution.facts;
    artifact.execution = { ok: false, language: "promql", error: { kind: "syntax", message: "Expected an expression" }, facts };
    const failed = transcriptEntry(artifact, true);
    expect(failed).not.toContain("aria-label=");
    expect(failed).toContain("SYNTAX ERROR");
    expect(failed).toContain("Expected an expression");
  });
});
