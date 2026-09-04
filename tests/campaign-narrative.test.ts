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

function queryInstruction(workOrderScope: string, position: number): string {
  return workOrderScope.split("\n")[position]!;
}

function inspectionForQuery(workOrderScope: string, queryNumber: number): string {
  const inspection = workOrderScope.split("\n").at(-1) ?? "";
  return inspection.split(/(?<=\.)\s+/).find((sentence) => {
    const list = sentence.match(/^In Quer(?:y|ies) ([\d,\sand]+), inspect/i)?.[1];
    return list?.match(/\d+/g)?.includes(String(queryNumber));
  }) ?? "";
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

  it("writes one concrete, variant-specific instruction for every required query", () => {
    for (const item of index.campaign.cases) for (const variant of item.variants) {
      const lines = variant.workOrderScope.split("\n");
      expect(lines, variant.id).toHaveLength(variant.workedEvidenceSet.artifacts.length + 1);
      variant.workedEvidenceSet.artifacts.forEach((_artifact, position) => {
        const line = lines[position]!;
        expect(line, variant.id).toMatch(new RegExp(`^Query ${position + 1}:`));
        expect(line, variant.id).toMatch(/\. Use .+\.$/);
      });
      expect(variant.workOrderScope, variant.id)
        .not.toMatch(/active work order|named Registry|returned scope|measured scope|auditable scope|<source/i);
    }

    const labelLedger = index.cases.get("case.012.label-ledger")!;
    expect(labelLedger.variants[0]!.workOrderScope).toMatch(/Pin battery.+metric selection.+exact label matching/is);

    const changingSources = index.cases.get("case.033.turnstile-total")!;
    expect(changingSources.variants[0]!.workOrderScope).toContain("attendance uploads");
    expect(changingSources.variants[0]!.workOrderScope).not.toContain("press pages");
    expect(changingSources.variants[1]!.workOrderScope).toContain("press pages");
    expect(changingSources.variants[1]!.workOrderScope).not.toContain("attendance uploads");

    const changingOperator = index.cases.get("case.065.clinic-zero")!;
    expect(changingOperator.variants[0]!.workOrderScope).toContain("shared-series set comparison");
    expect(changingOperator.variants[1]!.workOrderScope).toContain("missing-series set comparison");

    const membership = index.cases.get("case.117.membership-reopen")!.variants[0]!.workOrderScope;
    expect(membership).toMatch(/press.+readable line.+outcome label.+one day earlier.+registered-population.+100%/is);

    expect(labelLedger.variants[0]!.workOrderScope).toMatch(/district North/i);
    expect(labelLedger.variants[1]!.workOrderScope).toMatch(/district West/i);

    const rangeWindow = index.cases.get("case.015.range-window")!;
    expect(queryInstruction(rangeWindow.variants[0]!.workOrderScope, 0)).toMatch(/district North.+30-minute window/i);
    expect(queryInstruction(rangeWindow.variants[1]!.workOrderScope, 1)).toMatch(/district West.+below 0\.9/i);

    const vectorMatch = index.cases.get("case.097.classic-buckets")!.variants[0]!.workOrderScope;
    expect(vectorMatch).toMatch(/Match both sides on district, facility, and service/i);
    expect(vectorMatch).toMatch(/Copy priority band from the matching side/i);

    const percentile = index.cases.get("case.098.queue-percentile")!.variants[0]!.workOrderScope;
    expect(percentile).toMatch(/95th percentile/i);
    expect(percentile).toMatch(/30-minute window/i);
    expect(percentile).toMatch(/Sum by district and bucket boundary/i);

    const protocol = index.cases.get("case.185.protocol-audit")!.variants[0]!.workOrderScope;
    expect(protocol).toMatch(/nonempty source label.+Parse JSON.+Format each line as classification, district, and facility in that order/is);
    expect(protocol).toMatch(/Create the route class label from route and classification/is);

    const compoundLogMatcher = queryInstruction(index.cases.get("case.122.label-format")!.variants[0]!.workOrderScope, 1);
    expect(compoundLogMatcher).toMatch(/regular-expression label matching/i);
    expect(compoundLogMatcher).toMatch(/label-value exclusion, including streams without that label/i);
  });

  it("changes the instruction when a variant changes selector values", () => {
    const matcherSignature = (query: string) => [...query.matchAll(/\{([^{}]*)\}/g)]
      .flatMap((selector) => [...selector[1]!.matchAll(/\b([A-Za-z_]\w*)\s*(=~|!~|!=|=)\s*"((?:\\.|[^"])*)"/g)]
        .map((matcher) => `${matcher[1]}${matcher[2]}${matcher[3]}`))
      .sort().join("|");

    for (const item of index.campaign.cases) {
      const artifactCount = item.variants[0]!.workedEvidenceSet.artifacts.length;
      for (let position = 0; position < artifactCount; position += 1) {
        const signatures = item.variants.map((variant) => matcherSignature(variant.workedEvidenceSet.artifacts[position]!.query));
        if (new Set(signatures).size < 2) continue;
        const instructions = item.variants.map((variant) => queryInstruction(variant.workOrderScope, position));
        expect(new Set(instructions).size, `${item.id} Query ${position + 1}`).toBe(new Set(signatures).size);
      }
    }
  });

  it("keeps exact Worked query syntax out of every work order", () => {
    const metricNames = index.campaign.metrics.map((metric) => metric.name);
    for (const item of index.campaign.cases) for (const variant of item.variants) {
      variant.workedEvidenceSet.artifacts.forEach((artifact, position) => {
        const line = queryInstruction(variant.workOrderScope, position);
        expect(line, `${variant.id} Query ${position + 1}`).not.toMatch(/[`{}\[\]"]|\b[A-Za-z_]\w*\s*\(/);
        for (const metric of metricNames.filter((name) => new RegExp(`\\b${name}\\b`).test(artifact.query))) {
          expect(line, `${variant.id} Query ${position + 1}`).not.toMatch(new RegExp(`\\b${metric}\\b`));
        }
      });
    }
  });

  it("keeps claims aligned with the result shape and visible query populations", () => {
    for (const caseId of [
      "case.072.lantern-rescue", "case.099.lost-le", "case.103.interpolation-limit",
      "case.114.linear-prediction", "case.141.precedence-file", "case.142.multi-window",
      "case.164.first-rehearsal", "case.170.silent-stream", "case.180.rival-movement",
      "case.186.report-correlation",
    ]) {
      const claim = index.cases.get(caseId)!.hypotheses[0]!.summary;
      expect(claim, caseId).toMatch(/returned values?.+empty results?|empty results?.+returned values?/i);
      expect(claim, caseId).toMatch(/missing observations?.+not.+(?:cause|reason)/i);
    }
    for (const caseId of ["case.164.first-rehearsal", "case.180.rival-movement"]) {
      const item = index.cases.get(caseId)!;
      expect([item.briefing, item.question, item.hypotheses[0]!.summary].join(" "), caseId).not.toMatch(/\bzero\b/i);
    }

    for (const caseId of [
      "case.066.scrape-dark", "case.098.queue-percentile",
      "case.126.omission-map", "case.163.source-gaps",
    ]) {
      const item = index.cases.get(caseId)!;
      const visibleCopy = [
        item.briefing, item.question, ...item.hypotheses.map((claim) => claim.summary),
        ...item.variants.map((variant) => variant.workOrderScope),
      ].join(" ");
      expect(visibleCopy, caseId).toMatch(/\bclassic\b/i);
      expect(visibleCopy, caseId).toMatch(/\bnative\b/i);
      expect(visibleCopy, caseId).toMatch(/\ble\b/i);
      expect(visibleCopy, caseId).toMatch(/population.+unit|unit.+population/i);
    }

    for (const caseId of [
      "case.065.clinic-zero", "case.097.classic-buckets", "case.125.report-chain",
      "case.161.protocol-registry", "case.177.leadership-event",
    ]) {
      const item = index.cases.get(caseId)!;
      expect(item.hypotheses[0]!.summary, caseId).toMatch(/only identities.+(?:returned|retained|kept)|(?:returned|retained|kept).+only identities/i);
      expect(item.hypotheses[0]!.summary, caseId).not.toMatch(/describes?.+excluded/i);
      expect(item.hypotheses.map((claim) => claim.summary).join(" "), caseId).toMatch(/missing.+inputs?|absent.+operands?/i);
    }

    const rangeClaim = index.cases.get("case.004.registry-window")!.hypotheses[0]!.summary;
    expect(rangeClaim).toMatch(/samples?|window|history/i);
    expect(rangeClaim).not.toMatch(/current values?/i);

    const recordCase = index.cases.get("case.016.clerk-assessment")!;
    expect([recordCase.question, recordCase.hypotheses[0]!.summary].join(" ")).toMatch(/records?|lines?/i);
    expect([recordCase.question, recordCase.hypotheses[0]!.summary].join(" ")).not.toMatch(/current values?|returned targets?/i);
  });

  it("describes literal and calculated scalars without invented metric sources or labels", () => {
    for (const item of index.campaign.cases) for (const variant of item.variants) {
      variant.workedEvidenceSet.artifacts.forEach((artifact, position) => {
        const line = queryInstruction(variant.workOrderScope, position);
        const literalScalar = artifact.language === "promql" && /^-?\d+(?:\.\d+)?$/.test(artifact.query.trim());
        const calculatedScalar = artifact.language === "promql" && /^\s*scalar\s*\(/.test(artifact.query);
        if (literalScalar) {
          expect(line, `${variant.id} Query ${position + 1}`).not.toMatch(/\bmetrics?\s*\./i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/\bscalar\b/i);
        }
        if (literalScalar || calculatedScalar) {
          const inspection = inspectionForQuery(variant.workOrderScope, position + 1);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/\bscalar\b/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/result type/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/(?:without|no) labels?|unlabeled/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).not.toMatch(/returned label set/i);
        }
      });
    }
  });

  it("states grouping, raw-record, negative-matcher, and plain-sum semantics", () => {
    let rawRecordCount = 0;
    let negativeMatcherCount = 0;
    let plainSumCount = 0;
    for (const item of index.campaign.cases) for (const variant of item.variants) {
      variant.workedEvidenceSet.artifacts.forEach((artifact, position) => {
        const line = queryInstruction(variant.workOrderScope, position);
        const suffixGroup = artifact.query.match(/quantile_over_time[\s\S]*\)\s+(by|without)\s*\(([^)]*)\)\s*$/);
        if (suffixGroup) {
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/percentile|quantile/i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/label grouping/i);
        }

        if (artifact.language === "logql" && artifact.mode === "records"
          && !/\|\s*(?:json|logfmt|pattern|regexp)\b/.test(artifact.query)) {
          rawRecordCount += 1;
          const inspection = inspectionForQuery(variant.workOrderScope, position + 1);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/timestamp/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/stream labels?/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/raw lines?|record text/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).toMatch(/order/i);
          expect(inspection, `${variant.id} Query ${position + 1}`).not.toMatch(/parsed fields?/i);
        }

        const selectorText = [...artifact.query.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]).join(",");
        const negativeMatchers = [...selectorText.matchAll(/\b([A-Za-z_]\w*)\s*(!=|!~)\s*"[^"]*"/g)];
        if (negativeMatchers.length) {
          negativeMatcherCount += negativeMatchers.length;
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/label(?:-value)? exclusion.+without that label/i);
        }

        if (artifact.language === "promql" && /\bsum\s*\(/.test(artifact.query)) {
          plainSumCount += 1;
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/summar|aggregation|total/i);
        }
      });
    }
    expect(rawRecordCount).toBeGreaterThan(0);
    expect(negativeMatcherCount).toBeGreaterThan(0);
    expect(plainSumCount).toBeGreaterThan(0);
  });

  it("uses reset-adjusted counter semantics and applies LogQL offsets before calculation", () => {
    let rateCount = 0;
    let increaseCount = 0;
    let offsetCount = 0;
    for (const item of index.campaign.cases) for (const variant of item.variants) {
      variant.workedEvidenceSet.artifacts.forEach((artifact, position) => {
        const line = queryInstruction(variant.workOrderScope, position);
        if (artifact.language === "promql" && /\brate\s*\(/.test(artifact.query)) {
          rateCount += 1;
          expect(line, `${variant.id} Query ${position + 1}`).not.toMatch(/per-second change/i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/reset/i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/per-second|per second/i);
        }
        if (artifact.language === "promql" && /\bincrease\s*\(/.test(artifact.query)) {
          increaseCount += 1;
          expect(line, `${variant.id} Query ${position + 1}`).not.toMatch(/total change/i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/reset/i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/extrapolat/i);
        }
        if (artifact.language === "logql" && /\boffset\s+/.test(artifact.query)) {
          offsetCount += 1;
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/earlier|shifted/i);
          expect(line, `${variant.id} Query ${position + 1}`).toMatch(/rate|per-second/i);
        }
      });
    }
    expect(rateCount).toBeGreaterThan(0);
    expect(increaseCount).toBeGreaterThan(0);
    expect(offsetCount).toBeGreaterThan(0);
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
      "Query 2 measures the window mean of unwrapped Pin battery_ratio samples.",
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
      ["case.132.allocation-result", 2, /^max_over_time\(/, "Query 3 measures the maximum demand-to-capacity ratio over the stated window."],
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

  it("keeps the three final acceptance claims exact across every variant", () => {
    const allocation = index.cases.get("case.132.allocation-result")!;
    const maximumRatio = "Query 3 measures the maximum demand-to-capacity ratio over the stated window.";
    expect(allocation.technicalTruth.artifactRoles["evidence-03"]).toBe(maximumRatio);
    expect(allocation.variants[0]!.workOrderScope).toMatch(/Query 3:.+maximum.+stepped time window/is);
    for (const variant of allocation.variants) {
      expect(variant.workedEvidenceSet.artifacts[2]!.explanation, variant.id).toContain(maximumRatio.slice(8));
    }

    const battery = index.cases.get("case.138.set-or")!;
    const meanBattery = "Query 3 measures the window mean of unwrapped Pin battery_ratio samples.";
    expect(battery.technicalTruth.artifactRoles["evidence-03"]).toBe(meanBattery);
    expect(battery.variants[0]!.workOrderScope).toMatch(/Query 3:.+mean.+battery ratio/is);
    for (const variant of battery.variants) {
      expect(variant.workedEvidenceSet.artifacts[2]!.query, variant.id).toMatch(/^avg_over_time\(.+\|\s*unwrap battery_ratio/);
      expect(variant.workedEvidenceSet.artifacts[2]!.explanation, variant.id).toContain(meanBattery.slice(8));
    }

    const membership = index.cases.get("case.117.membership-reopen")!;
    const assuredTitle = "Membership Reopen: Every Registered Person Is a Party Member";
    const assuredConclusion = "Every registered person is a Party member.";
    expect(membership.hypotheses[1]).toMatchObject({ title: assuredTitle, summary: assuredConclusion });
    expect(membership.report.titles.find((entry) => entry.id.endsWith(".title.assured"))!.text).toBe(assuredTitle);
    expect(membership.report.conclusions.find((entry) => entry.id.endsWith(".conclusion.assured"))!.text).toBe(assuredConclusion);
    expect(membership.decisionChoices.find((entry) => entry.id.endsWith(".decision.broad"))!.text)
      .toBe("Declare every registered person a Party member.");
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
        ...item.report.conclusions.map((entry) => entry.text), ...item.hints.map((hint) => hint.text),
        ...item.variants.map((variant) => variant.workOrderScope)].join(" ");
      expect(prose, caseId).toMatch(offset === "1d" ? /`1d` earlier|from one day earlier|prior-day/ : /`2h` earlier|from two hours earlier/);
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
      expect(item.variants[0]!.workOrderScope, caseId).toMatch(/Count resets.+counter-reset count/is);
      expect(item.variants[1]!.workOrderScope, caseId).toMatch(/Count value changes.+value-change count/is);
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
      expect(item.hints[3]!.text).toMatch(/do not define a global order|cross-stream/i);
      expect(item.variants[0]!.workOrderScope).toMatch(/timestamp.+stream labels.+parsed fields/i);
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
    const organization = "Party Directorate → Ministry of Contentment → Signal Reconciliation Bureau → Elian Marr → you, Personnel File Seven";
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
      expect(body).toContain("Directorate of Public Assurance publishes conclusions");
      expect(body).toContain("Office of Records Integrity archives reports");
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
    expect(Object.fromEntries(index.campaign.factions.map((faction) => [faction.id, faction.name]))).toMatchObject({
      "faction.reconciliation": "Signal Reconciliation Bureau",
      "faction.public-assurance": "Directorate of Public Assurance",
      "faction.records-integrity": "Office of Records Integrity",
    });
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
      expect(wordCount([edition.headline, edition.subhead, ...(edition.stories ?? []).flatMap((story) => [story.headline, story.body])].join(" ")), edition.id).toBeLessThanOrEqual(122);
    }

    const first = defaultEditions.find((edition) => edition.shiftId === "shift.01.first-bell")!;
    expect(first.stories![0]!.body).toContain("north-02");
    expect(first.stories![0]!.headline).toBe("ELM SERVICE BULLETIN");
    expect(index.cases.get("case.001.elm-exchange")!.briefing).toContain("ELM SERVICE BULLETIN");
    expect(new Set(defaultEditions.map((edition) => edition.stories![0]!.body)).size).toBe(48);
    expect(new Set(defaultEditions.map((edition) => edition.stories![1]!.body)).size).toBe(48);
    const columnBodies = defaultEditions.flatMap((edition) => edition.stories!.slice(2).map((story) => story.body));
    expect(new Set(columnBodies).size).toBe(columnBodies.length);

    for (const [shiftIndex, shift] of mainShifts.entries()) {
      const previousShift = shiftIndex === 0
        ? index.shifts.get("shift.clearance.ministry-trainee")!
        : mainShifts[shiftIndex - 1]!;
      const previousCases = previousShift.inbox
        .filter((item) => item.kind === "case")
        .map((item) => index.cases.get(item.id)!);
      const previousFiling = [...previousCases].reverse().find((item) => item.decisionChoices.some((option) => option.id.endsWith(".observe")))
        ?? previousCases.at(-1)!;
      const editionStem = `newspaper.${shift.id.replace("shift.", "")}`;
      const defaultUsefulDay = defaultEditions.find((edition) => edition.shiftId === shift.id)!.stories![1]!.body;
      const routeBodies = previousFiling.decisionChoices.map((option) => {
        const route = option.id.split(".").at(-1);
        const edition = newspaper.editions.find((candidate) => candidate.id === `${editionStem}.filing-${route}`)!;
        expect(JSON.stringify(edition.condition), edition.id).toContain(`decision:${previousFiling.decisionId}.choice_id`);
        expect(JSON.stringify(edition.condition), edition.id).toContain(option.id);
        expect(edition.stories![1]!.body, edition.id).not.toMatch(/filing limited|filing approved|wider claim|to the evidence/i);
        expect(edition.stories![1]!.body, edition.id).not.toBe(defaultUsefulDay);
        return edition.stories![1]!.body;
      });
      expect(new Set(routeBodies).size, shift.id).toBe(previousFiling.decisionChoices.length);
    }

    const shiftById = new Map(mainShifts.map((shift) => [shift.id, shift]));
    const longestTransferByAct = index.campaign.acts.map((act) => Math.max(...defaultEditions
      .filter((edition) => shiftById.get(edition.shiftId)?.actId === act.id)
      .flatMap((edition) => edition.stories!.filter((story) => story.headline === "TRANSFERS AND REST"))
      .map((story) => wordCount(story.body))));
    expect(longestTransferByAct.every((length, actIndex) => actIndex === 0 || length > longestTransferByAct[actIndex - 1]!)).toBe(true);
    const final = defaultEditions.find((edition) => edition.shiftId === "shift.48.all-is-well")!;
    expect(final.headline).toBe("ALL IS WELL");
  });

  it("keeps each concise work order in its requester’s voice", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    expect(mainCases).toHaveLength(192);
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
    expect(index.cases.get("case.089.bad-duration")!.hints[2]!.text).toContain("hillside-retreat");
    expect(index.cases.get("case.123.raw-record")!.briefing).toMatch(/Hillside Registry.+member.+Pin identit/i);
    expect(index.cases.get("case.132.allocation-result")!.variants[0]!.workOrderScope).toContain("demand-to-capacity ratio");
  });

  it("keeps generated lessons grammatical and specific to their query skill", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    const playerText = JSON.stringify(mainCases, (key, value) => key === "query" ? undefined : value);

    expect(playerText).not.toContain("despite their different units");
    expect(playerText).not.toContain("active work order");
    expect(playerText).not.toContain("the returned North's");
    expect(playerText).not.toContain("returned the active work order");
    expect(playerText).not.toMatch(/\bthe the\b/i);
    expect(playerText).not.toMatch(/\b([a-z]+)\s+\1\b/i);
    for (const item of mainCases) {
      for (const hypothesis of item.hypotheses) expect(hypothesis.summary, item.id).toMatch(/^[A-Z0-9`]/);
      for (const conclusion of item.report.conclusions) expect(conclusion.text, item.id).toMatch(/^[A-Z0-9`]/);
      expect(item.hypotheses[0]!.summary, item.id)
        .not.toMatch(/^(Inspect|Read|Check|Compare|Filter|Start|Open|Run|Unwrap)\b/);
    }
    expect(mainCases.map((item) => item.question).join("\n"))
      .not.toMatch(/^What do (?:North's )?service requests grouped result report,|^What do facility demand-to-capacity match report,|^What do active Pins window presence report,/m);

    const turnstile = index.cases.get("case.033.turnstile-total")!;
    expect(turnstile.technicalTruth.artifactRoles["evidence-01"]).toContain("requested source");
    expect(turnstile.variants[0]!.workedEvidenceSet.artifacts[0]!.explanation).toMatch(/service request/i);
    expect(turnstile.variants[0]!.workedEvidenceSet.artifacts[0]!.explanation).not.toMatch(/press page/i);
    expect(turnstile.variants[1]!.workedEvidenceSet.artifacts[0]!.explanation).toMatch(/press page/i);
    expect(turnstile.variants[1]!.workedEvidenceSet.artifacts[0]!.explanation).not.toMatch(/service request/i);

    const bulletin = index.cases.get("case.036.bulletin-brief")!;
    expect(bulletin.variants[0]!.workedEvidenceSet.artifacts[0]!.explanation).toMatch(/Pin gateway/i);
    expect(bulletin.variants[0]!.workedEvidenceSet.artifacts[0]!.explanation).not.toMatch(/attendance/i);
    expect(bulletin.variants[1]!.workedEvidenceSet.artifacts[0]!.explanation).toMatch(/attendance/i);

    expect(index.cases.get("case.014.canteen-gateway")!.question).toMatch(/result type.+value.+each query|each query.+result type.+value/i);
    expect(index.cases.get("case.049.market-records")!.question).not.toContain("Market Records records");
    expect(index.cases.get("case.098.queue-percentile")!.question).not.toContain("Queue Percentile percentile");
  });

  it("keeps shift orders in directives instead of replacing case lessons", () => {
    const replay = structuredClone(campaign) as any;
    const vectorMatch = replay.cases.find((item: any) => item.id === "case.097.classic-buckets");
    vectorMatch.briefing = "Sabine Orra asks Seven to match facility identities and retain unmatched series.";
    addCampaignNarrative(replay);

    expect(vectorMatch.briefing).toBe("Sabine Orra asks Seven to match facility identities and retain unmatched series.");
    expect(index.cases.get("case.097.classic-buckets")!.variants[0]!.workOrderScope).toMatch(/facility demand.+facility capacity/i);
    expect(index.cases.get("case.097.classic-buckets")!.variants[0]!.workOrderScope).not.toMatch(/histogram|bucket|\ble\b|tail/i);
    expect(index.cases.get("case.129.roster-match")!.variants[0]!.workOrderScope).toMatch(/maximum.+percentile/is);
    expect(index.cases.get("case.129.roster-match")!.variants[0]!.workOrderScope).not.toMatch(/facility|capacity|unmatched/i);
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
    expect(index.cases.get("case.089.bad-duration")!.hints[2]!.text).toContain("hillside-retreat");
    expect(index.cases.get("case.123.raw-record")!.briefing).toMatch(/Hillside Registry.+member.+Pin identit/i);
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
    expect(coldCase.briefing).toMatch(/School Twelve.+ready-for-breakfast notice/i);
    expect(coldCase.variants[0]!.workOrderScope).toContain("room temperature");
    expect(coldCase.variants[0]!.workOrderScope).toContain("gateway reachability");

    const allocation = referenceExecution("case.132.allocation-result", 0);
    expect(allocation.ok).toBe(true);
    if (!allocation.ok || allocation.result.type !== "instant-vector") return;
    const values = new Map(allocation.result.series.map((series) => [series.labels.facility, series.value]));
    expect(values.get("ration-hall-three")).toBeGreaterThan(2);
    expect(values.get("clinic-nine")).toBe(Number.POSITIVE_INFINITY);
    expect(values.get("north-heat")).toBe(Number.POSITIVE_INFINITY);

    const item = index.cases.get("case.132.allocation-result")!;
    expect(item.variants[0]!.workOrderScope).toContain("demand-to-capacity ratio");
    expect(item.variants[0]!.workOrderScope).toMatch(/no matching capacity|missing capacity/i);
    const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!;
    const assured = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"))!;
    const standingDelta = (outcome: typeof evidence) => {
      for (const effect of outcome.effects ?? []) {
        if (effect.type === "change" && effect.target === "standing.value") return effect.delta;
      }
      return undefined;
    };
    expect(standingDelta(evidence)).toBe(0);
    expect(standingDelta(assured)).toBe(0);
    expect(evidence.ministryResponse).toContain("files the supported facility shortages");
    expect(assured.ministryResponse).toContain("Standing does not change");
    const coldEvidence = coldCase.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!;
    const coldAssured = coldCase.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"))!;
    expect(standingDelta(coldEvidence)).toBe(0);
    expect(standingDelta(coldAssured)).toBe(0);

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

  it("keeps Act IV assured actions on the same specific operational claim", () => {
    const actions = new Map([
      ["case.104.threshold-notices", "Declare that one empty or zero reading proves district-wide absence."],
      ["case.107.change-count", "Declare that one parsed record proves every threshold row has the same cause."],
      ["case.112.auditor-assessment", "Declare that one district tail proves every unmatched facility has capacity."],
      ["case.113.gauge-history", "Declare that missing histogram telemetry proves every route met the limit."],
      ["case.123.raw-record", "Declare that the later Registry timestamp proves the reissued Pin automatically supersedes the retired Pin."],
      ["case.127.ledger-watch", "Declare that the telemetry results prove service absence and make Reconciliation's later finding unnecessary."],
    ]);
    for (const [caseId, expected] of actions) {
      const item = index.cases.get(caseId)!;
      expect(item.decisionChoices.find((choice) => choice.id.endsWith(".decision.broad"))!.text, caseId).toBe(expected);
    }
    expect(index.campaign.cases.filter((item) => item.actId === "act.4.official-truth")
      .flatMap((item) => item.decisionChoices).map((choice) => choice.text).join(" ")).not.toContain("wider misconduct");
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

  it("keeps the first twelve shifts safe before morning-edition penalties begin", () => {
    const mainCases = index.campaign.cases.filter((item) => /^case\.\d/.test(item.id));
    const byId = new Map(mainCases.map((item) => [item.id, item]));
    const pressureCases: string[] = [];
    const mainShifts = index.campaign.shifts.filter((item) => item.id !== "shift.clearance.ministry-trainee");
    expect(index.shifts.get("shift.12.watch-board")!.directive)
      .toMatch(/Marr.+from tomorrow.+Public Assurance.+signed finding.+morning edition.+lowers Standing/i);
    for (const [position, shift] of mainShifts.entries()) {
      const pressured = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => byId.get(ref.id)).filter((item) => {
        const evidence = item?.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
        return evidence?.effects?.some((effect) => effect.type === "change" && effect.target === "standing.value" && effect.delta === -1)
          && evidence.effects.some((effect) => effect.type === "change" && effect.target === "world:evidence-preserved.value" && effect.delta === 1);
      });
      if (position < 12) expect(pressured, shift.id).toHaveLength(0);
      else expect(pressured.length, shift.id).toBeGreaterThanOrEqual(1);
      expect(pressured.length, shift.id).toBeLessThanOrEqual(2);
      for (const item of pressured) {
        expect(item!.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"))!.ministryResponse)
          .toContain("contradicts the morning edition");
        pressureCases.push(item!.id);
      }
    }
    expect(pressureCases).toHaveLength(37);
    for (const item of mainCases) {
      const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
      const standing = evidence?.effects?.find((effect) => effect.type === "change" && effect.target === "standing.value");
      if (evidence) expect(standing && standing.type === "change" ? standing.delta : undefined, item.id)
        .toBe(pressureCases.includes(item.id) ? -1 : 0);
      const fallback = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.fallback"))!;
      expect(fallback.effects?.some((effect) => effect.type === "change" && effect.target === "world:evidence-preserved.value"), item.id).toBe(false);
    }

    const standingTimeline: number[] = [];
    let standing = index.campaign.opening.standing;
    for (const shift of mainShifts) {
      const guaranteedCases = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => byId.get(ref.id)!).filter((item) =>
        shift.caseSelectionMode === "fixed" || item.mode !== "adaptive");
      standing += guaranteedCases.reduce((total, item) => {
        const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
        return total + (evidence?.effects?.reduce((sum, effect) =>
          sum + (effect.type === "change" && effect.target === "standing.value" ? effect.delta : 0), 0) ?? 0);
      }, 0);
      standingTimeline.push(standing);
    }
    expect(standingTimeline.slice(0, 12)).toEqual(Array(12).fill(5));
    expect(standingTimeline[12]).toBe(4);
    expect(standingTimeline.at(-1)).toBeLessThan(0);

    for (const shift of mainShifts.slice(10, 12)) {
      const guaranteedCases = shift.inbox.filter((ref) => ref.kind === "case").map((ref) => byId.get(ref.id)!).filter((item) => item.mode !== "adaptive");
      expect(guaranteedCases.some((item) => item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"))?.effects
        ?.some((effect) => effect.type === "change" && effect.target === "standing.value" && effect.delta === 1)), shift.id).toBe(true);
    }
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
        ...item.variants.map((variant) => variant.workOrderScope),
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
    expect(caseText("case.104.threshold-notices")).toMatch(/reachability.+delay records.+request rate.+collector failure.+missing traffic/i);

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
    expect(caseText("case.089.bad-duration")).toMatch(/Hillside Retreat.+rate.+30-minute increase.+result code/i);
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
    expect(resultForms.hints[2]!.text).toMatch(/Queries 1 and 2 as Table.+Query 3 as Graph/);

    const pressWatch = index.cases.get("case.061.broad-press-watch")!;
    expect(pressWatch.variants[0]!.workOrderScope).toMatch(/timestamp/i);
    expect(pressWatch.variants[0]!.workOrderScope).toMatch(/stream labels?/i);
    expect(pressWatch.variants[0]!.workOrderScope).toMatch(/parsed fields?/i);
    expect(pressWatch.variants[0]!.workOrderScope).toMatch(/raw lines?/i);
    expect(pressWatch.variants[0]!.workOrderScope).toMatch(/order/i);
    expect(pressWatch.variants.every((variant) => variant.workedEvidenceSet.artifacts.every((artifact) => artifact.print.visualization === "logs"))).toBe(true);
    expect(pressWatch.hints[2]!.text).toContain("as Logs");

    const topology = index.cases.get("case.112.auditor-assessment")!;
    expect(topology.variants[0]!.workedEvidenceSet.artifacts[1]!.query).toContain(" and ");
    expect(topology.variants[1]!.workedEvidenceSet.artifacts[1]!.query).toContain(" unless ");
    expect(topology.variants[0]!.workOrderScope).toMatch(/Query 2:.+shared-series set comparison/is);
    expect(topology.variants[1]!.workOrderScope).toMatch(/Query 2:.+missing-series set comparison/is);
  });

  it("explains worked queries in terms of the skill being practiced", () => {
    const explanations = index.campaign.cases.flatMap((item) =>
      item.variants.flatMap((variant) => variant.workedEvidenceSet.artifacts.map((artifact) => artifact.explanation)));
    expect(explanations).not.toContainEqual(expect.stringMatching(/^Query \d+ uses /));
    expect(explanations).not.toContainEqual(expect.stringMatching(/Compare this result with the work-order question/));
    expect(explanations.every((explanation) => explanation.length > 35)).toBe(true);
  });
});
