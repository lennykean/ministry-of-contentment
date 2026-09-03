import { describe, expect, it } from "vitest";
import campaign from "../content/campaign.json";
import { createGameState, evaluateCondition, GameEngine } from "../src/game";
import { loadCampaign } from "../src/loader";
import { executeQuery } from "../src/query";
import { renderDrawer } from "../src/ui/drawers";
import { acknowledgeOfficialItems, completeCampaign, controlsFor, mixedEndingRoutes, printAll } from "./campaign-route";

function expectRankCadence(index: ReturnType<typeof loadCampaign>, rankTimeline: string[]): void {
  const expected = [
    [4, "rank.reconciliation-clerk"], [8, "rank.signal-registrar"], [12, "rank.watch-officer"],
    [16, "rank.wellbeing-analyst"], [20, "rank.assurance-liaison"], [24, "rank.senior-reconciliation-officer"],
    [28, "rank.district-auditor"], [32, "rank.deputy-director"], [36, "rank.director-public-assurance"],
    [40, "rank.continuity-secretary"], [48, "rank.party-leader"],
  ] as const;
  for (const [shift, rankId] of expected) expect(rankTimeline[shift - 1], `rank after Shift ${shift}`).toBe(rankId);
  const orders = rankTimeline.map((rankId) => index.ranks.get(rankId)!.order);
  for (let index = 1; index < orders.length; index += 1) expect(orders[index]! - orders[index - 1]!, `rank step after Shift ${index + 1}`).toBeLessThanOrEqual(1);
}

function readyToCloseShift(index: ReturnType<typeof loadCampaign>, shiftNumber: number, rankId: string) {
  const mainShifts = index.campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
  const shift = mainShifts[shiftNumber - 1]!;
  const state = createGameState(index, 0);
  state.appointmentId = "appointment.ministry-agent";
  state.currentShiftId = shift.id;
  state.shiftNumber = shiftNumber;
  state.rankId = rankId;
  for (const previous of mainShifts.slice(0, shiftNumber - 1)) state.progress[`shift:${previous.id}`] = { phase: "completed", outcome: "succeeded" };
  state.completedCases = shift.inbox.filter((item) => item.kind === "case").map((item) => item.id);
  state.readNarrative = shift.inbox.filter((item) => item.kind !== "case").map((item) => item.id);
  return state;
}

describe("canonical campaign progression", () => {
  it("spreads genuine first-use lessons without making one optional", () => {
    const index = loadCampaign(campaign);
    const mainShifts = index.campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
    const mainCaseIds = mainShifts.flatMap((shift) => shift.inbox.filter((ref) => ref.kind === "case").map((ref) => ref.id));
    expect(mainCaseIds).toHaveLength(192);
    expect(new Set(mainCaseIds).size).toBe(192);
    expect(new Set(mainCaseIds)).toEqual(new Set(index.campaign.cases.filter((item) => /^case\.\d/.test(item.id)).map((item) => item.id)));
    expect(mainShifts.reduce((count, shift) => {
      const cases = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => index.cases.get(ref.id)!);
      return count + (shift.caseSelectionMode === "fixed" ? cases.length : cases.filter((item) => item.mode !== "adaptive").length + Math.min(1, cases.filter((item) => item.mode === "adaptive").length));
    }, 0)).toBe(154);
    expect(index.campaign.cases.filter((item) => item.mode === "adaptive")).toHaveLength(76);
    for (const caseId of [
      "case.032.signal-promotion", "case.064.wellbeing-promotion", "case.096.senior-promotion",
      "case.112.auditor-assessment", "case.128.deputy-promotion", "case.160.secretary-promotion",
    ]) expect(index.cases.get(caseId)!.mode, caseId).not.toBe("adaptive");

    for (const appointment of ["trainee", "agent"] as const) {
      const shifts = appointment === "trainee" ? index.campaign.shifts : mainShifts;
      const shiftByCaseId = new Map(shifts.flatMap((shift, shiftIndex) =>
        shift.inbox.filter((ref) => ref.kind === "case").map((ref) => [ref.id, { shift, shiftIndex }] as const)));
      const firstUse = new Map<string, { shiftIndex: number; caseIds: string[] }>();
      for (const concept of index.campaign.concepts) {
        const uses = index.campaign.cases.flatMap((item) => item.masteryUses
          .filter((use) => use.conceptId === concept.id && shiftByCaseId.has(item.id))
          .map(() => ({ caseId: item.id, shiftIndex: shiftByCaseId.get(item.id)!.shiftIndex })))
          .sort((left, right) => left.shiftIndex - right.shiftIndex);
        expect(uses.length, `${appointment} ${concept.id}`).toBeGreaterThan(0);
        firstUse.set(concept.id, {
          shiftIndex: uses[0]!.shiftIndex,
          caseIds: uses.filter((use) => use.shiftIndex === uses[0]!.shiftIndex).map((use) => use.caseId),
        });
      }

      for (const concept of index.campaign.concepts) for (const prerequisite of concept.prerequisites) {
        expect(firstUse.get(prerequisite)!.shiftIndex, `${appointment}: ${prerequisite} before ${concept.id}`)
          .toBeLessThanOrEqual(firstUse.get(concept.id)!.shiftIndex);
      }

      const introductionShifts: number[] = [];
      for (const [shiftIndex, shift] of shifts.entries()) {
        const firstConcepts = index.campaign.concepts.filter((concept) => firstUse.get(concept.id)!.shiftIndex === shiftIndex);
        expect(firstConcepts.length, `${appointment} ${shift.id}`).toBeLessThanOrEqual(3);
        if (firstConcepts.length > 0) introductionShifts.push(shiftIndex);
        if (shift.caseSelectionMode !== "mixed") continue;
        const required = new Set(shift.inbox.filter((ref) => ref.kind === "case" && index.cases.get(ref.id)!.mode !== "adaptive").map((ref) => ref.id));
        for (const concept of firstConcepts) {
          expect(firstUse.get(concept.id)!.caseIds.some((caseId) => required.has(caseId)), `${appointment} ${shift.id}: ${concept.id}`).toBe(true);
        }
      }
      expect(introductionShifts.length).toBeGreaterThanOrEqual(24);
    }
  });

  it("schedules every standing-query lesson before its executable checkpoints", () => {
    const index = loadCampaign(campaign);
    const shiftByCaseId = new Map(index.campaign.shifts.flatMap((shift, shiftIndex) =>
      shift.inbox.filter((ref) => ref.kind === "case").map((ref) => [ref.id, shiftIndex] as const)));
    const checkpoints = new Map(index.campaign.shifts.flatMap((shift, shiftIndex) =>
      (shift.watchCheckpoints ?? []).map((checkpoint) => [checkpoint.id, { checkpoint, shiftIndex }] as const)));

    for (const item of index.campaign.cases.filter((candidate) => candidate.watchScenarioId)) {
      const caseShift = shiftByCaseId.get(item.id)!;
      const scenario = index.watchScenarios.get(item.watchScenarioId!)!;
      for (const checkpointId of scenario.checkpointIds) {
        const located = checkpoints.get(checkpointId)!;
        expect(located.shiftIndex, `${item.id} ${checkpointId}`).toBeGreaterThanOrEqual(caseShift);
        const dataset = index.datasets.get(located.checkpoint.datasetId)!;
        const sources = [...dataset.series, ...dataset.streams.flatMap((stream) => stream.records)];
        for (const event of scenario.events) for (const sourceId of event.sourceIds) {
          expect(sources.find((source) => source.id === sourceId)?.eventIds, `${item.id} ${event.id} source`).toContain(event.id);
        }
      }
    }

    for (const shift of index.campaign.shifts) {
      const cases = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => index.cases.get(ref.id)!);
      const required = cases.filter((item) => item.mode !== "adaptive" && item.watchScenarioId).length;
      const adaptive = cases.some((item) => item.mode === "adaptive" && item.watchScenarioId) ? 1 : 0;
      expect(required + adaptive, shift.id).toBeLessThanOrEqual(3);
    }
  });

  it("reveals each shift's cases one at a time", () => {
    const index = loadCampaign(campaign);
    const state = createGameState(index, 0);
    state.appointmentId = "appointment.ministry-agent";
    state.currentShiftId = "shift.03.warm-rooms";
    state.shiftNumber = 3;
    const game = new GameEngine(index, executeQuery, state);

    expect(game.inbox().filter((item) => item.kind === "case" && !item.done).map((item) => item.id))
      .toEqual(["case.005.north-relay"]);
    expect(game.inbox().some((item) => item.id === "case.006.school-cohorts")).toBe(false);

    const item = index.cases.get("case.005.north-relay")!;
    const variant = game.caseVariant(item.id);
    const reference = variant.referenceSets[0]!;
    const artifacts = reference.artifacts.map((artifact) => game.runQuery(
      item.id, artifact.language, artifact.query, controlsFor(item, variant, artifact), false, false, artifact.role,
    ));
    const outcome = item.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
    game.fileReport(
      item.id, printAll(game, item.id, artifacts), outcome.titleChoiceIds![0]!, outcome.conclusionChoiceIds![0]!,
      outcome.decisionChoiceIds![0]!, item.report.visualizations[0]!,
    );

    expect(game.inbox().filter((candidate) => candidate.kind === "case" && !candidate.done).map((candidate) => candidate.id))
      .toEqual(["case.006.school-cohorts"]);
  });

  it("keeps shift speakers and work-order requesters valid without conflating them", () => {
    const index = loadCampaign(campaign);
    const characterIds = new Set(index.campaign.characters.map((character) => character.id));
    const characterNames = new Set(index.campaign.characters.map((character) => character.name));
    for (const shift of index.campaign.shifts.filter((item) => item.id !== "shift.clearance.ministry-trainee")) {
      const speaker = shift.directive!.split(":", 1)[0]!;
      expect(characterNames.has(speaker), shift.id).toBe(true);
      for (const ref of shift.inbox.filter((item) => item.kind === "case")) {
        expect(characterIds.has(index.cases.get(ref.id!)!.requesterId!), `${shift.id} ${ref.id}`).toBe(true);
      }
      expect(index.campaign.newspaper!.editions.some((edition) => edition.shiftId === shift.id)).toBe(true);
    }
  });

  it("gives every main case usable query guidance", () => {
    const index = loadCampaign(campaign);
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));

    expect(mainCases).toHaveLength(192);
    for (const item of mainCases) {
      const variant = item.variants[0]!;
      const artifacts = variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct"))!.artifacts;
      const hintText = item.hints.map((hint) => hint.text).join(" ");
      expect(hintText, item.id).not.toMatch(/active[- ]packet|bounded finding|executed scope|\bartifact\b/i);
      expect(hintText, `${item.id} matcher placeholders`).not.toMatch(/[A-Za-z_][\w]*\s*(?:=~|!~|!=|=)\s*"<text>"/);
      for (const hint of item.hints) {
        expect(hint.text, `${item.id} hint stage`).not.toMatch(/^(?:Orientation|Scaffold|Worked)\b/);
        expect(["Start ", "Build ", "Prepare ", "Load "].some((lead) => hint.text.startsWith(`${lead}${item.title}`)), `${item.id} hint title`).toBe(false);
      }
      expect(item.hints[0]!.query, `${item.id} first hint`).toBeUndefined();
      expect(item.hints[1]!.query, `${item.id} second hint`).toBeUndefined();
      expect(`${item.hints[2]!.text} ${item.hints[2]!.query ?? ""}`, `${item.id} scaffold blank`).toMatch(/<[^>]+>/);
      if (artifacts.length > 1) for (let position = 1; position <= artifacts.length; position += 1) {
        expect(item.hints[2]!.text, `${item.id} Query ${position} scaffold`).toContain(`Query ${position}:`);
      }
    }

    const battery = index.cases.get("case.002.battery-cart")!;
    expect(battery.hints[2]!.query).toBe('up{service="<service>",district!="<district>"}');
    expect(battery.hints[1]!.text).toContain("A series without the excluded label");
    const boiler = index.cases.get("case.003.boiler-pulse")!;
    expect(boiler.hints[0]!.text).toContain("A scalar is one number without labels");
    expect(boiler.hints[1]!.text).toContain("Use `=~`");
    const registry = index.cases.get("case.004.registry-window")!;
    expect(registry.hints[0]!.text).toContain("30 minutes before the evaluation time");
    const fieldNotes = index.cases.get("case.008.field-notes")!;
    expect(fieldNotes.hints[2]!.query).toBe('{service="<service>",district="north"} |~ "service_(delay|ok)"');
  });

  it("shows a staged, human-readable query reference", () => {
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 0));
    game.acceptAppointment("appointment.ministry-agent");
    const context = { index, engine: game, registryKind: "syntax" as const, registrySearch: "", selectedReport: "" };

    const opening = renderDrawer("registry", { ...context, caseId: "case.001.elm-exchange" });
    expect(opening).toContain("Unlocked query reference");
    expect(opening).toContain("Select a metric and interpret every returned label set and value.");
    expect(opening).not.toContain("promql.selector.metric");
    expect(opening).not.toContain("histogram_quantile");
    expect(opening).not.toContain("Capability manifest");

    const histogramState = createGameState(index, 0);
    histogramState.appointmentId = "appointment.ministry-agent";
    histogramState.rankId = "rank.wellbeing-analyst";
    const histogramGame = new GameEngine(index, executeQuery, histogramState);
    const histogram = renderDrawer("registry", { ...context, engine: histogramGame, caseId: "case.066.scrape-dark", registrySearch: "histogram" });
    expect(histogram).toContain("histogram_quantile");
    expect(histogram).toContain("Classic histogram");
    expect(histogram).not.toContain("promql.histogram.classic");
  });

  it("authors both appointment routes, the complaint ending, and daily newspapers", () => {
    const index = loadCampaign(campaign);
    const appointments = index.campaign.opening.appointments!;

    expect(index.campaign.opening.montage).toHaveLength(3);
    expect(appointments.map((item) => item.id)).toEqual(["appointment.ministry-trainee", "appointment.ministry-agent"]);
    expect(appointments.map((item) => item.title)).toEqual(["Ministry Intern", "Ministry Agent"]);
    for (const appointment of appointments) {
      expect(appointment.agreeLabel).toBe("AGREE");
      expect(appointment.complaintLabel).toBe("FILE A MOTION WITH THE MINISTRY OF COMPLAINTS");
      expect(appointment.finePrint.join(" ")).toContain("interface help");
    }
    expect(index.campaign.newspaper).toMatchObject({
      title: "The Contented Citizen",
      motto: "Every day, better than the last.",
    });
    expect(new Set(index.campaign.newspaper!.editions.map((edition) => edition.shiftId))).toEqual(new Set(index.campaign.shifts.map((shift) => shift.id)));
    expect(index.campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee")).toHaveLength(48);

    for (const appointment of appointments) {
      const game = new GameEngine(index, executeQuery, createGameState(index, 0));
      game.fileAppointmentComplaint(appointment.id);
      expect(game.state.endingId).toBe("ending.work-camp.complaint");
      expect(game.locked()).toBe(true);
    }
  });

  it("requires Trainee clearance, lets Agent skip it, and converges both at Elm Exchange", () => {
    const index = loadCampaign(campaign);
    const agent = new GameEngine(index, executeQuery, createGameState(index, 0));
    agent.acceptAppointment("appointment.ministry-agent");
    expect(agent.currentShift().id).toBe("shift.01.first-bell");
    expect(agent.currentShift().title).toBe("Elm Exchange Competence");
    expect(agent.state.mastery["promql.discovery.schema"]?.state).toBe("Unobserved");
    expect(agent.state.mastery["promql.selector.metric"]?.state).toBe("Unobserved");

    const trainee = new GameEngine(index, executeQuery, createGameState(index, 0));
    trainee.acceptAppointment("appointment.ministry-trainee");
    expect(trainee.currentShift().id).toBe("shift.clearance.ministry-trainee");
    expect(trainee.currentNewspaper()?.stories?.[0]?.body).toContain("West-03");
    trainee.readNewspaper(trainee.currentNewspaper()!.id);
    acknowledgeOfficialItems(trainee);

    const clearanceIds = [
      "case.clearance.01.metric-name", "case.clearance.02.series-reading",
      "case.clearance.03.exact-label", "case.clearance.04.zero-or-empty",
    ];
    for (const caseId of clearanceIds) {
      expect(trainee.inbox().filter((item) => item.kind === "case" && !item.done).map((item) => item.id)).toEqual([caseId]);
      const item = index.cases.get(caseId)!;
      const variant = trainee.caseVariant(item.id);
      const reference = variant.referenceSets[0]!;
      const artifacts = reference.artifacts.map((artifact) => trainee.runQuery(
        item.id, artifact.language, artifact.query, controlsFor(item, variant, artifact), false, false, artifact.role,
      ));
      const outcome = item.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
      trainee.fileReport(
        item.id, printAll(trainee, item.id, artifacts), outcome.titleChoiceIds![0]!, outcome.conclusionChoiceIds![0]!,
        outcome.decisionChoiceIds![0]!, item.report.visualizations[0]!,
      );
    }

    expect(trainee.canAdvance()).toBe(true);
    expect(trainee.state.mastery["promql.discovery.schema"]?.credits.map((credit) => credit.caseId)).toEqual(["case.clearance.01.metric-name"]);
    expect(trainee.state.mastery["promql.selector.metric"]?.credits.map((credit) => credit.caseId)).toEqual([
      "case.clearance.02.series-reading", "case.clearance.03.exact-label", "case.clearance.04.zero-or-empty",
    ]);
    trainee.advanceShift();
    expect(trainee.currentShift().id).toBe(agent.currentShift().id);
    expect(trainee.state.rankId).toBe("rank.reconciliation-trainee");
    expect(agent.state.mastery["promql.selector.metric"]?.credits).toEqual([]);
  });

  it("exposes only the telemetry sources authored for the current case", () => {
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 0));
    game.acceptAppointment("appointment.ministry-agent");
    const item = index.cases.get("case.001.elm-exchange")!;
    const variant = game.caseVariant(item.id);

    expect(game.availableSources(item.id)).toEqual(expect.arrayContaining(["up", "ministry_collector_queue_depth"]));
    expect(game.availableSources(item.id)).not.toContain("ministry_assurance_dispatches_total");
    expect(game.availableSources(item.id)).not.toContain("record.vitals");

    const result = game.runQuery(item.id, "promql", "ministry_assurance_dispatches_total", {
      timestamp: Date.parse(variant.evaluationTime!) / 1000,
      visualization: "table",
    });
    expect(result.execution).toMatchObject({ ok: true, result: { type: "instant-vector", series: [] } });
  });

  it("owns the complete promotion cadence and benefits in rank data", () => {
    const index = loadCampaign(campaign);
    const promotionShifts = [
      "shift.04.clerks-seal", "shift.08.lantern-watch", "shift.12.watch-board", "shift.16.clean-bulletin",
      "shift.20.liaisons-card", "shift.24.first-visit", "shift.28.auditors-seal", "shift.32.district-audit",
      "shift.36.deputys-desk", "shift.40.directorate",
    ];
    const ranks = [...index.ranks.values()].sort((left, right) => left.order - right.order);
    expect(ranks).toHaveLength(12);
    expect(ranks.slice(1, 11).map((rank) => rank.condition)).toEqual(promotionShifts.map((shiftId) => ({
      op: "state", value: { fact: `progress:shift:${shiftId}.phase` }, expected: "completed",
    })));
    expect(ranks.every((rank) => Array.isArray(rank.grants))).toBe(true);
    expect(ranks.at(-1)).toMatchObject({ id: "rank.party-leader", requiresWinningEnding: true });
    expect(index.campaign.cases.flatMap((item) => item.outcomes.flatMap((outcome) => outcome.effects ?? []))
      .filter((effect) => effect.type === "promote" || effect.type === "grant"
        || (effect.type === "change" && effect.target === "watch_capacity.limit"))).toEqual([]);
  });

  it("uses one rank gate for Registry, syntax, Worked execution, metrics, logs, and histograms", () => {
    const index = loadCampaign(campaign);
    const logCase = index.cases.get("case.009.two-targets")!;
    const logArtifact = logCase.variants[0]!.workedEvidenceSet.artifacts[1]!;
    const logConcept = index.concepts.get("logql.parse.json-logfmt")!;
    const game = new GameEngine(index, executeQuery, readyToCloseShift(index, 4, "rank.reconciliation-trainee"));
    const drawer = (kind: "records" | "syntax", search = "") => renderDrawer("registry", {
      index, engine: game, registryKind: kind, registrySearch: search, selectedReport: "", caseId: logCase.id,
    });

    expect(game.availableSources(logCase.id)).not.toContain("record.attendance");
    expect(drawer("records")).not.toContain("<code>record.attendance</code>");
    expect(drawer("syntax", "parse")).not.toContain(logConcept.competency);
    const lockedLog = game.runQuery(logCase.id, logArtifact.language, logArtifact.query, controlsFor(logCase, logCase.variants[0]!, logArtifact));
    expect(lockedLog.execution).toMatchObject({ ok: true, result: { type: "records", streams: [] } });

    game.advanceShift();
    expect(game.state.rankId).toBe("rank.reconciliation-clerk");
    expect(game.state.watchCapacity).toBe(1);
    expect(game.availableSources(logCase.id)).toContain("record.attendance");
    expect(drawer("records")).toContain("<code>record.attendance</code>");
    expect(drawer("syntax", "parse")).toContain(logConcept.competency);
    const unlockedLog = game.runQuery(logCase.id, logArtifact.language, logArtifact.query, controlsFor(logCase, logCase.variants[0]!, logArtifact));
    expect(unlockedLog.execution.ok && unlockedLog.execution.result.type === "records"
      ? unlockedLog.execution.result.streams.flatMap((stream) => stream.records).length : 0).toBeGreaterThan(0);

    const histogramCase = index.cases.get("case.066.scrape-dark")!;
    const histogramSource = "ministry_dispatch_duration_seconds_bucket";
    const histogramGame = new GameEngine(index, executeQuery, readyToCloseShift(index, 16, "rank.watch-officer"));
    const histogramControls = controlsFor(histogramCase, histogramCase.variants[0]!, histogramCase.variants[0]!.workedEvidenceSet.artifacts[0]!);
    expect(histogramGame.availableSources(histogramCase.id)).not.toContain(histogramSource);
    expect(histogramGame.canAccessConcept("promql.histogram.classic")).toBe(false);
    expect(histogramGame.runQuery(histogramCase.id, "promql", histogramSource, histogramControls).execution)
      .toMatchObject({ ok: true, result: { type: "instant-vector", series: [] } });
    histogramGame.advanceShift();
    expect(histogramGame.state.rankId).toBe("rank.wellbeing-analyst");
    expect(histogramGame.availableSources(histogramCase.id)).toContain(histogramSource);
    expect(histogramGame.canAccessConcept("promql.histogram.classic")).toBe(true);
    const unlockedHistogram = histogramGame.runQuery(histogramCase.id, "promql", histogramSource, histogramControls);
    expect(unlockedHistogram.execution.ok && unlockedHistogram.execution.result.type === "instant-vector"
      ? unlockedHistogram.execution.result.series.length : 0).toBeGreaterThan(0);
  });

  it("cannot skip eligible ranks when several earlier promotion shifts are already complete", () => {
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, readyToCloseShift(index, 12, "rank.reconciliation-trainee"));
    game.advanceShift();
    expect(game.state.rankId).toBe("rank.reconciliation-clerk");
    expect(index.ranks.get(game.state.rankId)!.order).toBe(2);
  });

  it("routes valid political choices without letting error artifacts claim their outcome", () => {
    const index = loadCampaign(campaign);
    const item = index.cases.get("case.001.elm-exchange")!;
    const assurance = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"))!;
    const fallback = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.fallback"))!;

    const validGame = new GameEngine(index, executeQuery, createGameState(index, 0));
    validGame.acceptAppointment("appointment.ministry-agent");
    const variant = validGame.caseVariant(item.id);
    const valid = variant.referenceSets[0]!.artifacts.map((artifact) => validGame.runQuery(item.id, artifact.language, artifact.query, controlsFor(item, variant, artifact), false, false, artifact.role));
    const political = validGame.fileReport(item.id, printAll(validGame, item.id, valid), assurance.titleChoiceIds![0]!, assurance.conclusionChoiceIds![0]!, assurance.decisionChoiceIds![0]!, item.report.visualizations[0]!);
    expect(political.outcomeId).toBe(assurance.id);
    expect(political.evidence).toBe(assurance.technicalEvidence);

    const errorGame = new GameEngine(index, executeQuery, createGameState(index, 0));
    errorGame.acceptAppointment("appointment.ministry-agent");
    const broken = variant.referenceSets[0]!.artifacts.map((artifact) => errorGame.runQuery(item.id, artifact.language, `${artifact.query}{`, controlsFor(item, variant, artifact), false, false, artifact.role));
    const rejected = errorGame.fileReport(item.id, printAll(errorGame, item.id, broken), assurance.titleChoiceIds![0]!, assurance.conclusionChoiceIds![0]!, assurance.decisionChoiceIds![0]!, item.report.visualizations[0]!);
    expect(rejected.outcomeId).toBe(fallback.id);
    expect(rejected.evidence).toBe("error");
  });

  it("requires the Elm Exchange queue-depth result for a supported filing", () => {
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 0));
    game.acceptAppointment("appointment.ministry-agent");
    const item = index.cases.get("case.001.elm-exchange")!;
    const variant = game.caseVariant(item.id);
    const reference = variant.referenceSets[0]!;
    const reachability = game.runQuery(
      item.id, "promql", reference.artifacts[0]!.query,
      controlsFor(item, variant, reference.artifacts[0]!), false, false, reference.artifacts[0]!.role,
    );
    const unrelated = game.runQuery(
      item.id, "promql", "1",
      controlsFor(item, variant, reference.artifacts[1]!), false, false, reference.artifacts[1]!.role,
    );
    const evidence = item.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
    const filed = game.fileReport(
      item.id, printAll(game, item.id, [reachability, unrelated]), evidence.titleChoiceIds![0]!,
      evidence.conclusionChoiceIds![0]!, evidence.decisionChoiceIds![0]!, item.report.visualizations[0]!,
    );

    expect(filed.outcomeId).not.toBe(evidence.id);
    expect(filed.evidence).not.toBe("supported");
  });

  it.each([
    ["case.002.battery-cart", 'up{service="press",district!="south"}', false],
    ["case.002.battery-cart", '(up{district!="south",service="pin-gateway"})', true],
    ["case.004.registry-window", 'ministry_service_requests_total{district="north"}[60m]', false],
  ] as const)("grades %s by its authored result and scope", (caseId, query, supported) => {
    const index = loadCampaign(campaign);
    const game = new GameEngine(index, executeQuery, createGameState(index, 0));
    game.acceptAppointment("appointment.ministry-agent");
    const item = index.cases.get(caseId)!;
    const variant = game.caseVariant(caseId);
    const reference = variant.referenceSets[0]!.artifacts[0]!;
    for (const prerequisite of index.concepts.get(item.masteryUses[0]!.conceptId)!.prerequisites) game.state.mastery[prerequisite]!.state = "Observed";
    const artifact = game.runQuery(caseId, reference.language, query, controlsFor(item, variant, reference));
    const evidence = item.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
    const artifactIds = printAll(game, caseId, [artifact]);

    expect(game.reportPreview(caseId, artifactIds).titles[evidence.titleChoiceIds![0]!]).toBe(supported ? "supported" : "partial");
    const filed = game.fileReport(
      caseId, artifactIds, evidence.titleChoiceIds![0]!, evidence.conclusionChoiceIds![0]!,
      evidence.decisionChoiceIds![0]!, item.report.visualizations[0]!,
    );
    expect(filed.evidence).toBe(supported ? "supported" : "partial");
    expect(game.state.mastery[item.masteryUses[0]!.conceptId]!.credits).toHaveLength(supported ? 1 : 0);
  });

  it("settles a watch-dependent report from checkpoint results instead of its dropdown choice", () => {
    const index = loadCampaign(campaign);
    const state = createGameState(index, 0);
    state.appointmentId = "appointment.ministry-agent";
    state.tags.push("route.ministry-agent");
    state.currentShiftId = "shift.48.all-is-well";
    state.shiftNumber = 48;
    state.rankId = "rank.continuity-secretary";
    state.completedCases = ["case.189.final-checkpoints", "case.190.resource-notices", "case.191.continuity-outcome"];
    const game = new GameEngine(index, executeQuery, state);
    const item = index.cases.get("case.192.party-record")!;
    const variant = game.caseVariant(item.id);
    const reference = variant.referenceSets[0]!;
    const artifacts = reference.artifacts.map((artifact) => game.runQuery(item.id, artifact.language, artifact.query, controlsFor(item, variant, artifact), false, false, artifact.role));
    const evidenceOutcome = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!;

    const filed = game.fileReport(
      item.id,
      printAll(game, item.id, artifacts),
      evidenceOutcome.titleChoiceIds![0]!,
      evidenceOutcome.conclusionChoiceIds![0]!,
      evidenceOutcome.decisionChoiceIds![0]!,
      item.report.visualizations[0]!,
    );

    expect(filed.pendingWatch).toBe(true);
    expect(game.state.tags).not.toContain("final.precise");
    game.saveWatch(item.id, artifacts.find((artifact) => artifact.role === "watch-expression")!.id);
    acknowledgeOfficialItems(game);
    const humaneService = game.state.world["humane-service"] as number;
    game.advanceShift();

    const settled = game.state.reports.find((report) => report.id === filed.id)!;
    expect(settled.pendingWatch).toBe(false);
    expect(settled.evidence).toBe("supported");
    expect(settled.outcomeId).toBe(evidenceOutcome.id);
    expect(game.state.tags).toContain("final.precise");
    expect(game.state.world["humane-service"]).toBe(humaneService + 2);
    expect(game.state.consequenceRuns["consequence.case.192.party-record.targeted"]).toBe(1);
    expect(game.state.scheduled.find((item) => item.targetId === "consequence.case.192.party-record.targeted")?.cancelled).toBe(true);
    expect(game.state.memos.some((memo) => memo.consequenceId === "consequence.case.192.party-record.targeted")).toBe(true);
  });

  it("does not grant a watch outcome when no standing query was saved", () => {
    const index = loadCampaign(campaign);
    const state = createGameState(index, 0);
    state.appointmentId = "appointment.ministry-agent";
    state.tags.push("route.ministry-agent");
    state.currentShiftId = "shift.08.lantern-watch";
    state.shiftNumber = 8;
    state.completedCases = ["case.028.watch-rehearsal", "case.031.good-notice", "case.032.signal-promotion"];
    const game = new GameEngine(index, executeQuery, state);
    const item = index.cases.get("case.029.lantern-design")!;
    const variant = game.caseVariant(item.id);
    const reference = variant.referenceSets[0]!;
    const artifacts = reference.artifacts.map((artifact) => game.runQuery(item.id, artifact.language, artifact.query, controlsFor(item, variant, artifact), false, false, artifact.role));
    const evidenceOutcome = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!;

    const filed = game.fileReport(
      item.id,
      printAll(game, item.id, artifacts),
      evidenceOutcome.titleChoiceIds![0]!,
      evidenceOutcome.conclusionChoiceIds![0]!,
      evidenceOutcome.decisionChoiceIds![0]!,
      item.report.visualizations[0]!,
    );

    expect(filed.pendingWatch).toBe(true);
    expect(game.state.tags).not.toContain("lantern.precise");
    acknowledgeOfficialItems(game);
    game.advanceShift();
    expect(game.state.reports.find((report) => report.id === filed.id)?.evidence).toBe("unsupported");
    expect(game.state.tags).not.toContain("lantern.precise");
  });

  it("can file the supported record through every shift and become Party Leader", () => {
    const { game, index, rankTimeline, standingTimeline } = completeCampaign("evidence");
    const ending = index.endings.get(game.state.endingId ?? "");
    expect(game.state.shiftNumber).toBe(48);
    expect(game.state.rankId).toBe("rank.party-leader");
    expect(ending?.id).toBe("ending.party-leader.precise");
    expect(ending?.winning).toBe(true);
    expect(game.state.memos.some((memo) => memo.endingId === ending?.id)).toBe(true);
    expect(standingTimeline.slice(0, 12)).toEqual(Array(12).fill(5));
    expect(standingTimeline[12]).toBe(4);
    expectRankCadence(index, rankTimeline);
    for (const number of [161, 173, 185, 190]) {
      const state = structuredClone(game.state);
      state.reports.find((report) => report.id.startsWith(`report.${number}.`))!.evidence = "unsupported";
      expect(evaluateCondition(index, state, ending!.condition), `report ${number} must remain supported`).toBe(false);
    }
  }, 60_000);

  it("can also reach Party Leader through institutionally rewarded false certainty", () => {
    const { game, index, rankTimeline } = completeCampaign("assured");
    const ending = index.endings.get(game.state.endingId ?? "");
    expect({
      ending: ending?.id, winning: ending?.winning, rank: game.state.rankId, standing: game.state.standing,
      continuity: game.state.world["continuity-score"], control: game.state.world["political-control"],
      tags: game.state.tags.filter((tag) => tag.includes("final") || tag.includes("press") || tag.includes("alliance") || tag.includes("continuity")),
      relationships: game.state.relationships,
    }).toMatchObject({ ending: "ending.party-leader.assurance", winning: true, rank: "rank.party-leader" });
    expect(game.state.shiftNumber).toBe(48);
    expect(game.state.memos.some((memo) => memo.endingId === ending?.id)).toBe(true);
    expectRankCadence(index, rankTimeline);
    for (const number of [161, 173, 185, 190]) {
      const state = structuredClone(game.state);
      state.reports.find((report) => report.id.startsWith(`report.${number}.`))!.evidence = "supported";
      expect(evaluateCondition(index, state, ending!.condition), `report ${number} must remain unsupported`).toBe(false);
    }
  }, 60_000);

  it.each(mixedEndingRoutes.slice(0, 1))("reaches $endingId through authored report choices", ({ endingId, route, seed = 0 }) => {
    const { game } = completeCampaign(route, seed);
    expect(game.state.shiftNumber).toBe(48);
    expect(game.state.endingId, JSON.stringify({
      standing: game.state.standing, rights: game.state.rights,
      world: game.state.world, tags: game.state.tags, adaptive: game.state.adaptiveSelections,
    })).toBe(endingId);
  }, 60_000);
});
