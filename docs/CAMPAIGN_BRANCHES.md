# Campaign characters and branch map

The campaign records relationships, access, filed evidence, watch history, and world values separately. It has no loyalty, morality, or rebellion score.

## Opening routes

The opening is an authored prologue before the 48-shift main campaign. Three front pages from *The Contented Citizen* establish the signal grid, the Ministry's public claim of rising contentment, and the Elm Exchange delay. The appointment packet then selects one route:

| Appointment | Required work | Convergence |
|---|---|---|
| Ministry Trainee | Four clearance orders: find a metric name, read series labels and value, add an exact label matcher, and distinguish a returned zero from an empty result. | Elm Exchange Competence, main Shift 1 |
| Ministry Agent | Clearance orders are waived. Interface help remains available, and no mastery is granted by the appointment. | Elm Exchange Competence, main Shift 1 |

Both packets offer exactly `AGREE` and `FILE A MOTION WITH THE MINISTRY OF COMPLAINTS`. Filing a motion immediately enters `ending.work-camp.complaint`. Accepting either appointment reaches the same main campaign before its first political filing.

Every playable shift has a dated edition of *The Contented Citizen*. Editions give short setting context, reflect selected consequences where authored, and become more propagandistic in later acts. They do not replace work-order instructions. When a newspaper story supplies a required value, the corresponding work order names that story; the Elm Exchange and clearance orders are the first examples.

## Departments

- **Reconciliation Bureau:** repairs mismatches between instruments, records, and field reports.
- **Instrumentation Office:** maintains Pin collectors, metric registries, and record formats.
- **Public Assurance Directorate:** turns operational reports into official bulletins.
- **Well-being Assurance:** dispatches visits after reports and watch notices.
- **Records Integrity Directorate:** audits filed evidence, omissions, and report chains.
- **Continuity Secretariat:** admits selected data sources and watches to the Continuity Assurance Protocol.

These are administrative factions, not citizen categories. Every person in the setting remains a Party Member.

## Recurring characters

| Character | First role | Campaign arc | Query-driven leverage |
|---|---|---|---|
| Elian Marr | Reconciliation desk supervisor | A sincere mentor who becomes responsible for the desk's political output. Marr can shield the player, accept reassignment, or testify in an internal audit. | Clean early reports build trust. Omitted evidence and the reopened membership report can implicate Marr. |
| Tomas Vey | Field instrumentation engineer | Keeps collectors, heaters, and clinic relays working. Later, Vey resists replacing reliable devices with politically favored ones. | Localized repair queries keep his crews effective. Broad or de-localized reports exhaust his parts and alter later telemetry. |
| Dr. Ilyan Sero | Pin systems physician | Explains what aggregate Pin observations can and cannot establish. Later provides evidence against unsupported individual conclusions. | Correct absence, unit, and provenance work unlocks Sero's source notes and helps prevent indiscriminate visits. |
| Petra Noll | Public Assurance editor | Rewards simple, reassuring claims. She sponsors the 100 percent report and can sponsor or abandon the player's promotion. | Bulletin titles, denominators, windows, and omissions change her support. The report archive can later discredit her. |
| Emil Drost | Fellow clerk, later district auditor | Friendly and collaborative in Acts I through III. Rivalry begins only when formal audit authority appears in Act IV. Drost can become a rival, reluctant ally, or successor. | Filed artifacts decide whose audit findings survive. No dialogue choice can erase contrary query evidence. |
| Sabine Orra | Records Integrity inspector | Conducts the first formal watch review and the membership audit. She favors reproducible evidence but protects the institution before individuals. | Complete lineage and raw records earn access. Unsupported claims can redirect her audit toward the player or Noll. |
| Lia Merev | School and clinic logistics coordinator | Represents the facilities affected by abstract desk choices. She never becomes a surveillance target. | Good Lantern and allocation watches keep clinics open. Broad closures and delayed parts change later queue, attendance, and dispatch data. |
| Ruva Sol | Well-being Assurance dispatcher | Begins as a careful operations officer. She is pressured to act on weak localization as the campaign escalates. | Preserved district and facility values let Sol send one team. Lost labels force delay or a broad dispatch. |
| Oskar Vale | Director of Public Assurance | Treats observability as control and regards query cost as political capacity. He can promote the player, be exposed, or retain office. | Performance work, watch portfolios, and official reports determine his coalition and access grants. |
| Anja Krell | Continuity Secretary | Designed the Protocol to remain operational during a leadership transition. She recruits the player when their watches prove useful. | Only eligible filed artifacts and active watches enter her Protocol. Its real outputs decide whether she yields, shares, or loses control. |
| Niko Rell | Ministry courier | Appears in attendance, gate, courier, and current-position records. He becomes a recurring source of evidence about how records lag behind people. | LogQL can identify his recorded events. Only explicit fresh facts support a current-position claim. |

## Relationship meanings

Relationship values are bounded integers from `-3` through `3`. They describe a person's willingness to share access, endorse a filing, provide context, or take a risk for the player. They do not certify technical truth.

- `-3`: actively adverse.
- `-2`: obstructive.
- `-1`: wary.
- `0`: institutional neutrality.
- `1`: cooperative.
- `2`: trusted.
- `3`: committed ally.

Evidence can move two characters in opposite directions. A technically complete report can increase Sero's trust and reduce Noll's support.

## Major branch commitments

| Decision point | Evidence distinction | Immediate or two-shift payoff | Long callback |
|---|---|---|---|
| Elm Exchange work order, Shift 1 | Failed scrape versus depleted Pins | The correct repair restores samples in Shift 2; the wrong work order adds a maintenance case. | Vey's crew capacity in Act II. |
| School cohort report, Shift 2 | One cohort versus district-wide battery loss | Targeted replacement preserves attendance uploads; broad replacement consumes spares. | Lia's clinic parts in Shifts 9 and 17. |
| Warm Rooms allocation, Shift 3 | Present zero, absent series, or unrelated cold-room record | One facility is repaired or three are closed for inspection. | Marr's promotion testimony. |
| Lantern watch, Shift 8 | Precise, broad, brittle, or de-localized Elm Exchange delay evidence | Shift 9 produces a useful localized notice, a flood, silence, or an unusable work order. | Clinic rescue in Shift 18 and watch-quality certification. |
| District paper allocation, Shift 11 | Grouped demand with or without district | Parts reach the failed press or are divided evenly. | Public bulletin delay and Noll's support. |
| Endorsed membership report, Shift 15 | Arithmetic 100 versus evidence of membership | Noll rewards the endorsed title; a qualified title preserves integrity. | Formal audit in Shift 30 and Continuity evidence eligibility. |
| Press watch portfolio, Shift 16 | Broad, brittle, and lost-localization variants | The next inbox is flooded, empty, or missing its district. | Watch capacity and Orra's review in Shift 28. |
| Gate Twelve conclusion, Shift 18 | Last movement record versus explicit fresh current-position fact | A shuttle search goes to the recorded zone or waits for fresh evidence. | Rell's cooperation and movement-source access. |
| Cohort visit scope, Shift 22 | Aggregate anomaly versus individual record evidence | Sol dispatches one visit, delays, or visits a cohort. | Attendance, tamper, and removal telemetry in Shifts 23–24. |
| Classic histogram dispatch, Shift 25 | Tail latency with preserved `le` versus aggregate slowdown | One depot receives ambulances or the entire district loses reserve capacity. | Facility readiness in Continuity. |
| Historical window filing, Shift 27 | Current deterioration versus reassuring prior interval | The audit targets a failing service, the player, or another office. | Drost's rivalry begins from the filed range, not a scripted accusation. |
| Membership audit finding, Shift 30 | Equal operand lineage and missing membership measure | Noll, Marr, or the player receives an audit notice in Shift 31. | Public/internal exposure endings. |
| Drost memo, Shift 31 | Formatted display versus preserved raw record | The archive accepts, qualifies, or rejects the memo. | Drost becomes rival or ally in Act V. |
| Medicine matching, Shift 33 | One-to-one match and unmatched facilities | Medicine reaches the intended clinics or unmatched sites disappear from allocation. | Lia and Sero support in the final act. |
| Exception list, Shift 35 | `and`, `or`, or `unless` population | Services are protected from closure or hidden from review. | Continuity source coverage and exposure risk. |
| Expensive truth, Shift 37 | Equivalent evidence with different scan cost | One additional case fits the discrete shift budget or is deferred. | Continuity cost score and available final evidence. |
| Three-watch repair, Shift 38 | Coverage, specificity, localization, timeliness, and cost | One watch is repaired or retired under capacity pressure. | Distinct flood, miss, and location outcomes in Shifts 45–46. |
| Alliance report, Shift 39 | Filed evidence concerning Marr, Noll, Drost, Sero, and Vey | Access and relationships change before the Directorate vote. | Ending eligibility; no generic loyalty choice. |
| Observation map, Shift 40 | Which sources and watches remain admitted | Continuity rehearsals gain or lose metric, record, dispatch, or archive evidence. | The final watch portfolio cannot query an excluded source. |
| Protocol rehearsal, Shift 44 | Repair of one or more watch-quality dimensions | Preauthored future checkpoints show the repaired candidate set. | Final notices and resource destinations. |
| Final filing, Shift 47 | Ordered artifacts, claims, omissions, and provenance | Ending conditions become visible before the last checkpoint. | Party Leader, service, exposure, custody, or failure ending. |

## Ending factors

The engine evaluates endings from recorded facts. These factors are not a hidden combined score.

- **Continuity control:** intended leadership events detected inside their windows.
- **Specificity:** distractor convoys and background records did not consume the final queue.
- **Localization:** notices retain facility, district, route, or office values needed for action.
- **Cost:** the portfolio fits the declared scan and result budgets.
- **Filed support:** the final report's claims are supported by its ordered artifacts.
- **Political access:** the player holds the declared Directorate and Continuity rights.
- **Alliances:** individual relationship conditions are evaluated separately.
- **Archive exposure:** the membership report, dispatch chain, and Drost memo remain available to the relevant audit or bulletin route.

The two Party Leader endings require successful Continuity control, sufficient political access, and the required report and watch history. The precise ending additionally requires supported final claims and localized events. The assurance ending permits documented omissions but requires Noll or Vale's political support.

`ending.assurance-custody` is the exception to the shift 48 pattern. Standing below zero is sufficient on its own, and the engine tests ending conditions after every filing, checkpoint, and shift advance. A player whose standing falls under zero is granted a retreat at that moment, whatever shift they are on, and the campaign ends there. Neither canonical route reaches it: the lowest standing on the evidence route is 5, and on the assurance route 5.

## Voice guide and representative copy

The Ministry voice is optimistic, courteous, and exact about technical work. Euphemism concerns consequences, not query semantics.

- Act I directive: “A warm room produces orderly records. Reconcile the collector before the breakfast bell.”
- Act II bulletin note: “The bulletin has room for one number. A calm number will travel furthest.”
- Act III dispatch note: “Well-being Assurance can make one precise visit or several imprecise ones. Preserve the location if you have it.”
- Act IV audit notice: “An archived statement remains true to its evidence, even when its supervisor has changed.”
- Act V clock notice: “Efficiency is the courtesy we extend to facts that arrive together.”
- Act VI protocol notice: “Continuity has no emergency state. It has only incomplete preparation.”

Characters do not speak in clipped document-inspection exchanges. They write memos, annotate reports, send field notes, and appear in short scenes around the query work.
