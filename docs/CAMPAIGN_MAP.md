# Campaign map

This is the human-readable map for the first complete campaign of *Ministry of Contentment: All Is Well*. The playable definitions live under `content/` once they conform to the engine wire schema.

## Scale and timing

- 6 acts, 12 ranks, 48 authored shifts, and 192 authored critical-path case slots.
- The 462 required mastery uses are spread across the full campaign: 98 cases carry three credits, 74 carry two, and 20 carry one. No case exceeds the three-credit cap. The mathematical floor remains 154 credited case-equivalents, but the authored campaign uses 192 distinct investigations so query work can carry story, watch, audit, and promotion consequences without cramming unrelated skills together.
- Target active time is 1,336 minutes for a proficient query user and 2,296 minutes for a learner: 22.3 and 38.3 hours.
- These are authored estimates, not playtest results. Only recorded playtests can satisfy the acceptance gate.
- Every shift contains four investigations, audits, notices, or report decisions. Syntax correction, registry reading, and hint reading are not counted as active time.

## Recurring campaign systems

Five watch lines persist across acts:

1. **Lantern:** Elm Exchange gateway-delay records. A precise version catches and localizes the next-shift delay. A broad version floods the desk. Brittle or de-localized versions miss the incident or produce an unusable work order.
2. **Press:** bulletin and public-record delivery. It exposes false positives, counter resets, missing localization, and politically useful omissions.
3. **Threshold:** Pin removal, tamper, proximity, and Well-being Assurance dispatch. It can save a member, expose surveillance abuse, or direct a visit at an entire cohort.
4. **Ledger:** audit integrity and report provenance. It reopens the endorsed 100 percent membership report and earlier omitted evidence.
5. **Continuity:** the final portfolio of movement, facility, communications, and Assurance watches. Its combined detections, misses, labels, and cost determine the takeover.

Major choices receive a material result within two shifts or before the act ends. Selected artifacts return later through Ledger audits and Continuity eligibility.

## Act I — Reconciliation

Act I is untimed and sincere. No case asks for an individual, a political lie, a rival action, detention, or an Assurance visit. Unease appears only in form language and background announcements.

| Shift | Rank | Cases | Story and delayed state | Minutes proficient / learner |
|---|---|---|---|---:|
| `shift.01.first-bell` | Reconciliation Trainee | `case.001.elm-exchange`, `case.002.battery-cart`, `case.003.boiler-pulse`, `case.004.registry-window` | A failed collector, low batteries, and a cold annex have overlapping symptoms. Repair choices change the next shift's samples and maintenance queue. | 23 / 39 |
| `shift.02.rain-ledger` | Reconciliation Trainee | `case.005.north-relay`, `case.006.school-cohorts`, `case.007.upload-gap`, `case.008.field-notes` | Rain exposes a target-label mismatch and delayed attendance upload. Correct routing keeps a school service window open in Shift 3. | 23 / 39 |
| `shift.03.warm-rooms` | Reconciliation Trainee | `case.009.two-targets`, `case.010.clinic-queue`, `case.011.tram-records`, `case.012.label-ledger` | The player distinguishes zero work, failed scrape, and unrelated records. A localized report sends technicians to one facility instead of closing three. | 23 / 39 |
| `shift.04.clerks-seal` | Reconciliation Trainee | `case.013.orison-rain`, `case.014.canteen-gateway`, `case.015.range-window`, `case.016.clerk-assessment` | The first promotion assessment combines metric and record evidence. Passing reaches Reconciliation Clerk; failed concepts open targeted practice without punishment. | 23 / 39 |
| `shift.05.cold-annex` | Reconciliation Clerk | `case.017.annex-heat`, `case.018.west-batteries`, `case.019.attendance-spool`, `case.020.result-forms` | Different result shapes support different repair orders. The archived form becomes the first clean example used by a later audit. | 23 / 39 |
| `shift.06.quiet-queue` | Reconciliation Clerk | `case.021.blue-queue`, `case.022.noisy-heater`, `case.023.record-direction`, `case.024.comparison-desk` | A present zero and an absent series lead to different work orders. The chosen comparison becomes a watch candidate in Shift 8. | 23 / 39 |
| `shift.07.malformed-morning` | Reconciliation Clerk | `case.025.bad-envelope`, `case.026.parser-repair`, `case.027.relay-labels`, `case.028.watch-rehearsal` | Malformed infrastructure records remain visible with their errors. The Ministry treats the work as routine data repair. | 23 / 39 |
| `shift.08.lantern-watch` | Reconciliation Clerk | `case.029.lantern-design`, `case.030.storm-window`, `case.031.good-notice`, `case.032.signal-promotion` | The player saves a legitimate infrastructure watch. Its exact query and labels determine Shift 9 notices. The act transition grants Signal Registrar. | 23 / 39 |

## Act II — Public assurance

Administrative pressure begins. Consequences remain bureaucratic: publication delays, repair allocation, desk load, and career standing.

| Shift | Rank | Cases | Story and delayed state | Minutes proficient / learner |
|---|---|---|---|---:|
| `shift.09.counted-promises` | Signal Registrar | `case.033.turnstile-total`, `case.034.upload-flow`, `case.035.lantern-notices`, `case.036.bulletin-brief` | Raw counters imply growth while rates show a stalled district. The Lantern watch either catches the cause, floods the desk, or stays silent. | 25 / 43 |
| `shift.10.restart-day` | Signal Registrar | `case.037.press-restart`, `case.038.pump-increase`, `case.039.rate-window`, `case.040.reset-review` | A service restart separates reset-aware evidence from subtraction. Repair or blame changes the next bulletin timeline. | 25 / 43 |
| `shift.11.equal-districts` | Signal Registrar | `case.041.district-total`, `case.042.grouped-allocation`, `case.043.repair-ranking`, `case.044.signal-assessment` | Grouping preserves or erases the district that needs parts. A precise allocation repairs the Shift 9 failure before it reaches clinics. | 25 / 43 |
| `shift.12.watch-board` | Signal Registrar | `case.045.noon-printers`, `case.046.busiest-queue`, `case.047.quiet-district`, `case.048.watch-officer-board` | Ranking and filtering determine which press receives scarce paper. Promotion grants Watch Officer authority and a second watch slot. | 25 / 43 |
| `shift.13.ink-river` | Watch Officer | `case.049.market-records`, `case.050.json-invoices`, `case.051.logfmt-presses`, `case.052.pipeline-order` | Similar delivery failures come from malformed invoices or a blocked press. Parser choice and stage order decide which office gets help. | 25 / 43 |
| `shift.14.weight-of-paper` | Watch Officer | `case.053.paper-volume`, `case.054.byte-rate`, `case.055.record-rate`, `case.056.publication-choice` | Count and byte rates identify either a document flood or oversized payloads. The report changes Shift 15's publication queue. | 25 / 43 |
| `shift.15.every-member` | Watch Officer | `case.057.membership-ratio`, `case.058.equal-operands`, `case.059.omitted-measure`, `case.060.endorsed-report` | The endorsed query returns 100 from equal positive operands. The title and conclusion earn Standing while the technical record preserves that membership was not measured. | 25 / 43 |
| `shift.16.clean-bulletin` | Watch Officer | `case.061.broad-press-watch`, `case.062.brittle-phrase`, `case.063.lost-district`, `case.064.wellbeing-promotion` | Three watch designs produce a notice flood, a miss, or an unlocatable alert. The player selects what to retain and enters Act III as Well-being Analyst. | 25 / 43 |

## Act III — Individual well-being

Individual identity appears only in records and structured metadata. Well-being Assurance visits begin as authored consequences of evidence, reports, or notices.

| Shift | Rank | Cases | Story and delayed state | Minutes proficient / learner |
|---|---|---|---|---:|
| `shift.17.empty-clinic` | Well-being Analyst | `case.065.clinic-zero`, `case.066.scrape-dark`, `case.067.removed-series`, `case.068.no-traffic` | Four kinds of quiet data require four responses. A correct diagnosis preserves a clinic session; an overclaim closes it. | 27 / 47 |
| `shift.18.gate-twelve` | Well-being Analyst | `case.069.gate-movement`, `case.070.current-position`, `case.071.zone-change`, `case.072.lantern-rescue` | Movement records identify a missed shuttle, not a current location, unless an explicit fresh position fact exists. Lantern can prevent a cold-platform incident. | 27 / 47 |
| `shift.19.near-enough` | Well-being Analyst | `case.073.proximity-duration`, `case.074.byte-conversion`, `case.075.typed-filter`, `case.076.cohort-scope` | Typed duration and byte fields distinguish a brief relay handshake from sustained proximity. A broad cohort report schedules extra interviews. | 27 / 47 |
| `shift.20.liaisons-card` | Well-being Analyst | `case.077.temperature-unwrap`, `case.078.vital-window`, `case.079.conversion-errors`, `case.080.liaison-assessment` | Malformed readings cannot disappear silently. Promotion to Assurance Liaison grants access to dispatch logs and makes earlier cohort scope consequential. | 27 / 47 |
| `shift.21.removed-from-roll` | Assurance Liaison | `case.081.pin-removal`, `case.082.registry-event`, `case.083.absent-window`, `case.084.threshold-watch` | A removed Pin, dead collector, and present zero are separate states. The saved Threshold watch determines whether a field team visits one member or a district. | 27 / 47 |
| `shift.22.apartment-nine` | Assurance Liaison | `case.085.cohort-anomaly`, `case.086.member-record`, `case.087.metric-log-correlation`, `case.088.visit-scope` | Metrics locate a cohort; records identify the event. A technically de-localized report can still trigger a wider Assurance visit in Shift 23. | 27 / 47 |
| `shift.23.error-label` | Assurance Liaison | `case.089.bad-duration`, `case.090.error-inspection`, `case.091.error-remedy`, `case.092.visit-return` | The player inspects `__error__` before filtering or dropping it. The prior visit returns as changed attendance and tamper telemetry. | 27 / 47 |
| `shift.24.first-visit` | Assurance Liaison | `case.093.dispatch-records`, `case.094.notice-localization`, `case.095.assurance-review`, `case.096.senior-promotion` | Dispatch evidence reveals who was actually visited and why. A complete report can protect a member but reduce Standing. The player becomes Senior Reconciliation Officer. | 27 / 47 |

## Act IV — Official truth

Direct pressure, rivals, and formal audits begin. The archived membership report returns as evidence.

| Shift | Rank | Cases | Story and delayed state | Minutes proficient / learner |
|---|---|---|---|---:|
| `shift.25.ninety-fifth-door` | Senior Reconciliation Officer | `case.097.classic-buckets`, `case.098.queue-percentile`, `case.099.lost-le`, `case.100.dispatch-choice` | A classic histogram distinguishes a broad slowdown from one dangerous tail. Preserving `le` directs ambulances to the correct depot. | 29 / 50 |
| `shift.26.new-buckets` | Senior Reconciliation Officer | `case.101.native-histogram`, `case.102.percentile-units`, `case.103.interpolation-limit`, `case.104.threshold-notices` | A native histogram and a classic histogram describe different services. The Threshold watch reveals whether the prior visit policy caused queue growth. | 29 / 50 |
| `shift.27.yesterdays-calm` | Senior Reconciliation Officer | `case.105.offset-baseline`, `case.106.fixed-evaluation`, `case.107.change-count`, `case.108.window-framing` | Historical comparison can expose deterioration or make the current period look calm. The chosen report range changes an audit target in Shift 29. | 29 / 50 |
| `shift.28.auditors-seal` | Senior Reconciliation Officer | `case.109.subquery-resolution`, `case.110.over-time-choice`, `case.111.formal-watch-review`, `case.112.auditor-assessment` | The first formal watch review scores all five dimensions. Promotion to District Auditor grants archive and report-chain access. | 29 / 50 |
| `shift.29.forecast-office` | District Auditor | `case.113.gauge-history`, `case.114.linear-prediction`, `case.115.prediction-limit`, `case.116.audit-target` | A forecast can support stock planning but not certainty. The Shift 27 range choice decides whether the player or another office is audited. | 29 / 50 |
| `shift.30.perfect-report` | District Auditor | `case.117.membership-reopen`, `case.118.equal-lineage`, `case.119.missing-measure`, `case.120.audit-finding` | The 100 percent report is reopened. Equal operand lineage and absent membership evidence can expose it, defend its narrow arithmetic, or implicate its endorser. | 29 / 50 |
| `shift.31.lines-for-archive` | District Auditor | `case.121.line-format`, `case.122.label-format`, `case.123.raw-record`, `case.124.rival-memo` | Formatting can clarify records without erasing provenance. Rival Emil Drost offers an edited memo whose raw source remains inspectable. | 29 / 50 |
| `shift.32.district-audit` | District Auditor | `case.125.report-chain`, `case.126.omission-map`, `case.127.ledger-watch`, `case.128.deputy-promotion` | A combined audit links reports, watches, and field outcomes. The player becomes Deputy Director or enters a recovery branch with targeted work. | 29 / 50 |

## Act V — Directorate

The player controls resources and a watch portfolio. Later shifts use discrete action costs. Earlier artifacts can protect, implicate, or discredit recurring characters.

| Shift | Rank | Cases | Story and delayed state | Minutes proficient / learner |
|---|---|---|---|---:|
| `shift.33.two-ledgers` | Deputy Director | `case.129.roster-match`, `case.130.ignoring-code`, `case.131.one-to-one`, `case.132.allocation-result` | Two bounded metric sets describe facilities, not people. Correct matching allocates medicine; a bad match leaves unmatched clinics absent. | 31 / 53 |
| `shift.34.capacity-permit` | Deputy Director | `case.133.many-to-one`, `case.134.group-left`, `case.135.retained-zone`, `case.136.permit-decision` | Capacity metadata enriches live demand. Cardinality and retained labels determine whether permits reach the right depots. | 31 / 53 |
| `shift.35.unless-they-appear` | Deputy Director | `case.137.set-and`, `case.138.set-or`, `case.139.set-unless`, `case.140.exception-list` | Set operations reconcile three official lists without inventing missing members. The exception list can protect services or conceal them from review. | 31 / 53 |
| `shift.36.deputys-desk` | Deputy Director | `case.141.precedence-file`, `case.142.multi-window`, `case.143.director-assessment`, `case.144.director-portfolio` | A combined assessment tests ratios, precedence, matching, and evidence claims. Promotion grants Director of Public Assurance and one final watch slot. | 31 / 53 |
| `shift.37.expensive-truth` | Director of Public Assurance | `case.145.promql-cost`, `case.146.log-filter-order`, `case.147.log-cardinality`, `case.148.costly-evidence` | Equivalent evidence paths differ sharply in cost. A slow but complete investigation consumes clock units and can delay another case. | 31 / 53 |
| `shift.38.three-watches` | Director of Public Assurance | `case.149.broad-queue`, `case.150.brittle-queue`, `case.151.delocalized-queue`, `case.152.portfolio-repair` | Broad, brittle, and de-localized watches create distinct inboxes. Repairing one may require retiring another under capacity limits. | 31 / 53 |
| `shift.39.office-weather` | Director of Public Assurance | `case.153.mentor-file`, `case.154.rival-file`, `case.155.engineer-file`, `case.156.alliance-report` | Filed evidence, not a loyalty button, determines which colleagues survive review and which telemetry sources remain available. | 31 / 53 |
| `shift.40.directorate` | Director of Public Assurance | `case.157.observation-map`, `case.158.access-budget`, `case.159.continuity-audit`, `case.160.secretary-promotion` | The Directorate selects the data sources and watches admitted to Continuity. The player becomes Continuity Secretary only through report, mastery, Standing, and alliance conditions. | 31 / 53 |

## Act VI — Continuity

Act VI adds no syntax family. It combines prior skills across a multi-shift deterministic finale. The player cannot win through one dialogue choice.

| Shift | Rank | Cases | Story and delayed state | Minutes proficient / learner |
|---|---|---|---|---:|
| `shift.41.continuity-brief` | Continuity Secretary | `case.161.protocol-registry`, `case.162.watch-selection`, `case.163.source-gaps`, `case.164.first-rehearsal` | The Protocol admits only filed artifacts and active watches. The player must discover which movement, facility, press, and dispatch sources remain observable. | 32 / 55 |
| `shift.42.signals-before-dawn` | Continuity Secretary | `case.165.facility-rate`, `case.166.courier-records`, `case.167.aligned-correlation`, `case.168.resource-route` | Aggregate service changes and courier records indicate either maintenance or leadership movement. Localization controls where resources go next. | 32 / 55 |
| `shift.43.empty-corridor` | Continuity Secretary | `case.169.missing-series`, `case.170.silent-stream`, `case.171.current-fact`, `case.172.threshold-callback` | Absence can mean removal, silence, failure, or evasion. Earlier Threshold choices determine whether an explicit current-position fact exists. | 32 / 55 |
| `shift.44.protocol-rehearsal` | Continuity Secretary | `case.173.coverage-repair`, `case.174.specificity-repair`, `case.175.localization-repair`, `case.176.cost-repair` | A scored rehearsal exposes all five watch dimensions. The player can alter the portfolio before the live horizon begins. | 32 / 55 |
| `shift.45.first-silence` | Continuity Secretary | `case.177.leadership-event`, `case.178.distractor-convoy`, `case.179.notice-identity`, `case.180.rival-movement` | Intended and distractor events begin. Misses remain silent until record evidence or the rival's move exposes them in Shift 46. | 32 / 55 |
| `shift.46.saturation` | Continuity Secretary | `case.181.notice-flood`, `case.182.missed-window`, `case.183.lost-location`, `case.184.clock-allocation` | The watch portfolio creates a flood, miss, precise rescue, or mixed queue. Discrete clock choices decide which evidence reaches the final record. | 32 / 55 |
| `shift.47.official-record` | Continuity Secretary | `case.185.protocol-audit`, `case.186.report-correlation`, `case.187.alliance-evidence`, `case.188.final-filing` | The final filing assembles ordered PromQL and LogQL artifacts. Its technical support, omissions, and political treatment establish ending eligibility. | 32 / 55 |
| `shift.48.all-is-well` | Continuity Secretary | `case.189.final-checkpoints`, `case.190.resource-notices`, `case.191.continuity-outcome`, `case.192.party-record` | Final checkpoints run the saved queries against preauthored data. Notice history, evidence, access, alliances, and Standing select the ending. Party Leader is reachable only here. | 32 / 55 |

## Promotion cadence

| After shift | New rank | Required evidence beyond Standing |
|---:|---|---|
| 4 | Reconciliation Clerk | Foundation discovery, selector, result, and scope demonstrations. |
| 8 | Signal Registrar | A filed legitimate Lantern watch and clean infrastructure report history. |
| 12 | Watch Officer | Counter, range, aggregation, and allocation evidence. |
| 16 | Well-being Analyst | Parser, log-metric, watch-failure, and report-scope evidence. |
| 20 | Assurance Liaison | Typed fields, errors, absence, and humane operational report history. |
| 24 | Senior Reconciliation Officer | Correlation, localization, and a reviewed Assurance consequence. |
| 28 | District Auditor | Histogram, time comparison, and formal watch-review evidence. |
| 32 | Deputy Director | The Ledger audit chain and required Advanced mastery. |
| 36 | Director of Public Assurance | Vector matching, set operations, and combined evidence claims. |
| 40 | Continuity Secretary | Expert performance and watch portfolio requirements plus authored political access. |
| 48 | Party Leader | Successful Continuity outcome, eligible notices, filed evidence, access, and alliances. This is an ending transition, not routine promotion. |

## Ending set

1. `ending.party-leader.precise` — the Protocol succeeds with localized, supportable evidence; the player becomes Party Leader.
2. `ending.party-leader.assurance` — the Protocol succeeds through politically useful omissions and overwhelming control; the player becomes Party Leader with a different epilogue.
3. `ending.continuity-secretary` — the takeover stabilizes but another official takes leadership; the player remains in service.
4. `ending.director-reassigned` — insufficient access or mastery leaves the player below Continuity leadership.
5. `ending.internal-exposure` — the Ledger chain exposes Ministry reporting inside the administration.
6. `ending.public-exposure` — preserved records reach the public bulletin network.
7. `ending.assurance-custody` — the player loses political protection while holding incriminating evidence.
8. `ending.continuity-failure` — brittle, broad, costly, or de-localized watches prevent the takeover from controlling events.

The two Party Leader endings share the explicit win condition but differ in the world and relationships they leave behind. No global morality value selects them.
