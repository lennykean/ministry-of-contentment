import { describe, expect, it } from "vitest";
import { completeCampaign, mixedEndingRoutes } from "./campaign-route";

describe("final campaign ending witnesses", () => {
  it.each(mixedEndingRoutes.slice(4))("reaches $endingId through authored report choices", ({ endingId, route, seed = 0 }) => {
    const { game } = completeCampaign(route, seed);
    expect(game.state.shiftNumber).toBe(48);
    expect(game.state.endingId, JSON.stringify({
      standing: game.state.standing, world: game.state.world, tags: game.state.tags,
    })).toBe(endingId);
  }, 60_000);
});
