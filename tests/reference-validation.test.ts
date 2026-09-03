import { describe, expect, it } from "vitest";
import generatedCampaign from "../content/campaign.json";
import fixture from "./fixtures/minimal-campaign.json";
import { buildQueryContext, type QueryControls } from "../src/game";
import { loadCampaign } from "../src/loader";
import { executeQuery } from "../src/query";
import { ReferenceValidationError, validateReferenceQueries } from "../src/reference-validation";

function multiArtifactWorkedCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  const item = campaign.cases[0];
  item.report.minArtifacts = 2;
  item.report.maxArtifacts = 2;
  item.technicalTruth.artifactRoles.confirmation = "The confirmation query checks the district-specific fixture series.";
  for (const referenceSet of item.variants[0].referenceSets) referenceSet.artifacts.push({
    role: "confirmation", language: "promql", mode: "instant", query: 'fixture_signal{district="north"}',
  });
  const path = item.evidencePaths.find((candidate: { id: string }) => candidate.id === "path.selector");
  path.clauses[0].artifactSelectors = ["artifact[1]", "artifact[2]"];
  path.clauses[0].requirements = {
    op: "all",
    items: [
      { kind: "U", property: "artifact-count", relation: "=", expected: 2 },
      { kind: "A", selector: "artifact[1]", node: "metric-selector", parameters: {} },
      { kind: "A", selector: "artifact[2]", node: "label-matcher", parameters: { operator: "=" } },
    ],
  };
  item.variants[0].workedEvidenceSet = {
    evidencePathId: "path.selector",
    artifacts: [
      {
        role: "signal", language: "promql", mode: "instant", query: "fixture_signal", explanation: "Inspect the available series.",
        print: { visualization: "table", showQuery: true, showLabels: true, showRange: true, zeroAxis: false },
      },
      {
        role: "confirmation", language: "promql", mode: "instant", query: 'fixture_signal{district="north"}', explanation: "Confirm the district-specific series.",
        print: { visualization: "table", showQuery: true, showLabels: true, showRange: true, zeroAxis: false },
      },
    ],
  };
  item.outcomes = [
    {
      id: "outcome.evidence", titleChoiceIds: ["title.signal"], conclusionChoiceIds: ["conclusion.present"],
      decisionChoiceIds: ["decision.clear"], technicalEvidence: "supported", technicalExplanation: "The evidence supports the filing.",
      ministryResponse: "Recorded.",
    },
    { id: "outcome.fallback", technicalEvidence: "partial", ministryResponse: "Correct and refile." },
  ];
  return campaign;
}

describe("campaign reference validation", () => {
  it("executes reference queries and validates their computed evidence", () => {
    expect(() => validateReferenceQueries(loadCampaign(fixture))).not.toThrow();
  });

  it("rejects a mastery progression that reuses one exact reference query", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].masteryUses.push({
      ...campaign.cases[0].masteryUses[0],
      targetState: "Practiced",
    });
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/concept fixture\.selector reuses one exact reference query across its mastery progression/);
  });

  it("accepts a mastery progression with distinct reference queries", () => {
    const campaign = multiArtifactWorkedCampaign();
    campaign.cases[0].masteryUses.push({
      ...campaign.cases[0].masteryUses[0], targetState: "Practiced", artifactSelectors: ["artifact[2]"],
    });
    expect(() => validateReferenceQueries(loadCampaign(campaign))).not.toThrow();
  });

  it("rejects a reference query that cannot be parsed", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].variants[0].referenceSets[0].artifacts[0].query = "fixture_signal{";
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrowError(ReferenceValidationError);
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/role signal syntax/);
  });

  it("reports supported-language syntax outside the simulator subset as unsupported", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].variants[0].referenceSets[0].artifacts[0].query = "sort(fixture_signal)";
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/role signal unsupported/);
  });

  it("rejects a reference query that fails during execution", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.datasets[0].series.push({ ...structuredClone(campaign.datasets[0].series[0]), id: "series.two" });
    campaign.cases[0].variants[0].referenceSets[0].artifacts[0].query = "fixture_signal + on(district) fixture_signal";
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/role signal execution: many-to-many matching is not allowed/);
  });

  it("rejects successful output that cannot satisfy player evidence", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].variants[0].referenceSets[0].artifacts[0].query = "1";
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/does not satisfy named evidence path/);
  });

  it("executes a complete ordered multi-artifact Worked evidence set", () => {
    expect(() => validateReferenceQueries(loadCampaign(multiArtifactWorkedCampaign()))).not.toThrow();
  });

  it("files every generated Worked plan through the player run, print, and report path", () => {
    expect(() => validateReferenceQueries(loadCampaign(generatedCampaign))).not.toThrow();
  }, 20_000);

  it("rejects a watch Worked plan that passes its horizon but not the runtime reference gate", () => {
    const campaign = structuredClone(generatedCampaign) as any;
    const item = campaign.cases.find((candidate: { id: string }) => candidate.id === "case.133.many-to-one");
    item.variants[0].workedEvidenceSet.artifacts[1].query = 'predict_linear(ministry_contentment_index{district="north"}[1h], 7200)';

    expect(() => validateReferenceQueries(loadCampaign(campaign)))
      .toThrow(/worked evidence does not satisfy named evidence path case\.133\.many-to-one\.path\.direct/);
  }, 20_000);

  it("projects final topology reference data into its authored case window", () => {
    const index = loadCampaign(generatedCampaign);
    for (const caseId of ["case.189.final-checkpoints", "case.190.resource-notices", "case.192.party-record"]) {
      const item = index.cases.get(caseId)!;
      const variant = item.variants.find((candidate) => candidate.id.endsWith(".topology"))!;
      const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
      const start = Date.parse(variant.rangeStart ?? item.rangeStart!) / 1000;
      const end = Date.parse(variant.rangeEnd ?? item.rangeEnd!) / 1000;
      const references = variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct"))!.artifacts;

      for (const reference of references) {
        const controls: QueryControls = reference.mode === "instant"
          ? { timestamp, visualization: "table" }
          : reference.mode === "records"
            ? { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" }
            : { timestamp, start, end, step: Math.max(1, Math.floor((end - start) / 60)), visualization: "graph" };
        const execution = executeQuery(reference.language, reference.query, buildQueryContext(
          index, variant.datasetId, controls, item.availableSources, variant.datasetTimeOffsetSeconds,
        ));
        expect(execution.ok, `${variant.id} ${reference.role}`).toBe(true);
        if (!execution.ok) continue;
        const times = execution.result.type === "records"
          ? execution.result.streams.flatMap((stream) => stream.records.map((record) => record.timestamp))
          : execution.result.type === "range-vector"
            ? execution.result.series.flatMap((series) => series.values.map((point) => point.timestamp))
            : execution.result.type === "instant-vector"
              ? execution.result.series.map((series) => series.timestamp)
              : [execution.result.timestamp];
        expect(times.length, `${variant.id} ${reference.role} returned no data`).toBeGreaterThan(0);
        expect(times.every((time) => time >= start && time <= end), `${variant.id} ${reference.role} returned out-of-range data`).toBe(true);
        expect(execution.facts.lineage.sources.length, `${variant.id} ${reference.role} read no source`).toBeGreaterThan(0);
      }
    }
  });

  it("requires complete print metadata for every Worked artifact", () => {
    const campaign = structuredClone(fixture) as any;
    delete campaign.cases[0].variants[0].workedEvidenceSet.artifacts[0].print;
    expect(() => loadCampaign(campaign)).toThrow(/must have required property 'print'/);
  });

  it("retains each Worked print plan after advancing to the next query", () => {
    const campaign = multiArtifactWorkedCampaign();
    campaign.cases[0].variants[0].workedEvidenceSet.artifacts[0].print.zeroAxis = true;
    for (const path of campaign.cases[0].evidencePaths) {
      const clause = path.clauses[0];
      clause.requirements = {
        op: "all",
        items: [clause.requirements, { kind: "R", selector: "artifact[1]", property: "print-zero-axis", relation: "=", expected: true }],
      };
    }
    expect(() => validateReferenceQueries(loadCampaign(campaign))).not.toThrow();
  });

  it("rejects a Worked print plan that omits evidence metadata", () => {
    const campaign = multiArtifactWorkedCampaign();
    for (const path of campaign.cases[0].evidencePaths) {
      const clause = path.clauses[0];
      clause.requirements = {
        op: "all",
        items: [clause.requirements, { kind: "R", selector: "artifact[1]", property: "print-zero-axis", relation: "=", expected: true }],
      };
    }
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/Worked filing did not complete/);
  });

  it("rejects a report form that permits fewer artifacts than its shortest evidence path", () => {
    const campaign = multiArtifactWorkedCampaign();
    for (const path of campaign.cases[0].evidencePaths) {
      for (const clause of path.clauses) clause.artifactSelectors = ["artifact[1]", "artifact[2]"];
    }
    campaign.cases[0].report.minArtifacts = 1;
    expect(() => validateReferenceQueries(loadCampaign(campaign)))
      .toThrow(/report allows 1 artifacts but its shortest evidence path requires 2/);
  });

  it("preserves a genuinely shorter alternate evidence path", () => {
    const campaign = multiArtifactWorkedCampaign();
    const item = campaign.cases[0];
    const alternate = item.variants[0].referenceSets.find((set: { evidencePathId: string }) => set.evidencePathId === "path.result");
    alternate.artifacts = alternate.artifacts.slice(0, 1);
    item.report.minArtifacts = 1;
    expect(() => validateReferenceQueries(loadCampaign(campaign))).not.toThrow();
  });

  it("rejects a Worked evidence set when any required artifact fails", () => {
    const campaign = multiArtifactWorkedCampaign();
    campaign.cases[0].variants[0].workedEvidenceSet.artifacts[1].query = "fixture_signal{";
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/worked evidence role confirmation syntax/);
  });

  it("rejects an executable Worked evidence set that does not prove its named path", () => {
    const campaign = multiArtifactWorkedCampaign();
    campaign.cases[0].variants[0].workedEvidenceSet.artifacts[1].query = "fixture_signal";
    expect(() => validateReferenceQueries(loadCampaign(campaign))).toThrow(/worked evidence does not satisfy named evidence path path\.selector/);
  });
});
