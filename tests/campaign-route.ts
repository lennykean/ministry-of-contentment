import campaign from "../content/campaign.json";
import { createGameState, GameEngine, printableViews, type QueryControls, type SavedArtifact } from "../src/game";
import { loadCampaign } from "../src/loader";
import { executeQuery } from "../src/query";
import type { CampaignCase, EvidenceState, ReferenceArtifact } from "../src/types";

export type ReportRoute = "evidence" | "assured";
export type CampaignRoute = ReportRoute | ((caseId: string) => ReportRoute);

export function controlsFor(item: CampaignCase, variant: CampaignCase["variants"][number], artifact: ReferenceArtifact): QueryControls {
  const timestamp = Date.parse(variant.evaluationTime ?? item.evaluationTime!) / 1000;
  const start = Date.parse(variant.rangeStart ?? item.rangeStart ?? "") / 1000;
  const end = Date.parse(variant.rangeEnd ?? item.rangeEnd ?? "") / 1000;
  if (artifact.mode === "instant") return { timestamp, visualization: "table" };
  if (artifact.mode === "records") return { timestamp, start, end, lookback: end - start, direction: "backward", limit: 100, visualization: "logs" };
  return { timestamp, start, end, step: Math.max(1, Math.floor((end - start) / 60)), visualization: "graph" };
}

export function acknowledgeOfficialItems(game: GameEngine): void {
  for (const item of game.inbox()) if (item.kind !== "case" && item.kind !== "notice" && item.kind !== "watch-error") game.readItem(item.id);
}

export function printAll(game: GameEngine, caseId: string, artifacts: SavedArtifact[]): string[] {
  for (const artifact of artifacts) game.printArtifact(caseId, artifact.id, {
    visualization: printableViews(artifact)[0]!, showQuery: true, showLabels: true, showRange: true, zeroAxis: true,
  });
  return artifacts.map((artifact) => artifact.id);
}

export function completeCampaign(route: CampaignRoute, seed = 0) {
  const index = loadCampaign(campaign);
  const game = new GameEngine(index, executeQuery, createGameState(index, seed));
  game.acceptAppointment("appointment.ministry-agent");
  const rankTimeline: string[] = [];
  const standingTimeline: number[] = [];
  const expectedEvidence = new Map<string, EvidenceState>();
  const mainShiftCount = index.campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee").length;
  campaignRoute: for (let shiftNumber = 1; shiftNumber <= mainShiftCount; shiftNumber += 1) {
    for (const watch of game.state.watches.filter((candidate) => candidate.state === "active" && candidate.scores)) game.retireWatch(watch.id);
    acknowledgeOfficialItems(game);
    while (true) {
      const inboxItem = game.inbox().find((candidate) => candidate.kind === "case" && !candidate.done);
      if (!inboxItem) break;
      const item = index.cases.get(inboxItem.id)!;
      const variant = game.caseVariant(item.id);
      const reference = variant.referenceSets[0]!;
      const artifacts = reference.artifacts.map((artifact) => game.runQuery(item.id, artifact.language, artifact.query, controlsFor(item, variant, artifact), false, false, artifact.role));
      const selectedRoute = typeof route === "function" ? route(item.id) : route;
      const outcome = item.outcomes.find((candidate) => candidate.id.endsWith(`.outcome.${selectedRoute}`)
        && candidate.titleChoiceIds?.length && candidate.conclusionChoiceIds?.length && candidate.decisionChoiceIds?.length)!;
      expectedEvidence.set(item.id, outcome.technicalEvidence);
      const report = game.fileReport(
        item.id, printAll(game, item.id, artifacts), outcome.titleChoiceIds![0]!, outcome.conclusionChoiceIds![0]!,
        outcome.decisionChoiceIds![0]!, item.report.visualizations[0]!,
      );
      if (item.watchScenarioId) {
        const artifact = artifacts.find((candidate) => candidate.role === "watch-expression") ?? artifacts[0]!;
        game.saveWatch(item.id, artifact.id);
        if (!report.pendingWatch) throw new Error(`${item.id} should remain pending until its watch horizon closes`);
      }
      if (game.locked()) break campaignRoute;
    }
    if (!game.canAdvance()) throw new Error(`Shift ${shiftNumber} is incomplete`);
    game.advanceShift();
    rankTimeline.push(game.state.rankId);
    standingTimeline.push(game.state.standing);
    if (game.locked()) break;
  }
  for (const [caseId, expected] of expectedEvidence) {
    const report = game.state.reports.find((candidate) => candidate.caseId === caseId);
    if (!report || report.pendingWatch || report.evidence !== expected) throw new Error(`${caseId} settled as ${report?.pendingWatch ? "pending" : report?.evidence ?? "missing"}; expected ${expected}`);
  }
  return { game, index, rankTimeline, standingTimeline };
}

export const routeWith = (base: ReportRoute, overrides: Record<string, ReportRoute>) =>
  (caseId: string): ReportRoute => overrides[caseId] ?? base;

export const mixedEndingRoutes: ReadonlyArray<{ endingId: string; route: CampaignRoute; seed?: number }> = [
  { endingId: "ending.public-exposure", route: routeWith("evidence", { "case.161.protocol-registry": "assured" }), seed: 6 },
  { endingId: "ending.internal-exposure", route: routeWith("evidence", {
    "case.120.audit-finding": "assured", "case.161.protocol-registry": "assured",
  }) },
  { endingId: "ending.assurance-custody", route: routeWith("evidence", {
    "case.120.audit-finding": "assured", "case.127.ledger-watch": "assured", "case.161.protocol-registry": "assured",
  }) },
  { endingId: "ending.continuity-failure", route: routeWith("assured", { "case.161.protocol-registry": "evidence" }) },
  { endingId: "ending.director-reassigned", route: (caseId: string): ReportRoute => {
    const number = Number(caseId.slice(5, 8));
    return number <= 32 || ["case.173.coverage-repair", "case.176.cost-repair", "case.188.final-filing"].includes(caseId) ? "evidence" : "assured";
  } },
  { endingId: "ending.continuity-secretary", route: routeWith("assured", {
    "case.173.coverage-repair": "evidence", "case.176.cost-repair": "evidence", "case.188.final-filing": "evidence",
  }) },
];

export const endingWitnessIds = [
  "ending.work-camp.complaint", "ending.party-leader.precise", "ending.party-leader.assurance",
  ...mixedEndingRoutes.map(({ endingId }) => endingId),
];
