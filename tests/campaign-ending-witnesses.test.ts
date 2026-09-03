import { describe, expect, it } from "vitest";
import campaign from "../content/campaign.json";
import { loadCampaign } from "../src/loader";
import { completeCampaign, endingWitnessIds, mixedEndingRoutes } from "./campaign-route";

describe("campaign ending witnesses", () => {
  it("covers the exact authored ending set", () => {
    expect(new Set(endingWitnessIds)).toEqual(new Set(loadCampaign(campaign).endings.keys()));
  });

  it.each(mixedEndingRoutes.slice(1, 4))("reaches $endingId through authored report choices", ({ endingId, route, seed = 0 }) => {
    const { game } = completeCampaign(route, seed);
    expect(game.state.shiftNumber).toBe(48);
    expect(game.state.endingId, JSON.stringify({
      standing: game.state.standing, world: game.state.world, tags: game.state.tags,
    })).toBe(endingId);
  }, 60_000);
});
