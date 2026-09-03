import type { QueryControls } from "./game";
import type { Language, Visualization } from "./types";

export interface QueryFormState {
  timestamp: number;
  range: number;
  visualization: Visualization;
}

export interface QueryHistoryNavigation {
  cursor: number;
  draft: string;
}

export function queryHistoryDirection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  key: "ArrowUp" | "ArrowDown",
  historyLength: number,
): "older" | "newer" | undefined {
  if (!historyLength || selectionStart !== selectionEnd) return undefined;
  if (key === "ArrowUp" && !value.slice(0, selectionStart).includes("\n")) return "older";
  if (key === "ArrowDown" && !value.slice(selectionEnd).includes("\n")) return "newer";
  return undefined;
}

export function navigateQueryHistory(
  history: string[],
  current: string,
  navigation: QueryHistoryNavigation | undefined,
  direction: "older" | "newer",
): { value: string; navigation: QueryHistoryNavigation } {
  const end = history.length;
  const draft = !navigation || navigation.cursor === end ? current : navigation.draft;
  const cursor = Math.max(0, Math.min(end, (navigation?.cursor ?? end) + (direction === "older" ? -1 : 1)));
  return { value: cursor === end ? draft : history[cursor]!, navigation: { cursor, draft } };
}

export function formatUtcDateTimeLocal(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 19);
}

export function formatUtcTimestamp(value: string | number | undefined): string {
  if (value === undefined) return "—";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function parseUtcDateTimeLocal(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) return undefined;
  const timestamp = Date.parse(`${value}Z`) / 1000;
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function authoredQueryForm(
  evaluationTime: string,
  rangeStart: string | undefined,
  rangeEnd: string | undefined,
  visualization: Visualization,
): QueryFormState {
  const timestamp = Date.parse(evaluationTime) / 1000;
  const start = rangeStart === undefined ? undefined : Date.parse(rangeStart) / 1000;
  const end = rangeEnd === undefined ? undefined : Date.parse(rangeEnd) / 1000;
  const range = start !== undefined && end !== undefined && end > start ? end - start : 3600;
  return { timestamp, range, visualization };
}

export function formForExecutionMode(
  base: QueryFormState, mode: "instant" | "range" | "records", instantView: "table" | "stat" = "table",
): QueryFormState {
  return { ...base, visualization: mode === "range" ? "graph" : mode === "records" ? "logs" : instantView };
}

export function executionControls(
  language: Language,
  expression: string,
  form: QueryFormState,
): QueryControls {
  const common: QueryControls = { timestamp: form.timestamp, visualization: form.visualization };
  const rawRecords = language === "logql" && expression.trimStart().startsWith("{");
  if (rawRecords) return {
    ...common,
    start: form.timestamp - form.range,
    end: form.timestamp,
    lookback: form.range,
    direction: "backward",
    limit: 100,
  };
  if (form.visualization === "graph") return {
    ...common,
    start: form.timestamp - form.range,
    end: form.timestamp,
    step: Math.max(1, Math.floor(form.range / 60)),
  };
  return common;
}
