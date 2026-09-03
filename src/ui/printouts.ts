import type { PrintOptions, SavedArtifact } from "../game";
import type { QueryValue, SampleValue } from "../query";
import type { Visualization } from "../types";
import {
  clockSeconds, escapeHtml, formatTime, formatValue, labelsPlain, labelsText,
  paperclip, resultKindLabel, resultSize,
} from "./format";

const seriesColour = (position: number): string => ["#1f2d44", "#e8785a", "#1f5a3f", "#b3462a", "#6b7a90", "#c9a227"][position % 6]!;

type NumericPoint = { timestamp: number; value: number };
const numericPoints = (values: { timestamp: number; value: unknown }[]): NumericPoint[] =>
  values.filter((point): point is NumericPoint => typeof point.value === "number");
const valueWithUnit = (value: SampleValue, unit?: string): string => `${formatValue(value)}${unit ? ` ${unit}` : ""}`;

function recordRows(result: Extract<QueryValue, { type: "records" }>) {
  return result.streams.flatMap((stream) => stream.records.map((record) => ({ ...record, streamLabels: stream.labels })));
}

/* ------------------------------------------------------------------ console */

/** One transcript entry on the phosphor screen: the query, its shape, and a few result lines. */
export function transcriptEntry(artifact: SavedArtifact, selected: boolean, printNumber?: number): string {
  const execution = artifact.execution;
  const head = `<span class="crt-prompt">&gt;</span> ${escapeHtml(artifact.expression || "(empty query)")}`;
  let body: string;
  if (!execution.ok) {
    body = `<span class="crt-error">${escapeHtml(execution.error.kind.toUpperCase())} ERROR</span>\n ${escapeHtml(execution.error.message)}`;
  } else {
    const result = execution.result;
    const size = resultSize(result);
    const noun = result.type === "records" ? `RECORD${size === 1 ? "" : "S"}`
      : result.type === "scalar" ? `VALUE${size === 1 ? "" : "S"}` : "SERIES";
    const meta = `${resultKindLabel(result)} · ${size} ${noun} · ${clockSeconds(artifact.controls.timestamp)}`;
    body = `<span class="crt-dim">${escapeHtml(meta)}</span>\n${transcriptLines(result)}`;
  }
  const stamp = printNumber === undefined ? "" : `\n<span class="crt-dim"> printed as PRINTOUT #${printNumber}</span>`;
  return `<button type="button" class="crt-run ${selected ? "selected" : ""}" data-select-artifact="${escapeHtml(artifact.id)}" aria-pressed="${selected}"><span class="crt-line">${head}</span><span class="crt-line">${body}${stamp}</span></button>`;
}

function transcriptLines(result: QueryValue): string {
  if (result.type === "scalar") return ` ${escapeHtml(formatValue(result.value))}`;
  if (result.type === "instant-vector") {
    if (!result.series.length) return " Successful query. No series are present at this evaluation time.\n This is absence, not zero.";
    return result.series.slice(0, 6).map((series) =>
      ` <span class="crt-cols"><span>${escapeHtml(labelsPlain(series.labels))}</span><span>${escapeHtml(valueWithUnit(series.value, series.unit))}</span></span>`).join("\n")
      + (result.series.length > 6 ? `\n <span class="crt-dim">…${result.series.length - 6} more series</span>` : "");
  }
  if (result.type === "range-vector") {
    if (!result.series.length) return " Successful query. No series exist in this range.";
    return result.series.slice(0, 6).map((series) => {
      const points = numericPoints(series.values);
      const last = points.at(-1);
      return ` <span class="crt-cols"><span>${escapeHtml(labelsPlain(series.labels))}</span><span>${series.values.length} pts${last ? ` · last ${escapeHtml(valueWithUnit(last.value, series.unit))}` : ""}</span></span>`;
    }).join("\n") + (result.series.length > 6 ? `\n <span class="crt-dim">…${result.series.length - 6} more series</span>` : "");
  }
  const records = recordRows(result);
  if (!records.length) return " Successful query. No log records match this range and pipeline.";
  return records.slice(0, 6).map((record) => ` ${escapeHtml(clockSeconds(record.timestamp))} ${escapeHtml(record.displayLine)}`).join("\n")
    + (records.length > 6 ? `\n <span class="crt-dim">…${records.length - 6} more records</span>` : "");
}

/* -------------------------------------------------------------------- slips */

export function slipMeta(artifact: SavedArtifact, options: PrintOptions): string {
  const execution = artifact.execution;
  if (!execution.ok) return `FAILED · ${clockSeconds(artifact.controls.timestamp)}`;
  const result = execution.result;
  const size = resultSize(result);
  const parts = [resultKindLabel(result)];
  if (result.type !== "scalar") parts.push(`${size} ${result.type === "records" ? "RECORDS" : "SERIES"}`);
  if (options.showRange && artifact.controls.start !== undefined && artifact.controls.end !== undefined) {
    parts.push(`${clockSeconds(artifact.controls.start).slice(0, 5)} → ${clockSeconds(artifact.controls.end).slice(0, 5)}`);
    if (artifact.controls.step) parts.push(`STEP ${artifact.controls.step}S`);
  } else {
    parts.push(clockSeconds(artifact.controls.timestamp));
  }
  return parts.join(" · ");
}

/** A printed slip: header, optional query, meta, then the picture the print view chose. */
export function renderSlip(artifact: SavedArtifact, printNumber: number, pinIndex: number, locked: boolean, filed: boolean): string {
  const options = artifact.print!;
  const pinned = pinIndex >= 0;
  const switches = [
    options.showQuery ? "query" : "no query",
    options.showLabels ? "labels" : "no labels",
    options.showRange ? "range" : "no range",
    options.zeroAxis ? "zero axis" : "free axis",
  ].join(" · ");
  return `<article class="slip ${pinned ? "pinned" : ""}" data-slip="${escapeHtml(artifact.id)}" aria-label="Printout ${printNumber}, ${options.visualization} view">
    <button type="button" class="slip-open" data-action="open-slip" data-id="${escapeHtml(artifact.id)}" aria-label="Open the whole printout"></button>
    ${pinned ? `<span class="slip-clip">${paperclip(24, 52)}</span>` : ""}
    <div class="slip-head"><span>PRINTOUT #${printNumber} · ${escapeHtml(options.visualization.toUpperCase())}</span><span>${escapeHtml(clockSeconds(artifact.controls.timestamp))}</span></div>
    ${options.showQuery ? `<div class="slip-query">${escapeHtml(artifact.expression || "(empty query)")}</div>` : ""}
    <div class="slip-meta">${escapeHtml(slipMeta(artifact, options))}</div>
    <div class="slip-picture">${slipPicture(artifact, options)}</div>
    <div class="slip-foot"><span>${escapeHtml(switches)}</span>${
      filed ? `<span class="tag mint">Filed evidence</span>`
        : `<span class="slip-actions"><button type="button" class="trash-button" data-action="trash-printout" data-id="${escapeHtml(artifact.id)}" ${locked ? "disabled" : ""}>Trash</button><button type="button" class="pin-button ${pinned ? "on" : ""}" data-action="${pinned ? "unpin-artifact" : "pin-artifact"}" data-id="${escapeHtml(artifact.id)}" ${locked ? "disabled" : ""}>${paperclip(11, 22, pinned ? "#fffdf7" : "#e8785a")}<span>${pinned ? `Pinned · evidence ${pinIndex + 1}` : "Pin to report"}</span></button></span>`
    }</div>
  </article>`;
}

/** The visible top sheet of the evidence pile attached to an unfiled report. */
export function renderPinnedStack(artifacts: SavedArtifact[], printed: SavedArtifact[], activeArtifactId: string, locked: boolean): string {
  if (!artifacts.length) return "";
  const selected = artifacts.findIndex((artifact) => artifact.id === activeArtifactId);
  const activeIndex = selected >= 0 ? selected : 0;
  const artifact = artifacts[activeIndex]!;
  const printNumber = printed.indexOf(artifact) + 1;
  return `<aside class="pinned-stack" aria-label="${artifacts.length} printout${artifacts.length === 1 ? "" : "s"} attached to this report">
    <span class="stack-clip" aria-hidden="true">${paperclip(20, 44)}</span>
    <p class="stack-label">ATTACHED EVIDENCE · ${activeIndex + 1} OF ${artifacts.length}</p>
    <div class="stack">${renderSlip(artifact, printNumber, activeIndex, locked, artifact.filed)}</div>
    ${artifacts.length > 1 ? `<button type="button" class="stack-next" data-action="next-pinned">Next printout</button>` : ""}
  </aside>`;
}

function slipPicture(artifact: SavedArtifact, options: PrintOptions): string {
  const execution = artifact.execution;
  if (!execution.ok) {
    return `<p class="slip-error">${escapeHtml(execution.error.kind)} error. ${escapeHtml(execution.error.message)}</p>`;
  }
  return renderPicture(execution.result, options);
}

export function renderPicture(result: QueryValue, options: PrintOptions): string {
  const view = options.visualization;
  if (result.type === "scalar") {
    return view === "table"
      ? `<table class="slip-table"><tbody><tr><td class="n">${escapeHtml(formatValue(result.value))}</td></tr></tbody></table>`
      : statBlock(formatValue(result.value), options.showLabels ? "one value, no labels" : "");
  }
  if (result.type === "instant-vector") {
    if (!result.series.length) return `<p class="slip-empty">No series are present at this evaluation time. This is absence, not zero.</p>`;
    if (view === "stat") {
      const series = result.series[0]!;
      return statBlock(valueWithUnit(series.value, series.unit), options.showLabels ? labelsPlain(series.labels) : "");
    }
    return instantTable(result, options);
  }
  if (result.type === "range-vector") {
    if (!result.series.length) return `<p class="slip-empty">No series exist in this range.</p>`;
    if (view === "table") return rangeTable(result, options);
    if (view === "stat") {
      const series = result.series[0]!;
      const last = numericPoints(series.values).at(-1);
      return statBlock(last ? valueWithUnit(last.value, series.unit) : "—", options.showLabels ? labelsPlain(series.labels) : "last value");
    }
    return graph(result, options);
  }
  return logLines(result, options);
}

function statBlock(value: string, caption: string): string {
  return `<div class="stat-block"><strong>${escapeHtml(value)}</strong>${caption ? `<small>${escapeHtml(caption)}</small>` : ""}</div>`;
}

function labelChips(labels: Record<string, string>): string {
  return Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `<span class="lab">${escapeHtml(key)}=${escapeHtml(value)}</span>`).join("") || `<span class="lab muted">no labels</span>`;
}

function instantTable(result: Extract<QueryValue, { type: "instant-vector" }>, options: PrintOptions): string {
  return `<div class="slip-scroll"><table class="slip-table"><thead><tr>${options.showLabels ? "<th>LABELS</th>" : ""}<th class="n">VALUE</th><th class="n">TIME</th></tr></thead><tbody>${
    result.series.map((series) => `<tr>${options.showLabels ? `<td>${labelChips(series.labels)}</td>` : ""}<td class="n">${escapeHtml(valueWithUnit(series.value, series.unit))}</td><td class="n">${escapeHtml(clockSeconds(series.timestamp))}</td></tr>`).join("")
  }</tbody></table></div>`;
}

function rangeTable(result: Extract<QueryValue, { type: "range-vector" }>, options: PrintOptions): string {
  return `<div class="slip-scroll"><table class="slip-table"><thead><tr>${options.showLabels ? "<th>LABELS</th>" : ""}<th class="n">VALUE</th><th class="n">TIME</th></tr></thead><tbody>${
    result.series.flatMap((series) => series.values.map((point) =>
      `<tr>${options.showLabels ? `<td>${labelChips(series.labels)}</td>` : ""}<td class="n">${escapeHtml(valueWithUnit(point.value, series.unit))}</td><td class="n">${escapeHtml(clockSeconds(point.timestamp))}</td></tr>`)).join("")
  }</tbody></table></div>`;
}

function graph(result: Extract<QueryValue, { type: "range-vector" }>, options: PrintOptions): string {
  const all = result.series.flatMap((series) => numericPoints(series.values));
  if (!all.length) return `<p class="slip-empty">Native histogram range. Inspect count and sum in the table view.</p>`;
  const minTime = Math.min(...all.map((point) => point.timestamp));
  const maxTime = Math.max(...all.map((point) => point.timestamp));
  const highest = Math.max(...all.map((point) => point.value));
  const lowest = options.zeroAxis ? Math.min(0, ...all.map((point) => point.value)) : Math.min(...all.map((point) => point.value));
  const top = highest === lowest ? lowest + 1 : highest;
  const unit = result.series.find((series) => series.unit)?.unit;
  const x = (time: number) => 34 + ((time - minTime) / Math.max(maxTime - minTime, 1)) * 366;
  const y = (value: number) => 118 - ((value - lowest) / Math.max(top - lowest, Number.EPSILON)) * 112;
  const label = `Time series from ${formatTime(minTime)} to ${formatTime(maxTime)}, ${result.series.length} series`;
  return `<svg class="slip-graph" viewBox="0 0 404 150" role="img" aria-label="${escapeHtml(label)}">
    <line x1="34" y1="6" x2="34" y2="118" stroke="#9aa5b5" stroke-width="1"/>
    <line x1="34" y1="118" x2="400" y2="118" stroke="#9aa5b5" stroke-width="1"/>
    <line x1="34" y1="62" x2="400" y2="62" stroke="#eef3ef" stroke-width="1"/>
    <text x="2" y="12">${escapeHtml(valueWithUnit(top, unit))}</text>
    <text x="2" y="122">${escapeHtml(valueWithUnit(lowest, unit))}</text>
    <text x="34" y="136">${escapeHtml(clockSeconds(minTime).slice(0, 5))}</text>
    <text x="360" y="136">${escapeHtml(clockSeconds(maxTime).slice(0, 5))}</text>
    ${result.series.map((series, position) => {
      const points = numericPoints(series.values).map((point) => `${x(point.timestamp).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
      return `<polyline fill="none" stroke="${seriesColour(position)}" stroke-width="2" points="${points}"/>`;
    }).join("")}
  </svg>${options.showLabels ? `<div class="slip-legend">${result.series.map((series, position) =>
    `<span><i style="background:${seriesColour(position)}"></i>${escapeHtml(labelsPlain(series.labels))}</span>`).join("")}</div>` : ""}`;
}

function logLines(result: Extract<QueryValue, { type: "records" }>, options: PrintOptions): string {
  const records = recordRows(result);
  if (!records.length) return `<p class="slip-empty">No log records match this range and pipeline.</p>`;
  return `<div class="slip-logs">${records.slice(0, 12).map((record) => `<div class="slip-log">
    <div class="slip-meta">${escapeHtml(clockSeconds(record.timestamp))}${options.showLabels ? ` ${labelChips(record.streamLabels)}` : ""}</div>
    <div class="slip-query">${escapeHtml(record.displayLine)}</div>
    ${options.showLabels && Object.keys(record.fields).length ? `<div>${Object.entries(record.fields).map(([key, value]) => `<span class="fld">${escapeHtml(key)}=${escapeHtml(value)}</span>`).join("")}</div>` : ""}
    ${record.error ? `<div><span class="err">__error__=${escapeHtml(record.error)}</span></div>` : ""}
  </div>`).join("")}${records.length > 12 ? `<p class="slip-meta">${records.length - 12} further records in the archive.</p>` : ""}</div>`;
}

/* ------------------------------------------------------- full result detail */

const defaultPrint = (visualization: Visualization): PrintOptions =>
  ({ visualization, showQuery: true, showLabels: true, showRange: true, zeroAxis: false });

/** The complete result, used by the archive and the filed report where nothing is hidden. */
export function renderResultDetail(artifact: SavedArtifact, visualization?: Visualization): string {
  const execution = artifact.execution;
  if (!execution.ok) {
    const at = execution.error.position === undefined ? "" : ` at character ${execution.error.position + 1}`;
    return `<div class="query-error"><b>${execution.error.kind === "unsupported" ? "Valid syntax outside this console's supported subset" : `${escapeHtml(execution.error.kind)} error${at}`}</b><p>${escapeHtml(execution.error.message)}</p></div>`;
  }
  const cost = execution.facts.cost;
  const view = visualization ?? artifact.print?.visualization ?? artifact.controls.visualization;
  return `<div class="result-detail">
    <p class="result-meta">${resultSize(execution.result)} returned · ${escapeHtml(execution.result.type)} · ${cost.seriesScanned} series, ${cost.samplesScanned} samples, ${cost.recordsScanned} records scanned</p>
    ${renderPicture(execution.result, artifact.print ?? defaultPrint(view))}
    ${execution.facts.lineage.warnings.length ? `<ul class="result-warnings">${execution.facts.lineage.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export const describeLabels = labelsText;
