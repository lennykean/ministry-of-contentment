import { clearStoredState, loadStoredState, saveKey, type GameState } from "./game";
import type { CampaignIndex } from "./types";

const databaseName = "ministry-of-contentment";
const objectStoreName = "saves";

type LegacyStorage = Pick<Storage, "getItem" | "removeItem">;

export interface PersistenceStore {
  read(key: string): Promise<unknown>;
  write(key: string, value: GameState): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PersistenceOptions {
  backend?: PersistenceStore;
  indexedDB?: IDBFactory;
  legacyStorage?: LegacyStorage | null;
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(objectStoreName)) request.result.createObjectStore(objectStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the campaign save database"));
    request.onblocked = () => reject(new Error("The campaign save database is open in another tab"));
  });
}

async function transact<T>(factory: IDBFactory, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      let result: T;
      const transaction = database.transaction(objectStoreName, mode);
      const request = operation(transaction.objectStore(objectStoreName));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("Campaign save transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("Campaign save transaction was cancelled"));
    });
  } finally {
    database.close();
  }
}

function indexedDbStore(factory: IDBFactory): PersistenceStore {
  return {
    read: (key) => transact(factory, "readonly", (store) => store.get(key)),
    write: (key, value) => transact(factory, "readwrite", (store) => store.put(value, key)).then(() => undefined),
    delete: (key) => transact(factory, "readwrite", (store) => store.delete(key)).then(() => undefined),
  };
}

function backendFor(options: PersistenceOptions): PersistenceStore {
  if (options.backend) return options.backend;
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("IndexedDB is unavailable; campaign progress cannot be saved");
  return indexedDbStore(factory);
}

function legacyStorageFor(options: PersistenceOptions): LegacyStorage | undefined {
  if ("legacyStorage" in options) return options.legacyStorage ?? undefined;
  try { return globalThis.localStorage; }
  catch { return undefined; }
}

function stateForCampaign(value: unknown, campaignId: string): GameState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state = value as GameState;
  return state.version === 1 && state.campaignId === campaignId ? state : undefined;
}

function removeLegacy(index: CampaignIndex, storage: LegacyStorage | undefined): void {
  if (!storage) return;
  try { clearStoredState(index, storage); }
  catch { /* The committed IndexedDB save remains authoritative. */ }
}

export async function loadPersistentState(index: CampaignIndex, options: PersistenceOptions = {}): Promise<GameState | undefined> {
  const backend = backendFor(options);
  const key = saveKey(index.campaign.id);
  const stored = stateForCampaign(await backend.read(key), index.campaign.id);
  if (stored) return stored;

  const legacyStorage = legacyStorageFor(options);
  let legacy: GameState | undefined;
  try { legacy = legacyStorage ? loadStoredState(index, legacyStorage) : undefined; }
  catch { return undefined; }
  if (!legacy) return undefined;

  await backend.write(key, structuredClone(legacy));
  removeLegacy(index, legacyStorage);
  return legacy;
}

export async function storePersistentState(index: CampaignIndex, state: GameState, options: PersistenceOptions = {}): Promise<void> {
  await backendFor(options).write(saveKey(index.campaign.id), structuredClone(state));
  removeLegacy(index, legacyStorageFor(options));
}

export async function clearPersistentState(index: CampaignIndex, options: PersistenceOptions = {}): Promise<void> {
  await backendFor(options).delete(saveKey(index.campaign.id));
  const legacyStorage = legacyStorageFor(options);
  if (legacyStorage) clearStoredState(index, legacyStorage);
}
