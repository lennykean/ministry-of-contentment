import { describe, expect, it } from "vitest";
import fixture from "./fixtures/minimal-campaign.json";
import { executeQuery } from "../src/query";
import {
  GameEngine, assessMasteryUse, buildQueryContext, clearStoredState, createGameState, loadStoredState, printableViews, replayResultFor,
  storeState, type PrintOptions, type SavedArtifact,
} from "../src/game";
import { loadCampaign } from "../src/loader";
import { renderDrawer } from "../src/ui/drawers";

const controls = {
  timestamp: Date.parse("2030-01-01T08:00:00Z") / 1000,
  visualization: "table" as const,
};

const printOptions = (options: Partial<PrintOptions> = {}): PrintOptions => ({
  visualization: "table", showQuery: true, showLabels: true, showRange: false, zeroAxis: false, ...options,
});

/** Prints every artifact in the view its own result type allows, then returns the ids for filing. */
function printAll(game: GameEngine, caseId: string, artifacts: SavedArtifact[]): string[] {
  for (const artifact of artifacts) game.printArtifact(caseId, artifact.id, printOptions({ visualization: printableViews(artifact)[0] }));
  return artifacts.map((artifact) => artifact.id);
}

function clockCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.shifts[0].actionBudget = 8;
  campaign.shifts[0].actionCosts = { validQuery: 1, fileReport: 2, saveWatch: 2, retireWatch: 1 };
  return campaign;
}

function retryCampaign(): any {
  const campaign = clockCampaign();
  campaign.cases[0].outcomes = [
    {
      id: "outcome.success", titleChoiceIds: ["title.signal"], conclusionChoiceIds: ["conclusion.present"],
      decisionChoiceIds: ["decision.clear"], technicalEvidence: "supported", technicalExplanation: "The filed evidence supports the report.",
      ministryResponse: "Accepted.", effects: [{ type: "change", target: "standing.value", delta: 2 }],
    },
    {
      id: "outcome.fallback", technicalEvidence: "partial", technicalExplanation: "The report does not match the evidence.",
      ministryResponse: "Returned for correction.", effects: [{ type: "change", target: "standing.value", delta: -1 }],
    },
  ];
  return campaign;
}

function watchCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.cases[0].watchScenarioId = "watch.one";
  campaign.datasets[0].series[0].eventIds = ["event.intended"];
  campaign.datasets[0].series[0].samples.push({ time: "2030-01-01T09:00:00Z", value: 1 });
  campaign.datasets.push({ id: "data.empty", series: [], streams: [] });
  campaign.shifts[0].next = [{ shiftId: "shift.two" }];
  campaign.shifts.push(
    {
      id: "shift.two", actId: "act.one", title: "Checkpoint One", time: "2030-01-01T09:00:00Z", datasetId: "data.one",
      caseSelectionMode: "fixed", inbox: [],
      watchCheckpoints: [{ id: "checkpoint.one", time: "2030-01-01T09:00:00Z", datasetId: "data.one", execution: "execute", scenarioIds: ["watch.one"] }],
      next: [{ shiftId: "shift.three" }],
    },
    {
      id: "shift.three", actId: "act.one", title: "Checkpoint Two", time: "2030-01-01T10:00:00Z", datasetId: "data.empty",
      caseSelectionMode: "fixed", inbox: [],
      watchCheckpoints: [{ id: "checkpoint.two", time: "2030-01-01T10:00:00Z", datasetId: "data.empty", execution: "execute", scenarioIds: ["watch.one"] }],
      next: [],
    },
  );
  campaign.watchScenarios.push({
    id: "watch.one", mode: "metric", checkpointIds: ["checkpoint.one", "checkpoint.two"], resolveAfter: 1,
    events: [
      { id: "event.intended", relevance: "intended", sourceIds: ["series.one"], start: "2030-01-01T08:00:00Z", end: "2030-01-01T10:00:00Z", detectionStart: "2030-01-01T08:30:00Z", detectionEnd: "2030-01-01T09:30:00Z", localization: { district: "north" } },
      { id: "event.distractor", relevance: "distractor", sourceIds: ["stream.one"], start: "2030-01-01T08:00:00Z", end: "2030-01-01T10:00:00Z" },
    ],
    attributions: [{ sourceId: "series.one", eventIds: ["event.intended"] }, { sourceId: "stream.one", eventIds: ["event.distractor"] }],
    thresholds: { coverage: 1, specificity: 1, localization: 1, timeliness: 1, cost: 0.5 },
    costBudgets: { selectedSeries: 10, scannedSamples: 100, scannedRecords: 100, scannedBytes: 10000, returnedItems: 10 },
  });
  return campaign;
}

function recordWatchCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.datasets[0].streams[0].records[0].eventIds = ["incident.from-another-scenario"];
  campaign.features.logql = ["selector"];
  campaign.cases[0].languages.push("logql");
  campaign.cases[0].report.visualizations.push("logs");
  campaign.cases[0].watchScenarioId = "watch.records";
  campaign.shifts[0].next = [{ shiftId: "shift.two" }];
  campaign.shifts.push(
    {
      id: "shift.two", actId: "act.one", title: "Successful checkpoint", time: "2030-01-01T09:00:00Z", datasetId: "data.one",
      caseSelectionMode: "fixed", inbox: [],
      watchCheckpoints: [{ id: "checkpoint.records", time: "2030-01-01T09:00:00Z", datasetId: "data.one", execution: "execute", scenarioIds: ["watch.records"] }],
      next: [{ shiftId: "shift.three" }],
    },
    {
      id: "shift.three", actId: "act.one", title: "Expected error", time: "2030-01-01T10:00:00Z", datasetId: "data.one",
      caseSelectionMode: "fixed", inbox: [],
      watchCheckpoints: [{ id: "checkpoint.expected-error", time: "2030-01-01T10:00:00Z", datasetId: "data.one", execution: "error", errorMessage: "The archive is briefly unavailable.", scenarioIds: ["watch.records"] }],
      next: [],
    },
  );
  campaign.watchScenarios.push({
    id: "watch.records", mode: "records", checkpointIds: ["checkpoint.records", "checkpoint.expected-error"], lookbackSeconds: 7200,
    direction: "forward", limit: 20, resolveAfter: 1,
    events: [
      { id: "event.record", relevance: "intended", sourceIds: ["record.one"], start: "2030-01-01T07:00:00Z", end: "2030-01-01T09:00:00Z", localization: { job: "fixture" } },
      { id: "event.other", relevance: "distractor", sourceIds: ["series.one"], start: "2030-01-01T07:00:00Z", end: "2030-01-01T09:00:00Z" },
    ],
    attributions: [
      { sourceId: "record.one", eventIds: ["event.record"] },
      { sourceId: "series.one", eventIds: ["event.other"] },
    ],
    thresholds: { coverage: 1, specificity: 1, localization: 1, timeliness: 1, cost: 0.5 },
    costBudgets: { selectedSeries: 10, scannedSamples: 100, scannedRecords: 100, scannedBytes: 10000, returnedItems: 10 },
  });
  return campaign;
}

function provenanceCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.features.logql = ["selector", "parse.json"];
  campaign.concepts = [{
    id: "logql.field.provenance", accessRightId: "access.fixture", language: "logql", family: "provenance", stage: "Intermediate",
    unitKinds: ["ordered-artifact-set"], competency: "Distinguish field origins.",
    semantic: { kind: "U", property: "artifact-count", relation: ">=", expected: 2 },
    evidence: { kind: "E", rule: "provenance", selectors: ["artifact"], parameters: { distinctions: ["indexed-label", "structured-metadata", "extracted-field"] } },
    prerequisites: [],
  }];
  campaign.acts[0].conceptIds = ["logql.field.provenance"];
  campaign.logSources[0].structuredMetadata = [{ name: "trace_id", type: "string", description: "Fixture trace.", parser: "metadata" }];
  campaign.datasets[0].streams[0].records[0].metadata = { trace_id: "trace.one" };
  const item = campaign.cases[0];
  item.languages = ["logql"];
  item.conceptIds = ["logql.field.provenance"];
  item.masteryUses = [{ conceptId: "logql.field.provenance", targetState: "Observed", unitKind: "ordered-artifact-set", maxAssistance: "Worked", artifactSelectors: ["artifact[1]", "artifact[2]"] }];
  const provenance = { kind: "E", rule: "provenance", selectors: ["artifact"], parameters: { distinctions: ["indexed-label", "structured-metadata", "extracted-field"] } };
  item.evidencePaths = [
    { id: "path.provenance", clauses: [{ conceptId: "logql.field.provenance", artifactSelectors: ["artifact[1]", "artifact[2]"], requirements: provenance }] },
    { id: "path.provenance.alternative", clauses: [{ conceptId: "logql.field.provenance", artifactSelectors: ["artifact[1]", "artifact[2]"], requirements: structuredClone(provenance) }] },
  ];
  item.report.minArtifacts = 2;
  item.report.maxArtifacts = 2;
  item.report.visualizations = ["logs"];
  item.variants[0].rangeStart = "2030-01-01T07:00:00Z";
  item.variants[0].rangeEnd = "2030-01-01T09:00:00Z";
  const artifacts = [
    { role: "first", language: "logql", mode: "records", query: "{job=\"fixture\"} | json" },
    { role: "second", language: "logql", mode: "records", query: "{job=\"fixture\"} | json" },
  ];
  item.technicalTruth.artifactRoles = {
    first: "The first query exposes the initial set of field origins.",
    second: "The second query exposes the comparison set of field origins.",
  };
  item.variants[0].referenceSets = [
    { id: "reference.provenance", evidencePathId: "path.provenance", artifacts },
    { id: "reference.provenance.alternative", evidencePathId: "path.provenance.alternative", artifacts: structuredClone(artifacts) },
  ];
  item.variants[0].workedEvidenceSet = {
    evidencePathId: "path.provenance",
    artifacts: artifacts.map((artifact: Record<string, unknown>, index: number) => ({
      ...artifact, explanation: `Inspect field origins in record result ${index + 1}.`,
      print: { visualization: "logs", showQuery: true, showLabels: true, showRange: true, zeroAxis: false },
    })),
  };
  return campaign;
}

function mixedClauseCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.features.logql = ["selector"];
  campaign.concepts.push({
    id: "fixture.logs", accessRightId: "access.fixture", language: "logql", family: "selector", stage: "Foundation",
    unitKinds: ["query-artifact"], competency: "Inspect fixture records.",
    semantic: { kind: "U", property: "language-sequence", relation: "=", expected: ["logql"] },
    evidence: { kind: "U", property: "artifact-count", relation: "=", expected: 1 },
    prerequisites: [],
  });
  campaign.acts[0].conceptIds.push("fixture.logs");
  const item = campaign.cases[0];
  item.languages.push("logql");
  item.conceptIds.push("fixture.logs");
  item.report.minArtifacts = 2;
  item.report.maxArtifacts = 2;
  item.report.visualizations.push("logs");
  item.variants[0].rangeStart = "2030-01-01T07:00:00Z";
  item.variants[0].rangeEnd = "2030-01-01T08:00:01Z";
  for (const path of item.evidencePaths) {
    path.clauses[0].artifactSelectors = ["artifact[1]"];
    path.clauses.push({
      conceptId: "fixture.logs", artifactSelectors: ["artifact[2]"],
      requirements: { op: "all", items: [
        { kind: "U", property: "artifact-count", relation: "=", expected: 1 },
        { kind: "U", property: "language-sequence", relation: "=", expected: ["logql"] },
      ] },
    });
  }
  for (const referenceSet of item.variants[0].referenceSets) referenceSet.artifacts.push({
    role: "records", language: "logql", mode: "records", query: '{job="fixture"}',
  });
  item.variants[0].workedEvidenceSet.artifacts.push({
    role: "records", language: "logql", mode: "records", query: '{job="fixture"}', explanation: "Inspect matching fixture records.",
    print: { visualization: "logs", showQuery: true, showLabels: true, showRange: true, zeroAxis: false },
  });
  item.technicalTruth.artifactRoles.records = "The records query supplies the matching fixture records.";
  return campaign;
}

function claimMasteryCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.concepts[0].evidence = {
    kind: "E", rule: "claim-support", selectors: ["artifact"], parameters: { subjects: ["title", "conclusion"] },
  };
  const item = campaign.cases[0];
  item.evidenceRequirements = [
    {
      conceptId: "fixture.selector", rule: "claim-support", selectors: ["artifact"], subject: "title", choiceId: "title.signal",
      alternatives: [[{ kind: "R", selector: "artifact", property: "result-type", relation: "=", expected: "instant-vector" }]],
    },
    ...item.report.conclusions.map((choice: { id: string }) => ({
      conceptId: "fixture.selector", rule: "claim-support", selectors: ["artifact"], subject: "conclusion", choiceId: choice.id,
      alternatives: [[{ kind: "R", selector: "artifact", property: "result-type", relation: "=", expected: "instant-vector" }]],
    })),
  ];
  return campaign;
}

function memoCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.characters.push({ id: "character.vale", name: "Oskar Vale", role: "Statistician", description: "Fixture character." });
  campaign.consequences.push(
    {
      id: "consequence.named", condition: { op: "compare", left: { fact: "standing.value" }, relation: ">=", right: 0 },
      explanation: "Oskar Vale: I need the northern district figures kept exact.",
      effects: [{ type: "change", target: "standing.value", delta: 1 }],
    },
    {
      id: "consequence.anonymous", condition: { op: "compare", left: { fact: "standing.value" }, relation: ">=", right: 0 },
      explanation: "The northern district reassurance figures have been revised upward for the quarterly summary, again. No further action is required of you.",
      effects: [],
    },
  );
  campaign.shifts[0].inbox = [];
  campaign.shifts[0].next = [{ shiftId: "shift.two" }];
  campaign.shifts.push({
    id: "shift.two", actId: "act.one", title: "Second Fixture Shift", time: "2030-01-02T08:00:00Z", datasetId: "data.one",
    caseSelectionMode: "fixed", inbox: [], next: [],
  });
  return campaign;
}

function endingCampaign(endingId: string): any {
  const campaign = structuredClone(fixture) as any;
  campaign.endings[0].id = endingId;
  campaign.endings[0].condition = { op: "compare", left: { fact: "standing.value" }, relation: ">=", right: 0 };
  return campaign;
}

function preferenceCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.cases[0].outcomes[0].effects = [{ type: "change", target: "standing.value", delta: 5 }];
  campaign.cases[0].outcomes.push({
    id: "outcome.preferred", titleChoiceIds: ["title.signal"], conclusionChoiceIds: ["conclusion.absent"],
    decisionChoiceIds: ["decision.review"], technicalEvidence: "unsupported", ministryResponse: "Reassuring.",
    effects: [{ type: "change", target: "standing.value", delta: 10 }],
  });
  return campaign;
}

function fileFixtureReport(game: GameEngine): string {
  const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);
  game.fileReport("case.one", printAll(game, "case.one", [artifact]), "title.signal", "conclusion.present", "decision.clear", "table");
  return artifact.id;
}

describe("game engine", () => {
  it("projects source timestamps into the case timeline", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.datasets[0].streams[0].records[0].line = "observed_at=2030-01-01T08:00:00Z";
    const context = buildQueryContext(loadCampaign(campaign), "data.one", controls, undefined, 86_400);
    expect(context.metrics![0]!.samples[0]!.timestamp).toBe(controls.timestamp + 86_400);
    expect(context.logs![0]!.records[0]).toMatchObject({
      timestamp: controls.timestamp + 86_400,
      line: "observed_at=2030-01-02T08:00:00.000Z",
    });
  });

  it("timestamps query artifacts and reports from authored UTC campaign context", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].variants[0].evaluationTime = "2030-01-01T09:00:00Z";
    const alternate = structuredClone(campaign.cases[0].variants[0]);
    alternate.id = "variant.two";
    alternate.dataShapeId = "shape.two";
    alternate.evaluationTime = "2030-01-02T09:00:00Z";
    campaign.cases[0].variants.push(alternate);
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 0));
    expect(game.caseVariant("case.one").id).toBe(campaign.cases[0].variants[0].id);
    const queryTime = Date.parse("2041-02-03T14:15:16Z") / 1000;
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", { timestamp: queryTime, visualization: "table" }, false, true, "worked-signal");
    expect(artifact.createdAt).toBe("2041-02-03T14:15:16.000Z");
    expect(artifact.role).toBe("worked-signal");
    const report = game.fileReport("case.one", printAll(game, "case.one", [artifact]), "title.signal", "conclusion.present", "decision.clear", "table");
    expect(report.filedAt).toBe("2030-01-01T09:00:00Z");
    expect(report.campaignTime).toBe("2030-01-01T09:00:00Z");
    expect(report.filedAt).not.toContain(String(new Date().getUTCFullYear()));
  });

  it("keeps syntax failure free and separates report truth, Standing, and private history", () => {
    const index = loadCampaign(clockCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 7));
    const failed = game.runQuery("case.one", "promql", "fixture_signal{", controls);
    expect(failed.execution.ok).toBe(false);
    expect(game.state.clockUsed).toBe(0);

    const filedId = fileFixtureReport(game);
    expect(game.state.clockUsed).toBe(3);
    expect(game.state.artifacts).toHaveLength(2);
    expect(game.state.reports[0]?.artifactIds).toEqual([filedId]);
    expect(game.state.reports[0]?.evidence).toBe("supported");
    expect(game.state.standing).toBe(0);
    expect(game.state.mastery["fixture.selector"]?.state).toBe("Observed");
    expect(game.state.artifacts[0]?.filed).toBe(false);
    expect(game.state.artifacts[1]?.filed).toBe(true);
  });

  it("returns an unsuccessful filed attempt with actionable diagnostics and keeps the case open", () => {
    const index = loadCampaign(retryCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 75));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal{", controls);
    if (artifact.execution.ok) throw new Error("Expected the fixture query to fail");

    const report = game.fileReport(
      "case.one", printAll(game, "case.one", [artifact]), "title.signal", "conclusion.present", "decision.clear", "table",
    );

    expect(report).toMatchObject({ id: "report.one.attempt.1", outcomeId: "outcome.fallback", evidence: "error" });
    expect(report.technicalExplanation).toContain(artifact.execution.error.message);
    expect(report.technicalExplanation).toMatch(/correct the query and file a new attempt/i);
    expect(game.state.completedCases).not.toContain("case.one");
    expect(game.inbox().find((item) => item.id === "case.one")?.done).toBe(false);
    expect(game.state.progress["case:case.one"]).toMatchObject({ phase: "active", outcome: "failed" });
    expect(game.canAdvance()).toBe(false);
    expect(game.state.clockUsed).toBe(2);
    expect(game.state.standing).toBe(-1);
    expect(game.state.standingHistory.map((change) => change.delta)).toEqual([-1]);
  });

  it("names the report choice that conflicts with the other choices", () => {
    const index = loadCampaign(retryCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 751));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);

    const report = game.fileReport(
      "case.one", printAll(game, "case.one", [artifact]), "title.signal", "conclusion.present", "decision.review", "table",
    );

    expect(report.technicalExplanation).toMatch(/recommended action points to a different finding/i);
    expect(report.technicalExplanation).toContain("You filed:");
    expect(game.state.completedCases).not.toContain("case.one");
  });

  it("describes the returned result when valid evidence does not prove the filing", () => {
    const index = loadCampaign(retryCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 752));
    const artifact = game.runQuery("case.one", "promql", "1", controls);

    const report = game.fileReport(
      "case.one", printAll(game, "case.one", [artifact]), "title.signal", "conclusion.present", "decision.clear", "table",
    );

    expect(report.technicalExplanation).toMatch(/returned scalar 1/i);
    expect(report.technicalExplanation).toMatch(/does not yet prove/i);
    expect(game.state.completedCases).not.toContain("case.one");
  });

  it("preserves a returned attempt and its consequences when a corrected report completes the case", () => {
    const index = loadCampaign(retryCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 76));
    const failedArtifact = game.runQuery("case.one", "promql", "fixture_signal{", controls);
    const first = game.fileReport(
      "case.one", printAll(game, "case.one", [failedArtifact]), "title.signal", "conclusion.present", "decision.clear", "table",
    );
    const firstSnapshot = structuredClone(first);
    const validArtifact = game.runQuery("case.one", "promql", "fixture_signal", controls);

    const corrected = game.fileReport(
      "case.one", printAll(game, "case.one", [validArtifact]), "title.signal", "conclusion.present", "decision.clear", "table",
    );

    expect(corrected).toMatchObject({ id: "report.one", outcomeId: "outcome.success", evidence: "supported" });
    expect(game.state.reports).toEqual([firstSnapshot, corrected]);
    expect(game.archiveReports().map((report) => report.id)).toEqual(["report.one", "report.one.attempt.1"]);
    expect(game.state.completedCases).toContain("case.one");
    expect(game.inbox().find((item) => item.id === "case.one")?.done).toBe(true);
    expect(game.canAdvance()).toBe(true);
    expect(game.state.clockUsed).toBe(5);
    expect(game.state.standing).toBe(1);
    expect(game.state.standingHistory.map((change) => change.delta)).toEqual([-1, 2]);
  });

  it("uses the declared fallback outcome regardless of its array position", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].outcomes.push({
      id: "outcome.specific", titleChoiceIds: ["title.signal"], conclusionChoiceIds: ["conclusion.absent"],
      decisionChoiceIds: ["decision.clear"], technicalEvidence: "supported", ministryResponse: "Specific response.",
    });
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 72));

    fileFixtureReport(game);

    expect(game.state.reports[0]?.outcomeId).toBe("outcome.fallback");
  });

  it("archives every Standing change with its campaign reason", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].outcomes[0].effects = [{ type: "change", target: "standing.value", delta: 500 }];
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 71));

    fileFixtureReport(game);

    expect(game.state.standingHistory).toEqual([expect.objectContaining({
      value: 100, delta: 100, shiftId: "shift.one", campaignTime: "2030-01-01T08:00:00Z",
      reason: expect.stringContaining("Recorded"),
    })]);
  });

  it("can restart a clocked shift without resetting the campaign", () => {
    const index = loadCampaign(clockCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 8));
    fileFixtureReport(game);
    expect(game.state.clockUsed).toBe(3);
    expect(game.state.reports).toHaveLength(1);

    game.restartShift();

    expect(game.state.currentShiftId).toBe("shift.one");
    expect(game.state.clockUsed).toBe(0);
    expect(game.state.reports).toHaveLength(0);
    expect(game.state.artifacts).toHaveLength(0);
  });

  it("allows an expired shift to close and records whether its required work was complete", () => {
    const nextShift = (campaign: any) => {
      campaign.shifts[0].next = [{ shiftId: "shift.two" }];
      campaign.shifts.push({
        ...structuredClone(campaign.shifts[0]), id: "shift.two", title: "Second Fixture Shift",
        time: "2030-01-01T09:00:00Z", inbox: [], actionBudget: undefined, actionCosts: undefined, next: [],
      });
      return campaign;
    };

    const unfinishedIndex = loadCampaign(nextShift(clockCampaign()));
    const unfinished = new GameEngine(unfinishedIndex, executeQuery, createGameState(unfinishedIndex, 81));
    expect(unfinished.canAdvance()).toBe(false);
    for (let run = 0; run < 8; run += 1) unfinished.runQuery("case.one", "promql", "fixture_signal", controls);
    expect(unfinished.clockExpired()).toBe(true);
    expect(unfinished.canAdvance()).toBe(true);
    unfinished.advanceShift();
    expect(unfinished.state.currentShiftId).toBe("shift.two");
    expect(unfinished.state.progress["shift:shift.one"]?.outcome).toBe("failed");

    const completeCampaign = nextShift(clockCampaign());
    completeCampaign.shifts[0].actionBudget = 3;
    const completeIndex = loadCampaign(completeCampaign);
    const complete = new GameEngine(completeIndex, executeQuery, createGameState(completeIndex, 82));
    fileFixtureReport(complete);
    expect(complete.clockExpired()).toBe(true);
    complete.advanceShift();
    expect(complete.state.progress["shift:shift.one"]?.outcome).toBe("succeeded");

    const unclockedIndex = loadCampaign(nextShift(structuredClone(fixture)));
    const unclocked = new GameEngine(unclockedIndex, executeQuery, createGameState(unclockedIndex, 83));
    expect(unclocked.clockExpired()).toBe(false);
    expect(unclocked.canAdvance()).toBe(false);
  });

  it("preserves non-finite archived evidence when restarting a later shift", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].report.maxArtifacts = 3;
    campaign.shifts[0].next = [{ shiftId: "shift.two" }];
    campaign.shifts.push({
      ...structuredClone(campaign.shifts[0]), id: "shift.two", title: "Second Fixture Shift",
      time: "2030-01-01T09:00:00Z", inbox: [], next: [],
    });
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 9));
    const artifacts = ["1 / 0", "-1 / 0", "0 / 0"].map((query) => game.runQuery("case.one", "promql", query, controls));
    game.fileReport("case.one", printAll(game, "case.one", artifacts), "title.signal", "conclusion.present", "decision.clear", "stat");
    game.advanceShift();

    const resumed = new GameEngine(index, executeQuery, structuredClone(game.state));
    resumed.restartShift();

    const values = resumed.state.artifacts.map((artifact) => artifact.execution.ok && artifact.execution.result.type === "scalar" ? artifact.execution.result.value : undefined);
    expect(values.slice(0, 2)).toEqual([Infinity, -Infinity]);
    expect(Number.isNaN(values[2])).toBe(true);
    expect(() => renderDrawer("archive", {
      index, engine: resumed, registryKind: "metrics", registrySearch: "", selectedReport: "",
    })).not.toThrow();
  });

  it("distinguishes every non-finite value when matching authored evidence", () => {
    for (const [referenceQuery, actualQuery] of [["1 / 0", "-1 / 0"], ["1 / 0", "0 / 0"], ["-1 / 0", "0 / 0"]] as const) {
      const campaign = structuredClone(fixture) as any;
      for (const path of campaign.cases[0].evidencePaths) path.clauses[0].requirements = { op: "all", items: [
        { kind: "A", selector: "artifact", node: "binary", parameters: {} },
        { kind: "R", selector: "artifact", property: "result-type", relation: "=", expected: "scalar" },
      ] };
      for (const set of campaign.cases[0].variants[0].referenceSets) set.artifacts[0].query = referenceQuery;
      const index = loadCampaign(campaign);
      const game = new GameEngine(index, executeQuery, createGameState(index, 90));
      const artifact = game.runQuery("case.one", "promql", actualQuery, controls);

      expect(game.reportPreview("case.one", [artifact.id]).titles["title.signal"]).toBe("partial");
    }
  });

  it("requires official narrative items to be acknowledged before ending a shift", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.narrativeItems.push({ id: "directive.one", kind: "directive", title: "Read this", body: "Official context." });
    campaign.shifts[0].inbox.push({ kind: "directive", id: "directive.one" });
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 74));
    fileFixtureReport(game);

    expect(game.canAdvance()).toBe(false);
    game.readItem("directive.one");
    expect(game.canAdvance()).toBe(true);
  });

  it("keeps one adaptive case selected after it is completed", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.shifts[0].caseSelectionMode = "mixed";
    campaign.cases[0].mode = "adaptive";
    const alternate = structuredClone(campaign.cases[0]);
    alternate.id = "case.two";
    alternate.reportId = "report.two";
    alternate.decisionId = "decision.two";
    alternate.variants[0].id = "variant.two";
    campaign.cases.push(alternate);
    campaign.shifts[0].inbox.push({ kind: "case", id: "case.two" });
    const index = loadCampaign(campaign);
    index.cases.get("case.two")!.conceptIds = ["concept.weak"];
    const state = createGameState(index, 73);
    state.mastery["fixture.selector"] = { state: "Independent", credits: [] };
    state.mastery["concept.weak"] = { state: "Unobserved", credits: [] };
    const game = new GameEngine(index, executeQuery, state);
    const selected = game.inbox().find((item) => item.kind === "case")!.id;
    const artifact = game.runQuery(selected, "promql", "fixture_signal", controls);

    game.fileReport(selected, printAll(game, selected, [artifact]), "title.signal", "conclusion.present", "decision.clear", "table");

    expect(selected).toBe("case.two");
    expect(game.inbox().filter((item) => item.kind === "case")).toEqual([expect.objectContaining({ id: selected, done: true })]);
    expect(game.canAdvance()).toBe(true);
  });

  it("replays archived evidence without changing campaign records or Standing", () => {
    const index = loadCampaign(fixture);
    const game = new GameEngine(index, executeQuery, createGameState(index, 9));
    const artifactId = fileFixtureReport(game);
    const before = { standing: game.state.standing, reports: game.state.reports.length, artifacts: game.state.artifacts.length, world: structuredClone(game.state.world) };
    const replay = game.replayQuery("report.one", artifactId, "fixture_signal{district=\"north\"}");
    expect(replay.execution.ok).toBe(true);
    expect(replay.replayOfId).toBe(artifactId);
    expect(replayResultFor(artifactId, replay)).toBe(replay);
    expect(game.state.artifacts.some((artifact) => artifact.id === replay.id)).toBe(false);
    expect({ standing: game.state.standing, reports: game.state.reports.length, artifacts: game.state.artifacts.length, world: game.state.world }).toEqual(before);
  });

  it("requires every artifact to execute successfully before awarding provenance mastery", () => {
    const index = loadCampaign(provenanceCampaign());
    const logControls = { timestamp: controls.timestamp + 3600, start: controls.timestamp - 3600, end: controls.timestamp + 3600, direction: "backward" as const, limit: 100, visualization: "logs" as const };
    const failedGame = new GameEngine(index, executeQuery, createGameState(index, 12));
    const failed = [
      failedGame.runQuery("case.one", "logql", "{", logControls),
      failedGame.runQuery("case.one", "logql", "{job=", logControls),
    ];
    failedGame.fileReport("case.one", printAll(failedGame, "case.one", failed), "title.signal", "conclusion.present", "decision.clear", "logs");
    expect(failedGame.state.mastery["logql.field.provenance"]).toEqual({ state: "Unobserved", credits: [] });
    expect(failedGame.state.attempts.at(-1)).toMatchObject({ state: "errored", behaviorPass: false, evidencePass: false, creditAwarded: false });

    const validGame = new GameEngine(index, executeQuery, createGameState(index, 13));
    const valid = [
      validGame.runQuery("case.one", "logql", "{job=\"fixture\"} | json", logControls),
      validGame.runQuery("case.one", "logql", "{job=\"fixture\"} | json", logControls),
    ];
    validGame.fileReport("case.one", printAll(validGame, "case.one", valid), "title.signal", "conclusion.present", "decision.clear", "logs");
    expect(validGame.state.mastery["logql.field.provenance"]?.state).toBe("Observed");
    expect(validGame.state.attempts.at(-1)).toMatchObject({ state: "successful", behaviorPass: true, evidencePass: true, creditAwarded: true });
  });

  it("resolves explicit mastery slots without prefix or ambiguous language inference", () => {
    const index = loadCampaign(fixture);
    const game = new GameEngine(index, executeQuery, createGameState(index, 14));
    const failed = game.runQuery("case.one", "promql", "fixture_signal{", controls);
    const valid = game.runQuery("case.one", "promql", "fixture_signal", controls);
    const item = index.cases.get("case.one")!;
    const variant = item.variants[0]!;
    const use = item.masteryUses[0]!;
    expect(assessMasteryUse(index, item, variant, { ...use, artifactSelectors: ["artifact[2]"] }, [failed, valid]).creditAwarded).toBe(true);
    expect(assessMasteryUse(index, item, variant, { ...use, artifactSelectors: ["promql"] }, [failed, valid]).creditAwarded).toBe(false);
  });

  it("does not award mastery before its declared prerequisites are observed", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.concepts.push({ ...structuredClone(campaign.concepts[0]), id: "fixture.prerequisite", prerequisites: [] });
    campaign.concepts[0].prerequisites = ["fixture.prerequisite"];
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 21));

    fileFixtureReport(game);

    expect(game.state.mastery["fixture.selector"]).toEqual({ state: "Unobserved", credits: [] });
    expect(game.state.attempts.at(-1)).toMatchObject({ behaviorPass: true, evidencePass: true, creditAwarded: false });
  });

  it("evaluates each concept clause against its declared ordered artifact projection", () => {
    const index = loadCampaign(mixedClauseCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 16));
    const metric = game.runQuery("case.one", "promql", "fixture_signal", controls);
    const records = game.runQuery("case.one", "logql", '{job="fixture"}', {
      timestamp: controls.timestamp, start: controls.timestamp - 3600, end: controls.timestamp + 1,
      lookback: 3601, direction: "backward", limit: 100, visualization: "logs",
    });
    const report = game.fileReport("case.one", printAll(game, "case.one", [metric, records]), "title.signal", "conclusion.present", "decision.clear", "logs");
    expect(report.evidence).toBe("supported");
    expect(game.state.assessments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "path.selector", state: "supported" }),
      expect.objectContaining({ id: "path.result", state: "supported" }),
    ]));
  });

  it("passes filed report choices into claim-support mastery assessment", () => {
    const index = loadCampaign(claimMasteryCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 17));
    fileFixtureReport(game);
    expect(game.state.mastery["fixture.selector"]?.state).toBe("Observed");
    expect(game.state.attempts.at(-1)).toMatchObject({ behaviorPass: true, evidencePass: true, creditAwarded: true });
  });

  it("grants the standing-query capacity attached to a promotion", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.ranks.push({
      id: "rank.two", name: "Fixture Watch Officer", order: 2, grants: [], watchAuthority: 3,
      eligibilityText: "The fixture promotion is earned.", appointmentText: "The fixture office opened a vacant watch desk.",
      condition: { op: "compare", left: { fact: "standing.value" }, relation: ">=", right: 0 },
    });
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 18));

    fileFixtureReport(game);

    expect(game.state.rankId).toBe("rank.two");
    expect(game.state.watchCapacity).toBe(3);
  });

  it("treats an already-earned authored promotion as idempotent", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.ranks.push({
      id: "rank.two", name: "Fixture Clerk", order: 2, grants: [], watchAuthority: 1,
      eligibilityText: "The fixture promotion is earned.", appointmentText: "The fixture office opened a vacant clerk desk.",
    });
    campaign.cases[0].outcomes[0].effects = [{ type: "promote", rankId: "rank.two" }];
    const index = loadCampaign(campaign);
    const state = createGameState(index, 19);
    state.rankId = "rank.two";
    const game = new GameEngine(index, executeQuery, state);

    expect(() => fileFixtureReport(game)).not.toThrow();
    expect(game.state.rankId).toBe("rank.two");
  });

  it("runs a saved expression at later checkpoints and maintains notice lifecycle", () => {
    const campaign = watchCampaign();
    campaign.watchScenarios[0].events[0].detectionStart = "2030-01-01T10:00:00+02:00";
    campaign.watchScenarios[0].events[0].detectionEnd = "2030-01-01T10:30:00+01:00";
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 11));
    const artifactId = fileFixtureReport(game);
    const watch = game.saveWatch("case.one", artifactId);
    game.advanceShift();
    expect(game.state.notices).toHaveLength(1);
    expect(game.state.notices[0]).toMatchObject({ state: "open", eventIds: ["event.intended"], localization: { district: "north" } });
    game.advanceShift();
    expect(game.state.notices[0]?.state).toBe("resolved");
    expect(game.state.watches.find((item) => item.id === watch.id)?.executions).toHaveLength(2);
    expect(game.state.watches.find((item) => item.id === watch.id)?.scores).toMatchObject({ coverage: 1, specificity: 1, localization: 1, timeliness: 1, checkpointSuccess: true });
  });

  it("clears a retired watch's open notices from the in tray", () => {
    const index = loadCampaign(watchCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 11));
    const artifactId = fileFixtureReport(game);
    const watch = game.saveWatch("case.one", artifactId);
    game.advanceShift();
    expect(game.inbox()).toContainEqual(expect.objectContaining({ kind: "notice", title: expect.stringMatching(/^1 candidate/) }));

    game.retireWatch(watch.id);

    expect(game.state.notices[0]).toMatchObject({ state: "resolved", resolvedAt: game.state.notices[0]!.lastSeen });
    expect(game.inbox().some((item) => item.kind === "notice")).toBe(false);
  });

  it("clears open notices when an effect retires a watch", () => {
    const campaign = watchCampaign();
    campaign.shifts[1].next[0].effects = [{ type: "retire_watch", watchId: "watch.1" }];
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 12));
    const artifactId = fileFixtureReport(game);
    game.saveWatch("case.one", artifactId);
    game.advanceShift();
    expect(game.inbox().some((item) => item.kind === "notice")).toBe(true);

    game.advanceShift();

    expect(game.state.watches[0]?.state).toBe("retired");
    expect(game.state.notices[0]).toMatchObject({ state: "resolved", resolvedAt: game.state.notices[0]!.lastSeen });
    expect(game.inbox().some((item) => item.kind === "notice")).toBe(false);
  });

  it("keeps a locked source out of direct, saved-watch probe, and checkpoint execution", () => {
    const campaign = watchCampaign();
    campaign.rightDeclarations.push({ id: "access.locked", kind: "access", name: "Locked fixture source", initial: false });
    campaign.metrics[0].accessRightId = "access.locked";
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 12));
    const artifactId = fileFixtureReport(game);
    const artifact = game.state.artifacts.find((item) => item.id === artifactId)!;

    expect(artifact.execution).toMatchObject({ ok: true, result: { type: "instant-vector", series: [] } });
    game.saveWatch("case.one", artifactId);
    game.advanceShift();

    expect(game.state.watches[0]?.executions).toEqual([expect.objectContaining({ checkpointId: "checkpoint.one", state: "successful" })]);
    expect(game.state.notices).toEqual([]);
  });

  it("evaluates checkpoints for watches saved during the current shift", () => {
    const campaign = watchCampaign();
    campaign.shifts[0].watchCheckpoints = campaign.shifts[1].watchCheckpoints;
    campaign.shifts[1].watchCheckpoints = [];
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 12));
    const artifactId = fileFixtureReport(game);
    const watch = game.saveWatch("case.one", artifactId);

    game.advanceShift();

    expect(game.state.notices).toHaveLength(1);
    expect(game.state.watches.find((item) => item.id === watch.id)?.executions).toEqual([
      expect.objectContaining({ checkpointId: "checkpoint.one", state: "successful" }),
    ]);
  });

  it("attributes record watches and treats authored checkpoint errors as expected lifecycle freezes", () => {
    const index = loadCampaign(recordWatchCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 15));
    const artifact = game.runQuery("case.one", "logql", '{job="fixture"}', {
      timestamp: controls.timestamp, start: controls.timestamp - 3600, end: controls.timestamp,
      lookback: 3600, direction: "forward", limit: 20, visualization: "logs",
    });
    game.fileReport("case.one", printAll(game, "case.one", [artifact]), "title.signal", "conclusion.present", "decision.clear", "logs");
    const watch = game.saveWatch("case.one", artifact.id);
    game.advanceShift();
    expect(game.state.notices[0]).toMatchObject({ state: "open", eventIds: ["event.record"], occurrenceCount: 1, candidateCount: 1, absentEvaluations: 0 });
    game.advanceShift();
    expect(game.state.notices[0]).toMatchObject({ state: "open", occurrenceCount: 1, candidateCount: 1, absentEvaluations: 0 });
    expect(game.state.watchErrors).toContainEqual({ watchId: watch.id, checkpointId: "checkpoint.expected-error", message: "The archive is briefly unavailable.", time: "2030-01-01T10:00:00Z" });
    expect(game.state.watches.find((item) => item.id === watch.id)?.scores).toMatchObject({ checkpointSuccess: true, coverage: 1 });
    game.retireWatch(watch.id);
    expect(game.inbox().some((item) => item.kind === "watch-error")).toBe(false);
  });

  it("binds a view to a result at print time and refuses views the result cannot take", () => {
    const index = loadCampaign(clockCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 31));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);

    expect(() => game.printArtifact("case.one", artifact.id, printOptions({ visualization: "graph" }))).toThrow(/instant-vector result prints as table or stat, not graph/);
    expect(() => game.printArtifact("case.one", "artifact.missing", printOptions())).toThrow(/missing or belongs to another case/);
    expect(game.state.artifacts[0]?.print).toBeUndefined();

    game.printArtifact("case.one", artifact.id, printOptions({ visualization: "table" }));
    const printed = game.printArtifact("case.one", artifact.id, printOptions({ visualization: "stat", showQuery: false, showLabels: false, zeroAxis: true }));
    expect(printed.print).toEqual({ visualization: "stat", showQuery: false, showLabels: false, showRange: false, zeroAxis: true });
    expect(game.state.clockUsed).toBe(1);

    const report = game.fileReport("case.one", [artifact.id], "title.signal", "conclusion.present", "decision.clear");
    expect(report.visualization).toBe("stat");
    expect(() => game.printArtifact("case.one", artifact.id, printOptions({ visualization: "table" }))).toThrow(/keeps the view it was printed with/);
  });

  it("refuses to file a pinned result that was never printed", () => {
    const index = loadCampaign(fixture);
    const game = new GameEngine(index, executeQuery, createGameState(index, 32));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);

    expect(() => game.fileReport("case.one", [artifact.id], "title.signal", "conclusion.present", "decision.clear", "table"))
      .toThrow("Print every pinned result before filing");
    expect(game.state.reports).toHaveLength(0);
  });

  it("rejects duplicate artifact ids before report size and artifact resolution", () => {
    const index = loadCampaign(fixture);
    const game = new GameEngine(index, executeQuery, createGameState(index, 32));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);
    game.printArtifact("case.one", artifact.id, printOptions());

    expect(() => game.fileReport(
      "case.one", [artifact.id, artifact.id, artifact.id], "title.signal", "conclusion.present", "decision.clear", "table",
    )).toThrow("File each evidence artifact only once");
    expect(game.state.reports).toHaveLength(0);
    expect(game.state.artifacts[0]?.filed).toBe(false);
  });

  it("trashes a printout without deleting its query result or refunding time", () => {
    const index = loadCampaign(clockCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 32));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);
    game.printArtifact("case.one", artifact.id, printOptions());

    game.trashPrintout("case.one", artifact.id);

    expect(game.state.artifacts).toHaveLength(1);
    expect(game.state.artifacts[0]?.print).toBeUndefined();
    expect(game.state.clockUsed).toBe(1);
    expect(() => game.trashPrintout("case.one", artifact.id)).toThrow("not printed");
  });

  it("retains the shift-opening Standing after reports change it and after reload", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].outcomes[0].effects = [{ type: "change", target: "standing.value", delta: -1 }];
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 32));

    expect(game.shiftStartingStanding()).toBe(0);
    fileFixtureReport(game);
    expect(game.state.standing).toBe(-1);
    expect(game.shiftStartingStanding()).toBe(0);

    const restored = new GameEngine(index, executeQuery, JSON.parse(game.serialize()));
    expect(restored.shiftStartingStanding()).toBe(0);
  });

  it("reads the printed view and its toggles as artifact facts", () => {
    const index = loadCampaign(fixture);
    const game = new GameEngine(index, executeQuery, createGameState(index, 33));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);
    game.printArtifact("case.one", artifact.id, printOptions({ visualization: "stat", showQuery: false, showRange: true }));
    game.fileReport("case.one", [artifact.id], "title.signal", "conclusion.present", "decision.clear");

    const fact = (field: string, expected: unknown) =>
      game.conditionSatisfied({ op: "state", value: { fact: `artifact:${artifact.id}.${field}` }, expected: expected as never });
    expect(fact("visualization_id", "stat")).toBe(true);
    expect(fact("print_query", false)).toBe(true);
    expect(fact("print_labels", true)).toBe(true);
    expect(fact("print_range", true)).toBe(true);
    expect(fact("print_zero_axis", false)).toBe(true);
  });

  it("delivers a memo whenever a consequence with an explanation lands", () => {
    const index = loadCampaign(memoCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 34));
    expect(game.inbox().some((item) => item.kind === "memo")).toBe(false);

    game.advanceShift();

    expect(game.state.standing).toBe(1);
    expect(game.state.memos).toEqual([
      expect.objectContaining({ id: "memo.1", consequenceId: "consequence.named", from: "Oskar Vale", text: "I need the northern district figures kept exact.", shiftNumber: 2, campaignTime: "2030-01-02T08:00:00Z", read: false }),
      expect.objectContaining({ consequenceId: "consequence.anonymous", from: "The Ministry", read: false }),
    ]);
    expect(game.inbox().filter((item) => item.kind === "memo")).toEqual([
      { kind: "memo", id: "memo.1", title: "I need the northern district figures kept exact.", done: false },
      { kind: "memo", id: "memo.2", title: "The northern district reassurance figures have been revised…", done: false },
    ]);
    expect(game.canAdvance()).toBe(true);

    game.readItem("memo.1");
    expect(game.inbox().find((item) => item.id === "memo.1")?.done).toBe(true);
    expect(game.state.memos[1]?.read).toBe(false);
  });

  it("delivers a memo when a delayed consequence comes due", () => {
    const campaign = memoCampaign();
    campaign.consequences = [{
      id: "consequence.delayed", delayShifts: 1,
      condition: { op: "compare", left: { fact: "standing.value" }, relation: ">=", right: 0 },
      explanation: "Oskar Vale returns the northern district figures a shift late.", effects: [],
    }];
    campaign.shifts[0].inbox = [{ kind: "case", id: "case.one" }];
    campaign.cases[0].outcomes[0].consequenceIds = ["consequence.delayed"];
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 42));

    fileFixtureReport(game);
    expect(game.state.memos).toEqual([]);
    game.advanceShift();

    expect(game.state.memos).toEqual([expect.objectContaining({
      consequenceId: "consequence.delayed", from: "Oskar Vale", shiftNumber: 2, read: false,
    })]);
  });

  it("loads a save written before memos existed", () => {
    const index = loadCampaign(memoCampaign());
    const legacy = createGameState(index, 35) as unknown as Record<string, unknown>;
    delete legacy.memos;
    const game = new GameEngine(index, executeQuery, legacy as never);
    expect(game.state.memos).toEqual([]);
    expect(() => game.inbox()).not.toThrow();
  });

  it("closes the console once an ending is entered and files the ending as a memo", () => {
    const index = loadCampaign(endingCampaign("ending.fixture"));
    const game = new GameEngine(index, executeQuery, createGameState(index, 36));
    expect(game.locked()).toBe(false);
    const artifactId = fileFixtureReport(game);

    expect(game.locked()).toBe(true);
    expect(game.state.memos).toEqual([expect.objectContaining({
      endingId: "ending.fixture", from: "The Ministry", text: "The engine fixture completed.", read: false,
    })]);

    const closed = /^The console is closed\.$/;
    expect(() => game.runQuery("case.one", "promql", "fixture_signal", controls)).toThrow(closed);
    expect(() => game.printArtifact("case.one", artifactId, printOptions())).toThrow(closed);
    expect(() => game.fileReport("case.one", [artifactId], "title.signal", "conclusion.present", "decision.clear")).toThrow(closed);
    expect(() => game.saveWatch("case.one", artifactId)).toThrow(closed);
    expect(() => game.retireWatch("watch.1")).toThrow(closed);
    expect(() => game.replaceWatch("watch.1", "case.one", artifactId)).toThrow(closed);
    expect(() => game.revealHint("case.one", 0)).toThrow(closed);
    expect(() => game.advanceShift()).toThrow(closed);
    expect(() => game.restartShift()).toThrow(closed);

    expect(game.replayQuery("report.one", artifactId, "fixture_signal").execution.ok).toBe(true);
    expect(game.archiveReports()).toHaveLength(1);
    expect(game.reportPreview("case.one", [artifactId]).titles["title.signal"]).toBe("supported");
  });

  it("signs an Assurance custody ending from Well-being Assurance", () => {
    const index = loadCampaign(endingCampaign("ending.assurance-custody"));
    const game = new GameEngine(index, executeQuery, createGameState(index, 37));
    fileFixtureReport(game);
    expect(game.state.memos).toEqual([expect.objectContaining({ endingId: "ending.assurance-custody", from: "Well-being Assurance" })]);
  });

  it("previews what each report choice would claim and which one Assurance prefers", () => {
    const index = loadCampaign(preferenceCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 38));
    const artifact = game.runQuery("case.one", "promql", "fixture_signal", controls);
    const before = JSON.stringify(game.state);

    expect(game.reportPreview("case.one", [])).toMatchObject({
      titles: { "title.signal": "unknown" },
      conclusions: { "conclusion.present": "unknown", "conclusion.absent": "unknown" },
    });
    const preview = game.reportPreview("case.one", [artifact.id]);
    expect(preview.titles).toEqual({ "title.signal": "supported" });
    expect(preview.conclusions).toEqual({ "conclusion.present": "supported", "conclusion.absent": "supported" });
    expect(preview.preferred).toEqual({
      titleChoiceIds: ["title.signal"], conclusionChoiceIds: ["conclusion.absent"],
      decisionChoiceIds: ["decision.review"], standingDelta: 10,
    });
    expect(JSON.stringify(game.state)).toBe(before);

    const noPreference = new GameEngine(loadCampaign(fixture), executeQuery, createGameState(loadCampaign(fixture), 39));
    expect(noPreference.reportPreview("case.one", []).preferred).toBeUndefined();
  });

  it("reports the shift clock in minutes only when the shift is clocked", () => {
    const plain = loadCampaign(fixture);
    expect(new GameEngine(plain, executeQuery, createGameState(plain, 40)).clock()).toBeUndefined();

    const index = loadCampaign(clockCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 41));
    game.runQuery("case.one", "promql", "fixture_signal", controls);
    expect(game.clock()).toEqual({
      enabled: true, budget: 8, used: 1, remaining: 7, minutesPerUnit: 67.5,
      shiftStart: "2030-01-01T08:00:00Z", shiftMinutes: 540,
    });
  });

  it("round-trips a local save and clears it explicitly", () => {
    const index = loadCampaign(fixture);
    const state = createGameState(index, 42);
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    storeState(index, state, storage);
    expect(loadStoredState(index, storage)?.seed).toBe(42);
    clearStoredState(index, storage);
    expect(loadStoredState(index, storage)).toBeUndefined();
  });
});
