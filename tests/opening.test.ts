import { describe, expect, it } from "vitest";
import fixture from "./fixtures/minimal-campaign.json";
import { GameEngine, createGameState } from "../src/game";
import { CampaignLoadError, loadCampaign } from "../src/loader";
import { executeQuery } from "../src/query";

function openingCampaign(): any {
  const campaign = structuredClone(fixture) as any;
  campaign.tagDeclarations.push(
    { id: "route.trainee", name: "Trainee appointment", initial: false },
    { id: "route.agent", name: "Agent appointment", initial: false },
  );
  campaign.shifts.push({
    ...structuredClone(campaign.shifts[0]),
    id: "shift.trainee",
    title: "Trainee clearance",
  });
  campaign.opening.montage = [{ id: "front-page.one", date: "Yesterday", headline: "All is well." }];
  campaign.opening.appointments = [
    {
      id: "trainee", title: "Ministry Trainee", body: ["Report for instruction."], finePrint: ["Memory is subject to reconciliation."],
      shiftId: "shift.trainee", effects: [{ type: "add_tag", tagId: "route.trainee" }],
      agreeLabel: "Agree", complaintLabel: "File a motion", complaintEffects: [{ type: "enter_ending", endingId: "ending.fixture" }],
    },
    {
      id: "agent", title: "Ministry Agent", body: ["Prior clearance recognized."], finePrint: ["Recognition may be withdrawn retroactively."],
      shiftId: "shift.one", effects: [{ type: "add_tag", tagId: "route.agent" }],
      agreeLabel: "Agree", complaintLabel: "File a motion", complaintEffects: [{ type: "enter_ending", endingId: "ending.fixture" }],
    },
  ];
  campaign.newspaper = {
    title: "The Contented Citizen", motto: "Every day, better than the last.",
    editions: [
      {
        id: "edition.hidden", shiftId: "shift.trainee", date: "Today", headline: "Agents excel.",
        condition: { op: "state", value: { fact: "tag:route.agent.present" }, expected: true },
      },
      {
        id: "edition.trainee", shiftId: "shift.trainee", date: "Today", headline: "Instruction improves everyone.",
        condition: { op: "state", value: { fact: "tag:route.trainee.present" }, expected: true },
      },
      { id: "edition.agent", shiftId: "shift.one", date: "Today", headline: "Experience confirmed." },
    ],
  };
  return campaign;
}

describe("opening appointments and newspaper", () => {
  it("validates authored route, condition, and ending references", () => {
    expect(loadCampaign(openingCampaign()).campaign.opening.montage).toHaveLength(1);

    const missingShift = openingCampaign();
    missingShift.opening.appointments[0].shiftId = "shift.missing";
    expect(() => loadCampaign(missingShift)).toThrow(/appointment trainee\.shiftId references missing id/);

    const missingEnding = openingCampaign();
    missingEnding.opening.appointments[0].complaintEffects[0].endingId = "ending.missing";
    expect(() => loadCampaign(missingEnding)).toThrow(/references missing id "ending\.missing"/);

    const missingConditionFact = openingCampaign();
    missingConditionFact.newspaper.editions[0].condition.value.fact = "tag:route.missing.present";
    expect(() => loadCampaign(missingConditionFact)).toThrowError(CampaignLoadError);
    expect(() => loadCampaign(missingConditionFact)).toThrow(/undeclared tag id/);
  });

  it("routes an accepted classification, applies its effects, and records the matching paper", () => {
    const index = loadCampaign(openingCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 7));

    expect(game.appointmentPending()).toBe(true);
    expect(game.currentNewspaper()).toBeUndefined();
    expect(() => game.runQuery("case.one", "promql", "fixture_signal", { timestamp: 0, visualization: "table" })).toThrow(/Accept an appointment/);

    game.acceptAppointment("trainee");

    expect(game.appointmentPending()).toBe(false);
    expect(game.state).toMatchObject({ appointmentId: "trainee", currentShiftId: "shift.trainee", tags: ["route.trainee"] });
    expect(game.currentNewspaper()?.id).toBe("edition.trainee");
    expect(game.newspaperRead("edition.trainee")).toBe(false);
    game.readNewspaper("edition.trainee");
    expect(game.newspaperRead("edition.trainee")).toBe(true);
    expect(() => game.acceptAppointment("agent")).toThrow(/already been decided/);
  });

  it("applies the authored complaint ending immediately", () => {
    const index = loadCampaign(openingCampaign());
    const game = new GameEngine(index, executeQuery, createGameState(index, 8));

    game.fileAppointmentComplaint("agent");

    expect(game.state).toMatchObject({ appointmentId: "agent", endingId: "ending.fixture" });
    expect(game.locked()).toBe(true);
    expect(game.state.memos).toContainEqual(expect.objectContaining({ endingId: "ending.fixture" }));
  });

  it("treats saves from before appointment and newspaper state as already underway", () => {
    const index = loadCampaign(openingCampaign());
    const legacy = createGameState(index, 9) as any;
    delete legacy.appointmentId;
    delete legacy.readNewspapers;
    const game = new GameEngine(index, executeQuery, legacy);

    expect(game.appointmentPending()).toBe(false);
    expect(game.state.readNewspapers).toEqual([]);
    expect(game.currentNewspaper()?.id).toBe("edition.agent");
  });
});
