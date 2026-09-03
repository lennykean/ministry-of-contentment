import { describe, expect, it } from "vitest";
import fixture from "./fixtures/minimal-campaign.json";
import { createGameState, saveKey } from "../src/game";
import { loadCampaign } from "../src/loader";
import {
  clearPersistentState, loadPersistentState, storePersistentState, type PersistenceStore,
} from "../src/persistence";

function memoryStore(): PersistenceStore & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    async read(key) { return structuredClone(values.get(key)); },
    async write(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
  };
}

function legacyStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("campaign persistence", () => {
  it("stores, loads, and clears a campaign save", async () => {
    const index = loadCampaign(fixture);
    const backend = memoryStore();
    const legacy = legacyStorage({});
    const state = createGameState(index, 42);

    await storePersistentState(index, state, { backend, legacyStorage: legacy });
    state.seed = 7;

    await expect(loadPersistentState(index, { backend, legacyStorage: legacy })).resolves.toMatchObject({ seed: 42 });
    await clearPersistentState(index, { backend, legacyStorage: legacy });
    await expect(loadPersistentState(index, { backend, legacyStorage: legacy })).resolves.toBeUndefined();
  });

  it("removes a legacy save only after its IndexedDB write commits", async () => {
    const index = loadCampaign(fixture);
    const state = createGameState(index, 23);
    const key = saveKey(index.campaign.id);
    const legacy = legacyStorage({ [key]: JSON.stringify(state) });
    let commit!: () => void;
    let started!: () => void;
    const commitPending = new Promise<void>((resolve) => { commit = resolve; });
    const writeStarted = new Promise<void>((resolve) => { started = resolve; });
    const backend = memoryStore();
    backend.write = async (writeKey, value) => {
      started();
      await commitPending;
      backend.values.set(writeKey, structuredClone(value));
    };

    const loading = loadPersistentState(index, { backend, legacyStorage: legacy });
    await writeStarted;
    expect(legacy.values.has(key)).toBe(true);

    commit();
    await expect(loading).resolves.toMatchObject({ seed: 23 });
    expect(legacy.values.has(key)).toBe(false);
  });

  it("keeps a legacy save when migration fails", async () => {
    const index = loadCampaign(fixture);
    const state = createGameState(index, 9);
    const key = saveKey(index.campaign.id);
    const legacy = legacyStorage({ [key]: JSON.stringify(state) });
    const backend = memoryStore();
    backend.write = async () => { throw new Error("quota"); };

    await expect(loadPersistentState(index, { backend, legacyStorage: legacy })).rejects.toThrow("quota");
    expect(legacy.values.has(key)).toBe(true);
  });
});
