import "./styles.css";
import { executeQuery } from "./query";
import { CampaignLoadError, loadCampaign } from "./loader";
import {
  GameEngine, createGameState, printableViews,
  type FiledReport, type GameState, type PrintOptions, type QueryControls, type SavedArtifact,
} from "./game";
import { clearPersistentState, loadPersistentState, storePersistentState } from "./persistence";
import {
  authoredQueryForm, executionControls, formForExecutionMode, formatUtcDateTimeLocal, parseUtcDateTimeLocal,
  navigateQueryHistory, queryHistoryDirection, type QueryFormState, type QueryHistoryNavigation,
} from "./query-controls";
import type { CampaignCase, CampaignIndex, Language, Visualization } from "./types";
import {
  calendarDate, clockTime, escapeHtml, face, highlightQuery, initials, minutesPhrase, wallClock,
} from "./ui/format";
import { renderPinnedStack, renderSlip, transcriptEntry } from "./ui/printouts";
import { renderDrawer, renderLedger, type DrawerName, type ShiftLedger } from "./ui/drawers";

const app = document.querySelector<HTMLDivElement>("#app")!;
const drawerNames: DrawerName[] = ["registry", "watches", "personnel", "archive", "keys"];

let index: CampaignIndex | undefined;
let engine: GameEngine | undefined;
let savedState: GameState | undefined;
let selectedItem = "";
let selectedArtifact = "";
let selectedReport = "";
let registryKind: "metrics" | "records" | "syntax" = "metrics";
let registrySearch = "";
let openDrawer: DrawerName | undefined;
let statusMessage = "";
let lastReplay: SavedArtifact | undefined;
let ledger: ShiftLedger | undefined;
let pendingFocus: string | undefined;
let shiftMarks = { artifacts: 0, hints: 0, memos: [] as string[] };

const expressions = new Map<string, string>();
const queryHistory = new Map<string, QueryHistoryNavigation>();
const languages = new Map<string, Language>();
const pinned = new Map<string, string[]>();
const queryForms = new Map<string, QueryFormState>();
const printBars = new Map<string, PrintOptions>();
const reportForms = new Map<string, { title: string; conclusion: string; decision: string }>();
const workSheets = new Map<string, "order" | "report">();
let pendingReveal: string | undefined;
let openSlip: string | undefined;
let hiddenHintCase = "";
let pendingPrint: string | undefined;
let openingScreen: "welcome" | "montage" | "appointment" | "complaint" = "welcome";
let montagePosition = 0;
let selectedAppointment = "";
let newspaperOpen = false;

/* ------------------------------------------------------------------ helpers */

function setStatus(message: string): void {
  statusMessage = message;
  const live = document.querySelector<HTMLElement>("#status-live");
  if (live) live.textContent = message;
}

let persistQueue = Promise.resolve();
function persist(): void {
  if (!index || !engine) return;
  savedState = structuredClone(engine.state);
  const currentIndex = index;
  const currentState = savedState;
  persistQueue = persistQueue
    .then(() => storePersistentState(currentIndex, currentState))
    .catch((error) => { setStatus(`Progress could not be saved. ${error instanceof Error ? error.message : String(error)}`); });
}

async function clearSave(): Promise<boolean> {
  if (!index) return false;
  try {
    await persistQueue;
    await clearPersistentState(index);
    savedState = undefined;
    return true;
  } catch (error) {
    window.alert(`Campaign progress could not be cleared. ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function guarded(action: () => void, success?: string): void {
  try {
    action();
    persist();
    if (success) statusMessage = success;
    render();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
}

function markShift(): void {
  if (!engine) return;
  shiftMarks = {
    artifacts: engine.state.artifacts.length,
    hints: Object.values(engine.state.revealedHints).reduce((sum, list) => sum + list.length, 0),
    memos: engine.state.memos.map((memo) => memo.id),
  };
}

function supervisorName(): string {
  const supervisor = index?.campaign.characters.find((character) => /supervisor/i.test(character.role));
  return supervisor?.name.split(" ").at(-1) ?? "the supervisor";
}

function currentCase(): CampaignCase | undefined {
  if (!engine || !index) return undefined;
  const inbox = engine.inbox();
  const selected = inbox.find((item) => item.id === selectedItem);
  if (selected?.kind === "case") return index.cases.get(selected.id);
  const cases = inbox.filter((item) => item.kind === "case");
  const open = cases.find((item) => !item.done) ?? cases.at(-1);
  return open ? index.cases.get(open.id) : undefined;
}

function defaultSelectedItem(): string {
  if (!engine) return "";
  const inbox = engine.inbox();
  return inbox.find((item) => item.kind === "case" && !item.done)?.id ?? inbox.find((item) => !item.done)?.id ?? inbox[0]?.id ?? "";
}

function caseFormKey(item: CampaignCase): string {
  return `${item.id}:${engine!.caseVariant(item.id).id}`;
}

function queryHistoryKey(item: CampaignCase): string {
  return `${item.id}:${languages.get(item.id) ?? item.languages[0]!}`;
}

function caseControls(item: CampaignCase): QueryFormState {
  const variant = engine!.caseVariant(item.id);
  const key = caseFormKey(item);
  const existing = queryForms.get(key);
  if (existing) return existing;
  const controls = authoredQueryForm(
    variant.evaluationTime ?? item.evaluationTime ?? engine!.currentShift().time,
    variant.rangeStart ?? item.rangeStart,
    variant.rangeEnd ?? item.rangeEnd,
    item.report.visualizations[0] ?? "table",
  );
  queryForms.set(key, controls);
  return controls;
}

function formFromControls(item: CampaignCase, expression = expressions.get(item.id) ?? "", language = languages.get(item.id) ?? item.languages[0]!): QueryFormState {
  const defaults = caseControls(item);
  const timestampValue = document.querySelector<HTMLInputElement>("#query-time")?.value;
  const timestamp = timestampValue ? (parseUtcDateTimeLocal(timestampValue) ?? defaults.timestamp) : defaults.timestamp;
  const range = defaults.range;
  const selectedMode = document.querySelector<HTMLElement>("[data-query-mode][aria-pressed=true]")?.dataset.queryMode
    ?? (defaults.visualization === "graph" ? "range" : defaults.visualization === "logs" ? "records" : "instant");
  const mode = language === "logql" && expression.trimStart().startsWith("{") ? "records" : selectedMode === "range" ? "range" : "instant";
  const form = formForExecutionMode({ timestamp, range, visualization: defaults.visualization }, mode);
  queryForms.set(caseFormKey(item), form);
  return form;
}

function controlsFromForm(item: CampaignCase, expression: string, language: Language): QueryControls {
  return executionControls(language, expression, formFromControls(item, expression, language));
}

const caseArtifacts = (caseId: string): SavedArtifact[] =>
  engine!.state.artifacts.filter((artifact) => artifact.caseId === caseId && !artifact.replayOfId);

const printedArtifacts = (caseId: string): SavedArtifact[] => caseArtifacts(caseId).filter((artifact) => artifact.print);

function targetArtifact(caseId: string): SavedArtifact | undefined {
  const list = caseArtifacts(caseId);
  return list.find((artifact) => artifact.id === selectedArtifact) ?? list.at(-1);
}

/** Views the result allows and Form R-7 accepts. Printing outside the pair is refused at filing. */
function offeredViews(item: CampaignCase, artifact: SavedArtifact | undefined): Visualization[] {
  if (!artifact) return item.report.visualizations;
  const allowed = printableViews(artifact);
  const shared = allowed.filter((view) => item.report.visualizations.includes(view));
  return shared.length ? shared : allowed;
}

function printBarKey(caseId: string, artifact?: SavedArtifact): string {
  return artifact?.authoredPrint ? `${caseId}:${artifact.id}` : caseId;
}

function printOptions(caseId: string, views: Visualization[], artifact = targetArtifact(caseId)): PrintOptions {
  const key = printBarKey(caseId, artifact);
  const base = printBars.get(key) ?? artifact?.authoredPrint
    ?? { visualization: views[0] ?? "table", showQuery: true, showLabels: true, showRange: true, zeroAxis: false };
  const options = views.includes(base.visualization) ? base : { ...base, visualization: views[0] ?? "table" };
  printBars.set(key, options);
  return options;
}

const price = (units: number): string => {
  const clock = engine?.clock();
  return clock ? `${Math.round(units * clock.minutesPerUnit)} min` : `${units} unit${units === 1 ? "" : "s"}`;
};

const chip = (text: string, tone = "sun"): string => `<span class="price ${tone}">${escapeHtml(text)}</span>`;

/* ------------------------------------------------------------ load screens */

function renderLoadError(error: unknown): void {
  const details = error instanceof CampaignLoadError ? error.problems : [error instanceof Error ? error.message : String(error)];
  app.innerHTML = `
    <main class="gate" id="main">
      <section class="gate-card">
        <p class="kicker">Civic terminal unavailable</p>
        <h1>The campaign pack was not accepted</h1>
        <p>The Ministry will not improvise around missing or invalid data.</p>
        <ul class="gate-problems">${details.slice(0, 30).map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>
        <label class="line-button" for="campaign-upload">Load a local campaign pack</label>
        <input id="campaign-upload" type="file" accept="application/json,.json" />
      </section>
    </main>`;
}

function renderWelcome(): void {
  if (!index) return;
  openingScreen = "welcome";
  const saved = savedState;
  app.innerHTML = `
    <main class="gate" id="main">
      <section class="gate-card welcome">
        <p class="kicker">Central Bureau of Measurable Happiness</p>
        <h1 class="display">All Is Well.</h1>
        <p class="gate-lede">${escapeHtml(index.campaign.title)}${index.campaign.subtitle ? `. ${escapeHtml(index.campaign.subtitle)}` : ""}</p>
        <p>Citizens submit symptoms. Infrastructure emits evidence. You decide what the evidence can support, and what the Ministry will hear.</p>
        <div class="gate-actions">
          ${saved ? `<button type="button" class="primary-button" data-action="continue">Continue shift ${saved.shiftNumber}<small>Your desk is as you left it</small></button>` : ""}
          <button type="button" class="${saved ? "line-button" : "primary-button"}" data-action="new-game">Begin a new appointment${saved ? "" : "<small>Assignment classification follows</small>"}</button>
        </div>
        ${statusMessage ? `<p class="gate-warning">${escapeHtml(statusMessage)}</p>` : ""}
        <p class="fine-print">Runs locally. Progress is saved in this browser.</p>
      </section>
  </main>`;
}

type NewspaperStoryView = { headline: string; body: string };

function newspaperSheet(date: string | undefined, headline: string, subhead = "", stories: NewspaperStoryView[] = []): string {
  const publication = index?.campaign.newspaper;
  return `<article class="newspaper-sheet">
    <header class="newspaper-masthead">
      <p>${escapeHtml(publication?.motto ?? "Every day, better than the last.")}</p>
      <h1>${escapeHtml(publication?.title ?? "The Contented Citizen")}</h1>
      <p>Approved national edition</p>
    </header>
    <div class="newspaper-rule"><span>${escapeHtml(date ?? "Special edition")}</span><span>Price · one cheerful thought</span></div>
    <section class="newspaper-lead">
      <div><h2>${escapeHtml(headline)}</h2>${subhead ? `<p>${escapeHtml(subhead)}</p>` : ""}</div>
      <div class="newspaper-picture" aria-hidden="true"><span class="paper-sun"></span><i></i><i></i><i></i><b>ALL IS WELL</b></div>
    </section>
    ${stories.length ? `<div class="newspaper-stories">${stories.map((story) => `<section><h3>${escapeHtml(story.headline)}</h3><p>${escapeHtml(story.body)}</p></section>`).join("")}</div>` : ""}
    <footer>Official circulation.</footer>
  </article>`;
}

function renderOpeningMontage(): void {
  if (!index) return;
  const cards = index.campaign.opening.montage ?? [];
  if (!cards.length) { openingScreen = "appointment"; renderAppointmentDesk(); return; }
  const card = cards[Math.min(montagePosition, cards.length - 1)]!;
  const last = montagePosition >= cards.length - 1;
  app.innerHTML = `<main class="opening-stage" id="main">
    <div class="montage-paper">${newspaperSheet(card.date, card.headline, card.body ?? "")}</div>
    <div class="montage-controls">
      <p>ARCHIVE REEL ${montagePosition + 1} / ${cards.length}</p>
      <button type="button" class="primary-button" data-action="montage-next">${last ? "Report to the appointment desk" : "Next edition"}</button>
      ${last ? "" : `<button type="button" class="line-button" data-action="montage-skip">Skip archive reel</button>`}
    </div>
  </main>`;
}

function renderAppointmentDesk(): void {
  if (!index) return;
  const appointments = index.campaign.opening.appointments ?? [];
  if (!appointments.length) { startGame(false); return; }
  if (!appointments.some((appointment) => appointment.id === selectedAppointment)) selectedAppointment = appointments[0]!.id;
  const appointment = appointments.find((candidate) => candidate.id === selectedAppointment)!;
  app.innerHTML = `<main class="appointment-stage" id="main">
    <section class="appointment-desk">
      <header><p class="kicker">Central Appointment Office · Classification required</p><h1 class="display">Your service begins here.</h1></header>
      <nav class="packet-tabs" aria-label="Choose assignment classification">
        ${appointments.map((candidate) => `<button type="button" data-appointment="${escapeHtml(candidate.id)}" aria-pressed="${candidate.id === appointment.id}" class="${candidate.id === appointment.id ? "on" : ""}">${escapeHtml(candidate.title)}<small>${escapeHtml(candidate.subtitle ?? "")}</small></button>`).join("")}
      </nav>
      <article class="appointment-packet">
        <header><span>MINISTRY OF CONTENTMENT · PERSONNEL PLACEMENT</span><b>OFFICIAL COPY</b></header>
        <h2>${escapeHtml(appointment.title)}</h2>
        ${appointment.subtitle ? `<p class="packet-subtitle">${escapeHtml(appointment.subtitle)}</p>` : ""}
        <div class="packet-body">${appointment.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
        <div class="packet-signature"><span>Placement signature</span><i></i><b>YOUR MARK HERE</b></div>
        <div class="packet-fine-print">${appointment.finePrint.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>
        <footer>
          <button type="button" class="primary-button" data-action="accept-appointment">${escapeHtml(appointment.agreeLabel)}</button>
          <button type="button" class="line-button danger" data-action="complain-appointment">${escapeHtml(appointment.complaintLabel)}</button>
        </footer>
      </article>
    </section>
  </main>`;
}

function renderComplaintEnding(): void {
  if (!index || !engine?.state.endingId) return;
  const ending = index.endings.get(engine.state.endingId);
  if (!ending) return;
  app.innerHTML = `<main class="complaint-stage" id="main">
    <section class="complaint-card">
      <p class="kicker">Ministry of Complaints · final disposition</p>
      <div class="complaint-stamp">MOTION<br>ACCEPTED</div>
      <h1 class="display">${escapeHtml(ending.title)}</h1>
      <p>${escapeHtml(ending.body)}</p>
      <p class="ending-label">GAME OVER · FINAL DISPOSITION</p>
      <button type="button" class="primary-button" data-action="return-appointment">Return to appointment desk</button>
    </section>
  </main>`;
}

function renderOpening(): void {
  if (openingScreen === "montage") renderOpeningMontage();
  else if (openingScreen === "appointment") renderAppointmentDesk();
  else if (openingScreen === "complaint") renderComplaintEnding();
  else renderWelcome();
}

function renderNewspaperOverlay(): string {
  if (!engine || !newspaperOpen) return "";
  const edition = engine.currentNewspaper();
  if (!edition) return "";
  return `<dialog class="overlay newspaper-view" id="overlay-newspaper" aria-label="${escapeHtml(index?.campaign.newspaper?.title ?? "The Contented Citizen")}">
    ${newspaperSheet(edition.date, edition.headline, edition.subhead ?? "", edition.stories ?? [])}
    <button type="button" class="primary-button fold-newspaper" data-action="fold-newspaper">Fold paper and begin work</button>
  </dialog>`;
}

/* ------------------------------------------------------------------- banner */

function renderBanner(): string {
  const engineRef = engine!;
  const indexRef = index!;
  const shift = engineRef.currentShift();
  const clock = engineRef.clock();
  const act = indexRef.acts.get(shift.actId);
  const bands = indexRef.campaign.standing.bands;
  const reached = bands.reduce((best, band, position) => engineRef.state.standing >= band.minimum ? position : best, 0);
  const rank = indexRef.ranks.get(engineRef.state.rankId);
  const shiftStart = Date.parse(clock?.shiftStart ?? shift.time);
  const usedMinutes = clock ? clock.used * clock.minutesPerUnit : 0;
  const nowStamp = new Date(shiftStart + usedMinutes * 60000).toISOString();
  const endStamp = new Date(shiftStart + (clock?.shiftMinutes ?? 540) * 60000).toISOString();
  const remaining = clock ? clock.remaining * clock.minutesPerUnit : 0;
  const used = clock && clock.budget ? Math.min(100, (clock.used / clock.budget) * 100) : 0;
  return `<header class="banner">
    <div class="clock-block">
      ${wallClock(Number(nowStamp.slice(11, 13)), Number(nowStamp.slice(14, 16)))}
      <div>
        <p class="clock-now">${escapeHtml(clockTime(nowStamp))}</p>
        ${clock ? `<p class="clock-note">Shift ends ${escapeHtml(clockTime(endStamp))} · ${escapeHtml(minutesPhrase(remaining))} left</p>
        <div class="clock-bar"><i style="width:${used.toFixed(1)}%"></i></div>
        <p class="clock-hint">Every action on the desk costs minutes.</p>` : `<p class="clock-note">${escapeHtml(calendarDate(shift.time))}</p>`}
      </div>
    </div>
    <div class="headline">
      <h1 class="display">All Is Well.</h1>
      <p>${escapeHtml(act?.name ?? "Reconciliation")} · Desk 7 · ${escapeHtml(shift.title)}</p>
    </div>
    <div class="standing-block">
      <p class="standing-label" id="standing-label">Ministry standing</p>
      <div class="faces" role="img" aria-labelledby="standing-label" aria-label="Standing ${engineRef.state.standing}, band ${escapeHtml(bands[reached]?.name ?? "unclassified")}">
        ${bands.map((band, position) => `<span class="face">${face(position, bands.length, position === reached)}<small>${escapeHtml(band.name)}</small></span>`).join("")}
      </div>
      <p class="standing-line">${engineRef.state.standing} · ${escapeHtml(bands[reached]?.name ?? "Unclassified")} · ${escapeHtml(rank?.name ?? engineRef.state.rankId)}</p>
    </div>
  </header>`;
}

/* ------------------------------------------------------------------ in tray */

const caseCode = (id: string): string => `WO-${/\.(\d+)\./.exec(id)?.[1] ?? id.slice(0, 3).toUpperCase()}`;

function trayCard(item: ReturnType<GameEngine["inbox"]>[number], position: number, active: boolean, locked: boolean): string {
  const engineRef = engine!;
  const indexRef = index!;
  let kicker = "";
  let title = item.title;
  let note = "";
  let avatar = `<span class="avatar navy">M</span>`;
  let tone = "official";
  if (item.kind === "case") {
    const record = indexRef.cases.get(item.id);
    kicker = caseCode(item.id);
    title = record?.title ?? item.title;
    note = `${record?.difficulty ?? ""}${record ? ` · ${record.report.minArtifacts} printout${record.report.minArtifacts === 1 ? "" : "s"}` : ""}`;
    tone = "case";
    avatar = `<span class="avatar plain" aria-hidden="true">${face(3, 5, false)}</span>`;
  } else if (item.kind === "memo") {
    const memo = engineRef.state.memos.find((candidate) => candidate.id === item.id);
    kicker = memo?.from ?? "The Ministry";
    note = memo ? `${escapeHtml(calendarDate(memo.campaignTime))} · shift ${memo.shiftNumber}` : "";
    tone = /assurance/i.test(memo?.from ?? "") ? "assurance" : "memo";
    avatar = `<span class="avatar ${tone === "assurance" ? "pink" : "sun"}">${escapeHtml(initials(memo?.from ?? "Ministry"))}</span>`;
  } else if (item.kind === "notice") {
    kicker = "Standing-query notice";
    tone = "notice";
    avatar = `<span class="avatar mint">SQ</span>`;
  } else if (item.kind === "watch-error") {
    kicker = "Standing query failed";
    tone = "fault";
    avatar = `<span class="avatar coral">!</span>`;
  } else {
    kicker = item.kind;
    note = item.done ? "acknowledged" : "sealed · read before the shift closes";
  }
  const disabled = locked && !item.id.startsWith("memo.");
  return `<li>
    <button type="button" class="tray-card ${tone} ${active ? "now" : ""} ${item.done ? "done" : ""} ${disabled ? "off" : ""}"
      data-inbox="${escapeHtml(item.id)}" tabindex="${active ? 0 : -1}" aria-current="${active}"${position < 5 ? ` data-tray-index="${position + 1}"` : ""}>
      ${avatar}
      <span class="tray-text">
        <span class="kicker">${escapeHtml(kicker)}</span>
        <span class="tray-title">${escapeHtml(title)}</span>
        ${note ? `<span class="tray-note">${note}</span>` : ""}
      </span>
      ${item.done ? `<span class="done-mark" aria-label="complete">✓</span>` : active ? `<span class="now-pill">NOW</span>` : ""}
    </button>
  </li>`;
}

function renderTray(): string {
  const engineRef = engine!;
  const locked = engineRef.locked();
  const inbox = engineRef.inbox();
  const open = inbox.filter((item) => !item.done).length;
  const item = currentCase();
  const nextHint = item ? item.hints.findIndex((_hint, position) => !engineRef.isHintRevealed(item.id, position)) : -1;
  const shift = engineRef.currentShift();
  const edition = engineRef.currentNewspaper();
  const timedOut = engineRef.clockExpired() && !engineRef.shiftWorkComplete();
  return `<section class="tray" aria-label="In tray">
    <header class="tray-head"><h2 class="display">In tray</h2><p>${escapeHtml(shift.title)} · ${open} open</p></header>
    ${edition ? `<button type="button" class="newspaper-fold" data-action="open-newspaper"><span>${escapeHtml(index?.campaign.newspaper?.title ?? "The Contented Citizen")}</span><b>${escapeHtml(edition.headline)}</b><small>${engineRef.newspaperRead(edition.id) ? "Filed for reference" : "Morning edition · unread"}</small></button>` : ""}
    <ul class="tray-list" role="list" id="tray-list">${inbox.map((entry, position) => trayCard(entry, position, entry.id === selectedItem, locked)).join("")}</ul>
    <div class="tray-foot">
      <button type="button" class="call-button" data-action="hint" ${locked || !item || nextHint < 0 ? "disabled" : ""}>
        <svg width="22" height="22" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M 8 6 C 6 6 4 8 4 10 C 4 24 16 36 30 36 C 32 36 34 34 34 32 L 34 27 L 26 24 L 22 28 C 17 26 14 23 12 18 L 16 14 L 13 6 Z" fill="#fffdf7"/></svg>
        <span>Call ${escapeHtml(supervisorName())}<small>${locked ? "line closed" : nextHint < 0 ? "no further help on this case" : "no time cost · may limit mastery"}</small></span>
        ${chip("no time", "mint")}
      </button>
      <button type="button" class="registry-button" data-drawer="registry">
        <span class="registry-spine" aria-hidden="true"></span>
        <span>Registry<small>metrics · records · syntax</small></span>
        ${chip("free", "mint")}
      </button>
      <div class="cabinet">
        <button type="button" class="line-button" data-drawer="watches">Standing queries <b>${engineRef.state.watches.filter((watch) => watch.state === "active").length}/${engineRef.state.watchCapacity}</b></button>
        <button type="button" class="line-button" data-drawer="personnel">Personnel file</button>
        <button type="button" class="line-button" data-drawer="archive">Archive <b>${engineRef.state.reports.length}</b></button>
        <button type="button" class="line-button" data-drawer="keys">Keys <kbd>?</kbd></button>
      </div>
      <button type="button" class="primary-button end-shift" data-action="end-shift" ${locked || !engineRef.canAdvance() ? "disabled" : ""}>
        End shift<small>${locked ? "the console is closed" : timedOut ? "time expired · close with work incomplete" : engineRef.canAdvance() ? "the ledger is ready" : "finish the work orders first"}</small>
      </button>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ console */

function renderConsole(): string {
  const engineRef = engine!;
  const locked = engineRef.locked();
  const item = currentCase();
  if (!item) {
    return `<section class="console-column">
      <div class="monitor"><div class="console-screen" id="main" tabindex="-1">
        <div class="crt-head"><span>MINISTRY TELEMETRY CONSOLE 3.1</span><span>DESK 7</span></div><hr>
        <p class="crt-line">${locked ? "SESSION ENDED · LOGGED OUT" : "NO WORK ORDER IS OPEN AT THIS DESK."}</p>
      </div></div>
    </section>`;
  }
  const artifacts = caseArtifacts(item.id);
  const printed = printedArtifacts(item.id);
  const chosen = pinned.get(item.id) ?? [];
  const target = targetArtifact(item.id);
  const loosePrints = printed.filter((artifact) => !chosen.includes(artifact.id));
  const visiblePrint = loosePrints.find((artifact) => artifact.id === target?.id) ?? loosePrints.at(-1);
  const views = offeredViews(item, target);
  const options = printOptions(item.id, views, target);
  const controls = caseControls(item);
  const language = languages.get(item.id) ?? item.languages[0]!;
  languages.set(item.id, language);
  const expression = expressions.get(item.id) ?? "";
  const recordsMode = language === "logql" && expression.trimStart().startsWith("{");
  const mode = recordsMode ? "records" : controls.visualization === "graph" ? "range" : "instant";
  const filed = engineRef.state.completedCases.includes(item.id);
  const disabled = locked || filed;
  const clearance = item.id.startsWith("case.clearance.");
  const ranges: [number, string][] = [[900, "15m"], [3600, "1h"], [7200, "2h"], [21600, "6h"], [86400, "24h"]];
  const switches: [keyof PrintOptions, string][] = [["showQuery", "Query"], ["showLabels", "Labels"], ["showRange", "Range"], ["zeroAxis", "Zero axis"]];
  const ending = engineRef.state.endingId ? index!.endings.get(engineRef.state.endingId) : undefined;
  return `<section class="console-column">
    <div class="monitor ${locked ? "off" : ""}">
      <div class="console-screen" id="main" tabindex="-1">
        <div class="crt-head"><span>MINISTRY TELEMETRY CONSOLE 3.1</span><span>DESK 7</span></div><hr>
        ${locked ? `<p class="crt-line crt-dim">SESSION ENDED · ${escapeHtml(clockTime(engineRef.currentShift().time))}</p>
          <p class="crt-line">${escapeHtml(ending?.title ?? "PERSONNEL FILE SEVEN · LOGGED OUT")}</p>
          <p class="crt-line">${escapeHtml(ending?.winning ? "Authority transferred. This desk now answers to you." : "Your final disposition is filed in the tray.")}</p>
          ${printed.length ? `<p class="crt-line">Printout${printed.length === 1 ? " #1 is" : `s #1 to #${printed.length} are`} retained in the archive.</p>` : ""}
          <p class="crt-line crt-dim">SESSION CLOSED</p>`
    : `${artifacts.map((artifact) => transcriptEntry(artifact, artifact.id === target?.id,
      artifact.print ? printed.indexOf(artifact) + 1 : undefined)).join("")}
        ${artifacts.length ? "" : `<p class="crt-line crt-dim">Write a query and run it. Results stay private until you print and pin them.</p>`}
        <div class="crt-input"><span class="crt-prompt">&gt;</span>
          <div class="crt-editor"><pre aria-hidden="true"><code id="syntax-code">${highlightQuery(expression)}</code></pre><textarea id="query-input" rows="2" spellcheck="false" aria-label="${escapeHtml(language)} query" placeholder="${language === "promql" ? "Type PromQL here" : "Type LogQL here"}" ${disabled ? "disabled" : ""}>${escapeHtml(expression)}</textarea></div>
        </div>`}
      </div>
    </div>
    <div class="pc-unit ${locked ? "off" : ""}">
      <div class="console-toolbar ${clearance ? "clearance" : ""}">
        ${clearance ? `<span class="toolbar-static">PromQL · instant query</span><span class="toolbar-note">Training time and table view are fixed for clearance.</span>` : `
          ${item.languages.length > 1 ? `<div class="toolbar-choice"><span>Language</span><div class="mini-segments">${item.languages.map((value) => `<button type="button" data-query-language="${value}" aria-pressed="${value === language}" class="${value === language ? "on" : ""}" ${disabled ? "disabled" : ""}>${value === "promql" ? "PromQL" : "LogQL"}</button>`).join("")}</div></div>` : `<span class="toolbar-static">${language === "promql" ? "PromQL" : "LogQL"}</span>`}
          <label>Evaluated at<input id="query-time" type="datetime-local" step="1" value="${formatUtcDateTimeLocal(controls.timestamp)}" ${disabled ? "disabled" : ""} /></label>
          <div class="toolbar-choice"><span>Run as</span><div class="mini-segments"><button type="button" data-query-mode="instant" aria-pressed="${mode === "instant"}" class="${mode === "instant" ? "on" : ""}" ${disabled || recordsMode ? "disabled" : ""}>Instant</button><button type="button" data-query-mode="range" aria-pressed="${mode === "range"}" class="${mode === "range" ? "on" : ""}" ${disabled || recordsMode ? "disabled" : ""}>Range</button>${language === "logql" ? `<button type="button" data-query-mode="records" aria-pressed="${mode === "records"}" class="${mode === "records" ? "on" : ""}" disabled>Records</button>` : ""}</div></div>
          <div class="toolbar-choice window-choice"><span>Window</span><div class="mini-segments">${ranges.map(([seconds, label]) => `<button type="button" data-query-range="${seconds}" aria-pressed="${controls.range === seconds}" class="${controls.range === seconds ? "on" : ""}" ${disabled ? "disabled" : ""}>${label}</button>`).join("")}</div></div>
          <button type="button" class="line-button" data-action="reset-query-context" ${disabled ? "disabled" : ""}>Reset time</button>`}
      </div>
      <div class="print-bar" id="print-bar" role="group" aria-label="Print bar">
        <div class="views" role="group" aria-label="Print view">
          ${(["stat", "table", "graph", "logs"] as Visualization[]).map((view, position) => `<button type="button" class="seg ${options.visualization === view ? "on" : ""}" data-view="${view}" aria-pressed="${options.visualization === view}" ${disabled || !views.includes(view) ? "disabled" : ""}><span class="seg-key" aria-hidden="true">${position + 1}</span>${view === "stat" ? "Stat" : view === "table" ? "Table" : view === "graph" ? "Graph" : "Logs"}</button>`).join("")}
        </div>
        <div class="console-actions">
          <button type="button" class="run-button" data-action="run-query" ${disabled ? "disabled" : ""}>Run ${chip(price(engineRef.actionCost("validQuery")))}</button>
        </div>
      </div>
    </div>
    <div class="printer ${locked ? "off" : ""}">
      <span class="printer-label">Result printer</span>
      <div class="switches" role="group" aria-label="What the slip carries">
        ${switches.map(([key, label]) => `<button type="button" class="tog ${options[key] ? "on" : "off"}" data-switch="${key}" aria-pressed="${Boolean(options[key])}" ${disabled ? "disabled" : ""}>${escapeHtml(label)}</button>`).join("")}
      </div>
      <div class="slot-row">
        <div class="printer-slot" aria-hidden="true"></div>
        <button type="button" class="print-button" data-action="print-artifact" ${disabled || !target ? "disabled" : ""}>Print ${chip(price(engineRef.actionCost("printArtifact")))}</button>
        <span class="printer-led" aria-hidden="true"></span>
      </div>
    </div>
    <div class="slips">${visiblePrint
      ? renderSlip(visiblePrint, printed.indexOf(visiblePrint) + 1, -1, locked || filed, visiblePrint.filed)
      : printed.length ? "" : `<p class="slips-empty">Nothing printed yet.</p>`}</div>
  </section>`;
}

/* -------------------------------------------------------------- work column */

function documentCard(): string {
  const engineRef = engine!;
  const indexRef = index!;
  const entry = engineRef.inbox().find((item) => item.id === selectedItem);
  if (!entry || entry.kind === "case") return "";
  if (entry.kind === "memo") {
    const memo = engineRef.state.memos.find((candidate) => candidate.id === entry.id);
    if (!memo) return "";
    const ending = memo.endingId ? indexRef.endings.get(memo.endingId) : undefined;
    const assurance = /assurance/i.test(memo.from);
    return `<article class="note-card ${assurance ? "assurance" : ""}">
      <header><span class="avatar ${assurance ? "pink" : "sun"}">${escapeHtml(initials(memo.from))}</span>
        <div><h2>${escapeHtml(ending?.title ?? `A note from ${memo.from}`)}</h2><p>${escapeHtml(memo.from)} · ${escapeHtml(calendarDate(memo.campaignTime))} · ${escapeHtml(clockTime(memo.campaignTime))}</p></div></header>
      <div class="note-body"><p>${escapeHtml(memo.text)}</p></div>
      <footer><span>No reply is required.</span>
        <button type="button" class="line-button" data-action="read-item" data-id="${escapeHtml(memo.id)}" ${memo.read ? "disabled" : ""}>${memo.read ? "Acknowledged" : "Acknowledge"}</button>
      </footer>
    </article>`;
  }
  if (entry.kind === "notice") {
    const notice = engineRef.state.notices.find((candidate) => candidate.id === entry.id)!;
    return `<article class="note-card notice">
      <header><span class="avatar mint">SQ</span><div><h2>${escapeHtml(entry.title)}</h2><p>Standing-query notice · generation ${notice.generation}</p></div></header>
      <div class="note-body">
        <dl class="fact-grid"><div><dt>First seen</dt><dd>${escapeHtml(clockTime(notice.firstSeen))} ${escapeHtml(calendarDate(notice.firstSeen))}</dd></div><div><dt>Last seen</dt><dd>${escapeHtml(clockTime(notice.lastSeen))} ${escapeHtml(calendarDate(notice.lastSeen))}</dd></div><div><dt>Occurrences</dt><dd>${notice.occurrenceCount}</dd></div><div><dt>Candidate records</dt><dd>${notice.candidateCount}</dd></div></dl>
        <p><b>Matched result:</b> <code>${escapeHtml(notice.summary)}</code></p>
        <p><b>Surviving location and scope:</b> ${Object.entries(notice.localization).map(([key, value]) => `<span class="lab">${escapeHtml(key)}=${escapeHtml(value)}</span>`).join("") || "none"}</p>
        <p><b>Attributed events:</b> ${notice.eventIds.length ? notice.eventIds.map(escapeHtml).join(", ") : "none. This is a false-positive candidate."}</p>
      </div>
    </article>`;
  }
  if (entry.kind === "watch-error") {
    const [watchId, checkpointId] = entry.id.split(":");
    const error = engineRef.state.watchErrors.find((candidate) => candidate.watchId === watchId && candidate.checkpointId === checkpointId);
    return `<article class="note-card fault">
      <header><span class="avatar coral">!</span><div><h2>${escapeHtml(error?.message ?? "A checkpoint did not run")}</h2><p>Standing query ${escapeHtml(watchId ?? "")} · checkpoint ${escapeHtml(checkpointId ?? "")}</p></div></header>
      <div class="note-body"><p>This run created no notice and changed no notice lifecycle. The next successful checkpoint resumes from the last successful cursor.</p></div>
    </article>`;
  }
  const narrative = indexRef.narrativeItems.get(entry.id);
  if (!narrative) return "";
  return `<article class="note-card official">
    <header><span class="avatar navy">M</span><div><h2>${escapeHtml(narrative.title)}</h2><p>${escapeHtml(narrative.kind)} · official circulation</p></div></header>
    <div class="note-body"><p>${escapeHtml(narrative.body)}</p></div>
    <footer><span>Read before the shift closes.</span>
      <button type="button" class="line-button" data-action="read-item" data-id="${escapeHtml(narrative.id)}" ${entry.done || engineRef.locked() ? "disabled" : ""}>${entry.done ? "Acknowledged" : "Acknowledge and file"}</button>
    </footer>
  </article>`;
}

function workOrderCard(item: CampaignCase): string {
  const engineRef = engine!;
  const adaptive = engineRef.adaptiveReason(item.id);
  const workOrderScope = engineRef.caseVariant(item.id).workOrderScope;
  const workOrderScopeHtml = workOrderScope.split("\n").map((line) => escapeHtml(line).replace(/`([^`]+)`/g, "<code>$1</code>")).join("<br>");
  const requester = index!.campaign.characters.find((character) => character.id === item.requesterId);
  const sender = requester ? `${requester.name}, ${requester.role}` : "The Ministry";
  const shiftTime = engineRef.currentShift().time;
  const fromLine = requester ? `${requester.name.split(" ").at(-1)}, ${requester.name.replace(/^Dr\.? /, "")[0]}. · ${requester.role}` : sender;
  return `<article class="work-order">
    <header class="paper-head">
      <div class="paper-title"><span>Ministry of Contentment · Field work order</span><b>${escapeHtml(caseCode(item.id))}</b></div>
      <dl class="paper-meta">
        <dt>From</dt><dd>${escapeHtml(fromLine)}</dd><dd class="right">${escapeHtml(calendarDate(shiftTime))} · ${escapeHtml(clockTime(shiftTime))}</dd>
        <dt>Re</dt><dd>${escapeHtml(item.title)} · ${escapeHtml(item.difficulty)} · ${item.report.minArtifacts} printout${item.report.minArtifacts === 1 ? "" : "s"}</dd><dd class="right red">${escapeHtml(item.languages.map((value) => value === "promql" ? "PromQL" : "LogQL").join(" and "))}</dd>
      </dl>
    </header>
    <div class="work-body">
      <p>${escapeHtml(item.briefing)}</p>
      <p class="work-scope"><b>Your task:</b><br>${workOrderScopeHtml}</p>
      <p class="work-question"><b>What is needed:</b> ${escapeHtml(item.question)}</p>
      ${adaptive ? `<p class="work-practice">Targeted practice. ${escapeHtml(adaptive)}</p>` : ""}
      <section class="hypotheses" aria-label="Claims to compare">
        <h3>Claims to compare</h3>
        ${item.hypotheses.map((hypothesis, position) => `<p><b>${String.fromCharCode(65 + position)} · ${escapeHtml(hypothesis.title.replace(`${item.title}: `, ""))}</b><span>${escapeHtml(hypothesis.summary)}</span></p>`).join("")}
      </section>
    </div>
    <footer>Attach ${item.report.minArtifacts} printout${item.report.minArtifacts === 1 ? "" : "s"}, then stamp Form R-7.</footer>
  </article>`;
}

function hintBody(text: string): string {
  return text.split(/\n+/).filter(Boolean).map((line) => {
    const wholeQuery = line.match(/^`([^`]+)`$/);
    if (wholeQuery) return `<code class="sticky-query">${escapeHtml(wholeQuery[1])}</code>`;
    const safe = escapeHtml(line).replace(/`([^`]+)`/g, "<code>$1</code>");
    return `<p>${safe}</p>`;
  }).join("");
}

function hintNotes(item: CampaignCase): string {
  const engineRef = engine!;
  const revealed = item.hints.map((hint, position) => ({ hint, position })).filter(({ position }) => engineRef.isHintRevealed(item.id, position));
  if (!revealed.length || hiddenHintCase === item.id) return "";
  const latest = revealed.at(-1)!;
  return `<aside class="sticky-note"><header><p class="kicker">Notes from ${escapeHtml(supervisorName())} · ${revealed.length} of ${item.hints.length}</p><button type="button" data-action="hide-hint" aria-label="Put away these hints">×</button></header>
    ${revealed.map(({ hint, position }) => {
      const example = position === latest.position && hint.level === "Worked" && engineRef.state.assistance[item.id] === "Worked";
      if (position === latest.position) return `<div class="hint-current">${example ? workedEvidence(item) : `${hintBody(hint.text)}${hint.query ? `<code class="sticky-query">${escapeHtml(hint.query)}</code>` : ""}`}</div>`;
      const lead = hint.text.split(/\n|(?<=[.!?])\s/, 1)[0]!.replaceAll("`", "");
      return `<details class="hint"><summary><span>Earlier note ${position + 1}</span><span class="hint-lead">${escapeHtml(lead)}</span></summary>${hintBody(hint.text)}</details>`;
    }).join("")}
  </aside>`;
}

/** The whole printout, opened from a curled slip. The dialog itself scrolls, so the card moves as one piece. */
function slipOverlay(): string {
  if (!openSlip || !engine) return "";
  const artifact = engine.state.artifacts.find((candidate) => candidate.id === openSlip);
  if (!artifact?.print) return "";
  const printed = printedArtifacts(artifact.caseId);
  const chosen = pinned.get(artifact.caseId) ?? [];
  return `<dialog class="overlay slip-view" id="overlay-slip" aria-label="Printout ${printed.indexOf(artifact) + 1}">
    <div class="slip-view-body">${renderSlip(artifact, printed.indexOf(artifact) + 1, chosen.indexOf(artifact.id), true, artifact.filed)}<button type="button" class="line-button" data-action="close-slip">Close</button></div>
  </dialog>`;
}

function workedEvidence(item: CampaignCase): string {
  const artifacts = engine!.caseVariant(item.id).workedEvidenceSet.artifacts;
  return `<div class="worked-evidence">
    ${artifacts.map((artifact, position) => `<div class="worked-step"><p><b>${position + 1} of ${artifacts.length}</b> ${escapeHtml(artifact.explanation)}</p><code>${escapeHtml(artifact.query)}</code><button type="button" class="line-button" data-action="run-worked-artifact" data-index="${position}" ${engine!.locked() ? "disabled" : ""}>Run this query</button></div>`).join("")}
  </div>`;
}

function choiceTag(state: string | undefined): string {
  if (state === "supported") return `<span class="tag mint">Reflects printouts</span>`;
  if (state === "partial") return `<span class="tag grey">Partly reflects printouts</span>`;
  if (state === "unsupported" || state === "error") return `<span class="tag grey">Exceeds printouts</span>`;
  return "";
}

function renderForm(item: CampaignCase): string {
  const engineRef = engine!;
  const indexRef = index!;
  const locked = engineRef.locked();
  const chosen = pinned.get(item.id) ?? [];
  const form = reportForms.get(item.id) ?? { title: "", conclusion: "", decision: "" };
  reportForms.set(item.id, form);
  const preview = engineRef.reportPreview(item.id, chosen);
  const printed = printedArtifacts(item.id);
  const attached = chosen.map((id) => printed.find((artifact) => artifact.id === id)).filter((artifact): artifact is SavedArtifact => Boolean(artifact));
  const complete = chosen.length >= item.report.minArtifacts && Boolean(form.title && form.conclusion && form.decision);
  const guidance = indexRef.acts.get(item.actId)?.reportPresentation.guidance ?? "";
  const showChoiceFeedback = item.id.startsWith("case.clearance.");
  const group = (name: string, legend: string, choices: { id: string; text: string }[], selected: string, tags: (id: string) => string) => `
    <fieldset class="choice-group">
      <legend class="kicker">${escapeHtml(legend)}</legend>
      <div class="choice-options">
        ${choices.map((choice) => `<label class="choice ${selected === choice.id ? "picked" : ""}"><input type="radio" name="${name}" value="${escapeHtml(choice.id)}" ${selected === choice.id ? "checked" : ""} ${locked ? "disabled" : ""}><span class="choice-text">${escapeHtml(choice.text)}</span>${selected === choice.id ? tags(choice.id) : ""}</label>`).join("")}
      </div>
    </fieldset>`;
  return `<form class="form-r7" id="report-form">
    <header class="paper-head"><div class="paper-title"><span>Official report · Form R-7</span><b>${escapeHtml(caseCode(item.id))}</b></div></header>
    <p class="form-guidance">${escapeHtml(guidance)}</p>
    ${renderPinnedStack(attached, printed, selectedArtifact, locked)}
    ${group("report-title", "Title", item.report.titles, form.title, (id) => showChoiceFeedback ? choiceTag(preview.titles[id]) : "")}
    ${group("report-conclusion", "Conclusion", item.report.conclusions, form.conclusion, (id) => showChoiceFeedback ? choiceTag(preview.conclusions[id]) : "")}
    ${group("report-decision", "Recommended action", item.decisionChoices, form.decision, () => "")}
    <footer class="form-foot">
      <p>Evidence attached · <b>${chosen.length}</b> of ${item.report.minArtifacts} required · up to ${item.report.maxArtifacts}</p>
      <p class="stamp-box"><span>Stamp here</span>${chip(price(engineRef.actionCost("fileReport")))}</p>
    </footer>
    <button type="submit" class="file-stamp" data-action="file-report" ${locked || !complete ? "disabled" : ""} aria-describedby="file-stamp-note">
      <span class="stamp-handle" aria-hidden="true"></span><span class="stamp-base" aria-hidden="true"></span><span class="stamp-face">FILE</span>
    </button>
    <p id="file-stamp-note" class="sr-only">${complete ? `Files the report and spends ${price(engineRef.actionCost("fileReport"))}.` : `Pin ${item.report.minArtifacts} printed slips and choose a title, conclusion, and action first.`}</p>
  </form>`;
}

function renderFiledReport(item: CampaignCase, report: FiledReport): string {
  const engineRef = engine!;
  const indexRef = index!;
  const presentation = indexRef.acts.get(item.actId)!.reportPresentation;
  const title = item.report.titles.find((choice) => choice.id === report.titleChoiceId)?.text;
  const conclusion = item.report.conclusions.find((choice) => choice.id === report.conclusionChoiceId)?.text;
  const decision = item.decisionChoices.find((choice) => choice.id === report.decisionChoiceId)?.text;
  const artifacts = report.artifactIds.map((id) => engineRef.state.artifacts.find((artifact) => artifact.id === id)).filter((value): value is SavedArtifact => Boolean(value));
  const watchArtifacts = [...new Map(artifacts.map((artifact) => [JSON.stringify([artifact.language, artifact.expression, artifact.controls]), artifact])).values()];
  const hasWatch = engineRef.state.watches.some((watch) => watch.reportId === report.id);
  const standingChange = [...engineRef.state.standingHistory].reverse().find((change) => change.reason.startsWith(`${item.title}:`));
  const standingResult = standingChange
    ? `<p class="standing-result ${standingChange.delta > 0 ? "gain" : "loss"}">Ministry Standing ${standingChange.delta > 0 ? "+" : ""}${standingChange.delta}</p>`
    : "";
  return `<article class="filed-report" tabindex="-1">
    <span class="filed-stamp" aria-hidden="true">${report.pendingWatch ? "PENDING" : "FILED"}</span>
    <p class="kicker">Official report · ${escapeHtml(clockTime(report.campaignTime))} · ${escapeHtml(calendarDate(report.campaignTime))}</p>
    <h2 class="display">${escapeHtml(title)}</h2>
    <p class="filed-conclusion">${escapeHtml(conclusion)}</p>
    <p><b>Ordered action:</b> ${escapeHtml(decision)}</p>
    <div class="verdicts">
      <section class="verdict technical"><p class="kicker">Technical record</p><h3>${escapeHtml(report.pendingWatch ? "awaiting checkpoints" : report.evidence)}</h3><p>${escapeHtml(report.technicalExplanation)}</p></section>
      <section class="verdict ministry"><p class="kicker">${escapeHtml(presentation.responseLabel)}</p><h3>${escapeHtml(report.pendingWatch ? "Decision pending" : presentation.responseHeading)}</h3><p>${escapeHtml(report.ministryResponse)}</p>${standingResult}</section>
    </div>
    <p class="filed-evidence">${artifacts.length} printout${artifacts.length === 1 ? "" : "s"} filed · ${escapeHtml(report.visualization)} view · full record in Archive</p>
    ${item.watchScenarioId ? `<div class="watch-offer">
      <p><b>Make this query a standing query.</b> Its exact expression runs against future authored checkpoints.</p>
      <fieldset><legend>Evidence to watch</legend><div class="watch-options">${watchArtifacts.map((artifact, position) => `<label><input type="radio" name="watch-artifact" value="${escapeHtml(artifact.id)}" ${position === 0 ? "checked" : ""} ${hasWatch || engineRef.locked() ? "disabled" : ""}><code>${escapeHtml(artifact.expression)}</code></label>`).join("")}</div></fieldset>
      <button type="button" class="line-button" data-action="save-watch" ${hasWatch || engineRef.locked() ? "disabled" : ""}>${hasWatch ? "Standing query saved" : `Save standing query · ${price(engineRef.actionCost("saveWatch"))}`}</button>
    </div>` : ""}
  </article>`;
}

function renderAttemptFeedback(item: CampaignCase, report: FiledReport): string {
  const presentation = index!.acts.get(item.actId)!.reportPresentation;
  return `<article class="filed-report attempt-feedback" tabindex="-1">
    <span class="filed-stamp" aria-hidden="true">RETURNED</span>
    <p class="kicker">Filed attempt · ${escapeHtml(clockTime(report.campaignTime))} · ${escapeHtml(calendarDate(report.campaignTime))}</p>
    <h2 class="display">Report returned</h2>
    <p><b>Technical record · ${escapeHtml(report.evidence)}.</b> ${escapeHtml(report.technicalExplanation)}</p>
    <p><b>${escapeHtml(presentation.responseLabel)}:</b> ${escapeHtml(report.ministryResponse)}</p>
    <p class="filed-evidence">Attempt archived. Change the choices below, or replace the evidence.</p>
    <button type="button" class="line-button" data-action="replace-evidence">Replace the attached evidence</button>
  </article>`;
}

function renderWorkColumn(): string {
  const engineRef = engine!;
  const item = currentCase();
  const note = documentCard();
  if (!item) {
    return `<section class="work-column">${note || `<article class="work-order"><header><span class="avatar navy">M</span><div><h2 class="display">${escapeHtml(engineRef.currentShift().title)}</h2><p>Shift ${engineRef.state.shiftNumber}</p></div></header><div class="work-body"><p>${escapeHtml(engineRef.currentShift().directive ?? "Continue the measurable work of public reassurance.")}</p></div></article>`}</section>`;
  }
  const report = engineRef.state.reports.filter((candidate) => candidate.caseId === item.id).at(-1);
  const completed = engineRef.state.completedCases.includes(item.id);
  const sheet = workSheets.get(item.id) ?? "order";
  const ready = (pinned.get(item.id)?.length ?? 0) >= item.report.minArtifacts;
  return `<section class="work-column">
    ${note}
    <nav class="sheet-tabs" aria-label="Case paperwork">
      <button type="button" class="sheet-tab ${sheet === "order" ? "on" : ""}" data-sheet="order" aria-pressed="${sheet === "order"}">Work order</button>
      <button type="button" class="sheet-tab ${sheet === "report" ? "on" : ""}" data-sheet="report" aria-pressed="${sheet === "report"}">${completed ? "Filed report" : report ? "Returned report" : "Report"}${ready && !completed ? `<span class="ready-dot" aria-label="ready to complete"></span>` : ""}</button>
    </nav>
    ${sheet === "order" ? `${workOrderCard(item)}${hintNotes(item)}` : completed && report ? renderFiledReport(item, report) : `${report ? renderAttemptFeedback(item, report) : ""}${renderForm(item)}`}
  </section>`;
}

/* ------------------------------------------------------------------- render */

function renderDesk(): void {
  const engineRef = engine!;
  const indexRef = index!;
  const context = { index: indexRef, engine: engineRef, registryKind, registrySearch, selectedReport, lastReplay, caseId: currentCase()?.id };
  app.innerHTML = `
    <div class="desk ${engineRef.locked() ? "locked" : ""}">
      ${renderBanner()}
      <div class="blotter">
        ${renderTray()}
        ${renderConsole()}
        ${renderWorkColumn()}
      </div>
      <div id="status-live" class="status-live" role="status">${escapeHtml(statusMessage)}</div>
      ${drawerNames.map((name) => renderDrawer(name, context)).join("")}
      ${renderNewspaperOverlay()}
      ${slipOverlay()}
      ${ledger ? renderLedger(ledger, engineRef, indexRef) : ""}
    </div>`;
  afterRender();
}

/** A fresh result is typed onto the screen after a short working beat, like a terminal printing. */
function typeOut(run: HTMLElement, screen: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const walker = document.createTreeWalker(run, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; text: string }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push({ node: node as Text, text: node.textContent ?? "" });
  const total = nodes.reduce((sum, item) => sum + item.text.length, 0);
  if (!total) return;
  nodes.forEach(({ node }) => { node.textContent = ""; });
  const busy = document.createElement("span");
  busy.className = "crt-busy";
  busy.textContent = "working";
  run.before(busy);
  const cursor = document.createElement("span");
  cursor.className = "crt-cursor";
  const perTick = Math.max(2, Math.ceil(total / 80));
  let position = 0;
  const step = () => {
    let budget = perTick;
    while (budget > 0 && position < nodes.length) {
      const item = nodes[position]!;
      const shown = item.node.textContent?.length ?? 0;
      if (shown >= item.text.length) { position += 1; continue; }
      const next = Math.min(item.text.length, shown + budget);
      budget -= next - shown;
      item.node.textContent = item.text.slice(0, next);
      item.node.after(cursor);
    }
    screen.scrollTop = screen.scrollHeight;
    if (position < nodes.length) window.requestAnimationFrame(step); else cursor.remove();
  };
  window.setTimeout(() => { busy.remove(); run.append(cursor); window.requestAnimationFrame(step); }, 350);
  screen.scrollTop = screen.scrollHeight;
}

function afterRender(): void {
  const screen = document.querySelector<HTMLElement>(".console-screen");
  if (screen) screen.scrollTop = screen.scrollHeight;
  if (pendingReveal && screen) {
    const run = screen.querySelector<HTMLElement>(`.crt-run[data-select-artifact="${CSS.escape(pendingReveal)}"]`);
    if (run) typeOut(run, screen);
    pendingReveal = undefined;
  }
  const overlay = ledger ? document.querySelector<HTMLDialogElement>("#overlay-ledger")
    : newspaperOpen ? document.querySelector<HTMLDialogElement>("#overlay-newspaper")
      : openDrawer ? document.querySelector<HTMLDialogElement>(`#drawer-${openDrawer}`)
        : openSlip ? document.querySelector<HTMLDialogElement>("#overlay-slip") : undefined;
  // A printout whose picture runs past the paper curls up instead of scrolling; the curl opens the whole card.
  document.querySelectorAll<HTMLElement>(".slip:not(.slip-view .slip)").forEach((slip) => {
    const picture = slip.querySelector<HTMLElement>(".slip-picture");
    if (picture && picture.scrollHeight > picture.clientHeight + 2) slip.classList.add("long");
  });
  if (pendingPrint) {
    document.querySelector<HTMLElement>(`.slip[data-slip="${CSS.escape(pendingPrint)}"]`)?.classList.add("fresh");
    pendingPrint = undefined;
  }
  if (overlay && !overlay.open) overlay.showModal();
  if (pendingFocus) {
    const target = document.querySelector<HTMLElement>(pendingFocus);
    // A disabled or missing target (e.g. the button that closed a dialog got disabled by
    // the state change the dialog caused) would otherwise leave focus stranded on <body>.
    (target && !target.hasAttribute("disabled") ? target : document.querySelector<HTMLElement>("#main"))?.focus();
    if (target instanceof HTMLInputElement && target.type === "search") target.setSelectionRange(target.value.length, target.value.length);
    pendingFocus = undefined;
  }
}

function render(): void {
  if (!engine || !index) return;
  renderDesk();
}

function startGame(useSave: boolean, appointmentId?: string, complaint = false): void {
  if (!index) return;
  const prior = useSave ? savedState : undefined;
  engine = new GameEngine(index, executeQuery, prior ?? createGameState(index));
  if (!prior && appointmentId) {
    if (complaint) engine.fileAppointmentComplaint(appointmentId);
    else engine.acceptAppointment(appointmentId);
  }
  queryForms.clear();
  expressions.clear();
  queryHistory.clear();
  languages.clear();
  pinned.clear();
  printBars.clear();
  reportForms.clear();
  workSheets.clear();
  lastReplay = undefined;
  selectedReport = "";
  selectedArtifact = "";
  openDrawer = undefined;
  ledger = undefined;
  statusMessage = "";
  if (engine.appointmentPending()) {
    selectedAppointment = index.campaign.opening.appointments?.[0]?.id ?? "";
    openingScreen = "appointment";
    persist();
    renderAppointmentDesk();
    return;
  }
  const appointment = index.campaign.opening.appointments?.find((candidate) => candidate.id === engine?.state.appointmentId);
  const complaintEnding = appointment?.complaintEffects.some((effect) => effect.type === "enter_ending" && effect.endingId === engine?.state.endingId);
  if (complaintEnding) {
    openingScreen = "complaint";
    persist();
    renderComplaintEnding();
    return;
  }
  selectedItem = defaultSelectedItem();
  markShift();
  const edition = engine.currentNewspaper();
  newspaperOpen = Boolean(edition && !engine.newspaperRead(edition.id));
  persist();
  render();
}

/* ------------------------------------------------------------------- events */

// dialog.close() fires the "close" event asynchronously; that listener clears openDrawer
// and restores focus to the opener, so this must not clear it synchronously first.
function closeOverlay(): void {
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => dialog.close());
}

app.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button, [data-action], [data-drawer], [data-inbox], [data-registry], [data-report], [data-view], [data-switch], [data-sheet], [data-slip], [data-select-artifact]");
  if (!target || (target instanceof HTMLButtonElement && target.disabled)) return;
  if (target instanceof HTMLButtonElement && target.type === "submit") event.preventDefault();
  const action = target.dataset.action;

  if (target.dataset.appointment) {
    selectedAppointment = target.dataset.appointment;
    renderAppointmentDesk();
    return;
  }
  if (action === "montage-next") {
    const count = index?.campaign.opening.montage?.length ?? 0;
    if (montagePosition < count - 1) montagePosition += 1;
    else openingScreen = "appointment";
    renderOpening();
    return;
  }
  if (action === "montage-skip") { openingScreen = "appointment"; renderOpening(); return; }
  if (action === "accept-appointment") { startGame(false, selectedAppointment); return; }
  if (action === "complain-appointment") { startGame(false, selectedAppointment, true); return; }
  if (action === "return-appointment") {
    if (!(await clearSave())) return;
    engine = undefined;
    montagePosition = 0;
    selectedAppointment = index?.campaign.opening.appointments?.[0]?.id ?? "";
    openingScreen = "appointment";
    renderOpening();
    return;
  }

  const drawer = target.dataset.drawer as DrawerName | undefined;
  if (drawer) { openDrawer = drawer; render(); return; }
  if (target.dataset.inbox) { selectedItem = target.dataset.inbox; selectedArtifact = ""; render(); return; }
  if (target.dataset.registry) { registryKind = target.dataset.registry as typeof registryKind; render(); return; }
  if (target.dataset.report) { selectedReport = target.dataset.report; lastReplay = undefined; render(); return; }
  if (target.dataset.selectArtifact) { selectedArtifact = target.dataset.selectArtifact; render(); return; }

  const item = currentCase();
  if (target.dataset.queryLanguage && item) {
    const language = target.dataset.queryLanguage as Language;
    formFromControls(item, expressions.get(item.id) ?? "", language);
    languages.set(item.id, language);
    pendingFocus = `[data-query-language="${language}"]`;
    render();
    return;
  }
  if (target.dataset.queryMode && item) {
    const mode = target.dataset.queryMode as "instant" | "range" | "records";
    queryForms.set(caseFormKey(item), formForExecutionMode(caseControls(item), mode));
    pendingFocus = `[data-query-mode="${mode}"]`;
    render();
    return;
  }
  if (target.dataset.queryRange && item) {
    queryForms.set(caseFormKey(item), { ...caseControls(item), range: Number(target.dataset.queryRange) });
    pendingFocus = `[data-query-range="${target.dataset.queryRange}"]`;
    render();
    return;
  }
  if (target.dataset.sheet && item) {
    workSheets.set(item.id, target.dataset.sheet as "order" | "report");
    render();
    return;
  }
  if (target.dataset.view && item) {
    const artifact = targetArtifact(item.id);
    printBars.set(printBarKey(item.id, artifact), { ...printOptions(item.id, offeredViews(item, artifact), artifact), visualization: target.dataset.view as Visualization });
    pendingFocus = `[data-view="${target.dataset.view}"]`;
    render();
    return;
  }
  if (target.dataset.switch && item) {
    const key = target.dataset.switch as keyof PrintOptions;
    const artifact = targetArtifact(item.id);
    const options = printOptions(item.id, offeredViews(item, artifact), artifact);
    printBars.set(printBarKey(item.id, artifact), { ...options, [key]: !options[key] });
    pendingFocus = `[data-switch="${key}"]`;
    render();
    return;
  }

  if (action === "continue") { startGame(true); return; }
  if (action === "new-game") {
    if (savedState && !window.confirm("Start over? Your current local campaign save will be replaced.")) return;
    if (!(await clearSave())) return;
    engine = undefined;
    montagePosition = 0;
    selectedAppointment = index?.campaign.opening.appointments?.[0]?.id ?? "";
    if (index?.campaign.opening.montage?.length) openingScreen = "montage";
    else if (index?.campaign.opening.appointments?.length) openingScreen = "appointment";
    else { startGame(false); return; }
    renderOpening();
    return;
  }
  if (action === "reset") {
    if (!index || !window.confirm("Clear the local campaign? Filed reports, standing queries, mastery, and Standing are removed from this browser.")) return;
    if (!(await clearSave())) return;
    engine = undefined;
    closeOverlay();
    statusMessage = "";
    renderWelcome();
    return;
  }
  if (action === "close-drawer") { closeOverlay(); return; }
  if (!engine || !index) return;

  if (action === "open-newspaper") { newspaperOpen = true; render(); return; }
  if (action === "fold-newspaper") {
    const edition = engine.currentNewspaper();
    if (edition) engine.readNewspaper(edition.id);
    newspaperOpen = false;
    persist();
    render();
    return;
  }

  if (action === "restart-shift") {
    if (!window.confirm("Restart this shift? Queries, reports, standing queries, and decisions made since the shift began are discarded.")) return;
    guarded(() => {
      engine!.restartShift();
      expressions.clear();
      queryHistory.clear();
      languages.clear();
      pinned.clear();
      queryForms.clear();
      printBars.clear();
      reportForms.clear();
      workSheets.clear();
      selectedArtifact = "";
      selectedItem = defaultSelectedItem();
      markShift();
    }, "The shift restarted from its opening checkpoint.");
    return;
  }
  if (action === "reset-query-context") {
    if (item) queryForms.delete(caseFormKey(item));
    render();
    return;
  }
  if (action === "run-query" && item) {
    const query = document.querySelector<HTMLTextAreaElement>("#query-input")?.value ?? "";
    const language = languages.get(item.id) ?? item.languages[0]!;
    expressions.set(item.id, query);
    languages.set(item.id, language);
    guarded(() => {
      const artifact = engine!.runQuery(item.id, language, query, controlsFromForm(item, query, language));
      selectedArtifact = artifact.id;
      pendingReveal = artifact.id;
      expressions.set(item.id, "");
      queryHistory.delete(queryHistoryKey(item));
      statusMessage = artifact.execution.ok
        ? "The query succeeded. Choose a view and print it to put it on paper."
        : `The query failed. ${artifact.execution.error.message}`;
      pendingFocus = "#query-input";
    });
    return;
  }
  if (action === "print-artifact" && item) {
    const artifact = targetArtifact(item.id);
    if (!artifact) return;
    guarded(() => {
      engine!.printArtifact(item.id, artifact.id, printOptions(item.id, offeredViews(item, artifact), artifact));
      selectedArtifact = artifact.id;
      pendingPrint = artifact.id;
    }, "The slip printed. Pin it with the paperclip to attach it to the report.");
    return;
  }
  if (action === "trash-printout" && item && target.dataset.id) {
    const artifactId = target.dataset.id;
    guarded(() => {
      engine!.trashPrintout(item.id, artifactId);
      pinned.set(item.id, (pinned.get(item.id) ?? []).filter((id) => id !== artifactId));
    }, "The printout was trashed. The query result remains in the console.");
    return;
  }
  if (action === "hint" && item) {
    const position = item.hints.findIndex((_hint, at) => !engine!.isHintRevealed(item.id, at));
    const hint = item.hints[position];
    if (!hint) return;
    guarded(() => {
      engine!.revealHint(item.id, position);
      if (hint.level !== "Worked" && hint.query) expressions.set(item.id, hint.query);
      queryHistory.delete(queryHistoryKey(item));
      hiddenHintCase = "";
    }, `${supervisorName()} left a note beneath the work order.`);
    return;
  }
  if (action === "hide-hint" && item) { hiddenHintCase = item.id; render(); return; }
  if (action === "next-pinned" && item) {
    const values = pinned.get(item.id) ?? [];
    if (values.length) {
      const current = values.indexOf(selectedArtifact);
      selectedArtifact = values[(current + 1 + values.length) % values.length]!;
      pendingFocus = '[data-action="next-pinned"]';
      render();
    }
    return;
  }
  if (action === "run-worked-artifact" && item) {
    const position = Number(target.dataset.index);
    const worked = engine.caseVariant(item.id).workedEvidenceSet.artifacts[position];
    if (!worked) return;
    const form = formForExecutionMode(caseControls(item), worked.mode, item.report.visualizations.includes("table") ? "table" : "stat");
    expressions.set(item.id, worked.query);
    languages.set(item.id, worked.language);
    queryForms.set(caseFormKey(item), form);
    guarded(() => {
      const artifact = engine!.runQuery(item.id, worked.language, worked.query, executionControls(worked.language, worked.query, form), false, true, worked.role, worked.print);
      selectedArtifact = artifact.id;
      expressions.set(item.id, "");
      queryHistory.delete(queryHistoryKey(item));
    }, `Marr's example query ran. Inspect the result and print it with the prepared settings before running the next Worked query.`);
    return;
  }
  if ((action === "pin-artifact" || action === "unpin-artifact") && item && target.dataset.id) {
    const values = [...(pinned.get(item.id) ?? [])];
    if (action === "pin-artifact" && !values.includes(target.dataset.id) && values.length < item.report.maxArtifacts) values.push(target.dataset.id);
    if (action === "pin-artifact" && values.length >= item.report.maxArtifacts && !values.includes(target.dataset.id)) {
      setStatus(`The form accepts up to ${item.report.maxArtifacts} slips. Unpin one first.`);
      return;
    }
    if (action === "unpin-artifact") values.splice(values.indexOf(target.dataset.id), 1);
    pinned.set(item.id, values);
    statusMessage = `${values.length} of ${item.report.minArtifacts} required slips pinned.`;
    pendingFocus = `[data-id="${CSS.escape(target.dataset.id)}"].pin-button`;
    render();
    return;
  }
  if (action === "replace-evidence" && item) {
    pinned.delete(item.id);
    workSheets.set(item.id, "order");
    statusMessage = "The filed attempt remains in the Archive. Run and print corrected evidence, then return to the report.";
    pendingFocus = "#query-input";
    render();
    return;
  }
  if (action === "open-slip" && target.dataset.id) { openSlip = target.dataset.id; render(); return; }
  if (action === "close-slip") { closeOverlay(); return; }
  if (target.dataset.slip && !target.closest(".slip-view")) {
    if (target.classList.contains("long")) { openSlip = target.dataset.slip; render(); return; }
    return;
  }
  if (action === "file-report" && item) {
    const artifactIds = pinned.get(item.id) ?? [];
    const form = reportForms.get(item.id)!;
    const confirmation = index.acts.get(item.actId)!.reportPresentation.confirmation;
    guarded(() => {
      const report = engine!.fileReport(item.id, artifactIds, form.title, form.conclusion, form.decision);
      const completed = engine!.state.completedCases.includes(item.id);
      statusMessage = completed ? confirmation : report.technicalExplanation;
      pendingFocus = completed ? ".filed-report" : ".attempt-feedback";
    });
    return;
  }
  if (action === "save-watch" && item) {
    const artifactId = document.querySelector<HTMLInputElement>('input[name="watch-artifact"]:checked')?.value;
    if (!artifactId) return;
    guarded(() => engine!.saveWatch(item.id, artifactId), "The standing query is saved. Future checkpoints run this exact expression.");
    return;
  }
  if (action === "retire-watch" && target.dataset.id) {
    guarded(() => engine!.retireWatch(target.dataset.id!), "The standing query is retired. Its history stays in the record.");
    return;
  }
  if (action === "read-item" && target.dataset.id) {
    guarded(() => {
      engine!.readItem(target.dataset.id!);
      selectedItem = defaultSelectedItem();
    }, "Acknowledged and filed.");
    return;
  }
  if (action === "end-shift") {
    const engineRef = engine;
    const closed = engineRef.currentShift();
    const clock = engineRef.clock();
    const reportIds = engineRef.state.reports.filter((report) => report.filedShiftId === closed.id).map((report) => report.id);
    const caseIds = new Set(engineRef.state.reports.filter((report) => reportIds.includes(report.id)).map((report) => report.caseId));
    const before = {
      standing: engineRef.shiftStartingStanding(), rank: engineRef.state.rankId,
      notices: engineRef.state.notices.length, scored: engineRef.state.watches.filter((watch) => watch.scores).length,
      memos: engineRef.state.memos.map((memo) => memo.id), number: engineRef.state.shiftNumber,
      unused: clock ? clock.remaining * clock.minutesPerUnit : 0,
      runs: engineRef.state.artifacts.length - shiftMarks.artifacts,
      hints: Object.values(engineRef.state.revealedHints).reduce((sum, list) => sum + list.length, 0) - shiftMarks.hints,
    };
    guarded(() => {
      engineRef.advanceShift();
      ledger = {
        shiftTitle: closed.title, shiftNumber: before.number, closedAt: closed.time, reportIds,
        standingBefore: before.standing, standingAfter: engineRef.state.standing,
        rankBefore: before.rank, rankAfter: engineRef.state.rankId,
        runs: before.runs, hintsCalled: before.hints, minutesUnused: before.unused,
        watchesScored: engineRef.state.watches.filter((watch) => watch.scores).length - before.scored,
        noticesAdded: engineRef.state.notices.length - before.notices,
        memoIds: engineRef.state.memos.map((memo) => memo.id).filter((id) => !before.memos.includes(id)),
        conceptIds: [...new Set(engineRef.state.attempts.filter((attempt) => caseIds.has(attempt.caseId) && attempt.creditAwarded).flatMap((attempt) => attempt.conceptIds))],
      };
      selectedItem = defaultSelectedItem();
      selectedArtifact = "";
      markShift();
      const edition = engineRef.currentNewspaper();
      newspaperOpen = Boolean(edition && !engineRef.newspaperRead(edition.id));
    }, "The shift closed. Standing queries and delayed consequences were evaluated.");
    return;
  }
  if (action === "dismiss-ledger") {
    ledger = undefined;
    closeOverlay();
    return;
  }
  if (action === "replay-query") {
    const reportId = target.dataset.reportId;
    const artifactId = target.dataset.artifactId;
    const input = artifactId ? document.querySelector<HTMLTextAreaElement>(`[data-replay-input="${CSS.escape(artifactId)}"]`) : undefined;
    if (!reportId || !artifactId || !input) return;
    guarded(() => { lastReplay = engine!.replayQuery(reportId, artifactId, input.value); }, "The replay finished. Campaign state and Standing were unchanged.");
  }
});

// Enter inside Form R-7 must stamp the report, never reload the page.
app.addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector<HTMLButtonElement>(".file-stamp:not([disabled])")?.click();
});

app.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  if (target.id === "query-input") {
    const item = currentCase();
    if (item) {
      expressions.set(item.id, target.value);
      queryHistory.delete(queryHistoryKey(item));
    }
    const code = document.querySelector<HTMLElement>("#syntax-code");
    if (code) code.innerHTML = highlightQuery(target.value);
    return;
  }
  if (target.id === "registry-search") {
    registrySearch = target.value;
    pendingFocus = "#registry-search";
    render();
  }
});

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  const item = currentCase();
  if (target.id === "query-time" && item) {
    formFromControls(item);
    render();
    return;
  }
  if (target.name?.startsWith("report-") && item) {
    const current = reportForms.get(item.id) ?? { title: "", conclusion: "", decision: "" };
    if (target.name === "report-title") current.title = target.value;
    if (target.name === "report-conclusion") current.conclusion = target.value;
    if (target.name === "report-decision") current.decision = target.value;
    reportForms.set(item.id, current);
    pendingFocus = `input[name="${target.name}"]:checked`;
    render();
    return;
  }
  if (target.id === "campaign-upload" && target instanceof HTMLInputElement && target.files?.[0]) {
    void target.files[0].text().then(async (text) => {
      try { index = loadCampaign(JSON.parse(text)); savedState = await loadPersistentState(index); renderWelcome(); }
      catch (error) { renderLoadError(error); }
    });
  }
});

// Full re-renders replace the DOM node that opened a dialog, so the browser's native
// post-close focus restore has nothing to return to. Send focus back to the opener ourselves.
app.addEventListener("close", (event) => {
  const dialog = event.target as HTMLElement;
  if (dialog.tagName !== "DIALOG") return;
  if (dialog.id === "overlay-ledger") {
    ledger = undefined;
    if (engine) pendingFocus = '[data-action="end-shift"]';
  } else if (dialog.id === "overlay-newspaper") {
    const edition = engine?.currentNewspaper();
    if (edition && !engine?.newspaperRead(edition.id)) engine?.readNewspaper(edition.id);
    newspaperOpen = false;
    if (engine) { persist(); pendingFocus = '[data-action="open-newspaper"]'; }
  } else if (dialog.id === "overlay-slip") {
    const id = openSlip;
    openSlip = undefined;
    if (id) pendingFocus = `.slip[data-slip="${CSS.escape(id)}"] .slip-open`;
  } else {
    const name = openDrawer;
    openDrawer = undefined;
    if (name && engine) pendingFocus = `[data-drawer="${name}"]`;
  }
  render();
}, true);

app.addEventListener("scroll", (event) => {
  const target = event.target as HTMLElement;
  if (target.id === "query-input") {
    const pre = target.previousElementSibling as HTMLElement | null;
    if (pre) { pre.scrollTop = target.scrollTop; pre.scrollLeft = target.scrollLeft; }
  }
}, true);

/* ---------------------------------------------------------------- shortcuts */

const isTyping = (element: Element | null): boolean =>
  element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
  || (element instanceof HTMLInputElement && !["radio", "checkbox", "button"].includes(element.type));

function press(selector: string): void {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

document.addEventListener("keydown", (event) => {
  if (!engine) return;
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && active.id === "query-input"
    && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const item = currentCase();
    if (!item) return;
    const language = languages.get(item.id) ?? item.languages[0]!;
    const historyKey = queryHistoryKey(item);
    const history = caseArtifacts(item.id).filter((artifact) => artifact.language === language).map((artifact) => artifact.expression);
    const direction = queryHistoryDirection(active.value, active.selectionStart, active.selectionEnd, event.key, history.length);
    if (!direction || (direction === "newer" && !queryHistory.has(historyKey))) return;
    event.preventDefault();
    const step = navigateQueryHistory(
      history, active.value, queryHistory.get(historyKey), direction,
    );
    queryHistory.set(historyKey, step.navigation);
    expressions.set(item.id, step.value);
    active.value = step.value;
    const code = document.querySelector<HTMLElement>("#syntax-code");
    if (code) code.innerHTML = highlightQuery(step.value);
    active.setSelectionRange(step.value.length, step.value.length);
    return;
  }
  if (event.key === "Enter" && (((active as HTMLElement | null)?.id === "query-input" && !event.shiftKey) || event.ctrlKey || event.metaKey)) { event.preventDefault(); press("[data-action=run-query]"); return; }
  if (event.key.toLowerCase() === "p" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); press("[data-action=print-artifact]"); return; }
  if (event.altKey && /^[1-5]$/.test(event.key)) { event.preventDefault(); press(`[data-tray-index="${event.key}"]`); return; }
  if (isTyping(active) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^[1-4]$/.test(event.key) && active?.closest("#print-bar")) {
    event.preventDefault();
    press(`#print-bar .views button:nth-of-type(${event.key})`);
    return;
  }
  if (event.key === "?") { event.preventDefault(); openDrawer = "keys"; render(); return; }
  if (event.key.toLowerCase() === "r" && !openDrawer) { event.preventDefault(); openDrawer = "registry"; render(); return; }
  if (event.key.toLowerCase() === "f" && !openDrawer) {
    event.preventDefault();
    press(".file-stamp");
    return;
  }
  if (event.key.startsWith("Arrow") && active?.closest("#tray-list")) {
    const cards = [...document.querySelectorAll<HTMLButtonElement>("#tray-list .tray-card")];
    const position = cards.findIndex((card) => card === active);
    const next = cards[position + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1)];
    if (next) {
      event.preventDefault();
      // next.click() re-renders the tray, replacing this node, so a plain next.focus() here
      // would be lost; pendingFocus survives the rebuild and is applied in afterRender().
      pendingFocus = `[data-inbox="${CSS.escape(next.dataset.inbox!)}"]`;
      next.click();
    }
  }
});

/* --------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  app.innerHTML = `<main class="gate" id="main"><section class="gate-card"><p class="kicker">Opening the civic terminal</p><h1 class="display">Measuring contentment</h1><div class="loading-bar"><i></i></div></section></main>`;
  try {
    const response = await fetch("./campaign.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`The campaign pack is unavailable (${response.status}). Build content/campaign.json or load a local pack.`);
    index = loadCampaign(await response.json());
    try { savedState = await loadPersistentState(index); }
    catch (error) { statusMessage = `Progress could not be loaded. ${error instanceof Error ? error.message : String(error)}`; }
    renderWelcome();
  } catch (error) {
    renderLoadError(error);
  }
}

void boot();
