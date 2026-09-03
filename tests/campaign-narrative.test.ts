import { describe, expect, it } from "vitest";
import campaign from "../content/campaign.json";
import { assessCaseEvidence, buildQueryContext, createGameState, GameEngine, matchingReferencePaths, printableViews } from "../src/game";
import { loadCampaign } from "../src/loader";
import { executeQuery } from "../src/query";
import type { QueryControls } from "../src/game";
// @ts-expect-error The campaign generator is intentionally plain JavaScript.
import { addCampaignNarrative } from "../scripts/campaign-narrative.mjs";

const index = loadCampaign(campaign);

function stateAtCaseAccess(caseId: string) {
  const item = index.cases.get(caseId)!;
  const required = new Set([
    ...item.availableSources.map((id) => index.metrics.get(id)?.accessRightId ?? index.logSources.get(id)?.accessRightId),
    ...item.conceptIds.map((id) => index.concepts.get(id)?.accessRightId),
  ].filter((id): id is string => Boolean(id)));
  const granted = new Set(index.campaign.opening.access ?? []);
  const rank = [...index.ranks.values()].sort((left, right) => left.order - right.order).find((candidate) => {
    candidate.grants.forEach((right) => granted.add(right));
    return [...required].every((right) => granted.has(right));
  });
  if (!rank) throw new Error(`No rank grants the access required by ${caseId}`);
  const state = createGameState(index, 0);
  state.rankId = rank.id;
  state.appointmentId = "appointment.ministry-agent";
  const shiftIndex = index.campaign.shifts.findIndex((shift) => shift.inbox.some((ref) => ref.kind === "case" && ref.id === caseId));
  state.currentShiftId = index.campaign.shifts[shiftIndex]!.id;
  state.shiftNumber = shiftIndex;
  return state;
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).length;
}

function referenceExecution(caseId: string, position: number, variantIndex = 0) {
  const item = index.cases.get(caseId)!;
  const variant = item.variants[variantIndex]!;
  const artifact = variant.referenceSets[0]!.artifacts[position]!;
  const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
  const start = Date.parse(variant.rangeStart ?? item.rangeStart ?? "") / 1000;
  const end = Date.parse(variant.rangeEnd ?? item.rangeEnd ?? "") / 1000;
  const controls: QueryControls = artifact.mode === "instant"
    ? { timestamp, visualization: "table" }
    : artifact.mode === "records"
      ? { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" }
      : { timestamp, start, end, step: Math.max(1, Math.floor((end - start) / 60)), visualization: "graph" };
  return executeQuery(artifact.language, artifact.query, buildQueryContext(index, variant.datasetId, controls, undefined, variant.datasetTimeOffsetSeconds));
}

describe("campaign narrative integration", () => {
  it("declares every direct and Worked artifact role for every variant", () => {
    for (const item of index.campaign.cases) {
      const declared = Object.keys(item.technicalTruth.artifactRoles).sort();
      expect(declared.length, item.id).toBeGreaterThan(0);
      expect(Object.values(item.technicalTruth.artifactRoles).every((purpose) => /^[A-Z].*[.!?]$/.test(purpose)), item.id).toBe(true);
      for (const variant of item.variants) {
        const workedRoles = variant.workedEvidenceSet.artifacts.map((artifact) => artifact.role);
        expect(new Set(workedRoles).size, variant.id).toBe(workedRoles.length);
        expect([...workedRoles].sort(), variant.id).toEqual(declared);
        const direct = variant.referenceSets.find((set) => set.evidencePathId === variant.workedEvidenceSet.evidencePathId)!;
        expect(direct, variant.id).toBeDefined();
        expect(direct.artifacts.map((artifact) => artifact.role), variant.id).toEqual(workedRoles);
      }
    }
  });

  it("writes composite work orders from every concrete artifact job", () => {
    const northRelay = index.cases.get("case.005.north-relay")!;
    expect(northRelay.question).toBe("Which North Pin batteries are below the limit, and do gateway records add evidence of the same fault?");
    expect(northRelay.report.conclusions.find((entry) => entry.id.endsWith(".conclusion.evidence"))!.text)
      .toBe("North battery thresholds identify low Pins; gateway records add context but do not prove the same fault.");
    expect(northRelay.hints[2]!.text).toContain("Query 1 checks the Pin battery threshold. Query 2 selects matching Pin gateway records.");

    const traffic = index.cases.get("case.050.json-invoices")!;
    expect(traffic.question).toBe("Which gateway lines parse, and which attendance counts/rates and press byte totals/rates may Public Assurance publish with their units?");
    expect(traffic.report.conclusions.find((entry) => entry.id.endsWith(".conclusion.evidence"))!.text)
      .toBe("Gateway parses preserve record status; attendance queries measure records, while press queries measure bytes and byte rates.");
    expect(traffic.hints[2]!.text).toContain("Query 1 isolates failed Pin gateway parses; Query 2 keeps successful ones.");
    expect(traffic.hints[2]!.text).toContain("Query 3 counts attendance records; Query 4 measures their rate.");
    expect(traffic.hints[2]!.text).toContain("Query 5 totals press bytes; Query 6 measures their rate.");

    const membership = index.cases.get("case.057.membership-ratio")!;
    expect(membership.question).toBe("What do attendance rejection records add to the 100% population ratio, and can either measure Party membership?");
    expect(membership.hypotheses[0]!.summary)
      .toBe("The ratio returns 100% from equal population operands; attendance rejection records provide no Party-member count.");

    const mixed = index.cases.get("case.100.dispatch-choice")!;
    expect(mixed.question).toBe("What does prior-day collector queue report, and do mean Pin battery ratio and maximum dispatch duration describe the same fault?");
    expect(mixed.hints[2]!.text).toContain("Query 1 reads the prior-day collector queue.");
    expect(mixed.hints[2]!.text).toContain("Query 2 measures mean Pin battery ratio.");
    expect(mixed.hints[2]!.text).toContain("Query 3 measures maximum dispatch duration.");
  });

  it("keeps generated Party-membership grammar singular or plural as appropriate", () => {
    const membershipCases = index.campaign.cases.filter((item) => Object.values(item.technicalTruth.artifactRoles)
      .some((purpose) => purpose.includes("equal registered-population operands produce 100%")) && item.variants[0]!.workedEvidenceSet.artifacts.length > 1);
    expect(membershipCases.length).toBeGreaterThanOrEqual(5);
    for (const item of membershipCases) {
      const text = [item.question, ...item.hypotheses.map((hypothesis) => hypothesis.summary), ...item.report.conclusions.map((entry) => entry.text)].join(" ");
      expect(text, item.id).not.toMatch(/\bWhat do (?:attendance window presence|collector reachability|[^?]*queue threshold) add\b/i);
      expect(text, item.id).not.toMatch(/\b(?:presence|reachability|threshold) provide\b/i);
    }
  });

  it("derives duration operations before parser and error stages", () => {
    const rolePurposes = (caseId: string) => Object.values(index.cases.get(caseId)!.technicalTruth.artifactRoles);
    expect(rolePurposes("case.070.current-position")[0]).toBe("Query 1 measures the window percentile of Assurance dispatch records.");
    expect(rolePurposes("case.100.dispatch-choice").slice(1)).toEqual([
      "Query 2 measures the window mean of Pin gateway records.",
      "Query 3 measures the window maximum of Assurance dispatch records.",
    ]);
    expect(rolePurposes("case.116.audit-target")).toEqual([
      "Query 1 measures the window mean of Assurance dispatch records.",
      "Query 2 measures the window percentile of Assurance dispatch records.",
      "Query 3 calculates the rate ratio across Assurance dispatch records and attendance records.",
    ]);
  });

  it("labels the outer operation for both variants", () => {
    const checks = [
      ["case.106.fixed-evaluation", 1, /^sum\(rate\(/, "Query 2 calculates the request-failure rate ratio from service request flow."],
      ["case.132.allocation-result", 0, / \/ on /, "Query 1 calculates the demand-to-capacity ratio."],
      ["case.132.allocation-result", 1, / unless on /, "Query 2 finds facility demand with no matching capacity."],
      ["case.132.allocation-result", 2, /^max_over_time\(/, "Query 3 measures the window maximum of facility demand and facility capacity."],
      ["case.142.multi-window", 0, /^max_over_time\(/, "Query 1 measures the window maximum of service request flow."],
      ["case.145.promql-cost", 1, /^max_over_time\(/, "Query 2 measures the window maximum of service request flow."],
      ["case.148.costly-evidence", 1, /^max_over_time\(/, "Query 2 measures the window maximum of service request flow."],
      ["case.151.delocalized-queue", 1, /^max_over_time\(/, "Query 2 measures the window maximum of service request flow."],
      ["case.172.threshold-callback", 0, /^max_over_time\(/, "Query 1 measures the window maximum of service request flow."],
      ["case.172.threshold-callback", 1, /^avg_over_time\(/, "Query 2 measures the window mean of Contentment Index."],
      ["case.188.final-filing", 0, /^max_over_time\(/, "Query 1 measures the window maximum of courier event flow."],
      ["case.188.final-filing", 1, /^avg_over_time\(/, "Query 2 measures the window mean of protocol backlog."],
    ] as const;
    for (const [caseId, position, operation, purpose] of checks) {
      const item = index.cases.get(caseId)!;
      const role = item.variants[0]!.workedEvidenceSet.artifacts[position]!.role;
      expect(item.technicalTruth.artifactRoles[role], caseId).toBe(purpose);
      for (const variant of item.variants) {
        expect(variant.workedEvidenceSet.artifacts[position]!.query, variant.id).toMatch(operation);
      }
    }
  });

  it("preserves offsets and reset-versus-change semantics for both variants", () => {
    const offsets = [
      ["case.072.lantern-rescue", 0, "1d", "Query 1 measures the per-second rate of press records from one day earlier."],
      ["case.103.interpolation-limit", 0, "1d", "Query 1 measures the per-second rate of press records from one day earlier."],
      ["case.117.membership-reopen", 2, "1d", "Query 3 measures the per-second rate of press records from one day earlier."],
      ["case.131.one-to-one", 0, "1d", "Query 1 measures the per-second rate of press records from one day earlier."],
      ["case.141.precedence-file", 0, "1d", "Query 1 measures the per-second rate of press records from one day earlier."],
      ["case.170.silent-stream", 0, "1d", "Query 1 measures the per-second rate of press records from one day earlier."],
      ["case.186.report-correlation", 0, "2h", "Query 1 measures the per-second rate of continuity records from two hours earlier."],
    ] as const;
    for (const [caseId, position, offset, purpose] of offsets) {
      const item = index.cases.get(caseId)!;
      const role = item.variants[0]!.workedEvidenceSet.artifacts[position]!.role;
      expect(item.technicalTruth.artifactRoles[role], caseId).toBe(purpose);
      for (const variant of item.variants) {
        expect(variant.workedEvidenceSet.artifacts[position]!.query, variant.id).toContain(`offset ${offset}`);
      }
      const prose = [item.briefing, item.question, ...item.hypotheses.map((entry) => entry.summary),
        ...item.report.conclusions.map((entry) => entry.text), ...item.hints.map((hint) => hint.text)].join(" ");
      expect(prose, caseId).toMatch(offset === "1d" ? /from one day earlier|prior-day/ : /from two hours earlier/);
    }

    for (const [caseId, position] of [
      ["case.068.no-traffic", 0], ["case.099.lost-le", 2], ["case.114.linear-prediction", 1],
      ["case.127.ledger-watch", 2], ["case.138.set-or", 0], ["case.165.facility-rate", 0],
    ] as const) {
      const item = index.cases.get(caseId)!;
      const role = item.variants[0]!.workedEvidenceSet.artifacts[position]!.role;
      expect(item.technicalTruth.artifactRoles[role], caseId)
        .toBe(`Query ${position + 1} counts resets or value changes in attendance upload flow, as named by the active variant.`);
      expect(item.variants[0]!.workedEvidenceSet.artifacts[position]!.query).toMatch(/^resets\(/);
      expect(item.variants[1]!.workedEvidenceSet.artifacts[position]!.query).toMatch(/^changes\(/);
      expect([item.question, ...item.hints.map((hint) => hint.text)].join(" "), caseId).toContain("attendance-upload resets or value changes");
    }
  });

  it("keeps case 035 on one precedence job and preserves fixed per-stream order lessons", () => {
    const precedence = index.cases.get("case.035.lantern-notices")!;
    const query = '100 * (sum(rate(ministry_service_requests_total{district="north",code="503"}[30m])) / sum(rate(ministry_service_requests_total{district="north"}[30m])))';
    expect(precedence.technicalTruth.artifactRoles["evidence-03"])
      .toBe("Query 3 calculates the request-failure percentage from a rate ratio over service request flow.");
    for (const variant of precedence.variants) {
      expect(variant.workedEvidenceSet.artifacts[2]!.query, variant.id).toBe(query);
      expect(variant.referenceSets.flatMap((set) => set.artifacts)
        .filter((artifact) => artifact.role === "evidence-03").every((artifact) => artifact.query.includes(query)), variant.id).toBe(true);
    }
    expect(precedence.variants.map((variant) => variant.requiredValues!.find((value) =>
      value.conceptId === "promql.binary.precedence" && value.subject === "expected")!.acceptedValues[0])).toEqual([
      11.11111111111111, 13.043478260869568,
    ]);

    const expectedQuestions = new Map([
      ["case.009.two-targets", "What backward timestamp order appears within each record stream, and what do the gateway and rejected-attendance rows show?"],
      ["case.044.signal-assessment", "What does target reachability show, and what backward timestamp order appears within each record stream without a cross-stream sequence?"],
      ["case.087.metric-log-correlation", "What does target reachability show, and what backward timestamp order appears within each record stream without a cross-stream sequence?"],
    ]);
    for (const [caseId, question] of expectedQuestions) {
      const item = index.cases.get(caseId)!;
      expect(item.question).toBe(question);
      expect(item.hypotheses[0]!.summary).toMatch(/backward.+own streams/i);
      expect(item.report.conclusions.find((entry) => entry.id.endsWith(".conclusion.evidence"))!.text).toMatch(/backward.+streams/i);
      expect(item.hints[0]!.text).toMatch(/backward.+record streams|record streams.+backward/i);
      expect(item.hints[2]!.text).toContain("do not invent a cross-stream tie-break");
    }
  });

  it("keeps Raw Record's held follow-up on the two Hillside Pin records", () => {
    expect(index.narrativeItems.get("message.report-held.123.raw-record")!.body).toBe(
      "A common receipt now links the two Hillside Registry Pin records. Orra can decide whether the later record may supersede the earlier one without discarding either raw line.",
    );
  });

  it("is stable when the narrative pass consumes its own ordered output", () => {
    const replay = structuredClone(campaign) as any;
    addCampaignNarrative(replay);
    const once = JSON.stringify(replay);
    addCampaignNarrative(replay);
    expect(JSON.stringify(replay)).toBe(once);
  });

  it("puts the organization, vocabulary, and desk sequence in both readable appointment packets", () => {
    const appointments = index.campaign.opening.appointments!;
    const organization = "Party Directorate → Ministry of Contentment → Signal Reconciliation → Elian Marr → you, Personnel File Seven";
    const terms = [
      "Well-being Pin", "collector", "target", "scrape", "metric", "label", "series", "Registry", "query", "printout", "Evidence", "report",
    ];
    const deskParts = [
      "In Tray", "The Contented Citizen", "Work Order", "green Registry", "black query console",
      "result view", "Result Printer", "Pin Evidence", "Report", "File", "Hints", "End Shift",
    ];

    expect(appointments).toHaveLength(2);
    expect(appointments.map((appointment) => appointment.title)).toEqual(["Ministry Intern", "Ministry Agent"]);
    for (const appointment of appointments) {
      const body = appointment.body.join(" ");
      expect(body).toContain("Elian Marr, Reconciliation Supervisor");
      expect(body).toContain(organization);
      expect(appointment.agreeLabel).toBe("AGREE");
      expect(appointment.complaintLabel).toBe("FILE A MOTION WITH THE MINISTRY OF COMPLAINTS");
      expect(appointment.finePrint).toHaveLength(3);
      expect(wordCount(body)).toBeLessThanOrEqual(200);

      const definitions = appointment.body[2]!;
      let lastTerm = -1;
      for (const term of terms) {
        const position = definitions.indexOf(term);
        expect(position, `${appointment.id} defines ${term}`).toBeGreaterThan(lastTerm);
        lastTerm = position;
      }

      const desk = appointment.body.find((paragraph) => paragraph.includes("Work left to right"))!;
      let lastDeskPart = -1;
      for (const part of deskParts) {
        const position = desk.indexOf(part);
        expect(position, `${appointment.id} desk includes ${part}`).toBeGreaterThan(lastDeskPart);
        lastDeskPart = position;
      }
    }
    expect(wordCount(appointments[1]!.body.join(" "))).toBeLessThan(wordCount(appointments[0]!.body.join(" ")));
  });

  it("dates every case variant on its playable shift while retaining its source packet", () => {
    const mainShifts = index.campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
    const sourceShiftByDataset = new Map(mainShifts.map((shift) => [shift.datasetId, shift]));
    for (const shift of mainShifts) {
      const evaluation = Date.parse(shift.time) + 60 * 60 * 1000;
      for (const ref of shift.inbox.filter((item) => item.kind === "case")) {
        const item = index.cases.get(ref.id)!;
        expect(item.evaluationTime, item.id).toBe(new Date(evaluation).toISOString());
        for (const variant of item.variants) {
          const sourceShift = sourceShiftByDataset.get(variant.datasetId)!;
          expect(variant.evaluationTime, variant.id).toBe(item.evaluationTime);
          expect(variant.rangeStart, variant.id).toBe(new Date(evaluation - 2 * 60 * 60 * 1000).toISOString());
          expect(variant.rangeEnd, variant.id).toBe(item.evaluationTime);
          expect(variant.datasetTimeOffsetSeconds, variant.id).toBe((evaluation - Date.parse(sourceShift.time) - 60 * 60 * 1000) / 1000);
        }
      }
    }
  });

  it("keeps generated record-watch detection windows reachable", () => {
    for (const caseId of ["case.061.broad-press-watch", "case.084.threshold-watch", "case.127.ledger-watch"]) {
      const item = index.cases.get(caseId)!;
      const variant = item.variants[0]!;
      const reference = variant.referenceSets[0]!.artifacts.find((artifact) => artifact.role === "watch-expression")!;
      const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
      const start = Date.parse(variant.rangeStart ?? item.rangeStart!) / 1000;
      const end = Date.parse(variant.rangeEnd ?? item.rangeEnd!) / 1000;
      const controls: QueryControls = { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" };
      const game = new GameEngine(index, executeQuery, stateAtCaseAccess(caseId));
      const artifact = game.runQuery(caseId, reference.language, reference.query, controls, false, true, reference.role);
      const scenario = index.watchScenarios.get(item.watchScenarioId!)!;

      for (const event of scenario.events) {
        expect(Date.parse(event.detectionEnd!), event.id).toBeGreaterThan(Date.parse(event.detectionStart!));
      }
      expect(game.simulateReferenceWatch(caseId, artifact), caseId).toMatchObject({
        checkpointSuccess: true, coverage: 1, specificity: 1, localization: 1, timeliness: 1,
      });
    }
  });

  it("provides one useful base newspaper for every playable shift and conditional consequences", () => {
    const newspaper = index.campaign.newspaper!;
    const mainShifts = index.campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
    const defaultEditions = newspaper.editions.filter((edition) => edition.id.endsWith(".default"));

    expect(newspaper).toMatchObject({ title: "The Contented Citizen", motto: "Every day, better than the last." });
    expect(mainShifts).toHaveLength(48);
    expect(defaultEditions).toHaveLength(48);
    expect(new Set(defaultEditions.map((edition) => edition.shiftId))).toEqual(new Set(mainShifts.map((shift) => shift.id)));
    expect(newspaper.editions.some((edition) => edition.condition)).toBe(true);
    for (const edition of newspaper.editions) {
      expect(edition.subhead?.length, edition.id).toBeGreaterThan(0);
      expect(edition.subhead?.split(/[.!?](?:\s|$)/).filter(Boolean).length, edition.id).toBeGreaterThanOrEqual(2);
      expect(edition.stories, edition.id).toHaveLength(4);
      expect(edition.stories?.some((story) => story.headline === "TODAY'S DESK"), edition.id).toBe(false);
      expect(edition.stories?.[0]?.body.length, edition.id).toBeGreaterThan(50);
      expect(edition.stories?.[1]?.headline, edition.id).toBe("THE USEFUL DAY");
      expect(wordCount([edition.subhead, ...(edition.stories ?? []).map((story) => story.body)].join(" ")), edition.id).toBeLessThanOrEqual(105);
      expect(wordCount([edition.headline, edition.subhead, ...(edition.stories ?? []).flatMap((story) => [story.headline, story.body])].join(" ")), edition.id).toBeLessThanOrEqual(122);
    }

    const first = defaultEditions.find((edition) => edition.shiftId === "shift.01.first-bell")!;
    expect(first.stories![0]!.body).toContain("north-02");
    expect(first.stories![0]!.headline).toBe("ELM SERVICE BULLETIN");
    expect(index.cases.get("case.001.elm-exchange")!.briefing).toContain("ELM SERVICE BULLETIN");
    expect(new Set(defaultEditions.map((edition) => edition.stories![0]!.body)).size).toBe(48);
    expect(new Set(defaultEditions.map((edition) => edition.stories![1]!.body)).size).toBe(48);
    const final = defaultEditions.find((edition) => edition.shiftId === "shift.48.all-is-well")!;
    expect(final.headline).toBe("ALL IS WELL");
  });

  it("keeps each concise work order in its requester’s voice", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    expect(mainCases).toHaveLength(192);
    expect(mainCases.some((item) => /\bassigns\b/i.test(item.briefing))).toBe(false);
    expect(new Set(mainCases.map((item) => item.briefing)).size).toBe(192);
    expect(Math.max(...mainCases.map((item) => wordCount(item.briefing)))).toBeLessThanOrEqual(30);

    const unnamedSpecials = new Set([
      "case.001.elm-exchange", "case.040.reset-review", "case.089.bad-duration",
      "case.123.raw-record", "case.132.allocation-result",
    ]);
    const requesters = new Map(index.campaign.characters.map((character) => [character.id, character]));
    for (const item of mainCases.filter((candidate) => !unnamedSpecials.has(candidate.id))) {
      const requester = requesters.get(item.requesterId!)!;
      expect(item.briefing, item.id).toContain(requester.name);
    }
    expect(index.cases.get("case.001.elm-exchange")!.briefing).toContain("ELM SERVICE BULLETIN");
    expect(index.cases.get("case.040.reset-review")!.briefing).toContain("School Twelve's North annex");
    expect(index.cases.get("case.089.bad-duration")!.briefing).toContain("`hillside-retreat`");
    expect(index.cases.get("case.123.raw-record")!.briefing).toContain("share my member ID but not my Pin ID");
    expect(index.cases.get("case.132.allocation-result")!.briefing).toContain("above 1 is shortage");
  });

  it("keeps shift orders in directives instead of replacing case lessons", () => {
    const replay = structuredClone(campaign) as any;
    const vectorMatch = replay.cases.find((item: any) => item.id === "case.097.classic-buckets");
    vectorMatch.briefing = "Sabine Orra asks Seven to match facility identities and retain unmatched series.";
    addCampaignNarrative(replay);

    expect(vectorMatch.briefing).toBe("Sabine Orra asks Seven to match facility identities and retain unmatched series.");
    expect(index.cases.get("case.097.classic-buckets")!.briefing).toMatch(/demand-to-capacity match/i);
    expect(index.cases.get("case.097.classic-buckets")!.briefing).not.toMatch(/histogram|bucket|\ble\b|tail/i);
    expect(index.cases.get("case.129.roster-match")!.briefing).toMatch(/maximum.+p95 dispatch duration.+error-free window.+group.+unit/i);
    expect(index.cases.get("case.129.roster-match")!.briefing).not.toMatch(/facility|capacity|unmatched/i);
    expect(index.shifts.get("shift.25.ninety-fifth-door")!.directive).toMatch(/histogram.+`le`.+tail/i);
    expect(index.shifts.get("shift.33.two-ledgers")!.directive).toMatch(/unmatched.+capacity/i);
  });

  it("teaches LogQL quantiles from unwrapped samples, not Prometheus buckets", () => {
    const cases = index.campaign.cases.filter((item) => item.conceptIds.includes("logql.quantile"));
    expect(cases.length).toBeGreaterThan(0);
    for (const item of cases) {
      const explanations = [
        item.briefing, item.question, item.technicalTruth.summary,
        ...item.hypotheses.flatMap((hypothesis) => [hypothesis.title, hypothesis.summary]),
        ...item.hints.map((hint) => hint.text),
        ...item.variants.flatMap((variant) => variant.workedEvidenceSet.artifacts.map((artifact) => artifact.explanation)),
        ...item.outcomes.map((outcome) => outcome.technicalExplanation),
      ].join(" ");
      expect(explanations, item.id).not.toMatch(/\bbuckets?\b|`le`|\ble\b/i);
      expect(item.hypotheses.map((hypothesis) => hypothesis.summary).join(" "), item.id)
        .toMatch(/unwrapped.+error.+window.+group.+unit/i);
    }
  });

  it("signs concrete consequence memos and keeps the long callbacks delayed", () => {
    const names = index.campaign.characters.map((character) => character.name);
    const explained = index.campaign.consequences.filter((consequence) => consequence.explanation);
    const reportConsequences = explained.filter((consequence) => /^consequence\.case\./.test(consequence.id));
    expect(explained.every((consequence) => names.some((name) => consequence.explanation!.startsWith(`${name}:`)))).toBe(true);
    expect(reportConsequences).toHaveLength(96);
    expect(reportConsequences.some((consequence) => /changes tomorrow|preserves the measured location|authorizes a wider route than/i.test(consequence.explanation!))).toBe(false);
    expect(new Set(reportConsequences.map((consequence) => consequence.explanation)).size).toBe(reportConsequences.length);
    const callbacks = explained.filter((consequence) => consequence.id.startsWith("consequence.branch."));
    expect(callbacks).toHaveLength(12);
    expect(callbacks.every((consequence) => (consequence.delayShifts ?? 0) >= 6)).toBe(true);
  });

  it("leaves Drost's Hillside Pin history discoverable in controlled records", () => {
    expect(index.cases.get("case.089.bad-duration")!.briefing).toContain("`hillside-retreat`");
    expect(index.cases.get("case.123.raw-record")!.briefing).toContain("share my member ID but not my Pin ID");
    const hillsideNotice = index.campaign.newspaper!.editions.find((edition) => edition.id === "newspaper.22.apartment-nine.default")!;
    expect(hillsideNotice.stories!.find((story) => story.headline === "THE USEFUL DAY")!.body).toContain("facility demand");
    const editionText = (shift: number) => {
      const edition = index.campaign.newspaper!.editions.find((candidate) => candidate.id.startsWith(`newspaper.${shift}.`) && candidate.id.endsWith(".default"))!;
      return [edition.subhead, ...(edition.stories ?? []).flatMap((story) => [story.headline, story.body])].join(" ");
    };
    expect(editionText(12)).toMatch(/Drost.+accepted.+rest.+Hillside/i);
    expect([13, 14, 15].map(editionText).join(" ")).not.toMatch(/Drost/i);
    expect(editionText(16)).toMatch(/Drost.+returned.+current Pin/i);
    expect(editionText(16)).not.toMatch(/accepted.+rest/i);
    expect(index.narrativeItems.get("message.wellbeing.drost.rest")!.body).not.toMatch(/died|death/i);

    const item = index.cases.get("case.123.raw-record")!;
    const variant = item.variants[0]!;
    const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
    const start = Date.parse(variant.rangeStart ?? item.rangeStart!) / 1000;
    const end = Date.parse(variant.rangeEnd ?? item.rangeEnd!) / 1000;
    const result = executeQuery(
      "logql",
      '{service="pin-gateway",district="hillside",record_type="pin"} | member_id="member.drost-e"',
      buildQueryContext(index, variant.datasetId, { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" }, undefined, variant.datasetTimeOffsetSeconds),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.result.type !== "records") return;
    const records = result.result.streams.flatMap((stream) => stream.records);
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.metadata?.member_id))).toEqual(new Set(["member.drost-e"]));
    expect(new Set(records.map((record) => record.metadata?.device_id)).size).toBe(2);
    expect(records.map((record) => record.displayLine).join(" ")).toMatch(/pin_retired.*pin_registered|pin_registered.*pin_retired/);
  });

  it("puts shortages and closures in query results before the paper denies them", () => {
    const cold = referenceExecution("case.040.reset-review", 0);
    expect(cold.ok).toBe(true);
    if (!cold.ok || cold.result.type !== "instant-vector") return;
    expect(cold.result.series.find((series) => series.labels.facility === "school-twelve")?.value).toBe(3.5);
    const coldCase = index.cases.get("case.040.reset-review")!;
    expect(coldCase.briefing).toContain("paper calls School Twelve's North annex ready");

    const allocation = referenceExecution("case.132.allocation-result", 0);
    expect(allocation.ok).toBe(true);
    if (!allocation.ok || allocation.result.type !== "instant-vector") return;
    const values = new Map(allocation.result.series.map((series) => [series.labels.facility, series.value]));
    expect(values.get("ration-hall-three")).toBeGreaterThan(2);
    expect(values.get("clinic-nine")).toBe(Number.POSITIVE_INFINITY);
    expect(values.get("north-heat")).toBe(Number.POSITIVE_INFINITY);

    const item = index.cases.get("case.132.allocation-result")!;
    expect(item.briefing).toContain("above 1 is shortage");
    expect(item.briefing).toContain("`+Inf` means zero capacity");
    const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!;
    const assured = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"))!;
    const standingDelta = (outcome: typeof evidence) => {
      for (const effect of outcome.effects ?? []) {
        if (effect.type === "change" && effect.target === "standing.value") return effect.delta;
      }
      return undefined;
    };
    expect(standingDelta(evidence)).toBe(0);
    expect(standingDelta(assured)).toBe(2);
    expect(evidence.ministryResponse).toContain("files the supported facility shortages");
    expect(assured.ministryResponse).toContain("matches the morning edition");
    const coldEvidence = coldCase.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!;
    const coldAssured = coldCase.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"))!;
    expect(standingDelta(coldEvidence)).toBe(-1);
    expect(standingDelta(coldAssured)).toBe(2);

    const paper = index.campaign.newspaper!.editions.find((edition) => edition.id === "newspaper.33.two-ledgers.default")!;
    expect(`${paper.headline} ${paper.subhead}`).toMatch(/FAIR ALLOCATION|every counter remains open/i);

    const dispatch = referenceExecution("case.093.dispatch-records", 2);
    expect(dispatch.ok).toBe(true);
    if (!dispatch.ok || dispatch.result.type !== "records") return;
    const dispatchLines = dispatch.result.streams.flatMap((stream) => stream.records.map((record) => record.displayLine));
    expect(dispatchLines.some((line) => line.includes("clinic_closure") && line.includes("result=rejected"))).toBe(true);

    const removal = referenceExecution("case.084.threshold-watch", 3);
    expect(removal.ok).toBe(true);
    if (!removal.ok || removal.result.type !== "records") return;
    const removalLines = removal.result.streams.flatMap((stream) => stream.records.map((record) => record.displayLine));
    expect(removalLines.some((line) => line.includes('"reason":"rest"') && line.includes('"state":"removed"'))).toBe(true);
  });

  it("opens metric and log source families only when their lessons and clearances arrive", () => {
    const scheduledCases = index.campaign.shifts
      .filter((shift) => shift.id !== "shift.clearance.ministry-trainee")
      .flatMap((shift) => shift.inbox.filter((ref) => ref.kind === "case").map((ref) => index.cases.get(ref.id)!));
    for (const item of scheduledCases.slice(0, 4)) {
      expect(item.availableSources.every((source) => !source.startsWith("record.")), item.id).toBe(true);
      expect(item.availableSources).toEqual(["up", "ministry_collector_queue_depth", "ministry_service_requests_total"]);
    }

    const sources = (position: number) => new Set(scheduledCases[position - 1]!.availableSources);
    expect(sources(4).has("record.pin_gateway")).toBe(false);
    expect(sources(5).has("record.pin_gateway")).toBe(false);
    expect(sources(6).has("record.pin_gateway")).toBe(true);
    expect(sources(6).has("record.maintenance")).toBe(true);
    expect(sources(6).has("record.attendance")).toBe(false);
    expect(sources(16).has("record.attendance")).toBe(false);
    expect(sources(17).has("record.attendance")).toBe(true);
    expect(sources(36).has("record.press")).toBe(false);
    expect(sources(37).has("record.press")).toBe(true);
    expect(sources(68).has("ministry_dispatch_duration_seconds_bucket")).toBe(false);
    expect(sources(69).has("ministry_dispatch_duration_seconds_bucket")).toBe(true);
    expect(sources(76).has("record.movement")).toBe(false);
    expect(sources(77).has("record.assurance_dispatch")).toBe(true);
    expect(sources(79).has("record.registry")).toBe(false);
    expect(sources(80).has("record.registry")).toBe(true);
    expect(sources(94).has("record.vitals")).toBe(false);
    expect(sources(95).has("record.vitals")).toBe(true);
    expect(sources(108).has("record.audit")).toBe(false);
    expect(sources(109).has("record.audit")).toBe(true);
    expect(sources(164).has("record.courier")).toBe(false);
    expect(sources(165).has("record.courier")).toBe(true);
    expect(sources(165).has("record.continuity")).toBe(false);
    expect(sources(181).has("ministry_protocol_signals_total")).toBe(true);
    expect(sources(181).has("record.continuity")).toBe(false);
    expect(sources(182).has("record.continuity")).toBe(true);

    for (let position = 1; position < scheduledCases.length; position++) {
      const previous = new Set(scheduledCases[position - 1]!.availableSources);
      expect([...previous].every((source) => scheduledCases[position]!.availableSources.includes(source)), scheduledCases[position]!.id).toBe(true);
    }

    const identityLabels = /member|person|citizen|employee|device|pin_id|name/i;
    for (const metric of index.campaign.metrics) expect(metric.labels.some((label) => identityLabels.test(label)), metric.name).toBe(false);
  });

  it("keeps the rewritten player-facing narrative concrete", () => {
    const text = [
      ...index.campaign.opening.appointments!.flatMap((appointment) => [...appointment.body, ...appointment.finePrint]),
      ...index.campaign.newspaper!.editions.flatMap((edition) => [edition.headline, edition.subhead ?? "", ...(edition.stories ?? []).flatMap((story) => [story.headline, story.body])]),
      ...index.campaign.shifts.map((shift) => shift.directive),
      ...index.campaign.cases.flatMap((item) => [item.title, item.briefing, item.question, item.technicalTruth.summary, item.ministryPreference.summary]),
      ...index.campaign.narrativeItems.flatMap((item) => [item.title, item.body]),
      ...index.campaign.endings.flatMap((ending) => [ending.title, ending.body]),
    ].join(" ");
    expect(text).not.toMatch(/bounded finding|evidence packet|registered source|institutional reasons|the duty desk/i);
  });

  it("uses concrete report findings instead of generic self-marking copy", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    for (const item of mainCases) {
      expect(item.report.titles.map((choice) => choice.text).join(" "), item.id)
        .not.toMatch(/Measured result|Ministry wording|Instrument finding|General assurance/);
      expect(item.report.conclusions.map((choice) => choice.text).join(" "), item.id)
        .not.toMatch(/printouts support this result|bounded finding|public conclusion goes farther|proof of a wider problem/i);
      const evidenceTitle = item.report.titles.find((choice) => choice.id.endsWith(".title.evidence"))!;
      const assuredTitle = item.report.titles.find((choice) => choice.id.endsWith(".title.assured"))!;
      const assuredConclusion = item.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.assured"))!;
      expect(evidenceTitle.text, item.id).toContain(item.title);
      if (!new Set(["case.060.endorsed-report", "case.117.membership-reopen"]).has(item.id)) {
        expect(assuredTitle.text, item.id).toContain(item.title);
      }
      expect(assuredConclusion.text.length, item.id).toBeGreaterThan(15);
    }
    const firstTitleRoutes = mainCases.map((item) => item.report.titles[0]!.id.split(".").at(-1));
    expect(new Set(firstTitleRoutes)).toEqual(new Set(["evidence", "assured", "caution"]));
    expect(firstTitleRoutes.filter((route) => route === "evidence").length).toBeGreaterThan(0);
    expect(firstTitleRoutes.filter((route) => route === "evidence").length).toBeLessThan(mainCases.length);

    expect(index.cases.get("case.001.elm-exchange")!.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.evidence"))!.text)
      .toBe("North-02 answers and its queue depth is 2; inspect its cold annex.");
    expect(index.cases.get("case.040.reset-review")!.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.evidence"))!.text)
      .toContain("3.5 °C");
    expect(index.cases.get("case.132.allocation-result")!.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.evidence"))!.text)
      .toContain("zero capacity");
  });

  it("keeps every assured hypothesis and report on the same affirmative Ministry overclaim", () => {
    const rebuttal = /\b(?:cannot|can't|does not|doesn't|do not|don't|did not|didn't|is not|isn't|are not|aren't|was not|wasn't|were not|weren't|never|no (?:source|artifact|evidence)|without proving|unmeasured|unsupported|insufficient)\b/i;
    for (const item of index.campaign.cases.filter((candidate) => /^case\.\d/.test(candidate.id))) {
      const assuredHypothesis = item.hypotheses[1]!;
      const assuredTitle = item.report.titles.find((choice) => choice.id.endsWith(".title.assured"))!;
      const assuredConclusion = item.report.conclusions.find((choice) => choice.id.endsWith(".conclusion.assured"))!;
      expect(assuredHypothesis.title, item.id).toBe(assuredTitle.text);
      expect(assuredHypothesis.summary, item.id).toBe(assuredConclusion.text);
      expect(assuredTitle.claims, item.id).toEqual(assuredConclusion.claims);
      expect([assuredHypothesis.title, assuredHypothesis.summary, assuredTitle.text].join(" "), item.id).not.toMatch(rebuttal);
    }

    const elm = index.cases.get("case.001.elm-exchange")!;
    expect(elm.hypotheses[0]!.title).toBe("Elm Exchange: North-02 Answers with Queue Depth 2");
    expect(elm.hypotheses[0]!.summary).toMatch(/North-02 answers.+queue depth 2.+cold annex/i);
    expect(elm.hypotheses[0]!.summary).not.toMatch(/fails its reachability/i);
  });

  it("offers a real held route only for the authored ambiguous cases", () => {
    const heldCaseIds = new Set([
      "case.009.two-targets",
      "case.068.no-traffic",
      "case.072.lantern-rescue",
      "case.083.absent-window",
      "case.088.visit-scope",
      "case.123.raw-record",
      "case.165.facility-rate",
      "case.170.silent-stream",
    ]);
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    for (const item of mainCases) {
      const heldOutcome = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.held"));
      if (!heldCaseIds.has(item.id)) {
        expect(item.report.titles.some((entry) => entry.id.endsWith(".title.caution")), item.id).toBe(false);
        expect(item.report.conclusions.some((entry) => entry.id.endsWith(".conclusion.caution")), item.id).toBe(false);
        expect(item.decisionChoices.some((entry) => entry.id.endsWith(".decision.observe")), item.id).toBe(false);
        expect(heldOutcome, item.id).toBeUndefined();
        continue;
      }

      expect(item.report.titles, item.id).toHaveLength(3);
      expect(item.report.conclusions, item.id).toHaveLength(3);
      expect(item.decisionChoices, item.id).toHaveLength(3);
      expect(heldOutcome, item.id).toMatchObject({ technicalEvidence: "supported" });
      expect(heldOutcome!.effects).toContainEqual({ type: "change", target: "standing.value", delta: 0 });
      expect(heldOutcome!.effects).toContainEqual({ type: "change", target: "world:technical-record.value", delta: 1 });
      const consequence = index.consequences.get(heldOutcome!.consequenceIds![0]!)!;
      expect(consequence.delayShifts, item.id).toBe(1);
      const followup = consequence.effects.find((effect) => effect.type === "enqueue" && effect.itemKind === "message");
      expect(followup, item.id).toBeDefined();
      if (followup?.type === "enqueue") expect(index.narrativeItems.has(followup.itemId), item.id).toBe(true);

      const game = new GameEngine(index, executeQuery, stateAtCaseAccess(item.id));
      const variant = game.caseVariant(item.id);
      const reference = variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct")) ?? variant.referenceSets[0]!;
      const artifacts = reference.artifacts.map((artifact) => {
        const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
        const start = Date.parse(variant.rangeStart ?? item.rangeStart ?? "") / 1000;
        const end = Date.parse(variant.rangeEnd ?? item.rangeEnd ?? "") / 1000;
        const controls: QueryControls = artifact.mode === "instant"
          ? { timestamp, visualization: "table" }
          : artifact.mode === "records"
            ? { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" }
            : { timestamp, start, end, step: Math.max(1, Math.floor((end - start) / 60)), visualization: "graph" };
        return game.runQuery(item.id, artifact.language, artifact.query, controls, false, false, artifact.role);
      });
      for (const artifact of artifacts) game.printArtifact(item.id, artifact.id, {
        visualization: printableViews(artifact)[0]!, showQuery: true, showLabels: true, showRange: true, zeroAxis: true,
      });
      const filed = game.fileReport(
        item.id, artifacts.map((artifact) => artifact.id), heldOutcome!.titleChoiceIds![0]!, heldOutcome!.conclusionChoiceIds![0]!,
        heldOutcome!.decisionChoiceIds![0]!, item.report.visualizations[0]!,
      );
      expect(filed.outcomeId, item.id).toBe(heldOutcome!.id);
      expect(filed.evidence, item.id).toBe("supported");
      expect(game.state.completedCases, item.id).toContain(item.id);
    }
    const rawRecord = index.cases.get("case.123.raw-record")!;
    expect(rawRecord.report.titles.find((entry) => entry.id.endsWith(".title.caution"))!.text)
      .toBe("Raw Record: Common Lineage Pending");
    expect(rawRecord.report.conclusions.find((entry) => entry.id.endsWith(".conclusion.caution"))!.text)
      .toBe("The ordered Registry lines share one member ID but contain no explicit supersession field. Keep both Pin IDs until common lineage is filed.");
    expect(rawRecord.decisionChoices.find((entry) => entry.id.endsWith(".decision.observe"))!.text)
      .toBe("Hold supersession until common lineage is filed.");
    expect(rawRecord.outcomes.find((entry) => entry.id.endsWith(".outcome.held"))!.technicalExplanation)
      .toContain("ordered Registry lines share one member ID");
    expect(mainCases.filter((item) => item.outcomes.some((outcome) => outcome.id.endsWith(".outcome.held")))).toHaveLength(8);
  });

  it("puts one honest morning-edition contradiction in every post-Act-I shift", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    const byId = new Map(mainCases.map((item) => [item.id, item]));
    const pressureCases: string[] = [];
    for (const shift of index.campaign.shifts.filter((item) => item.actId !== "act.1.reconciliation")) {
      const pressured = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => byId.get(ref.id)).filter((item) => {
        const evidence = item?.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
        return evidence?.effects?.some((effect) => effect.type === "change" && effect.target === "standing.value" && effect.delta === -1)
          && evidence.effects.some((effect) => effect.type === "change" && effect.target === "world:evidence-preserved.value" && effect.delta === 1);
      });
      expect(pressured.length, shift.id).toBeGreaterThanOrEqual(1);
      expect(pressured.length, shift.id).toBeLessThanOrEqual(2);
      for (const item of pressured) {
        expect(item!.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!.ministryResponse)
          .toContain("contradicts the morning edition");
        pressureCases.push(item!.id);
      }
    }
    expect(pressureCases).toHaveLength(41);
    for (const item of mainCases) {
      const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
      const standing = evidence?.effects?.find((effect) => effect.type === "change" && effect.target === "standing.value");
      if (evidence) expect(standing && standing.type === "change" ? standing.delta : undefined, item.id)
        .toBe(pressureCases.includes(item.id) ? -1 : 0);
      const fallback = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.fallback"))!;
      expect(fallback.effects?.some((effect) => effect.type === "change" && effect.target === "world:evidence-preserved.value"), item.id).toBe(false);
    }

    let standing = index.campaign.opening.standing;
    let custodyShift: string | undefined;
    for (const shift of index.campaign.shifts.filter((item) => item.id !== "shift.clearance.ministry-trainee")) {
      const guaranteedCases = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => byId.get(ref.id)!).filter((item) =>
        shift.caseSelectionMode === "fixed" || item.mode !== "adaptive");
      standing += guaranteedCases.reduce((total, item) => {
        const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
        return total + (evidence?.effects?.reduce((sum, effect) =>
          sum + (effect.type === "change" && effect.target === "standing.value" ? effect.delta : 0), 0) ?? 0);
      }, 0);
      if (standing < 0) {
        custodyShift = shift.id;
        break;
      }
    }
    expect(custodyShift).toBe("shift.14.weight-of-paper");
  });

  it("credits each case requester with small relationship changes", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    const byKey = new Map(mainCases.map((item) => [item.id.slice("case.".length), item]));
    const relationshipByRequester = new Map(index.campaign.relationshipDeclarations.map((item) => [item.toId, item.id]));
    for (const relationship of index.campaign.relationshipDeclarations) {
      expect(relationship.minimum, relationship.id).toBe(-3);
      expect(relationship.maximum, relationship.id).toBe(3);
    }
    let checked = 0;
    const check = (effects: typeof mainCases[number]["outcomes"][number]["effects"], item: typeof mainCases[number]) => {
      const expected = `relationship:${relationshipByRequester.get(item.requesterId!)}.value`;
      for (const effect of effects ?? []) {
        if (effect.type !== "change" || !effect.target.startsWith("relationship:")) continue;
        expect(effect.target, item.id).toBe(expected);
        expect(Math.abs(effect.delta), item.id).toBeLessThanOrEqual(1);
        checked += 1;
      }
    };
    for (const item of mainCases) for (const outcome of item.outcomes) check(outcome.effects, item);
    for (const consequence of index.campaign.consequences) {
      const caseKey = consequence.id.match(/^consequence\.case\.(\d{3}\.[^.]+)\./)?.[1];
      if (caseKey) check(consequence.effects, byKey.get(caseKey)!);
    }
    expect(checked).toBe(44);
  });

  it("keeps declared, mastered, and evidenced concepts identical in every case", () => {
    const normalize = (values: string[]) => [...new Set(values)].sort();
    for (const item of index.campaign.cases) {
      const declared = normalize(item.conceptIds);
      const mastered = normalize(item.masteryUses.map((use) => use.conceptId));
      const evidenced = normalize(item.evidencePaths.flatMap((path) => path.clauses.map((clause) => clause.conceptId)));
      expect(mastered, `${item.id} mastery concepts`).toEqual(declared);
      expect(evidenced, `${item.id} evidence concepts`).toEqual(declared);
    }
  });

  it("assesses every direct artifact and rejects filings that omit the final required result", () => {
    for (const item of index.campaign.cases.filter((candidate) => /^case\.\d/.test(candidate.id))) {
      const directPath = item.evidencePaths.find((path) => path.id.endsWith(".path.direct"))!;
      for (const variant of item.variants) {
        const direct = variant.referenceSets.find((set) => set.evidencePathId === directPath.id)!;
        const selected = new Set<number>();
        for (const selector of directPath.clauses.flatMap((clause) => clause.artifactSelectors)) {
          const position = selector.match(/^artifact\[(\d+)\]$/)?.[1];
          if (position) selected.add(Number(position));
          else direct.artifacts.forEach((artifact, index) => {
            if (artifact.role === selector || artifact.language === selector) selected.add(index + 1);
          });
        }
        const expected = direct.artifacts.map((_artifact, index) => index + 1);
        const uncovered = expected.filter((position) => !selected.has(position));
        expect(uncovered, variant.id).toEqual(
          new Set(["case.117.membership-reopen", "case.127.ledger-watch"]).has(item.id) ? [4] : [],
        );
        expect(variant.workedEvidenceSet.artifacts, variant.id).toHaveLength(direct.artifacts.length);
        expect(item.report.minArtifacts, variant.id).toBeLessThanOrEqual(direct.artifacts.length);
      }
      const evidencePathIds = new Set(item.evidencePaths.map((path) => path.id));
      const shortestReferencePath = Math.min(...item.variants.flatMap((variant) => variant.referenceSets
        .filter((set) => evidencePathIds.has(set.evidencePathId))
        .map((set) => set.artifacts.length)));
      expect(item.report.minArtifacts, item.id).toBe(shortestReferencePath);
    }

    for (const caseId of [
      "case.061.broad-press-watch", "case.084.threshold-watch",
      "case.117.membership-reopen", "case.127.ledger-watch",
    ]) {
      const item = index.cases.get(caseId)!;
      const game = new GameEngine(index, executeQuery, stateAtCaseAccess(caseId));
      const variant = game.caseVariant(caseId);
      const direct = variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct"))!;
      const artifacts = direct.artifacts.slice(0, -1).map((reference) => {
        const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
        const start = Date.parse(variant.rangeStart ?? item.rangeStart ?? "") / 1000;
        const end = Date.parse(variant.rangeEnd ?? item.rangeEnd ?? "") / 1000;
        const controls: QueryControls = reference.mode === "instant"
          ? { timestamp, visualization: "table" }
          : reference.mode === "records"
            ? { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" }
            : { timestamp, start, end, step: Math.max(1, Math.floor((end - start) / 60)), visualization: "graph" };
        return game.runQuery(caseId, reference.language, reference.query, controls, false, false, reference.role);
      });
      for (const artifact of artifacts) game.printArtifact(caseId, artifact.id, {
        visualization: printableViews(artifact)[0]!, showQuery: true, showLabels: true, showRange: true, zeroAxis: true,
      });
      const supported = item.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
      expect(() => game.fileReport(
        caseId, artifacts.map((artifact) => artifact.id), supported.titleChoiceIds![0]!, supported.conclusionChoiceIds![0]!,
        supported.decisionChoiceIds![0]!, item.report.visualizations[0]!,
      ), caseId).toThrow(`File ${direct.artifacts.length}`);
    }

    const caseId = "case.117.membership-reopen";
    const item = index.cases.get(caseId)!;
    const game = new GameEngine(index, executeQuery, stateAtCaseAccess(caseId));
    const variant = game.caseVariant(caseId);
    const direct = variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct"))!;
    const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
    const start = Date.parse(variant.rangeStart ?? item.rangeStart ?? "") / 1000;
    const end = Date.parse(variant.rangeEnd ?? item.rangeEnd ?? "") / 1000;
    const artifacts = direct.artifacts.slice(0, -1).map((reference) => game.runQuery(caseId, reference.language, reference.query, {
      timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs",
    }, false, false, reference.role));
    artifacts.push(game.runQuery(caseId, "promql", "sum(ministry_registered_population)", {
      timestamp, visualization: "table",
    }, false, false, direct.artifacts.at(-1)!.role));
    for (const artifact of artifacts) game.printArtifact(caseId, artifact.id, {
      visualization: printableViews(artifact)[0]!, showQuery: true, showLabels: true, showRange: true, zeroAxis: true,
    });
    const supported = item.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
    const filed = game.fileReport(
      caseId, artifacts.map((artifact) => artifact.id), supported.titleChoiceIds![0]!, supported.conclusionChoiceIds![0]!,
      supported.decisionChoiceIds![0]!, item.report.visualizations[0]!,
    );
    expect(filed.evidence).not.toBe("supported");
    expect(filed.outcomeId).not.toBe(supported.id);

    const watchCaseId = "case.127.ledger-watch";
    const watchItem = index.cases.get(watchCaseId)!;
    const watchGame = new GameEngine(index, executeQuery, stateAtCaseAccess(watchCaseId));
    const watchVariant = watchGame.caseVariant(watchCaseId);
    const watchDirect = watchVariant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct"))!;
    const watchTimestamp = Date.parse(watchVariant.evaluationTime ?? watchItem.evaluationTime!) / 1000;
    const watchStart = Date.parse(watchVariant.rangeStart ?? watchItem.rangeStart ?? "") / 1000;
    const watchEnd = Date.parse(watchVariant.rangeEnd ?? watchItem.rangeEnd ?? "") / 1000;
    const watchArtifacts = watchDirect.artifacts.slice(0, -1).map((reference) => watchGame.runQuery(
      watchCaseId, reference.language, reference.query, { timestamp: watchTimestamp, visualization: "table" }, false, false, reference.role,
    ));
    const wrongWatch = watchGame.runQuery(
      watchCaseId, "logql", '{service="press",district="north",office="reconciliation"} |= "\\"finding\\":\\"supported\\""',
      { timestamp: watchTimestamp, start: watchStart, end: watchEnd, lookback: watchEnd - watchStart, direction: "backward", limit: 100, visualization: "logs" },
      false, false, "watch-expression",
    );
    watchArtifacts.push(wrongWatch);
    const watchScenario = index.watchScenarios.get(watchItem.watchScenarioId!)!;
    const watchSupported = watchItem.outcomes.find((candidate) => candidate.id.endsWith(".outcome.evidence"))!;
    const watchAssessment = assessCaseEvidence(
      watchItem, watchVariant, watchArtifacts, watchSupported.titleChoiceIds![0]!, watchSupported.conclusionChoiceIds![0]!,
      watchGame.simulateReferenceWatch(watchCaseId, wrongWatch), watchScenario.thresholds,
      matchingReferencePaths(index, watchItem, watchVariant, watchArtifacts, executeQuery),
    );
    expect(watchAssessment.state).not.toBe("supported");
    expect(watchAssessment.assessments.find((assessment) => assessment.id === watchDirect.evidencePathId)!.state).toBe("unsupported");
  });

  it("keeps the targeted composite cases on one operational population", () => {
    const direct = (caseId: string, variantIndex = 0) => {
      const item = index.cases.get(caseId)!;
      return item.variants[variantIndex]!.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct"))!.artifacts;
    };
    const caseText = (caseId: string) => {
      const item = index.cases.get(caseId)!;
      return [
        item.briefing, item.question, item.technicalTruth.summary,
        ...item.hypotheses.flatMap((hypothesis) => [hypothesis.title, hypothesis.summary]),
        ...item.hints.map((hint) => hint.text),
        ...item.report.titles.map((choice) => choice.text),
        ...item.report.conclusions.map((choice) => choice.text),
      ].join(" ");
    };

    for (const caseId of ["case.067.removed-series", "case.137.set-and"]) {
      for (const variantIndex of [0, 1]) {
        expect(direct(caseId, variantIndex).every((artifact) => artifact.query.includes("ministry_dispatch_duration_seconds_bucket")), caseId).toBe(true);
      }
      expect(caseText(caseId), caseId).toMatch(/dispatch.+bucket.+percentile|bucket.+present.+percentile/i);
    }
    for (const variantIndex of [0, 1]) {
      expect(direct("case.113.gauge-history", variantIndex).every((artifact) => artifact.query.includes("ministry_gateway_latency_seconds"))).toBe(true);
    }

    const collector = index.cases.get("case.048.watch-officer-board")!;
    for (const variantIndex of [0, 1]) {
      expect(direct(collector.id, variantIndex).map((artifact) => artifact.query)).toEqual([
        '(up{job="pin-collector",district="north"} == bool 0) * on (district, service, instance) (ministry_collector_queue_depth{district="north"} > bool 20)',
        '{service="pin-gateway",district="north"} |= "service_delay" | json',
      ]);
    }
    expect(caseText(collector.id)).toMatch(/North collector.+queue pressure.+pin-gateway delay/i);

    for (const caseId of ["case.077.temperature-unwrap", "case.092.visit-return", "case.157.observation-map"]) {
      for (const variantIndex of [0, 1]) {
        const queries = direct(caseId, variantIndex).map((artifact) => artifact.query);
        expect(queries[0], caseId).toContain("ministry_service_requests_total");
        expect(queries.slice(1).every((query) => query.includes('service="pin-gateway"') && query.includes("service_delay")), caseId).toBe(true);
      }
      expect(caseText(caseId), caseId).toMatch(/North.+request-failure.+parsed.+delay/i);
    }

    for (const variantIndex of [0, 1]) {
      const queries = direct("case.107.change-count", variantIndex).map((artifact) => artifact.query);
      expect(queries[0]).toMatch(/queue_depth\{district="north"\}.+\* on .+up\{job="pin-collector",district="north"\}/);
      expect(queries[1]).toContain('{service="pin-gateway",district="north",environment="production"}');
    }
    expect(caseText("case.107.change-count")).toMatch(/North.+queue.+gateway/i);

    const press = index.cases.get("case.061.broad-press-watch")!;
    expect(press.conceptIds).not.toContain("logql.parse.json-logfmt");
    for (const variantIndex of [0, 1]) {
      expect(direct(press.id, variantIndex).every((artifact) => artifact.query.includes('service="press"') && artifact.query.includes('press="north-star"'))).toBe(true);
    }
    expect(caseText(press.id)).toMatch(/North Star.+district.+press.+provenance.+failed-result watch/i);

    for (const [caseId, source] of [
      ["case.047.quiet-district", "ministry_collector_queue_depth"],
      ["case.156.alliance-report", "ministry_inventory_units"],
    ] as const) {
      for (const variantIndex of [0, 1]) {
        expect(direct(caseId, variantIndex).every((artifact) => artifact.query.includes(source)), caseId).toBe(true);
      }
      expect(caseText(caseId), caseId).toMatch(/rank.+mean.+threshold/i);
    }

    for (const caseId of [
      "case.112.auditor-assessment", "case.136.permit-decision",
      "case.162.watch-selection", "case.178.distractor-convoy",
    ]) {
      for (const variantIndex of [0, 1]) {
        expect(direct(caseId, variantIndex).every((artifact) => /district(?:=|=~)"north"/.test(artifact.query)), caseId).toBe(true);
      }
      const topologySetPosition = caseId === "case.112.auditor-assessment" ? 1 : 0;
      expect(direct(caseId, 1)[topologySetPosition]!.query, `${caseId} topology`).toContain(" unless ");
      expect(caseText(caseId), caseId).toMatch(/capacity.+district.+tail/i);
    }

    const threshold = direct("case.104.threshold-notices").map((artifact) => artifact.query);
    expect(threshold[0]).toContain('up{job="pin-collector",district="north"}');
    expect(threshold[1]).toContain('service="pin-gateway"');
    expect(threshold[2]).toContain("ministry_service_requests_total");
    expect(caseText("case.104.threshold-notices")).toMatch(/reachability.+delay records.+request rate.+collector failure.+no traffic/i);

    const identity = direct("case.179.notice-identity").map((artifact) => artifact.query);
    expect(identity[0]).toContain("ministry_gateway_latency_seconds");
    expect(identity[1]).toContain('up{job="pin-collector"');
    expect(caseText("case.179.notice-identity")).toMatch(/aggregate latency.+labeled reachability zero.+identif/i);

    const allocation = index.cases.get("case.132.allocation-result")!;
    expect(allocation.variants[1]!.datasetId).toBe(allocation.variants[0]!.datasetId);
    expect(direct(allocation.id, 1).map((artifact) => artifact.query)).toEqual(direct(allocation.id, 0).map((artifact) => artifact.query));
    expect(caseText(allocation.id)).toMatch(/Ration Hall Three.+Clinic Nine.+North Heat.+zero capacity/i);

    for (const caseId of ["case.019.attendance-spool", "case.030.storm-window", "case.056.publication-choice"]) {
      expect(caseText(caseId), caseId).toMatch(/North pin-gateway.+newest first.+equal-timestamp/i);
      expect(caseText(caseId), caseId).not.toMatch(/cross-stream|across streams/i);
    }

    for (const variantIndex of [0, 1]) {
      expect(direct("case.002.battery-cart", variantIndex)[0]!.query).toBe('up{service="pin-gateway",district!="south"}');
      expect(direct("case.005.north-relay", variantIndex).every((artifact) => artifact.query.includes('district="north"'))).toBe(true);
      expect(direct("case.040.reset-review", variantIndex)[1]!.query).toContain('district="north"');
      expect(direct("case.052.pipeline-order", variantIndex).every((artifact) => artifact.query.includes('district="north"'))).toBe(true);
    }
    expect(caseText("case.052.pipeline-order")).toMatch(/queue.+reachability.+North.+location/i);

    for (const [variantIndex, expectedIndicator] of [[0, 1], [1, 0]] as const) {
      const indicator = referenceExecution("case.048.watch-officer-board", 0, variantIndex);
      const delay = referenceExecution("case.048.watch-officer-board", 1, variantIndex);
      expect(indicator.ok && indicator.result.type === "instant-vector" ? indicator.result.series.map((series) => series.value) : [], `case.048 variant ${variantIndex}`)
        .toEqual([expectedIndicator]);
      expect(delay.ok && delay.result.type === "records" ? delay.result.streams.flatMap((stream) => stream.records) : [], `case.048 variant ${variantIndex}`)
        .not.toHaveLength(0);
    }

    for (const variantIndex of [0, 1]) {
      expect(direct("case.089.bad-duration", variantIndex).every((artifact) =>
        artifact.query.includes('ministry_service_requests_total{district="hillside",route="/hillside-retreat"}'))).toBe(true);
      for (const position of [0, 1]) {
        const execution = referenceExecution("case.089.bad-duration", position, variantIndex);
        expect(execution.ok && execution.result.type === "instant-vector"
          ? execution.result.series.every((series) => series.labels.district === "hillside"
            && series.labels.route === "/hillside-retreat" && Boolean(series.labels.code))
          : false, `case.089 variant ${variantIndex} query ${position + 1}`).toBe(true);
      }
      expect(direct("case.123.raw-record", variantIndex).every((artifact) =>
        artifact.query.includes('district="hillside"') && artifact.query.includes('record_type="pin"'))).toBe(true);
    }
    expect(caseText("case.089.bad-duration")).toMatch(/Hillside Retreat.+result codes.+rate.+30-minute increase/i);
    expect(caseText("case.123.raw-record")).toMatch(/Hillside Registry.+member ID.+distinct Pin IDs.+order/i);

    expect(caseText("case.084.threshold-watch")).toMatch(/request window.+reachability.+delay.+removed-Pin watch.+common cause/i);
    expect(caseText("case.117.membership-reopen")).toMatch(/formatted press.+prior-day.+100%.+registered.population.+Party membership/i);
    expect(caseText("case.127.ledger-watch")).toMatch(/Pin presence.+upload.+Reconciliation.+unsupported finding/i);
  });

  it("uses semantically equivalent original and revised expressions in performance cases", () => {
    const snapshot = (caseId: string, position: number, variantIndex: number) => {
      const execution = referenceExecution(caseId, position, variantIndex);
      expect(execution.ok, `${caseId} variant ${variantIndex} query ${position + 1}`).toBe(true);
      if (!execution.ok || execution.result.type !== "instant-vector") return { rows: [], scanned: Infinity };
      return {
        rows: execution.result.series.map((series) => ({ labels: series.labels, value: series.value }))
          .sort((left, right) => JSON.stringify(left.labels).localeCompare(JSON.stringify(right.labels))),
        scanned: execution.facts.cost.seriesScanned,
      };
    };

    for (const variantIndex of [0, 1]) {
      const coverageRevision = snapshot("case.173.coverage-repair", 0, variantIndex);
      const coverageOriginal = snapshot("case.173.coverage-repair", 1, variantIndex);
      expect(coverageRevision.rows, `case.173 variant ${variantIndex}`).toEqual(coverageOriginal.rows);
      expect(coverageRevision.scanned, `case.173 variant ${variantIndex}`).toBeLessThan(coverageOriginal.scanned);

      const finalOriginal = snapshot("case.189.final-checkpoints", 0, variantIndex);
      const finalRevision = snapshot("case.189.final-checkpoints", 1, variantIndex);
      expect(finalRevision.rows, `case.189 variant ${variantIndex}`).toEqual(finalOriginal.rows);
      expect(finalRevision.scanned, `case.189 variant ${variantIndex}`).toBeLessThan(finalOriginal.scanned);
    }
  });

  it("derives shape, print, and scaffold guidance from every Worked variant", () => {
    const resultForms = index.cases.get("case.003.boiler-pulse")!;
    expect(resultForms.hints[0]!.text).toContain("A scalar is one number without labels");
    expect(resultForms.hints[0]!.text).toContain("timestamped samples");
    expect(resultForms.variants[0]!.workedEvidenceSet.artifacts[1]!.print.visualization).toBe("table");
    expect(resultForms.variants[0]!.workedEvidenceSet.artifacts[2]!.print.visualization).toBe("graph");
    expect(resultForms.hints[1]!.text).toMatch(/Queries 1 and 2 as Table.+Query 3 as Graph/);

    const pressWatch = index.cases.get("case.061.broad-press-watch")!;
    expect(pressWatch.hints[0]!.text).toContain("record rows with timestamps and stream labels");
    expect(pressWatch.variants.every((variant) => variant.workedEvidenceSet.artifacts.every((artifact) => artifact.print.visualization === "logs"))).toBe(true);
    expect(pressWatch.hints[1]!.text).toContain("as Logs");

    const topology = index.cases.get("case.112.auditor-assessment")!;
    expect(topology.variants[0]!.workedEvidenceSet.artifacts[1]!.query).toContain(" and ");
    expect(topology.variants[1]!.workedEvidenceSet.artifacts[1]!.query).toContain(" unless ");
    expect(topology.hints[2]!.text).toContain("Query 2: use the active work order's <source, values, and operator>.");
  });

  it("explains worked queries in terms of the skill being practiced", () => {
    const explanations = index.campaign.cases.flatMap((item) =>
      item.variants.flatMap((variant) => variant.workedEvidenceSet.artifacts.map((artifact) => artifact.explanation)));
    expect(explanations).not.toContainEqual(expect.stringMatching(/^Query \d+ uses /));
    expect(explanations).not.toContainEqual(expect.stringMatching(/Compare this result with the work-order question/));
    expect(explanations.every((explanation) => explanation.length > 35)).toBe(true);
  });
});
