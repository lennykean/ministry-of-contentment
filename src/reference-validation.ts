import { assessCaseEvidence, assessMasteryUse, authoredControls, controlsFor, createGameState, executeAuthoredArtifact, GameEngine, matchingReferencePaths, type QueryControls, type SavedArtifact } from "./game";
import type { WatchFacts } from "./detectors";
import { executeQuery } from "./query";
import type { CampaignCase, CampaignIndex, Detector, ReferenceArtifact, WorkedEvidenceArtifact } from "./types";

export class ReferenceValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Campaign reference queries rejected:\n${problems.map((problem) => `• ${problem}`).join("\n")}`);
    this.name = "ReferenceValidationError";
  }
}

type AuthoredArtifact = ReferenceArtifact | WorkedEvidenceArtifact;

function stateAtCaseAccess(index: CampaignIndex, item: CampaignCase) {
  const required = new Set([
    ...item.availableSources.map((id) => index.metrics.get(id)?.accessRightId ?? index.logSources.get(id)?.accessRightId),
    ...item.conceptIds.map((id) => index.concepts.get(id)?.accessRightId),
  ].filter((id): id is string => Boolean(id)));
  const granted = new Set(index.campaign.opening.access ?? []);
  const rank = [...index.ranks.values()].sort((left, right) => left.order - right.order).find((candidate) => {
    candidate.grants.forEach((right) => granted.add(right));
    return [...required].every((right) => granted.has(right));
  });
  if (!rank) throw new Error(`No rank grants the access required by ${item.id}`);
  const state = createGameState(index, 0);
  state.rankId = rank.id;
  if (state.appointmentId === null) state.appointmentId = index.campaign.opening.appointments?.[0]?.id;
  return state;
}

function choices(item: CampaignCase): Array<[string | undefined, string | undefined]> {
  const titles = item.report.titles.length ? item.report.titles.map((choice) => choice.id) : [undefined];
  const conclusions = item.report.conclusions.length ? item.report.conclusions.map((choice) => choice.id) : [undefined];
  return titles.flatMap((title) => conclusions.map((conclusion): [string | undefined, string | undefined] => [title, conclusion]));
}

function leaves(detector: Detector): Detector[] {
  return "op" in detector ? detector.items.flatMap(leaves) : [detector];
}

function needsWatch(item: CampaignCase, evidencePathId: string): boolean {
  const path = item.evidencePaths.find((candidate) => candidate.id === evidencePathId);
  return Boolean(path?.clauses.some((clause) => leaves(clause.requirements).some((leaf) =>
    !("op" in leaf) && (leaf.kind === "W" || (leaf.kind === "E" && (leaf.rule === "watch-quality" || leaf.selectors.includes("watch-expression")))),
  )));
}

function minimumFiledArtifacts(item: CampaignCase): number {
  const evidencePathIds = new Set(item.evidencePaths.map((path) => path.id));
  return Math.min(...item.variants.flatMap((variant) => variant.referenceSets
    .filter((set) => evidencePathIds.has(set.evidencePathId))
    .map((set) => set.artifacts.length)));
}

function validateMasteryQueryVariation(index: CampaignIndex, problems: string[]): void {
  const usesByConcept = new Map<string, Array<{ caseId: string; stage: string; querySet: string }>>();
  for (const item of index.campaign.cases) {
    const variant = item.variants[0];
    const referenceSet = variant?.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct")) ?? variant?.referenceSets[0];
    if (!referenceSet) continue;
    for (const use of item.masteryUses) {
      const positions = resolveReferencePositions(use.artifactSelectors, referenceSet.artifacts);
      if (!positions) continue;
      const querySet = JSON.stringify(positions.map((position) => referenceSet.artifacts[position]!.query.trim()));
      const stage = use.spacedRecall ? "spaced recall" : use.targetState;
      const uses = usesByConcept.get(use.conceptId) ?? [];
      uses.push({ caseId: item.id, stage, querySet });
      usesByConcept.set(use.conceptId, uses);
    }
  }
  for (const [conceptId, uses] of usesByConcept) {
    if (uses.length < 2) continue;
    if (new Set(uses.map((use) => use.querySet)).size === 1) {
      problems.push(`concept ${conceptId} reuses one exact reference query across its mastery progression (${uses.map((use) => `${use.stage} in ${use.caseId}`).join(", ")})`);
    }
  }
}

function resolveReferencePositions(selectors: string[], artifacts: AuthoredArtifact[]): number[] | undefined {
  const resolved: number[] = [];
  for (const selector of selectors) {
    const slot = /^artifact\[([1-9]\d*)\]$/.exec(selector)?.[1];
    const matches = slot ? (Number(slot) <= artifacts.length ? [Number(slot) - 1] : [])
      : selector === "promql" || selector === "logql" ? artifacts.flatMap((artifact, index) => artifact.language === selector ? [index] : [])
        : selector === "watch-expression" ? artifacts.flatMap((artifact, index) => artifact.role === selector ? [index] : []) : [];
    if (matches.length !== 1 || resolved.includes(matches[0]!)) return undefined;
    resolved.push(matches[0]!);
  }
  return resolved;
}

function validateWorkedFiling(
  index: CampaignIndex, item: CampaignCase, variant: CampaignCase["variants"][number], base: QueryControls,
  prefix: string, problems: string[],
): void {
  const successful = item.outcomes.find((outcome) => outcome.technicalEvidence === "supported" && !outcome.condition);
  if (!successful) {
    problems.push(`${prefix} has no unconditional supported outcome for its Worked filing`);
    return;
  }

  try {
    const state = stateAtCaseAccess(index, item);
    state.currentVariants[item.id] = variant.id;
    const engine = new GameEngine(index, executeQuery, state);
    const workedArtifacts = variant.workedEvidenceSet.artifacts.map((worked) =>
      engine.runQuery(item.id, worked.language, worked.query, controlsFor(base, worked), false, true, worked.role, worked.print));
    for (const artifact of workedArtifacts) {
      if (!artifact.authoredPrint) throw new Error(`role ${artifact.role ?? artifact.id} lost its authored print plan`);
      engine.printArtifact(item.id, artifact.id, artifact.authoredPrint);
    }
    const artifactIds = workedArtifacts.map((artifact) => artifact.id);
    const report = engine.fileReport(
      item.id, artifactIds,
      successful.titleChoiceIds?.[0] ?? item.report.titles[0]!.id,
      successful.conclusionChoiceIds?.[0] ?? item.report.conclusions[0]!.id,
      successful.decisionChoiceIds?.[0] ?? item.decisionChoices[0]!.id,
      variant.workedEvidenceSet.artifacts[0]!.print.visualization,
    );
    if (!engine.state.completedCases.includes(item.id)) {
      problems.push(`${prefix} Worked filing did not complete: ${report.technicalExplanation}`);
    } else if (!item.watchScenarioId && (report.evidence !== "supported" || report.outcomeId !== successful.id)) {
      problems.push(`${prefix} Worked filing selected ${report.outcomeId} with ${report.evidence} evidence instead of ${successful.id}`);
    }
  } catch (error) {
    problems.push(`${prefix} Worked filing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateReferenceQueries(index: CampaignIndex): void {
  const problems: string[] = [];
  for (const item of index.campaign.cases) {
    const requiredArtifacts = minimumFiledArtifacts(item);
    if (item.report.minArtifacts < requiredArtifacts) {
      problems.push(`case ${item.id} report allows ${item.report.minArtifacts} artifacts but its shortest evidence path requires ${requiredArtifacts}`);
    }
    for (const variant of item.variants) {
      const prefix = `case ${item.id} variant ${variant.id}`;
      let base: QueryControls;
      try { base = authoredControls(item, variant); }
      catch (error) {
        problems.push(`${prefix} ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      validateWorkedFiling(index, item, variant, base, prefix, problems);
      const masteryCovered = new Set<number>();
      const validateSet = (
        label: string, setId: string, evidencePathId: string, authoredArtifacts: AuthoredArtifact[],
        assistance: "None" | "Worked", coverMastery: boolean,
      ): void => {
        const artifacts: SavedArtifact[] = [];
        let failed = false;
        for (const [position, reference] of authoredArtifacts.entries()) {
          try {
            const artifact = executeAuthoredArtifact(index, item, variant, reference, controlsFor(base, reference), setId, position + 1, assistance, executeQuery);
            if (!artifact.execution.ok) {
              problems.push(`${prefix} ${label} role ${reference.role} ${artifact.execution.error.kind}: ${artifact.execution.error.message}`);
              failed = true;
            } else if (reference.mode === "records" && artifact.execution.result.type !== "records") {
              problems.push(`${prefix} ${label} role ${reference.role} did not return records`);
              failed = true;
            } else if (reference.mode === "range" && artifact.execution.result.type !== "range-vector") {
              problems.push(`${prefix} ${label} role ${reference.role} did not return a range vector`);
              failed = true;
            } else if (reference.mode === "instant" && artifact.execution.result.type === "records") {
              problems.push(`${prefix} ${label} role ${reference.role} returned records in instant mode`);
              failed = true;
            }
            const unauthorized = artifact.execution.facts.lineage.sources.filter((source) => !item.availableSources.includes(source));
            if (unauthorized.length) {
              problems.push(`${prefix} ${label} role ${reference.role} uses unavailable source${unauthorized.length === 1 ? "" : "s"} ${unauthorized.join(", ")}`);
              failed = true;
            }
            artifacts.push(artifact);
          } catch (error) {
            problems.push(`${prefix} ${label} role ${reference.role}: ${error instanceof Error ? error.message : String(error)}`);
            failed = true;
          }
        }
        if (failed) return;
        let watch: WatchFacts | undefined;
        if (needsWatch(item, evidencePathId)) {
          const positions = authoredArtifacts.map((artifact, index) => artifact.role === "watch-expression" ? index : -1).filter((index) => index >= 0);
          if (positions.length !== 1) {
            problems.push(`${prefix} ${label} must contain exactly one watch-expression role`);
            return;
          }
          try {
            watch = new GameEngine(index, executeQuery, stateAtCaseAccess(index, item)).simulateReferenceWatch(item.id, artifacts[positions[0]!]!);
          } catch (error) {
            problems.push(`${prefix} ${label} watch execution failed: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
        }
        const thresholds = item.watchScenarioId ? index.watchScenarios.get(item.watchScenarioId)?.thresholds : undefined;
        const matchingPaths = matchingReferencePaths(index, item, variant, artifacts, executeQuery);
        const supportedChoices = choices(item).filter(([title, conclusion]) =>
          assessCaseEvidence(item, variant, artifacts, title, conclusion, watch, thresholds, matchingPaths).assessments
            .some((assessment) => assessment.id === evidencePathId && assessment.state === "supported"),
        );
        if (!supportedChoices.length) problems.push(`${prefix} ${label} does not satisfy named evidence path ${evidencePathId}`);
        if (coverMastery) item.masteryUses.forEach((use, useIndex) => {
          if (supportedChoices.some(([title, conclusion]) => assessMasteryUse(index, item, variant, use, artifacts, watch, title, conclusion).creditAwarded)) masteryCovered.add(useIndex);
        });
      };
      for (const referenceSet of variant.referenceSets) {
        validateSet(`set ${referenceSet.id}`, referenceSet.id, referenceSet.evidencePathId, referenceSet.artifacts, "None", true);
      }
      validateSet("worked evidence", `worked.${variant.id}`, variant.workedEvidenceSet.evidencePathId, variant.workedEvidenceSet.artifacts, "Worked", false);
      item.masteryUses.forEach((use, useIndex) => {
        if (!masteryCovered.has(useIndex)) problems.push(`${prefix} reference sets cannot demonstrate mastery use ${useIndex + 1} (${use.conceptId})`);
      });
    }
  }
  validateMasteryQueryVariation(index, problems);
  if (problems.length) throw new ReferenceValidationError(problems);
}
