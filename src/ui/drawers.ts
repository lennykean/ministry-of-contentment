import type { FiledReport, GameEngine, SavedArtifact } from "../game";
import { replayResultFor } from "../game";
import type { CampaignIndex, Rank } from "../types";
import { calendarDate, clockTime, escapeHtml, formatTime, formatValue, initials, minutesPhrase } from "./format";
import { renderResultDetail } from "./printouts";

export type DrawerName = "registry" | "watches" | "personnel" | "archive" | "keys";

export interface DrawerContext {
  index: CampaignIndex;
  engine: GameEngine;
  registryKind: "metrics" | "records" | "syntax";
  registrySearch: string;
  selectedReport: string;
  lastReplay?: SavedArtifact;
  caseId?: string;
}

const shell = (name: DrawerName, title: string, kicker: string, body: string): string => `
  <dialog class="drawer drawer-${name}" id="drawer-${name}" aria-labelledby="drawer-${name}-title">
    <header class="drawer-head">
      <div><p class="kicker">${escapeHtml(kicker)}</p><h2 id="drawer-${name}-title">${escapeHtml(title)}</h2></div>
      <button type="button" class="close-button" data-action="close-drawer">Close <kbd>Esc</kbd></button>
    </header>
    <div class="drawer-body">${body}</div>
  </dialog>`;

export function renderDrawer(name: DrawerName, context: DrawerContext): string {
  if (name === "registry") return shell(name, "Registry", "Required information · always free", registryBody(context));
  if (name === "watches") return shell(name, "Standing queries", "What the Ministry notices tomorrow", watchesBody(context));
  if (name === "personnel") return shell(name, "Personnel file", "Continuously reviewed", personnelBody(context));
  if (name === "archive") return shell(name, "Archive", "Immutable filed record · consequence-free practice", archiveBody(context));
  return shell(name, "Keys", "Desk shortcuts", keysBody());
}

/* ----------------------------------------------------------------- registry */

function registryBody({ index, engine, registryKind, registrySearch, caseId }: DrawerContext): string {
  const query = registrySearch.trim().toLowerCase();
  const sources = new Set(engine.availableSources(caseId));
  const metricCount = index.campaign.metrics.filter((metric) => sources.has(metric.name)).length;
  const recordCount = index.campaign.logSources.filter((source) => sources.has(source.id)).length;
  const dataset = index.datasets.get(caseId ? engine.caseDatasetId(caseId) : engine.currentShift().datasetId);
  const tab = (kind: DrawerContext["registryKind"], label: string, count?: number) =>
    `<button type="button" role="tab" data-registry="${kind}" aria-selected="${registryKind === kind}">${escapeHtml(label)}${count === undefined ? "" : ` <b>${count}</b>`}</button>`;
  let panel = "";
  if (registryKind === "metrics") {
    const metrics = index.campaign.metrics.filter((metric) => sources.has(metric.name)
      && (!query || `${metric.name} ${metric.description} ${metric.labels.join(" ")}`.toLowerCase().includes(query)));
    panel = metrics.length ? `<div class="registry-grid">${metrics.map((metric) => {
      const series = dataset?.series.filter((candidate) => candidate.metric === metric.name) ?? [];
      const known = metric.labels.map((label) => [label, [...new Set(series.map((candidate) => candidate.labels[label]).filter((value): value is string => Boolean(value)))]] as const).filter(([, values]) => values.length);
      const first = known[0];
      const sample = series[0]?.samples.at(-1)?.value;
      return `<article class="registry-card">
        <header><code>${escapeHtml(metric.name)}</code><span>${escapeHtml(metric.type)}</span></header>
        <p>${escapeHtml(metric.description)}</p>
        <dl><div><dt>Measures</dt><dd>${escapeHtml(metric.source)}</dd></div><div><dt>Unit</dt><dd>${escapeHtml(metric.unit ?? "unitless")}</dd></div><div><dt>Labels</dt><dd>${metric.labels.length ? metric.labels.map((label) => `<code>${escapeHtml(label)}</code>`).join(" ") : "none"}</dd></div></dl>
        ${known.length ? `<details><summary>Known label values here</summary>${known.map(([label, values]) => `<p><b>${escapeHtml(label)}</b>: ${values.map(escapeHtml).join(", ")}</p>`).join("")}</details>` : ""}
        <p class="registry-example"><span>Try</span> <code>${escapeHtml(`${metric.name}${first ? `{${first[0]}="${first[1][0]}"}` : ""}`)}</code></p>
        ${sample === undefined ? "" : `<p class="registry-sample">Latest example value: <b>${escapeHtml(formatValue(sample))}</b></p>`}
      </article>`;
    }).join("")}</div>` : `<p class="empty-copy">No metrics match that search.</p>`;
  } else if (registryKind === "records") {
    const logSources = index.campaign.logSources.filter((source) => sources.has(source.id)
      && (!query || `${source.id} ${source.description} ${source.streamLabels.join(" ")} ${source.fields.map((field) => field.name).join(" ")}`.toLowerCase().includes(query)));
    panel = logSources.length ? `<div class="registry-grid">${logSources.map((source) => {
      const streams = dataset?.streams.filter((stream) => stream.sourceId === source.id) ?? [];
      const firstStream = streams[0];
      const firstLabel = source.streamLabels.find((label) => firstStream?.labels[label] !== undefined);
      const sample = firstStream?.records[0]?.line;
      return `<article class="registry-card">
        <header><code>${escapeHtml(source.id)}</code><span>log source</span></header>
        <p>${escapeHtml(source.description)}</p>
        <dl><div><dt>Stream labels</dt><dd>${source.streamLabels.length ? source.streamLabels.map((label) => `<code>${escapeHtml(label)}</code>`).join(" ") : "none"}</dd></div><div><dt>Structured metadata</dt><dd>${source.structuredMetadata?.map((field) => `<code>${escapeHtml(field.name)}</code>`).join(" ") || "none"}</dd></div></dl>
        <table><thead><tr><th>Parsed field</th><th>Type</th><th>Parser</th></tr></thead><tbody>${source.fields.map((field) => `<tr><td><code>${escapeHtml(field.name)}</code><small>${escapeHtml(field.description)}</small></td><td>${escapeHtml(field.type)}</td><td>${escapeHtml(field.parser)}</td></tr>`).join("")}</tbody></table>
        <p class="registry-example"><span>Try</span> <code>{${firstLabel && firstStream ? `${escapeHtml(firstLabel)}="${escapeHtml(firstStream.labels[firstLabel]!)}"` : ""}}</code></p>
        ${sample ? `<p class="registry-sample"><code>${escapeHtml(sample)}</code></p>` : ""}
      </article>`;
    }).join("")}</div>` : `<p class="empty-copy">No record sources match that search.</p>`;
  } else {
    panel = syntaxPanel({ index, engine, caseId, registrySearch });
  }
  return `<div class="registry-controls">
      <div class="tabs" role="tablist" aria-label="Registry sections">${tab("metrics", "Metrics", metricCount)}${tab("records", "Records", recordCount)}${tab("syntax", "Syntax")}</div>
      <label class="search-box">Search<input id="registry-search" type="search" value="${escapeHtml(registrySearch)}" placeholder="name, label, field" /></label>
    </div>${panel}`;
}

const syntaxPatterns: Record<string, string> = {
  "promql.selector.metric": "<metric>",
  "promql.selector.equality": '<metric>{<label>="<value>"} · <metric>{<label>!="<value>"}',
  "promql.selector.regex": '<metric>{<label>=~"<regex>"} · <metric>{<label>!~"<regex>"}',
  "promql.result.model": "<metric> · <scalar> · <metric>[<window>]",
  "promql.time.range-selector": "<metric>[5m]",
  "promql.comparison.filter": "<metric> > <threshold>",
  "promql.counter.rate": "rate(<counter>[5m])",
  "promql.counter.increase": "increase(<counter>[5m])",
  "promql.aggregate.reduce": "sum(<expression>)",
  "promql.aggregate.labels": "sum by (<labels>) (<expression>)",
  "promql.aggregate.rank": "topk(<n>, <expression>)",
  "promql.binary.ratio": "(<numerator> / <denominator>) * 100",
  "promql.comparison.bool": "<expression> > bool <threshold>",
  "promql.binary.precedence": "(<left> + <right>) / <total>",
  "promql.match.one-to-one": "<left> / on (<labels>) <right>",
  "promql.match.many-to-one": "<left> * on (<labels>) group_left (<labels>) <right>",
  "promql.set.operators": "<left> and|or|unless on (<labels>) <right>",
  "promql.histogram.classic": "histogram_quantile(0.95, sum by (le) (rate(<bucket-metric>[5m])))",
  "promql.histogram.native": "histogram_quantile(0.95, sum(rate(<native-histogram>[5m])))",
  "promql.absence.instant": "absent(<metric>{<matchers>})",
  "promql.absence.range": "absent_over_time(<metric>{<matchers>}[5m])",
  "promql.change.resets": "resets(<counter>[5m]) · changes(<series>[5m])",
  "promql.time.offset-at": "<selector> offset 1d · <selector> @ <unix-time>",
  "promql.time.subquery": "<expression>[30m:5m]",
  "promql.time.over-time": "max_over_time(<range>)",
  "promql.prediction": "predict_linear(<gauge>[1h], <seconds-ahead>)",
  "logql.selector.equality": '{<label>="<value>"}',
  "logql.selector.regex-negative": '{<label>=~"<regex>",<label>!="<value>"}',
  "logql.filter.literal": '|= "<text>" · != "<text>"',
  "logql.filter.regex-pattern": '|~ "<regex>" · !~ "<regex>"',
  "logql.pipeline.order": "<stream selector> | <filter> | <parser> | <field filter>",
  "logql.parse.json-logfmt": "<stream selector> | json · <stream selector> | logfmt",
  "logql.parse.pattern-regexp": '<stream selector> | pattern "<pattern>" · | regexp "<regex>"',
  "logql.filter.typed": "| duration(<field>) > 2s",
  "logql.error.pipeline": '| __error__=""',
  "logql.metric.count-rate": "count_over_time(<stream selector>[5m]) · rate(<stream selector>[5m])",
  "logql.metric.bytes": "bytes_over_time(<stream selector>[5m]) · bytes_rate(<stream selector>[5m])",
  "logql.aggregate": "sum by (<labels>) (<range function>)",
  "logql.unwrap.numeric": "| unwrap <field>",
  "logql.unwrap.units": "| unwrap duration(<field>) · | unwrap bytes(<field>)",
  "logql.unwrap.range": "avg_over_time(<stream selector> | unwrap <field> [5m])",
  "logql.quantile": "quantile_over_time(0.95, <stream selector> | unwrap <field> [5m])",
  "logql.binary": "<left> / on (<labels>) <right>",
  "logql.format.line": '| line_format "{{.<field>}}"',
  "logql.format.label-template": '| label_format <label>="{{.<field>}}"',
  "logql.time.offset": "<range function> offset 1d",
  "logql.absence.range": "absent_over_time(<stream selector>[5m])",
};

function syntaxPanel({ index, engine, caseId, registrySearch }: Pick<DrawerContext, "index" | "engine" | "caseId" | "registrySearch">): string {
  const item = caseId ? index.cases.get(caseId) : undefined;
  const available = new Set(engine.availableSources(caseId));
  const dataset = index.datasets.get(caseId ? engine.caseDatasetId(caseId) : engine.currentShift().datasetId);
  const learned = (conceptId: string) => engine.canAccessConcept(conceptId)
    && (item?.conceptIds.includes(conceptId) || (engine.state.mastery[conceptId]?.state ?? "Unobserved") !== "Unobserved");
  const metrics = index.campaign.metrics.filter((metric) => available.has(metric.name));
  const examples: string[][] = [];
  const metric = metrics[0];
  if (metric) {
    const series = dataset?.series.find((candidate) => candidate.metric === metric.name);
    const label = metric.labels.find((name) => series?.labels[name] !== undefined);
    examples.push(["Select metric series", `${metric.name}${label ? `{${label}="${series!.labels[label]}"}` : ""}`]);
  }
  const counter = metrics.find((candidate) => candidate.type === "counter");
  if (counter && learned("promql.counter.rate")) examples.push(["Rate a counter", `rate(${counter.name}[5m])`]);
  const histogram = metrics.find((candidate) => candidate.type === "classic-histogram");
  if (histogram && learned("promql.histogram.classic")) examples.push(["Classic histogram p95", `histogram_quantile(0.95, sum by (le) (rate(${histogram.name}[5m])))`]);
  const source = index.campaign.logSources.find((candidate) => available.has(candidate.id));
  if (source) {
    const stream = dataset?.streams.find((candidate) => candidate.sourceId === source.id);
    const label = source.streamLabels.find((name) => stream?.labels[name] !== undefined);
    const selector = `{${label ? `${label}="${stream!.labels[label]}"` : ""}}`;
    examples.push(["Select record streams", selector]);
    const parser = source.fields.find((field) => field.parser === "json" || field.parser === "logfmt")?.parser;
    if (parser && learned("logql.parse.json-logfmt")) examples.push(["Parse records", `${selector} | ${parser}`]);
    if (learned("logql.metric.count-rate")) examples.push(["Count records over time", `rate(${selector}[5m])`]);
  }
  const search = registrySearch.trim().toLowerCase();
  const visibleConcepts = index.campaign.concepts.filter((concept) => learned(concept.id)
    && (!search || `${concept.language} ${concept.family} ${concept.competency} ${syntaxPatterns[concept.id] ?? ""}`.toLowerCase().includes(search)));
  const guide = (language: "promql" | "logql" | "shared") => {
    const entries = visibleConcepts.filter((concept) => concept.language === language);
    return entries.length ? entries.map((concept) => `<div class="registry-example">
      <span>${escapeHtml(`${concept.stage} · ${concept.family}`)}</span>
      ${syntaxPatterns[concept.id] ? `<code>${escapeHtml(syntaxPatterns[concept.id]!)}</code>` : ""}
      <p>${escapeHtml(concept.competency)}</p>
    </div>`).join("") : `<p class="empty-copy">No ${language === "shared" ? "result-reading" : language.toUpperCase()} skills match.</p>`;
  };
  return `<div class="syntax-panel">
    <section><h3>Patterns for the registered sources</h3>${examples.map(([name, expression]) => `<p class="registry-example"><span>${escapeHtml(name!)}</span> <code>${escapeHtml(expression!)}</code></p>`).join("") || `<p class="empty-copy">This case uses source-free expressions.</p>`}</section>
    <section><h3>Unlocked query reference</h3><p>This list includes skills already learned and skills used by the current work order. Future access stays sealed.</p>
      <h4>PromQL</h4>${guide("promql")}
      <h4>LogQL</h4>${guide("logql")}
      <h4>Reading the evidence</h4>${guide("shared")}
    </section></div>`;
}

/* ------------------------------------------------------------ standing queries */

function watchesBody({ engine, index }: DrawerContext): string {
  const active = engine.state.watches.filter((watch) => watch.state === "active");
  const cost = engine.actionCost("retireWatch");
  if (!engine.state.watches.length) {
    return `<p class="empty-copy">No standing queries yet. Eligible filed evidence can become one. Later shifts run it against changed data.</p>`;
  }
  return `<p class="drawer-lede">Capacity ${active.length} of ${engine.state.watchCapacity}. Each watch runs the exact filed expression.</p>
    <div class="watch-list">${engine.state.watches.map((watch) => {
      const artifact = engine.state.artifacts.find((item) => item.id === watch.artifactId);
      const scenario = index.watchScenarios.get(watch.scenarioId);
      const notices = engine.state.notices.filter((notice) => notice.watchId === watch.id);
      return `<article class="watch-card">
        <header><h3>${escapeHtml(index.cases.get(watch.caseId)?.title ?? watch.caseId)}</h3><span class="tag ${watch.state === "active" ? "mint" : "grey"}">${escapeHtml(watch.state)}</span></header>
        <code>${escapeHtml(artifact?.expression ?? "")}</code>
        <dl><div><dt>Horizon</dt><dd>${scenario?.checkpointIds.length ?? 0} checkpoints</dd></div><div><dt>Last successful run</dt><dd>${escapeHtml(watch.lastSuccessfulCheckpointId ?? "not yet evaluated")}</dd></div><div><dt>Notice threads</dt><dd>${notices.length}</dd></div><div><dt>State</dt><dd>${escapeHtml(watch.lastCheckpointState ?? "pending")}</dd></div></dl>
        ${watch.scores ? `<div class="score-grid">${(["coverage", "specificity", "localization", "timeliness", "cost"] as const).map((key) => `<div><span>${key}</span><meter min="0" max="1" value="${watch.scores![key]}">${Math.round(watch.scores![key] * 100)}%</meter><b>${Math.round(watch.scores![key] * 100)}%</b></div>`).join("")}</div>` : `<p class="muted">Quality is computed after the authored checkpoint horizon completes.</p>`}
        ${watch.state === "active" ? `<button type="button" class="line-button" data-action="retire-watch" data-id="${escapeHtml(watch.id)}" ${engine.locked() ? "disabled" : ""}>Retire this standing query${cost ? ` · ${cost} unit${cost === 1 ? "" : "s"}` : ""}</button>` : ""}
      </article>`;
    }).join("")}</div>`;
}

/* ---------------------------------------------------------- personnel file */

function promotionBenefits(index: CampaignIndex, rank: Rank, previousRank?: Rank): string[] {
  const benefits = rank.grants.map((id) => index.campaign.rightDeclarations.find((right) => right.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if ((rank.watchAuthority ?? 0) > (previousRank?.watchAuthority ?? 0)) benefits.push(`Standing-query capacity: ${rank.watchAuthority}`);
  return benefits.length ? benefits : ["No new data access or standing-query authority"];
}

function personnelBody({ engine, index }: DrawerContext): string {
  const rank = index.ranks.get(engine.state.rankId);
  const band = [...index.campaign.standing.bands].reverse().find((item) => engine.state.standing >= item.minimum);
  const nextRank = [...index.ranks.values()].filter((candidate) => candidate.order > (rank?.order ?? 0)).sort((left, right) => left.order - right.order)[0];
  const stateOrder = ["Unobserved", "Observed", "Practiced", "Independent", "Certified"];
  const promotionReady = nextRank ? engine.conditionSatisfied(nextRank.condition) : false;
  const alliances = index.campaign.tagDeclarations.filter((tag) => tag.id.startsWith("alliance.") && engine.state.tags.includes(tag.id)).map((tag) => tag.name);
  const recordedTendencies = index.campaign.worldDeclarations.filter((declaration) =>
    (declaration.valueType === "int" || declaration.valueType === "number")
    && engine.state.world[declaration.id] !== declaration.initial,
  );
  const demonstrated = index.campaign.concepts.filter((concept) => engine.state.mastery[concept.id]?.credits.length);
  const recentDemonstrations = demonstrated.slice(-2).reverse();
  const masteryCounts = stateOrder.slice(1).map((state) => ({
    state,
    count: demonstrated.filter((concept) => engine.state.mastery[concept.id]?.state === state).length,
  })).filter(({ count }) => count);
  return `<div class="personnel">
    <section class="personnel-summary">
      <div class="portrait" aria-hidden="true">${escapeHtml(initials(rank?.name ?? "Trainee"))}</div>
      <div><h3>${escapeHtml(rank?.name ?? engine.state.rankId)}</h3><p>Shift ${engine.state.shiftNumber} · ${engine.state.completedCases.length} reports filed</p></div>
      <div class="standing-card"><span>Ministry standing</span><strong>${engine.state.standing}</strong><small>${escapeHtml(band?.name ?? "Unclassified")}</small></div>
    </section>
    ${recordedTendencies.length ? `<section>
      <h3>Recorded tendencies</h3>
      <p class="muted">These internal totals come from your filed decisions. The Ministry does not combine them with technical mastery.</p>
      <div class="record-measures">${recordedTendencies.map((declaration) => `<div><span>${escapeHtml(declaration.name)}</span><strong>${escapeHtml(String(engine.state.world[declaration.id]))}</strong></div>`).join("")}</div>
    </section>` : ""}
    ${nextRank ? `<section class="promotion">
      <p class="kicker">Next appointment</p><h3>${escapeHtml(nextRank.name)}</h3>
      <p>${escapeHtml(nextRank.appointmentText)}</p>
      <h4>Eligibility</h4>
      <ul class="requirements"><li class="${promotionReady ? "met" : "unmet"}"><b aria-hidden="true">${promotionReady ? "✓" : "○"}</b> <span>${escapeHtml(nextRank.eligibilityText)}</span> <span class="sr-only">${promotionReady ? "met" : "not met"}</span></li></ul>
      <h4>New data access and authority</h4>
      <ul>${promotionBenefits(index, nextRank, rank).map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join("")}</ul>
    </section>` : `<section class="promotion"><p class="kicker">Career objective reached</p><h3>Party Leader</h3></section>`}
    <section>
      <h3>Technical mastery</h3>
      <p class="muted">Mastery comes from computed behaviour and evidence. Repeating exact text or choosing an approved conclusion earns nothing.</p>
      <div class="mastery-counts">${masteryCounts.length
        ? masteryCounts.map(({ state, count }) => `<span><b>${count}</b> ${escapeHtml(state)}</span>`).join("")
        : "<span>No credited demonstrations yet.</span>"}</div>
      ${recentDemonstrations.length ? `<div class="mastery-list">${recentDemonstrations.map((concept) => {
        const record = engine.state.mastery[concept.id];
        const position = stateOrder.indexOf(record?.state ?? "Unobserved");
        return `<div><span class="tag ${position >= 3 ? "mint" : "grey"}">${escapeHtml(record?.state ?? "Unobserved")}</span><span><b>${escapeHtml(concept.competency)}</b><small>${record?.credits.length ?? 0} credited demonstration${record?.credits.length === 1 ? "" : "s"} · ${escapeHtml(concept.language)}</small></span></div>`;
      }).join("")}</div>` : ""}
    </section>
    <section>
      <h3>Career record</h3>
      <p>${alliances.length ? `Allied with ${escapeHtml(alliances.join(", "))}.` : "No declared alliance."}</p>
      ${engine.state.standingHistory.length ? `<details><summary>Standing ledger · ${engine.state.standingHistory.length} changes</summary>${engine.state.standingHistory.slice().reverse().map((change) => `<p><b>${change.delta >= 0 ? "+" : ""}${change.delta}</b> ${escapeHtml(formatTime(change.campaignTime))}<br>${escapeHtml(change.reason)}</p>`).join("")}</details>` : ""}
      <div class="desk-admin">
        <button type="button" class="line-button" data-action="restart-shift" ${engine.locked() || !engine.state.clockUsed ? "disabled" : ""}>Restart this shift and discard its work</button>
        <button type="button" class="line-button danger" data-action="reset">Clear the local campaign save</button>
      </div>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ archive */

function archiveBody({ engine, index, selectedReport, lastReplay }: DrawerContext): string {
  const reports = engine.archiveReports();
  if (!reports.length) return `<p class="empty-copy">The archive is empty. Filed reports preserve the evidence you chose, not every query you tried.</p>`;
  const current = reports.find((report) => report.id === selectedReport) ?? reports[0]!;
  return `<div class="archive-layout">
    <nav aria-label="Filed reports">${reports.map((report) => `<button type="button" data-report="${escapeHtml(report.id)}" class="${current.id === report.id ? "selected" : ""}" ${current.id === report.id ? 'aria-current="true"' : ""}><span>${escapeHtml(clockTime(report.campaignTime))} · ${escapeHtml(calendarDate(report.campaignTime))}</span><b>${escapeHtml(index.cases.get(report.caseId)?.title ?? report.caseId)}</b><i>${escapeHtml(report.pendingWatch ? "pending" : report.evidence)}</i></button>`).join("")}</nav>
    ${archivedReport(engine, index, current, lastReplay)}
  </div>`;
}

function archivedReport(engine: GameEngine, index: CampaignIndex, report: FiledReport, lastReplay?: SavedArtifact): string {
  const item = index.cases.get(report.caseId)!;
  const title = item.report.titles.find((choice) => choice.id === report.titleChoiceId)?.text;
  const conclusion = item.report.conclusions.find((choice) => choice.id === report.conclusionChoiceId)?.text;
  const artifacts = report.artifactIds.map((id) => engine.state.artifacts.find((artifact) => artifact.id === id)).filter((value): value is SavedArtifact => Boolean(value));
  return `<article class="archived-report">
    <p class="kicker">${escapeHtml(report.id)} · ${escapeHtml(formatTime(report.campaignTime))}</p>
    <h3>${escapeHtml(title)}</h3>
    <blockquote>${escapeHtml(conclusion)}</blockquote>
    <p class="archive-verdict"><span class="tag ${report.evidence === "supported" ? "mint" : "grey"}">Technical: ${escapeHtml(report.pendingWatch ? "awaiting checkpoints" : report.evidence)}</span> ${escapeHtml(report.ministryResponse)}</p>
    <h4>Filed evidence · ${escapeHtml(report.visualization)} view</h4>
    ${artifacts.map((artifact, position) => `<details class="filed-artifact">
      <summary><span>${position + 1}</span><code>${escapeHtml(artifact.expression)}</code></summary>
      ${renderResultDetail(artifact, report.visualization)}
      <div class="replay-controls">
        <label>Try another equivalent query<textarea data-replay-input="${escapeHtml(artifact.id)}" rows="2" spellcheck="false">${escapeHtml(artifact.expression)}</textarea></label>
        <button type="button" class="line-button" data-action="replay-query" data-report-id="${escapeHtml(report.id)}" data-artifact-id="${escapeHtml(artifact.id)}">Run a consequence-free replay</button>
      </div>
      ${replayResultFor(artifact.id, lastReplay) ? `<div class="replay-result"><p class="kicker">Replay result · campaign state unchanged</p>${renderResultDetail(lastReplay!)}</div>` : ""}
    </details>`).join("")}
  </article>`;
}

/* --------------------------------------------------------------------- keys */

const keyRows: [string, string][] = [
  ["Enter", "Run the query in the console"],
  ["Shift + Enter", "Insert a line break in the query"],
  ["↑ / ↓ in console", "Recall older or newer queries"],
  ["Ctrl + P", "Print the selected result"],
  ["1 to 4", "Choose the print view while the print bar has focus"],
  ["Alt + 1 to Alt + 5", "Open the first five items in the in tray"],
  ["F", "File the report when the form is complete"],
  ["R", "Open the registry"],
  ["?", "Open this list"],
  ["Esc", "Close any drawer"],
  ["Arrow keys in tray", "Move within the in tray and within a group of choices"],
];

function keysBody(): string {
  return `<p class="drawer-lede">Letter keys work when you are not typing in the console or a form field.</p>
    <dl class="key-list">${keyRows.map(([keys, what]) => `<div><dt><kbd>${escapeHtml(keys)}</kbd></dt><dd>${escapeHtml(what)}</dd></div>`).join("")}</dl>`;
}

/* ------------------------------------------------------------- shift ledger */

export interface ShiftLedger {
  shiftTitle: string;
  shiftNumber: number;
  closedAt: string;
  reportIds: string[];
  standingBefore: number;
  standingAfter: number;
  rankBefore: string;
  rankAfter: string;
  runs: number;
  hintsCalled: number;
  minutesUnused: number;
  watchesScored: number;
  noticesAdded: number;
  memoIds: string[];
  conceptIds: string[];
}

export function renderLedger(ledger: ShiftLedger, engine: GameEngine, index: CampaignIndex): string {
  const reports = ledger.reportIds.map((id) => engine.state.reports.find((report) => report.id === id)).filter((report): report is FiledReport => Boolean(report));
  const memos = ledger.memoIds.map((id) => engine.state.memos.find((memo) => memo.id === id)).filter((memo) => memo !== undefined);
  const delta = ledger.standingAfter - ledger.standingBefore;
  const beforeRank = index.ranks.get(ledger.rankBefore);
  const afterRank = index.ranks.get(ledger.rankAfter);
  const rankChange = beforeRank?.id === afterRank?.id
    ? `Rank remains ${escapeHtml(afterRank?.name ?? ledger.rankAfter)}.`
    : `Appointed ${escapeHtml(afterRank?.name ?? ledger.rankAfter)}. ${afterRank ? `Eligibility met: ${escapeHtml(afterRank.eligibilityText)} ${escapeHtml(afterRank.appointmentText)} New data access and authority: ${promotionBenefits(index, afterRank, beforeRank).map(escapeHtml).join("; ")}.` : ""}`;
  const active = engine.state.watches.filter((watch) => watch.state === "active").length;
  const nextShift = engine.currentShift();
  const evidenceTag = (report: FiledReport) => report.pendingWatch ? `<span class="tag grey">Pending</span>`
    : report.evidence === "supported" ? `<span class="tag mint">Supported</span>`
      : `<span class="tag coral">${escapeHtml(report.evidence === "partial" ? "Partial" : report.evidence === "error" ? "Error" : "Exceeds")}</span>`;
  return `<dialog class="overlay ledger" id="overlay-ledger" aria-labelledby="ledger-title">
    <section class="ledger-sheet">
      <header><h2 id="ledger-title">Shift ledger</h2><p>${escapeHtml(ledger.shiftTitle)} · closed ${escapeHtml(clockTime(ledger.closedAt))} · ${escapeHtml(calendarDate(ledger.closedAt))}</p></header>
      ${reports.length ? `<table class="ledger-table"><thead><tr><th>Reports filed</th><th>Technical</th><th>Ministry response</th></tr></thead><tbody>${
        reports.map((report) => `<tr><th scope="row">${escapeHtml(index.cases.get(report.caseId)?.title ?? report.caseId)}</th><td>${evidenceTag(report)}</td><td>${escapeHtml(report.ministryResponse)}</td></tr>`).join("")
      }</tbody></table>` : `<p class="muted">No reports were filed in this shift.</p>`}
      <dl class="ledger-facts">
        <div><dt>Ministry standing</dt><dd>${ledger.standingBefore} → ${ledger.standingAfter}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : " (unchanged)"}. ${rankChange}</dd></div>
        <div><dt>Standing queries</dt><dd>${active} active of ${engine.state.watchCapacity} authorised · ${ledger.watchesScored} scored this shift · ${ledger.noticesAdded} notices raised</dd></div>
        <div><dt>Clock</dt><dd>${reports.length} report${reports.length === 1 ? "" : "s"} · ${ledger.runs} console run${ledger.runs === 1 ? "" : "s"} · ${ledger.hintsCalled} call${ledger.hintsCalled === 1 ? "" : "s"} to the supervisor · ${escapeHtml(minutesPhrase(ledger.minutesUnused))} unused</dd></div>
        <div><dt>Mastery</dt><dd>${ledger.conceptIds.length ? ledger.conceptIds.map((id) => `<span class="tag grey">${escapeHtml(index.concepts.get(id)?.competency ?? id)}</span>`).join(" ") : "No new demonstration was credited."}</dd></div>
      </dl>
      ${memos.length ? `<div class="ledger-post"><div class="envelope" aria-hidden="true"><span>M</span></div><div><p class="kicker">Arriving tomorrow</p><p>${memos.map((memo) => escapeHtml(`${memo.from}: ${memo.text}`)).join("<br>")}</p></div></div>` : ""}
      <div class="ledger-stamp" aria-hidden="true"><span>SHIFT</span><span>CLOSED</span><small>DESK 7</small></div>
      <button type="button" class="primary-button" data-action="dismiss-ledger" autofocus>${engine.locked() ? "Return to the desk" : `Begin Shift ${String(engine.state.shiftNumber).padStart(2, "0")}`}<small>${escapeHtml(engine.locked() ? "The console is closed" : `${nextShift.title} · ${calendarDate(nextShift.time)} · ${clockTime(nextShift.time)}`)}</small></button>
    </section>
  </dialog>`;
}
