import { describe, expect, it } from "vitest";
import fixture from "./fixtures/minimal-campaign.json";
import { CampaignLoadError, loadCampaign } from "../src/loader";

describe("campaign loader", () => {
  it("builds indexes for a valid versioned pack", () => {
    const index = loadCampaign(fixture);
    expect(index.campaign.id).toBe("fixture");
    expect(index.cases.get("case.one")?.variants[0]?.datasetId).toBe("data.one");
  });

  it("rejects unsupported query capabilities instead of ignoring them", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.features.promql.push("imaginary.feature");
    expect(() => loadCampaign(campaign)).toThrowError(CampaignLoadError);
    expect(() => loadCampaign(campaign)).toThrow(/unsupported capability/);
  });

  it("rejects person identity in metric labels", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.metrics[0].labels.push("person_id");
    campaign.metrics[0].knownLabelValues.person_id = ["member.1"];
    expect(() => loadCampaign(campaign)).toThrow(/prohibited person-identity label/);
  });

  it("allows opaque shared event provenance without inventing a watch scenario", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.datasets[0].series[0].eventIds = ["incident.shared"];
    campaign.datasets[0].streams[0].records[0].eventIds = ["incident.shared"];
    expect(() => loadCampaign(campaign)).not.toThrow();
  });

  it("requires a complete authored discrete-clock contract", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.shifts[0].actionBudget = 8;
    expect(() => loadCampaign(campaign)).toThrow(/actionBudget and actionCosts together/);
  });

  it("rejects a shift clock that cannot cover required query and filing work", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.shifts[0].actionBudget = 3;
    campaign.shifts[0].actionCosts = { validQuery: 1, printArtifact: 1, fileReport: 2, saveWatch: 2, retireWatch: 1 };
    expect(() => loadCampaign(campaign)).toThrow(/cannot cover its minimum required case work \(4\)/);
  });

  it("rejects dangling declarative references", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.shifts[0].inbox[0].id = "case.missing";
    expect(() => loadCampaign(campaign)).toThrow(/references missing id/);
  });

  it("rejects unknown telemetry sources in a case access list", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].availableSources = ["source.missing"];
    expect(() => loadCampaign(campaign)).toThrow(/availableSources references missing telemetry source/);
  });

  it("requires variant-specific work-order instructions", () => {
    const campaign = structuredClone(fixture) as any;
    delete campaign.cases[0].variants[0].workOrderScope;
    expect(() => loadCampaign(campaign)).toThrow(/must have required property 'workOrderScope'/);
  });

  it("rejects dangling or wrongly typed access-right references", () => {
    const missingConceptRight = structuredClone(fixture) as any;
    missingConceptRight.concepts[0].accessRightId = "access.missing";
    expect(() => loadCampaign(missingConceptRight)).toThrow(/concepts\[0\]\.accessRightId references missing id/);

    const wrongSourceRight = structuredClone(fixture) as any;
    wrongSourceRight.rightDeclarations.push({ id: "authority.fixture", kind: "watch-authority", name: "Fixture authority", initial: false });
    wrongSourceRight.metrics[0].accessRightId = "authority.fixture";
    expect(() => loadCampaign(wrongSourceRight)).toThrow(/metric fixture_signal\.accessRightId must reference an access right/);

    const missingRankGrant = structuredClone(fixture) as any;
    missingRankGrant.ranks[0].grants = ["access.missing"];
    expect(() => loadCampaign(missingRankGrant)).toThrow(/ranks\[0\]\.grants\[0\] references missing id/);
  });

  it("requires coherent campaign Standing bounds and bands", () => {
    const outside = structuredClone(fixture) as any;
    outside.opening.standing = 101;
    expect(() => loadCampaign(outside)).toThrow(/opening\.standing is outside/);

    const unordered = structuredClone(fixture) as any;
    unordered.standing.bands[1].minimum = -101;
    expect(() => loadCampaign(unordered)).toThrow(/ordered by increasing minimum/);
  });

  it("requires unambiguous concept ownership for evidence clauses", () => {
    const campaign = structuredClone(fixture) as any;
    const clause = structuredClone(campaign.cases[0].evidencePaths[0].clauses[0]);
    campaign.cases[0].evidencePaths[0].clauses.push(clause);
    expect(() => loadCampaign(campaign)).toThrow(/duplicate clause concept/);

    campaign.cases[0].evidencePaths[0].clauses = [{ ...clause, conceptId: "concept.outside-case" }];
    expect(() => loadCampaign(campaign)).toThrow(/outside the case/);
  });

  it("rejects bare result-shape evidence for a concept with richer semantics", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].evidencePaths[1].clauses[0].requirements = {
      op: "all",
      items: [
        { kind: "R", selector: "artifact", property: "status", relation: "=", expected: "successful" },
        { kind: "R", selector: "artifact", property: "result-type", relation: "=", expected: "instant-vector" },
      ],
    };
    expect(() => loadCampaign(campaign)).toThrow(/reduces nontrivial concept .* to status\/result-type checks/);
  });

  it("rejects clause artifact projections that cannot resolve in their reference set", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].evidencePaths[0].clauses[0].artifactSelectors = ["artifact[2]"];
    expect(() => loadCampaign(campaign)).toThrow(/cannot resolve clause selectors/);

    const wrongLanguage = structuredClone(fixture) as any;
    wrongLanguage.features.logql = ["selector"];
    wrongLanguage.cases[0].languages.push("logql");
    wrongLanguage.cases[0].variants[0].referenceSets[0].artifacts[0] = { role: "records", language: "logql", mode: "records", query: '{job="fixture"}' };
    expect(() => loadCampaign(wrongLanguage)).toThrow(/outside concept .* language promql/);
  });

  it("rejects ambiguous and out-of-range mastery artifact selectors", () => {
    const ambiguous = structuredClone(fixture) as any;
    ambiguous.cases[0].masteryUses[0].artifactSelectors = ["artifact"];
    expect(() => loadCampaign(ambiguous)).toThrow(/ambiguous selector/);

    const outOfRange = structuredClone(fixture) as any;
    outOfRange.cases[0].masteryUses[0].artifactSelectors = ["artifact[3]"];
    expect(() => loadCampaign(outOfRange)).toThrow(/exceeds report.maxArtifacts/);
  });

  it("requires coherent reference sets to name a real evidence path", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].variants[0].referenceSets[0].evidencePathId = "path.missing";
    expect(() => loadCampaign(campaign)).toThrow(/names missing evidence path/);
  });

  it("requires a coherent variant-scoped Worked evidence set", () => {
    const campaign = structuredClone(fixture) as any;
    campaign.cases[0].variants[0].workedEvidenceSet.evidencePathId = "path.missing";
    campaign.cases[0].variants[0].workedEvidenceSet.artifacts.push({
      role: "signal", language: "promql", mode: "instant", query: "fixture_signal", explanation: "Duplicate role.",
      print: structuredClone(campaign.cases[0].variants[0].workedEvidenceSet.artifacts[0].print),
    });
    expect(() => loadCampaign(campaign)).toThrow(/worked evidence names missing evidence path/);
    expect(() => loadCampaign(campaign)).toThrow(/worked evidence has duplicate role/);
  });
});
