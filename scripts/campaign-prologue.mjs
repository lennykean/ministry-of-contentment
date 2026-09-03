const clone = (value) => structuredClone(value);
const fact = (factId) => ({ fact: factId });
const state = (factId, expected) => ({ op: "state", value: fact(factId), expected });
const compare = (factId, relation, right) => ({ op: "compare", left: fact(factId), relation, right });

const clearanceTime = "2041-01-05T09:00:00Z";
const datasetId = "dataset.clearance.ministry-trainee";

const status = () => ({ kind: "R", selector: "artifact", property: "status", relation: "=", expected: "successful" });
const metricSelector = () => ({ kind: "A", selector: "artifact", node: "metric-selector", parameters: {} });
const interpretation = (subjects) => ({ kind: "E", rule: "result-interpretation", selectors: ["artifact"], parameters: { subjects } });
const interpretationRequirements = (labels, values = [0, 1]) => [
  {
    conceptId: "promql.selector.metric", rule: "result-interpretation", selectors: ["artifact"], subject: "labels",
    alternatives: [[status(), { kind: "R", selector: "artifact", property: "retained-labels", relation: "contains-all", expected: labels }]],
  },
  {
    conceptId: "promql.selector.metric", rule: "result-interpretation", selectors: ["artifact"], subject: "values",
    alternatives: [[status(), { kind: "R", selector: "artifact", property: "value-domain", relation: "subset-of", expected: values }]],
  },
];

function clearanceCase(config) {
  const base = `case.clearance.${config.number}.${config.slug}`;
  const artifacts = config.queries.map((query, index) => ({
    role: `evidence-${String(index + 1).padStart(2, "0")}`, language: "promql", mode: "instant", query,
  }));
  const alternate = artifacts.map((artifact) => ({ ...artifact, query: `(${artifact.query})` }));
  const evidenceTitle = `${base}.title.evidence`;
  const evidenceConclusion = `${base}.conclusion.evidence`;
  const fileDecision = `${base}.decision.file`;
  const path = (suffix) => ({
    id: `${base}.path.${suffix}`,
    description: `${config.title}: the filed result must support the stated clearance distinction.`,
    clauses: clone(config.clauses),
  });
  return {
    id: base, version: 1, actId: "act.1.reconciliation", title: config.title,
    briefing: config.briefing, question: config.question, requesterId: "character.elian-marr",
    operationalQuestionId: `${base}.question`, difficulty: "Foundation", estimatedMinutes: 2,
    mode: "critical", datasetId, availableSources: ["up"], evaluationTime: clearanceTime,
    variants: [{
      id: `${base}.variant.primary`, dataShapeId: `${base}.shape.primary`, datasetId, evaluationTime: clearanceTime,
      requiredValues: clone(config.requiredValues ?? []), evidenceRequirements: clone(config.evidenceRequirements ?? []),
      referenceSets: [
        { id: `${base}.reference.direct`, evidencePathId: `${base}.path.direct`, artifacts },
        { id: `${base}.reference.corroborated`, evidencePathId: `${base}.path.corroborated`, artifacts: alternate },
      ],
      workedEvidenceSet: {
        evidencePathId: `${base}.path.direct`,
        artifacts: artifacts.map((artifact, index) => ({ ...artifact, explanation: config.explanations[index] })),
      },
    }],
    hypotheses: [
      { id: `${base}.hypothesis.evidence`, title: config.hypothesis, summary: config.truth },
      { id: `${base}.hypothesis.error`, title: config.alternative, summary: config.alternativeSummary },
    ],
    languages: ["promql"], conceptIds: [config.conceptId],
    masteryUses: [{
      conceptId: config.conceptId, targetState: "Observed", unitKind: "query-artifact",
      maxAssistance: "Worked", artifactSelectors: ["artifact[1]"],
    }],
    evidencePaths: [path("direct"), path("corroborated")],
    technicalTruth: {
      hypothesisIds: [`${base}.hypothesis.evidence`], summary: config.truth,
      artifactRoles: Object.fromEntries(artifacts.map((artifact, index) => [artifact.role, config.explanations[index]])),
    },
    ministryPreference: {
      summary: "File only the distinction demonstrated by the returned result.",
      titleChoiceIds: [evidenceTitle], conclusionChoiceIds: [evidenceConclusion], decisionChoiceIds: [fileDecision],
    },
    decisionId: `${base}.decision`,
    decisionChoices: [
      { id: fileDecision, text: "File the returned evidence.", claims: [`${base}.claim.evidence`] },
      { id: `${base}.decision.repeat`, text: "Return the order for another reading.", claims: [`${base}.claim.repeat`] },
    ],
    reportId: `${base}.report`, hints: config.hints,
    report: {
      minArtifacts: artifacts.length, maxArtifacts: artifacts.length, visualizations: ["table"],
      titles: [
        { id: evidenceTitle, text: `${config.title}: Evidence read`, claims: [`${base}.claim.evidence`] },
        { id: `${base}.title.uncertain`, text: `${config.title}: Reading uncertain`, claims: [`${base}.claim.uncertain`] },
      ],
      conclusions: [
        { id: evidenceConclusion, text: config.conclusion, claims: [`${base}.claim.evidence`] },
        { id: `${base}.conclusion.uncertain`, text: "The result was not interpreted yet.", claims: [`${base}.claim.uncertain`] },
      ],
    },
    outcomes: [
      {
        id: `${base}.outcome.evidence`, titleChoiceIds: [evidenceTitle], conclusionChoiceIds: [evidenceConclusion],
        decisionChoiceIds: [fileDecision], technicalEvidence: "supported", technicalExplanation: config.truth,
        ministryResponse: "Clearance records the demonstrated result.",
      },
      {
        id: `${base}.outcome.fallback`, technicalEvidence: "partial",
        technicalExplanation: "The query ran, but the filing does not state the demonstrated result.",
        ministryResponse: "The clearance order remains open for correction.",
      },
    ],
  };
}

function clearanceCases() {
  return [
    clearanceCase({
      number: "01", slug: "metric-name", title: "Find the Metric",
      briefing: "The Metric Registry describes whether each monitored target answered its last collection attempt. Find that metric, run it, and file the result.",
      question: "Which metric reports whether a target answered?", conceptId: "promql.discovery.schema", queries: ["up"],
      requiredValues: [
        { conceptId: "promql.discovery.schema", detector: "E", selectors: ["artifact"], subject: "accepted-source-sets", acceptedValues: [["up"]] },
        { conceptId: "promql.discovery.schema", detector: "E", selectors: ["artifact"], subject: "supplied-source-ids", acceptedValues: [[]] },
      ],
      clauses: [{
        conceptId: "promql.discovery.schema", artifactSelectors: ["artifact[1]"],
        requirements: { op: "all", items: [metricSelector(), { kind: "E", rule: "schema-selection", selectors: ["artifact"], parameters: { source: "metric", "name-supplied": false } }] },
      }],
      explanations: ["The registry description identifies `up`; run it and verify that it returns reachability series."],
      hypothesis: "The registered metric is up",
      truth: "The Metric Registry identifies `up` as standard scrape reachability, and the query returns its series.",
      alternative: "A service label is the metric name",
      alternativeSummary: "Labels such as service describe a series; they do not replace the registered metric name.",
      conclusion: "The returned reachability metric is `up`.",
      hints: [
        { level: "Orientation", text: "The Registry is the green drawer on the left. Open it and read the description beneath each metric." },
        { level: "Orientation", text: "A PromQL query can be only a metric name. Copy the matching name into the black console and press Run. Do not add braces yet." },
        { level: "Scaffold", text: "The matching Registry entry is `up`. Type `up` into the console and press Run." },
        { level: "Worked", text: "Run `up`. Each row in the result is one monitored target and its current reachability value." },
      ],
    }),
    clearanceCase({
      number: "02", slug: "series-reading", title: "Read the Series",
      briefing: "Run the metric cleared in Find the Metric. Read each returned series as labels plus one value; do not average them.",
      question: "What labels and value belong to the West-03 series?", conceptId: "promql.selector.metric", queries: ["up"],
      evidenceRequirements: interpretationRequirements(["__name__", "job", "instance", "district", "service"]),
      clauses: [{
        conceptId: "promql.selector.metric", artifactSelectors: ["artifact[1]"],
        requirements: { op: "all", items: [metricSelector(), interpretation(["labels", "values"])] },
      }],
      explanations: ["Read each output row separately. West-03 retains its job, instance, district, and service labels and has value 0."],
      hypothesis: "West-03 is a returned series with value zero",
      truth: "The result includes a West-03 series labeled for the press collector, west district, and press service, with value 0.",
      alternative: "The three returned values form one total",
      alternativeSummary: "An instant vector keeps one value per returned label set; it does not combine the series automatically.",
      conclusion: "West-03 is returned with its labels and value 0.",
      hints: [
        { level: "Orientation", text: "Run `up` again. Find the row containing `instance=west-03`; its labels are on the left and its value is on the right." },
        { level: "Orientation", text: "PromQL did not add these rows together. Each unique set of labels identifies a separate series with its own value." },
        { level: "Scaffold", text: "The West-03 row has `district=west`, `job=press-collector`, `service=press`, and value `0`." },
        { level: "Worked", text: "Run `up` and read the West-03 row. Its labels identify the target; the zero belongs to that target alone." },
      ],
    }),
    clearanceCase({
      number: "03", slug: "exact-label", title: "Narrow the Series",
      briefing: "Today’s Training Desk story assigns Elm-01. Add one exact instance matcher and file only that returned series.",
      question: "Which series remains after an exact Elm-01 instance match?", conceptId: "promql.selector.metric",
      queries: ["up{instance=\"elm-01\"}"],
      evidenceRequirements: interpretationRequirements(["__name__", "job", "instance", "district", "service"], [1]),
      clauses: [{
        conceptId: "promql.selector.metric", artifactSelectors: ["artifact[1]"],
        requirements: { op: "all", items: [metricSelector(), { kind: "A", selector: "artifact", node: "label-matcher", parameters: { operator: "=" } }, interpretation(["labels", "values"])] },
      }],
      explanations: ["The exact matcher `instance=\"elm-01\"` keeps only the Elm-01 reachability series."],
      hypothesis: "The exact matcher keeps Elm-01 only",
      truth: "The exact instance matcher returns one Elm-01 series and preserves its job, district, service, and value.",
      alternative: "An instance matcher changes the series value",
      alternativeSummary: "A label matcher selects series. It does not rewrite the selected sample value.",
      conclusion: "The exact matcher returns only Elm-01, with value 1.",
      hints: [
        { level: "Orientation", text: "The morning paper assigned Elm-01. Reopen the folded paper in the tray if you need to check the name." },
        { level: "Orientation", text: "Put a label test in braces after the metric: `up{instance=\"elm-01\"}`. One equals sign means an exact match." },
        { level: "Scaffold", text: "Run `up{instance=\"elm-01\"}`. The result should contain one row, not all three." },
        { level: "Worked", text: "Run `up{instance=\"elm-01\"}`. The braces keep only the series whose instance label exactly matches Elm-01." },
      ],
    }),
    clearanceCase({
      number: "04", slug: "zero-or-empty", title: "Zero or Empty",
      briefing: "Today’s Training Desk story assigns West-03. Compare that exact instance with missing-99; keep both result tables separate.",
      question: "Which selector returns zero, and which returns no series?", conceptId: "promql.selector.metric",
      queries: ["up{instance=\"west-03\"}", "up{instance=\"missing-99\"}"],
      evidenceRequirements: interpretationRequirements(["__name__", "job", "instance", "district", "service"], [0]),
      clauses: [{
        conceptId: "promql.selector.metric", artifactSelectors: ["artifact[1]", "artifact[2]"],
        requirements: { op: "all", items: [
          { kind: "A", selector: "artifact[1]", node: "metric-selector", parameters: {} },
          { kind: "A", selector: "artifact[2]", node: "metric-selector", parameters: {} },
          { kind: "R", selector: "artifact[1]", property: "empty", relation: "=", expected: false },
          { kind: "R", selector: "artifact[1]", property: "value-domain", relation: "subset-of", expected: [0] },
          { kind: "R", selector: "artifact[2]", property: "empty", relation: "=", expected: true },
        ] },
      }],
      explanations: [
        "West-03 returns a labeled series whose value is 0; that is observed zero, not absence.",
        "Missing-99 returns no series, so its result table is empty rather than zero-valued.",
      ],
      hypothesis: "West-03 is zero; Missing-99 is empty",
      truth: "West-03 returns a present series with value 0. Missing-99 returns no series. These results require different interpretations.",
      alternative: "Zero and an empty result mean the same thing",
      alternativeSummary: "A zero has a returned label set and sample. An empty result has no returned series.",
      conclusion: "West-03 is present at 0; Missing-99 returns no series.",
      hints: [
        { level: "Orientation", text: "Run the two instance queries separately. First check whether a row exists; only then read its value." },
        { level: "Orientation", text: "A returned row with value `0` is an observation. An empty result has no row at all. Those facts are different." },
        { level: "Scaffold", text: "Run `up{instance=\"west-03\"}` and then `up{instance=\"missing-99\"}`. Print both results." },
        { level: "Worked", text: "West-03 returns a labeled row with value zero. Missing-99 returns no row. File both printouts so the report can show the difference." },
      ],
    }),
  ];
}

function addNewspaper(campaign) {
  const actSubheads = {
    "act.1.reconciliation": "Orderly signals keep ordinary services moving.",
    "act.2.publication": "Clear figures support a confident public record.",
    "act.3.assurance": "Prompt assurance protects every district.",
    "act.4.audit": "Records confirm that correct procedure was followed.",
    "act.5.directorate": "Efficient evidence strengthens national confidence.",
    "act.6.continuity": "Continuity is preparation, and preparation is calm.",
  };
  const overrides = {
    "shift.01.first-bell": {
      headline: "ELM EXCHANGE OPENS ON SCHEDULE", subhead: "One collector delay has entered routine reconciliation.",
      stories: [{ headline: "SERVICE DESK POSTS ELM RECORD", body: "Elm Exchange is registered in the north district under job pin-collector; the affected instance is north-02." }],
    },
    "shift.08.lantern-watch": { headline: "LANTERN BOARD PROMISES EARLIER NOTICE", subhead: "A saved query will decide which interruption reaches tomorrow’s desk." },
    "shift.15.every-member": { headline: "EVERY MEMBER COUNTED", subhead: "A perfect figure awaits the wording it deserves." },
    "shift.30.perfect-report": { headline: "PERFECT REPORT RECEIVES PERFECT AUDIT", subhead: "Records Integrity will confirm what the celebrated figure measured." },
    "shift.40.directorate": { headline: "DIRECTORATE SELECTS TOMORROW’S TRUTHS", subhead: "Only admitted sources will support the Continuity record." },
    "shift.45.first-silence": { headline: "QUIET SYSTEMS PROVE CAREFUL PREPARATION", subhead: "Standing watches will decide which silence becomes a notice." },
    "shift.48.all-is-well": { headline: "ALL IS WELL", subhead: "Every final result confirms the future selected for it." },
  };
  const mainShifts = campaign.shifts.filter((shift) => shift.id !== "shift.clearance.ministry-trainee");
  const ordinary = mainShifts.filter((shift) => shift.id !== "shift.02.rain-ledger").map((shift) => ({
    id: `newspaper.${shift.id.replace("shift.", "")}`, shiftId: shift.id, date: shift.time.slice(0, 10),
    headline: overrides[shift.id]?.headline ?? shift.title.toUpperCase(),
    subhead: overrides[shift.id]?.subhead ?? actSubheads[shift.actId],
    ...(overrides[shift.id]?.stories ? { stories: overrides[shift.id].stories } : {}),
  }));
  const rainDate = mainShifts.find((shift) => shift.id === "shift.02.rain-ledger").time.slice(0, 10);
  const rainEditions = [
    {
      id: "newspaper.02.rain-ledger.targeted", shiftId: "shift.02.rain-ledger", date: rainDate,
      headline: "ELM CREW REPAIRS ONE EXCHANGE", subhead: "The filed scope sent service to the named collector.",
      condition: compare("decision:decision.001.elm-exchange.choice_id", "=", "case.001.elm-exchange.decision.targeted"),
    },
    {
      id: "newspaper.02.rain-ledger.broad", shiftId: "shift.02.rain-ledger", date: rainDate,
      headline: "PREVENTIVE SERVICE EXPANDS", subhead: "The filed scope sent crews beyond Elm Exchange.",
      condition: compare("decision:decision.001.elm-exchange.choice_id", "=", "case.001.elm-exchange.decision.broad"),
    },
    {
      id: "newspaper.02.rain-ledger.observe", shiftId: "shift.02.rain-ledger", date: rainDate,
      headline: "ELM REVIEW CONTINUES", subhead: "The filed scope held service for another observation.",
      condition: compare("decision:decision.001.elm-exchange.choice_id", "=", "case.001.elm-exchange.decision.observe"),
    },
  ];
  campaign.newspaper = {
    title: "The Contented Citizen", motto: "Every day, better than the last.",
    editions: [
      {
        id: "newspaper.clearance.ministry-trainee", shiftId: "shift.clearance.ministry-trainee", date: "2041-01-05",
        headline: "TRAINING DESK OPENS FOUR FILES", subhead: "Practice instruments are ready for orderly inspection.",
        stories: [{ headline: "TODAY’S ASSIGNED TARGETS", body: "The practice queue assigns Elm-01 for exact matching and West-03 for zero-versus-empty review." }],
      },
      ...ordinary,
      ...rainEditions,
    ],
  };
}

export function addCampaignPrologue(campaign) {
  campaign.tagDeclarations.push(
    { id: "route.ministry-trainee", name: "Ministry Trainee appointment", initial: false },
    { id: "route.ministry-agent", name: "Ministry Agent appointment", initial: false },
    { id: "opening.complaint-filed", name: "Appointment complaint filed", initial: false },
  );
  campaign.endings.push({
    id: "ending.work-camp.complaint", title: "Motion Received",
    body: "Your motion has been accepted for personal review at Contentment Work Camp 12. Your Ministry post will be filled without delay.",
    condition: state("tag:opening.complaint-filed.present", true), priority: 1000, winning: false,
  });
  campaign.opening.montage = [
    { id: "opening.montage.signal-grid", date: "2040-12-29", headline: "NATIONAL SIGNAL GRID COMPLETE", body: "Every district now reports service, attendance, and public confidence to the Ministry." },
    { id: "opening.montage.contentment-record", date: "2041-01-02", headline: "CONTENTMENT REACHES ANOTHER RECORD", body: "The Directorate credits precise measurement and prompt correction." },
    { id: "opening.montage.elm-delay", date: "2041-01-05", headline: "ELM EXCHANGE REPORTS ROUTINE DELAY", body: "Officials expect ordinary service after a brief collector interruption." },
  ];
  const complaintEffects = [{ type: "add_tag", tagId: "opening.complaint-filed" }, { type: "enter_ending", endingId: "ending.work-camp.complaint" }];
  campaign.opening.appointments = [
    {
      id: "appointment.ministry-trainee", title: "MINISTRY TRAINEE", subtitle: "Signal Reconciliation Bureau",
      body: ["The Ministry has observed your aptitude for orderly conclusions.", "You will reconcile public telemetry with approved service records."],
      finePrint: [
        "Four clearance work orders must be filed before live duty. Reference, Registry, and interface help remain available.",
        "The undersigned consents to continuous location, movement, pulse, and compliance monitoring through the issued Well-being Pin.",
        "Removal, obstruction, or unexplained silence constitutes a request for immediate assistance from Well-being Assurance.",
      ],
      shiftId: "shift.clearance.ministry-trainee", effects: [{ type: "add_tag", tagId: "route.ministry-trainee" }],
      agreeLabel: "AGREE", complaintLabel: "FILE A MOTION WITH THE MINISTRY OF COMPLAINTS", complaintEffects: clone(complaintEffects),
    },
    {
      id: "appointment.ministry-agent", title: "MINISTRY AGENT", subtitle: "Signal Reconciliation Bureau",
      body: ["Your prior field clearance is recognized for this transfer.", "Report directly to the Elm Exchange desk for live reconciliation duty."],
      finePrint: [
        "The four trainee clearance orders are waived; no foundation mastery is credited. Reference, Registry, and interface help remain available.",
        "Prior clearance is recognized pending retrospective review and may be withdrawn without notice or correction of the historical record.",
        "A missing Well-being Pin signal will be treated as voluntary surrender to Well-being Assurance.",
      ],
      shiftId: "shift.01.first-bell", effects: [{ type: "add_tag", tagId: "route.ministry-agent" }],
      agreeLabel: "AGREE", complaintLabel: "FILE A MOTION WITH THE MINISTRY OF COMPLAINTS", complaintEffects: clone(complaintEffects),
    },
  ];

  const samples = (value) => ["08:30", "08:45", "08:59"].map((time) => ({ time: `2041-01-05T${time}:00Z`, value }));
  campaign.datasets.push({
    id: datasetId,
    series: [
      { id: "dataset.clearance.series.elm-01", metric: "up", labels: { job: "pin-collector", instance: "elm-01", district: "north", service: "pin-gateway" }, samples: samples(1) },
      { id: "dataset.clearance.series.north-02", metric: "up", labels: { job: "pin-collector", instance: "north-02", district: "north", service: "pin-gateway" }, samples: samples(1) },
      { id: "dataset.clearance.series.west-03", metric: "up", labels: { job: "press-collector", instance: "west-03", district: "west", service: "press" }, samples: samples(0) },
    ],
    streams: [],
  });
  campaign.narrativeItems.push({
    id: "directive.clearance.ministry-trainee", kind: "directive", title: "Clearance procedure",
    body: "File four orders in sequence: find a metric, read its series, narrow it exactly, then distinguish a returned zero from no returned series.",
  });
  const cases = clearanceCases();
  campaign.cases.push(...cases);
  campaign.shifts.unshift({
    id: "shift.clearance.ministry-trainee", actId: "act.1.reconciliation", title: "Ministry Trainee Clearance",
    directive: "Complete four work orders. Each introduces one PromQL task; the newspaper names practice targets while the orders contain operating instructions.",
    time: clearanceTime, datasetId, caseSelectionMode: "fixed",
    inbox: [
      { kind: "directive", id: "directive.clearance.ministry-trainee" },
      ...cases.map((item, index) => ({
        kind: "case", id: item.id,
        ...(index ? { condition: state(`progress:case:${cases[index - 1].id}.phase`, "completed") } : {}),
      })),
    ],
    actionBudget: 24, actionCosts: { validQuery: 1, fileReport: 1, saveWatch: 1, retireWatch: 1, printArtifact: 0 },
    next: [{ shiftId: "shift.01.first-bell" }],
  });
  const firstShift = campaign.shifts.find((shift) => shift.id === "shift.01.first-bell");
  firstShift.title = "Elm Exchange Competence";
  firstShift.directive = "All new appointments report to Elm Exchange. Today’s Service Desk story supplies the registered job, district, and instance for the first live work order.";
  const elmCase = campaign.cases.find((item) => item.id === "case.001.elm-exchange");
  elmCase.briefing = "Today’s Service Desk story names the Elm Exchange job, district, and instance. Use them with registered sources; report every returned label and value.";
  addNewspaper(campaign);
}
