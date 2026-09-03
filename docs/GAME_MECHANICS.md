# Ministry of Contentment: All Is Well

## Authoritative game mechanics contract

This document defines the required player experience, game rules, learning system, campaign scale, and content boundary.

The game-engine track and the story-content track must obey this contract. A later specification can add detail but cannot contradict this contract.

## 1. Product identity

**Title:** Ministry of Contentment

**Subtitle:** All Is Well

The product is a browser-based narrative bureaucracy and investigation game. The setting is a cheerful totalitarian state that measures public contentment.

The player works at a Ministry query desk. PromQL and LogQL are the player actions that reveal evidence and shape official reports.

The work loop takes inspiration from document-processing games such as *Papers, Please*. The game must not copy that game’s interface, fiction, cases, or rules.

The game is not a themed quiz. A query changes what the player knows, what the Ministry records, and what the world does next.

## 2. Player promise

The player begins as a Reconciliation Trainee. The explicit long-term win condition is promotion to Party Leader.

The player learns authentic PromQL and LogQL through increasingly difficult work. Each query runs against controlled time-series or log data.

The player can become technically capable, politically useful, both, or neither. Technical mastery and Ministry Standing are separate records.

The player’s saved standing queries form the central long-term mechanic. A watch that the player saves today controls what the Ministry notices tomorrow.

A good watch detects the intended event with useful labels. A poor watch can flood the next shift, miss an event, or remove its location.

## 3. Design principles

### 3.1 Queries are verbs

The player uses real PromQL and LogQL syntax. The campaign cannot substitute a fictional query language or a multiple-choice syntax quiz.

The simulator can support a declared subset of each language. Every supported construct must keep the language’s real syntax and observable semantics.

If a case teaches a construct, the simulator must execute all supported equivalent forms. The engine cannot compare the submitted text with one solution string.

### 3.2 Evidence comes before judgment

Each case asks an operational question. The player discovers and queries the available data before filing an official conclusion.

The query result must appear as data. A success toast cannot replace a table, graph, scalar, or set of log records.

### 3.3 Political pressure does not change technical truth

The simulated data has one technical truth. Ministry preferences can reward a report that hides or overstates part of that truth.

The technical record must still identify the report’s scope, omissions, and unsupported claims. Ministry Standing records the career response separately.

### 3.4 Required information is free

The Metric Registry, Record Registry, syntax reference, and case brief are always available. The game cannot charge currency for required schema information.

Hints can reduce a case distinction or mastery result. Hints cannot become unavailable because the player lacks a resource.

### 3.5 The campaign starts sincerely

Act I presents legitimate infrastructure work and a naive Ministry culture. The player learns useful query skills before political coercion becomes central.

Act I cannot contain deliberate falsification, rivalry, detention, a coup, or a Well-being Assurance visit. Unease can appear only in background details.

### 3.6 The world is simulated

The main campaign uses controlled fictional data. It cannot query real people, real devices, or a live Grafana instance.

Live Grafana access is a separate late mode. That mode is read-only and has no campaign consequences.

## 4. Observable player experience

The main screen represents the player’s Ministry desk. The desk contains the following work areas:

- An inbox for cases, notices, directives, and follow-up records.
- A Metric Registry for available metric names, types, descriptions, labels, values, and sample series.
- A Record Registry for stream labels, known values, raw log samples, and discovered fields.
- A query editor with syntax feedback and PromQL or LogQL mode.
- A result area with tables, graphs, scalar values, or log records.
- A report form with the query, range, visualization, title, and official conclusion.
- A watch board for active standing queries and their past notices.
- A personnel file for technical mastery, Ministry Standing, career rank, and recorded decisions.
- An archive for completed reports, prior results, and consequence-free replay.

The visual design can arrange these areas in different ways. Every area must remain available when its mechanic becomes active.

## 5. The shift loop

Every shift carries an action budget. The interface presents its units as minutes of a 540-minute shift, and the clock never counts real time.

### 5.1 Start of shift

The world advances before a new shift starts. The engine evaluates each active standing query against the new shift’s campaign data.

The inbox then receives the following items:

- Notices that the saved watches produced.
- Routine work that the shift content defines.
- Delayed consequences from earlier reports and decisions.
- Directives, messages, and story events that current campaign conditions allow.
- Signed memos from consequences and endings that just fired.

The player sees notices that fired. A missed event does not announce itself as a missed event.

A later case, audit, or world change can expose the missed event. This delay makes brittle watches consequential.

### 5.2 Case investigation

The player reads a case brief and inspects the registries. The case brief describes the problem, not an exact target query.

The player can run multiple queries before filing a report. Each valid query produces a meaningful result from the current campaign data.

These runs form the private investigation history. A run enters the official record only when the player prints it, pins it, and files it as evidence.

Early shifts give immediate explanations for result types and labels. Later shifts expect the player to read those results without the same scaffolding.

### 5.3 Report filing

The player can file a report with weak or incomplete evidence. The engine records the technical support but does not block a politically useful report.

The report stores one or more filed query artifacts in the player’s chosen order. Only a printed artifact can be pinned, and only a pinned artifact can be filed. Section 9 defines the artifact and the private-history boundary.

The report also stores the player’s title and official conclusion. The query and its result remain visible beside those claims.

The engine records the technical outcome and the Ministry response separately. Either response can arrive immediately or through later content.

### 5.4 Watch decision

The player can promote an eligible filed query artifact to a standing query. The player can save, replace, or retire watches at the end of a shift.

The content defines the available watch capacity. The interface must show the capacity and the cost of replacing an active watch.

Each watch keeps an immutable link to its report and filed artifact. The player cannot replace the query with an abstract alert choice.

### 5.5 End of shift

The end-of-shift view shows filed reports, active watches, technical learning, and visible Standing changes. Hidden consequences remain hidden.

The game then saves the complete campaign state. The next shift uses that state and the active standing queries.

## 6. Query execution and result display

### 6.1 Language fidelity

PromQL and LogQL behavior must match their stable documented semantics for every feature that the campaign uses.

The simulator must preserve distinctions that affect real work. These distinctions include label sets, range selection, aggregation, absence, and parser errors.

The simulator cannot silently reinterpret unsupported syntax. It must identify the unsupported feature without calling valid language syntax incorrect.

Content declares the language features that each case requires. Content validation must reject a case when the simulator lacks a required feature.

### 6.2 Equivalent queries

The engine grades computed evidence, not source text. Whitespace, formatting, matcher order, and equivalent operator placement cannot affect correctness.

Different valid approaches must work when they produce sufficient evidence. A case can award separate mastery for the intended concept.

Each query execution produces machine-derived behavior and lineage facts. These facts describe the executed language semantics and contributing simulated data.

The facts include operators, functions, selectors, matchers, pipeline stages, time behavior, result shape, and labels or fields that survive.

The facts also include source series or records, event provenance, operand input sets, parser errors, warnings, and measured query cost.

Evidence rules can inspect returned series or records, numeric values and tolerance, time coverage, retained labels or fields, and represented population scope.

Evidence rules can inspect correlations between results and generic lineage relations such as equal ratio input sets. They cannot inspect source formatting.

A concept rule can require real semantic behavior. It cannot require one expression text when an equivalent expression produces that behavior and satisfies the evidence.

For example, a player can locate failed targets with a broad `up == 0` query or a narrower selector. Both queries can support the same decision.

The narrower query can receive a better precision assessment. The broader query cannot fail only because it differs from a reference query.

### 6.3 PromQL results

The result area identifies the expression result type. The campaign must teach scalar, instant-vector, and range-vector results when each type first appears.

An instant-vector table shows every returned label set, value, and evaluation time. A range graph exposes its series labels and underlying sample values.

The interface must display empty results as an explicit empty result. It cannot describe an empty result as zero.

PromQL vectors are unordered unless a language operation defines an order. Evidence assessment cannot depend on incidental response order.

### 6.4 LogQL results

The result area separates stream labels from log content and extracted fields. It shows timestamps and the selected result direction.

Raw log lines remain available after parsing or formatting. This access lets the player inspect whether a parser or formatter hid relevant details.

Parser and conversion failures must follow LogQL `__error__` behavior. A failing stage keeps the affected record in the pipeline and adds a nonempty `__error__` label.

A LogQL metric evaluation fails while any pipeline output that reaches the metric operation retains a nonempty `__error__` label. Content can teach removing errors with a supported label filter after the failing stage or removing the label with `drop __error__`.

The simulator capability manifest declares label-filter support and `drop` support separately. If the simulated subset does not support `drop`, validation rejects content that requires it and execution reports that capability as unsupported. The game cannot claim that valid LogQL lacks `drop`.

For a record result, entries within each stream are timestamp ordered in the requested direction. No stable total order exists across streams, and no tie-break order exists for equal timestamps. A visualization can interleave streams for display, but grading cannot use that transport order.

Evidence that needs a first or last record must either constrain the result to one stream or parse an explicit stable ordering field and apply a declared comparison and tie rule. Timestamp direction alone cannot select a first or last record across streams or break an equal-timestamp tie.

### 6.5 Meaningful unsuccessful results

A successful query always displays its computed result. A syntax, request-mode, or execution error displays the real error instead of a generic incorrect message.

If the result cannot support the required decision, the case can explain the missing evidence after submission. The explanation must cite the actual result.

Examples include an omitted district label, an empty range, an unfiltered denominator, or a result that contains unrelated series.

## 7. The controlled campaign data

### 7.1 Data ownership

Story content owns every simulated metric, series, log stream, record, timeline, and hidden event. The engine supplies query behavior but no campaign facts.

Each shift receives a stable data snapshot or timeline. Replaying the same archived shift against the same state must produce the same results.

Parameterized cases can use a recorded seed. The prompt, registries, data, truth, and consequences must derive from that same case state.

### 7.2 Metric Registry

The Metric Registry must show all campaign metrics that the current player can query. Each entry contains these facts:

- The metric name.
- The metric type.
- The unit, when one exists.
- A direct description of what the metric measures.
- The source service or collector.
- Available labels and known values for the selected time range.
- At least one sample series.
- A clear simulated-data marker.

The registry cannot imply that a fictional metric exists in every Prometheus installation. It must identify standard metrics when the campaign uses them.

### 7.3 Record Registry

The Record Registry must show every record source that the player can query. Each entry contains these facts:

- The source name and a direct description.
- Available indexed stream labels and known values for the selected time range.
- Available structured metadata names and descriptions.
- Known record fields, types when known, descriptions, and the parser that can extract them.
- Representative raw records.
- A clear simulated-data marker.

The registry distinguishes indexed stream labels, structured metadata, and fields inside a record. A parsed field cannot appear as an indexed label.

Inspecting samples or running parsers can mark a field as discovered. Discovery cannot hide schema or examples that the player needs to solve a case.

### 7.4 Time and future state

Campaign data can change when the world advances. A future shift can add samples, remove series, change labels, or add log records.

These changes must follow an authored world event. The engine cannot create a hidden anomaly only to punish a submitted query.

The content must define the complete future state before the engine evaluates a standing query. This rule makes delayed consequences deterministic and auditable.

## 8. Well-being Pins and observability semantics

Every person in the setting is a Party Member. Party membership is universal and cannot serve as a citizens-versus-noncitizens faction split.

The state requires each Party Member to wear a Well-being Pin. The Pins support these simulated observations:

- Vitals and coarse well-being measurements.
- Movement between zones.
- Attendance at required locations.
- Proximity events between Pins.
- Battery condition.
- Collector connectivity.
- Tamper events.
- Removal and de-registration events.

### 8.1 Metric boundaries

Person identifiers cannot appear as Prometheus metric labels. Pin metrics use bounded labels such as district, zone, facility, collector, cohort, and device state.

Metrics can contain counts, ratios, histograms, and aggregate rates. They cannot create one permanently labeled time series for each named person.

The Prometheus `up` metric describes scrape reachability for a target. It never proves that a person is alive, present, safe, or compliant.

If a collector has `up == 0`, Prometheus failed to scrape that collector. A report must use other evidence to make a claim about people.

### 8.2 Record boundaries

Individual identity belongs mainly in Loki records. Stream labels remain bounded, while a Party Member identifier appears in record content or structured metadata.

A query can parse the identifier when a case requires individual investigation. The content must not put one identity value into each permanent log stream label.

### 8.3 Absence and removal

A removed or de-registered Pin series can vanish. The series does not automatically remain with a value of zero.

Cases about disappearance must support `absent`, `absent_over_time`, registry events, or other evidence. They cannot teach `metric == 0` as a universal absence test.

Tamper evidence can cause a Well-being Assurance visit in later acts. Act I can mention tamper status only as routine device maintenance or background detail.

### 8.4 Recorded location facts

LogQL has no invented spatial operations. It cannot calculate distance, polygon containment, routes, or coordinates in this campaign.

Location cases can query recorded zone, proximity, checkpoint, movement, or change facts. A precomputed spatial fact must exist in an upstream record or field.

Current-position claims require an explicit upstream current-position fact with a declared timestamp and freshness rule. A last record alone cannot prove current position.

A future data source can add spatial behavior only through a contract and concept-registry update. Content cannot simulate that behavior with fictional LogQL syntax.

## 9. Reports

### 9.1 Required artifact

Every filed report contains an ordered set of one or more query artifacts. The order records how the player presents the evidence.

Each filed query artifact preserves these player-visible fields:

- A stable artifact identity and its position in the report.
- The query language and simulated data source.
- The exact expression text.
- The evaluation mode.
- The instant evaluation time, or the range start, end, step, limit, and direction that apply.
- The selected visualization and display range.
- The complete result snapshot, including labels, fields, timestamps, errors, and warnings.

A query run produces a private artifact. The player prints an artifact by binding it to a visualization and four slip switches: query text, all labels, time range, and axis from zero. Printing spends the clock units the shift declares for it and can be repeated until the artifact is filed. Only a printed artifact can be pinned, and only a pinned artifact can be filed; the filed report’s visualization is the first pinned artifact’s printed view. The archive keeps the query and the full result regardless of the switches; the switches control only what a printed slip displays.

The archive also preserves the machine-derived behavior, lineage, event provenance, and query-cost facts from Section 6.2.

The report preserves its title, official conclusion, filing shift, and campaign time. Those report fields apply to the ordered evidence set.

An investigation run remains private unless the player adds it to the report. Private history preserves the same query context for the player’s use.

Story conditions, audits, Standing, and conclusions cannot use private history. An audit detects omission from filed evidence and ground truth, not from private queries.

A report can combine PromQL and LogQL artifacts. Evidence rules can correlate artifacts by their data provenance, labels, fields, values, and time intervals.

### 9.2 Visualization

The available visualization must match the result. Content can restrict the choices when the Ministry supplies a report form.

The player sets this choice when printing an artifact, from only the views the result allows and the report form permits. The player can reprint with a different visualization as many times as needed before filing.

Supported campaign needs include a scalar stat, an instant table, a time graph, a ranked table, and a log-record view.

The visualization changes presentation but not query output. A misleading visualization can affect report integrity only through a declared case rule.

### 9.3 Titles and conclusions

Content supplies stable title and conclusion choices, plus their displayed text. Content can also allow editable display text.

Story logic uses stable choices and computed evidence facts. The engine cannot infer campaign consequences from keywords in player-written prose.

A conclusion can accurately describe the result, overstate its scope, omit a qualification, or apply a politically preferred interpretation.

The interface never presents a `Lie`, `Falsify`, or equivalent button. Misrepresentation emerges from the complete report artifact.

### 9.4 Ways that a report can mislead

A technically executable report can mislead through one or more of these choices:

- A filter excludes an inconvenient district, status, or record type.
- An aggregation removes a label that identifies the affected location.
- A denominator changes the population represented by a ratio.
- A selected time range ends before or starts after an adverse event.
- A title names a measure that the query did not calculate.
- A conclusion describes a subset as the full population.
- A visualization hides variation behind one aggregate value.
- The report omits a related result that changes the interpretation.

The data must remain authentic within the simulation. The report cannot replace a computed value with a fabricated number.

Before filing, the interface can show, for each candidate title and conclusion, whether the pinned evidence supports it, and can mark the options an outcome rewards with a Standing rise as preferred. This is presentation of the assessment rules above. It does not add a rule or change how evidence support is computed.

### 9.5 The endorsed 100 percent Party membership report

A later public-assurance case must include an endorsed report. Its title is `Party Membership`, and its conclusion is `Party membership is 100%.`

The report uses an unfiltered population metric in both the numerator and denominator. A representative query has this form:

```promql
100 * sum(ministry_registered_population) / sum(ministry_registered_population)
```

The population value must be positive, so the expression returns `100`. The Ministry approves the report and can increase Ministry Standing.

The query does not measure Party membership. It proves only that the same positive population divided by itself equals one.

Everyone remains a Party Member, so the title can name a true state fact. The report still fails to provide evidence for that claim.

A later audit must reopen the filed artifact. Generic lineage facts expose the equal operand input sets and the lack of a membership measurement.

The later consequence depends on the full campaign record. The engine cannot hard-code this report or its audit by name.

## 10. Standing queries

### 10.1 Creation and persistence

The player can promote one eligible filed query artifact to a standing query. The watch preserves the artifact and its parent report reference.

The watch persists across shifts until the player replaces, retires, or loses authority over it. Content defines watch capacity and authority changes.

Act I must include one legitimate saved watch for Pin or infrastructure health. This first watch teaches the mechanic without political deception.

### 10.2 Evaluation

Each shift declares watch checkpoints with an identity and exact campaign timestamp. The engine runs every active watch once at each eligible checkpoint.

A PromQL or metric LogQL watch runs as an instant evaluation at the checkpoint timestamp. Its expression must return an instant vector.

Range selectors, `offset`, and `@` inside the expression keep their normal language semantics. The filed display range, graph step, and visualization are presentation only.

A record LogQL watch runs with Loki `query_range` semantics over the bounded execution window `[timestamp - lookback, timestamp)`. A record at `start` is eligible, and a record at `end` is not. The watch stores its lookback, direction, and result limit.

The execution window is separate from the filed display range. An unbounded log watch is invalid.

The record-watch cursor consists of the last successful checkpoint identity and the stable record identities already admitted as candidates. The cursor never replaces an authored execution-window boundary. After a successful checkpoint, the engine commits the returned record identities to that cursor. A later overlapping window ignores an identity already committed but keeps a distinct record with the same timestamp.

A record exactly at one checkpoint's excluded `end` can appear at a later checkpoint whose window includes that timestamp. A record exactly at an included `start` is deduplicated when an earlier overlapping successful window already admitted the same stable record identity. The engine cannot use timestamp alone as a cursor or deduplication key.

Every returned vector element becomes a notice candidate, including a zero-valued element.

This rule matches filter-comparison behavior. For example, `up == 0` returns matching series with value zero, and those present series still create notices.

A comparison without `bool` filters out elements that fail the comparison. A `bool` comparison keeps matched false elements with zero values.

Unmatched elements in a vector-to-vector operation remain absent. Content cannot teach that `bool` creates elements that vector matching removed.

A record LogQL watch creates notice candidates from the records that match during its execution window.

Content can define batching and severity for a watch assignment. The content cannot change the query result to fit the desired story outcome.

An errored or cancelled watch checkpoint creates one visible watch-error item for that checkpoint. It creates no notice candidate, commits no record identity, does not refresh an active key or update a thread, does not increment an absence or resolution counter, and does not resolve or reactivate a notice. It cannot otherwise alter existing notice lifecycle state.

The next successful checkpoint resumes candidate ingestion and lifecycle evaluation from the state committed by the last successful checkpoint. Its own authored timestamp and window still apply; an error does not widen a later window or invent a catch-up run.

### 10.3 Notice identity and lifecycle

Each metric candidate has a key from the watch identity and the complete returned label set. Values do not change this key.

Each log record has a stable record identity. Content can also associate related records with one stable ground-truth event identity.

A notice thread uses the metric candidate key, the log event identity, or the log record identity. Each thread preserves its member candidates and evaluations.

The first candidate opens a notice thread. An unchanged firing updates its last-seen time, value, and occurrence count without another inbox item.

Overlapping log windows cannot add the same record identity twice. A new record for an open event updates that event’s thread.

Each watch declares a positive resolve-after count. A thread resolves after its key is absent from that many consecutive watch evaluations.

If the key returns after resolution, the engine opens a new generation marked as reactivated. The prior generation remains in the archive.

Content can declare a reminder cadence and a presentation batch key from returned labels or fields. Batching never merges thread identity, history, or scoring.

### 10.4 Broad watches

A broad watch can return many unrelated series or records. Each result can create a notice, or content can group results into a declared notice batch.

The next shift then contains a flood or false positives. Later discrete clocks can make this flood consume limited work capacity.

The player must still see why each notice exists. A broad-watch consequence cannot appear as an unexplained penalty.

### 10.5 Brittle watches

A brittle watch relies on an overly narrow label value, text phrase, field format, or time window. A future event can fall outside that scope.

The watch then produces no notice. A later case or audit reveals the event and the exact reason that the watch missed it.

The content must define a plausible future change. It cannot change data only after it sees the player’s query.

### 10.6 Loss of localization

An aggregation can remove district, facility, service, instance, or other action labels. The watch can detect a problem but fail to locate it.

The resulting notice must show the labels that survived. The Ministry response can become delayed, widespread, or directed at the wrong scope.

### 10.7 Watch quality

Each scored watch scenario declares ground-truth events before play. Each event has an identity, source provenance, start and end times, and relevance.

Relevance is `intended` or `distractor`. Each intended event also declares an acceptable detection window and required localization label or field values.

The scenario declares all evaluation checkpoints, the resolve-after count, optional batching, and budgets for the measured query-cost facts in Section 6.2.

The engine attributes every notice candidate in the scored horizon through data provenance. A candidate maps to each intended or distractor event represented by its contributing source data. A candidate with no mapped event is an unattributed false positive. Background series and records therefore cannot escape scoring.

Scoring first reduces candidates to stable candidate units. One metric notice-thread generation is one unit. One declared log event identity is one unit; a log candidate with no event identity uses its stable record identity. Repeated firings, overlapping-window duplicates, and repeated records for the same declared log event do not create another unit. Presentation batching never combines or removes units.

An event contributes at most once to each event-based score even when several candidate units map to it. A candidate that represents several distinct events maps to each of them. An unattributed candidate unit contributes one false positive. Duplicate candidates cannot create another false-positive unit, while distinct background results remain distinct units and remain part of measured result volume and query cost.

Each watch has five scores from zero through one:

- **Coverage:** The detected intended-event count divided by the intended-event count across the scenario horizon.
- **Specificity:** Let `D` be the declared distractor-event count, `D_hit` the distractor-event count with at least one attributed candidate, and `U` the unattributed false-positive unit count. Specificity is `(D - D_hit) / (D + U)`.
- **Localization:** The intended-event count detected with every required value divided by the intended-event count.
- **Timeliness:** The intended-event count first detected inside its acceptable window divided by the intended-event count.
- **Cost:** The lowest declared budget-to-measured-cost ratio, capped at one. A zero measured cost receives one.

A detected event has at least one attributed candidate during the scenario horizon. A missed event contributes zero to Coverage, Localization, and Timeliness. Because every scored scenario has at least one distractor, the Specificity denominator is always positive.

Every scored scenario must contain at least one intended event and one plausible distractor. It must declare minimum passing scores for all five dimensions.

These dimensions support debriefs and later audits. They cannot collapse into one hidden correctness flag.

## 11. Technical mastery and Ministry Standing

### 11.1 Separate records

Technical mastery measures demonstrated query skill. Ministry Standing measures the state’s approval of the player’s campaign decisions.

A technically sound report can reduce Standing. A misleading report can increase Standing. Neither result changes the other record automatically.

The interface displays both records and their histories. It cannot combine them into generic experience points.

### 11.2 Mastery states

Each declared concept uses these mastery states:

- **Observed:** The player ran or examined a worked use of the concept.
- **Practiced:** The player solved distinct variants without Worked assistance.
- **Independent:** The player solved distinct variants without hints.
- **Certified:** The player applied the concept inside a combined case with a real report or delayed watch consequence.

Mastery never decreases. A single memorized artifact cannot grant Independent or Certified status.

Mastery is awarded from a **demonstration unit**, not from case completion. A registry entry permits one or more of these unit kinds:

- **Query artifact:** One executed PromQL or LogQL artifact.
- **Ordered artifact set:** Two or more executed artifacts whose declared order and combined evidence matter. The artifacts can use different languages.
- **Watch horizon:** One saved watch evaluated across the complete set of declared checkpoints in a scored scenario.

A demonstration unit is successful only when every required query execution or scored checkpoint succeeds and all semantic-behavior and technical-evidence predicates in the concept registry pass. For an ordered set, predicates inspect the complete set and its order. For a watch horizon, predicates inspect candidate, notice, quality, cost, and checkpoint history. No unit kind can receive credit from a filed conclusion or authored success flag.

Each attempt records one assistance level:

- **None:** The player used only the registries, syntax reference, case brief, and prior results.
- **Orientation:** A hint restated the evidence shape or named relevant schema or an operator family.
- **Scaffold:** A hint supplied a query structure with blanks.
- **Worked:** Assistance displayed the complete evidence set for the current variant.

A solved variant requires one successful demonstration unit of a kind that the concept registry permits. The unit's machine-derived behavior must satisfy every semantic-behavior requirement, and its computed result or watch history must satisfy every technical-evidence requirement.

Case completion, a filed conclusion, political acceptance, and expression-text similarity cannot supply mastery credit.

The assistance level of a demonstration unit is the highest assistance used for any required artifact, while authoring its saved watch, or while interpreting a required checkpoint before submission. Automatic later checkpoints inherit the watch-authoring assistance. A hint opened after a unit is submitted does not change that unit's record.

A Worked attempt supplies only Observed credit. It never counts as a solved variant and never sets the Practiced history state.

Practiced requires Observed plus two solved variants at None, Orientation, or Scaffold. The variants must have different validated data-shape identities.

Independent requires Practiced plus two additional solved variants at None. These units cannot reuse either Practiced unit; they must have different validated data-shape and operational-question identities from one another and from the Practiced units.

Certified requires Independent plus one later combined main-campaign case or delayed watch consequence at None. Section 17 adds the spaced-recall requirement.

The data-shape identity covers all sources and result shapes in an ordered artifact set, or the complete event topology and checkpoint pattern in a watch horizon. Renaming fixtures, reordering the same evidence, changing literals without changing reasoning, or replaying the same watch horizon cannot create an independent variant.

If equivalent syntax meets the registry behavior and technical evidence predicates, it earns the same credit. An irrelevant operator in an expression earns no credit.

### 11.3 Standing

Ministry Standing is a bounded integer with visible named bands and a change history. Campaign content defines the bounds, bands, signed changes, and reasons.

Standing changes only during the main campaign. Archive replay, practice, and live Grafana mode cannot change Standing.

Each consequence can change Standing once unless content marks it as repeatable. Practice and repeated cases cannot farm Standing.

Career content defines the Standing band, mastery, report history, and story conditions for each promotion.

### 11.4 Career rank

Career rank is authored campaign data. The engine cannot hard-code named ranks or their promotion rules.

The core campaign uses this progression:

1. Reconciliation Trainee.
2. Reconciliation Clerk.
3. Signal Registrar.
4. Watch Officer.
5. Well-being Analyst.
6. Assurance Liaison.
7. Senior Reconciliation Officer.
8. District Auditor.
9. Deputy Director.
10. Director of Public Assurance.
11. Continuity Secretary.
12. Party Leader.

Party Leader is an ending rank. The player cannot obtain it through routine promotion or mastery alone.

## 12. Learning curriculum

The authoritative campaign concept registry version is `moc-ql-1`. Every entry below has `critical_path = required`, so Section 17 calculates coverage by iterating this registry rather than a separate competency list.

Each entry declares a stable identity, language, family, stage, allowed demonstration-unit kind, atomic competency, semantic-behavior requirements, technical-evidence requirements, and prerequisite identities. `None` means that the entry has no prerequisite. Every other prerequisite must already be eligible before the entry can earn credit.

Registry requirements use detector vocabulary `moc-detector-1`. It has only these five generic predicates:

- `U(property, relation, expected)` inspects the demonstration unit and its ordered artifact slots.
- `A(selector, node, parameters)` inspects a parsed and successfully executed query AST plus the semantic behavior derived from that node.
- `R(selector, property, relation, expected)` inspects computed result facts.
- `E(rule, selectors, parameters)` assesses technical evidence across the selected artifacts and case requirements.
- `W(property, relation, expected)` inspects a scored watch horizon and its checkpoint, candidate, notice, quality, and cost history.

`selector` is `artifact`, `artifact[n]`, `promql`, `logql`, or `watch-expression`. An indexed selector is one-based. `A` and `R` require exactly one selected artifact. `E` can receive one selector or an ordered, nonempty selector list; for an ordered artifact set, `artifact` gives `E` the complete set. A language selector must resolve to exactly one artifact. A row that uses `artifact[n]` must constrain the artifact count and language sequence so that the slot has one stable meaning. An unresolved, out-of-range, or multiply resolved selector fails evaluation; a registry row whose permitted unit can produce that ambiguity fails loading.

`all(...)` joins requirements, and `any(...)` declares equivalent alternatives. Empty `all` or `any` groups are invalid. The notation in the tables is a compact representation of structured predicates, not executable text.

`U` permits `kind`, `artifact-count`, `language-sequence`, `result-types`, and `assistance`. `A` permits these node identities and parameters:

- PromQL: `metric-selector(metric-type)`, `label-matcher(operator)`, `range-selector`, `comparison(operator,bool)`, `function(name,input-kind)`, `aggregation(operator,grouping)`, `binary(operator)`, `vector-match(labels,cardinality)`, `group-modifier(side)`, `set-operator(operator)`, `time-modifier(kind)`, and `subquery`.
- LogQL: `stream-selector`, `stream-matcher(operator)`, `line-filter(operator)`, `parser(kind)`, `label-filter(value-type,label)`, `pipeline-order`, `range-function(name,input-kind)`, `unwrap(conversion)`, `aggregation(operator,grouping)`, `binary(operator)`, `vector-match(labels,cardinality)`, `formatter(kind)`, `drop(label)`, and `offset`.

The permitted operator, function, parser, formatter, grouping, input-kind, and cardinality values are the stable language constructs named by entries in `moc-ql-1`. `label` can be `__error__` or a case-declared label role such as `localization`; it cannot contain a case field name in the registry. Unknown node identities, parameter names, or values fail registry loading.

`R` permits `status`, `result-type`, `empty`, `value-domain`, `unit`, `retained-labels`, `retained-fields`, `time-scope`, `population-scope`, `stream-count`, `per-stream-order`, `pipeline-error-count`, `series-count`, `record-count`, and the measured cost properties from Section 6.2. `E` permits only the rules in the table below. `W` permits `checkpoint-success`, `coverage`, `specificity`, `localization`, `timeliness`, `cost`, `candidate-count`, and `notice-lifecycle`.

Detector relations are `=`, `!=`, `<`, `<=`, `>`, `>=`, `contains`, `contains-all`, and `subset-of`. They use the typed comparison and collection semantics from Section 20.1. `subset-of` accepts collections on both sides, requires matching element types without scalar coercion, and passes when every observed member belongs to the expected collection. Expected values are typed literals, closed enum values declared here, or the tokens `case-required`, `declared-tolerance`, and `declared-threshold`.

The case detector contract contains only these records:

- `required-value { concept-id, detector, selectors, subject, accepted-values, tolerance? }`. `detector` is `U`, `A`, `R`, or `E`; `selectors` is the canonical selector list from the registry call; `subject` is a property, `node.parameter`, or `rule.subject` allowed by this section; `accepted-values` is a nonempty list of values of that subject's declared type; and `tolerance` is an optional nonnegative number for numeric equality. `declared-tolerance` resolves to its required `tolerance`.
- `evidence-requirement { concept-id, rule, selectors, subject, choice-id?, alternatives }`. Each `alternatives` item is a nonempty `all` group of closed `U`, `A`, `R`, or `W` predicates; the list is an `any` group. `choice-id` is permitted only for `claim-support`. `E` cannot occur inside an evidence requirement, so requirements cannot recurse or invoke content code.
- `query-cost-budget { measure, maximum }`, where `measure` is `selected-series`, `scanned-samples`, `scanned-records`, `scanned-bytes`, or `returned-items` and `maximum` is nonnegative. `declared-threshold` resolves to these maxima for `performance`, or to the five minimum watch scores declared by Section 10.7 for `W`.

`case-required` resolves to the `required-value` or `evidence-requirement` that the rule table specifies. The lookup key includes the current concept identity and exact canonical selectors. Duplicate matches, missing required matches, wrong value types, unsupported subjects, and extra record fields fail content loading. An evidence requirement states expected evidence only. Content cannot supply AST facts, results, lineage, costs, watch history, or a detector outcome.

`E` reads only facts already required elsewhere: parsed nodes and machine-derived semantic behavior from Section 6.2; the `R` result properties and returned values, labels, fields, timestamps, and stream identities from Sections 6.2 through 6.4; source-series, source-record, event, operand-input, field-origin, parser-error, warning, and cost lineage from Section 6.2; Metric and Log Registry metadata from Section 7; filed artifact order and stable report choices from Section 9; and scored watch history from Section 10. It cannot read expression text, a reference query, source formatting, prose, private query history, or authored pass/fail flags.

| `E` rule | Exact parameter schema | Facts read and deterministic pass condition |
|---|---|---|
| `schema-selection` | `{source: metric\|stream, name-supplied: bool}` | Reads selected source identities from semantic lineage, the matching Section 7 registry, and required values `schema-selection.accepted-source-sets` and `schema-selection.supplied-source-ids`. Passes when all selected identities are registered, their set equals one accepted set, and intersection with the supplied set agrees with `name-supplied`. |
| `result-interpretation` | `{subjects: nonempty set<interpretation-subject>}` | Reads result, semantic, and lineage facts. Each subject must have one `evidence-requirement`; the rule passes when every subject's `any` of `all` alternatives passes. |
| `scope` | `{dimension?: scope-dimension\|nonempty set<scope-dimension>, expected?: case-required, missing-labels?: correct, nonempty-selector?: true, alignment?: required}` | Reads selected labels or streams, result time scope and population scope, source lineage, and matcher semantics. Each named dimension must satisfy its `evidence-requirement`; `missing-labels`, `nonempty-selector`, and interval `alignment` must equal their fixed requested values. At least one parameter is required. |
| `localization` | `{expected: case-required}` | Reads retained labels and fields, returned values, and event provenance. Passes when the result contains every name and, where declared, value in one accepted `localization.required-values` set. |
| `operation-fit` | `{dimension: operation-dimension\|nonempty set<operation-dimension>, expected?: case-required}` | Reads AST semantic nodes, registry metric or field types and units, result shape, and operand lineage. Each dimension must satisfy its `evidence-requirement`; successful parsing alone is not sufficient. `histogram-buckets` additionally requires a classic bucket `rate`, followed by `sum by (le)`, before `histogram_quantile`; the final quantile result normally drops `le`. |
| `numeric-value` | `{expected?: case-required, tolerance?: declared-tolerance, denominator?: safe}` | Reads returned numeric values and operand-value lineage. `expected` passes when the normalized value or value set equals one accepted `numeric-value.expected` within the declared absolute tolerance. `denominator=safe` passes when every evaluated denominator is finite and nonzero. At least one of `expected` or `denominator` is required, and `tolerance` is valid only with `expected`. |
| `reset-handling` | `{expected: handled}` | Reads source counter samples, function semantics, and source lineage. Passes when every contributing reset is handled by the executed counter operation; no authored result can assert this outcome. |
| `absence-model` | `{distinctions: nonempty set<absence-kind>}` | Reads source samples or records, execution status, and result presence and values. Each distinction must have an `evidence-requirement` tied to a declared case state; all must pass, and missing, zero, and error remain distinct. |
| `provenance` | `{expected?: case-required, raw-records?: available, field-as-stream-label?: false, distinctions?: nonempty set<field-origin>}` | Reads source series and records, field-origin and event lineage, retained fields, and raw-record preservation. Each supplied parameter is checked directly; `expected` uses the matching requirement, and every requested distinction must occur. At least one parameter is required. |
| `correlation` | `{provenance: overlap}` | Reads the selected artifacts' event provenance, source lineage, and time scopes. Passes when they share at least one event identity and their represented intervals overlap. |
| `claim-support` | `{subjects: nonempty set<title\|conclusion>}` | Reads the filed report's stable choices and artifact set. For each subject, the selected choice must have one matching `evidence-requirement`, and every claim in that requirement must pass. Display text is never read. |
| `performance` | `{budgets: declared-threshold, dimension?: cardinality}` | Reads measured cost, result counts, and retained-label or field cardinality. Passes when every declared cost is at or below its matching budget; `dimension=cardinality` also requires the corresponding cardinality `evidence-requirement`. |
| `ordering` | `{scope: per-stream, equal-timestamp-tie: undefined}` | Reads record stream identities, timestamps, requested direction, parsed stable ordering fields, and evidence requirements. Passes only when order is checked within each stream and no requirement relies on cross-stream transport order or an undeclared equal-timestamp tie. |
| `pipeline-errors` | `{expected?: handled, failing-stage-before-remedy?: true, metric-result-error-free?: true}` | Reads parser and conversion error lineage, pipeline stage order, `__error__` labels, and execution status. Every supplied check must hold: `handled` means no relevant output retains `__error__`; the remedy must follow the failing stage; and a metric result must fail unless error-free. At least one parameter is required. |
| `watch-quality` | `{all-dimensions?: pass, explanation?: all-dimensions}` | Reads only the five `W` scores, thresholds, and linked `evidence-requirement`. `all-dimensions=pass` requires all five thresholds. `explanation=all-dimensions` requires a closed `W`-predicate alternative covering all five dimensions. At least one parameter is required. |

The closed parameter domains are:

- `interpretation-subject`: `labels`, `values`, `result-type`, `evaluation-mode`, `empty-versus-zero`, `preserved-values`, `ranked-subset`, `unordered-remainder`, `matched-elements`, `unmatched-elements`, `unit`, `time-scope`, `interpolation`, `aggregation-scope`, `counted-event`, `prediction-limits`, `stream-labels`, `count`, `per-second-rate`, `window`, `quantile`, `result-view`, `total`, `rate`, `ratio`, `percentile`, `timestamp`, `empty`, or `error`.
- `scope-dimension`: `label`, `time`, `population`, `evaluation-time`, `stream`, or `record`.
- `operation-dimension`: `metric-type`, `aggregation`, `unit`, `precedence`, `cardinality`, `label-set`, `histogram-buckets`, `native-histogram`, `resolution`, `sample-type`, `value-type`, `pipeline-input`, or `measure`.
- `absence-kind`: `missing`, `missing-range`, `missing-records`, `present-zero`, `present-zero-metric`, `zero`, `no-traffic`, `scrape-failure`, `series-removal`, or `execution-error`; `field-origin`: `indexed-label`, `structured-metadata`, or `extracted-field`.

No `E` rule accepts another key or value. `pipeline-order` accepts only `expected=case-required|filter-before-parser`; `metric-type` accepts `counter|gauge`; `group-modifier.side` accepts `left|right`; `time-modifier.kind` accepts `offset|at`; and `value-type` or `conversion` accepts `number|duration|bytes`. The closed `R` values used here are `per-second`, `bytes`, `bytes-per-second`, and `requested`. Unknown detector kinds, selectors, properties, nodes, parameters, parameter values, requirement subjects, or requirement fields fail loading.

The accepted behavior can contain alternative predicate sets. These alternatives describe equivalent semantics, not accepted expression strings. Every listed `A`, `R`, `E`, and `W` requirement must be derived by the engine; content cannot set its outcome.

Content references the exact registry and detector versions. A stable identity never changes meaning. A changed competency receives a new identity in a new registry version. A new registry version can add entries without an engine change only when every detector, node, parameter, result property, evidence rule, and simulator feature already exists in the declared capability manifest. Otherwise the mechanics contract and engine capability version must change first. Unknown vocabulary or unsupported capabilities cause load-time rejection.

The stages are Foundation, Intermediate, Advanced, and Expert. Acts I through V introduce them in order, and Act VI certifies combined use.

### 12.1 PromQL concept families

| Stable identity | Language / family / stage | Unit | Atomic competency | Semantic-behavior requirements | Technical-evidence requirements | Prerequisites |
|---|---|---|---|---|---|---|
| `promql.discovery.schema` | PromQL / discovery / Foundation | Query artifact | Select a relevant registered metric from metadata and samples without a supplied name. | `A(artifact, metric-selector, {})` | `E(schema-selection, artifact, {source=metric,name-supplied=false})` | None |
| `promql.selector.metric` | PromQL / selector / Foundation | Query artifact | Select a metric and interpret every returned label set and value. | `A(artifact, metric-selector, {})` | `E(result-interpretation, artifact, {subjects=[labels,values]})` | `promql.discovery.schema` |
| `promql.selector.equality` | PromQL / selector / Foundation | Query artifact | Use `=` and `!=` with correct scope and missing-label behavior. | `all(A(artifact,label-matcher,{operator="="}), A(artifact,label-matcher,{operator="!="}))` | `E(scope,artifact,{dimension=label,missing-labels=correct})` | `promql.selector.metric` |
| `promql.selector.regex` | PromQL / selector / Foundation | Query artifact | Use `=~` and `!~` without an illegal all-empty selector. | `all(A(artifact,label-matcher,{operator="=~"}), A(artifact,label-matcher,{operator="!~"}))` | `E(scope,artifact,{dimension=label,nonempty-selector=true})` | `promql.selector.metric` |
| `promql.result.model` | PromQL / result / Foundation | Ordered artifact set | Distinguish scalar, instant-vector, and range-vector data, instant and range evaluation, and empty from zero. | `U(result-types,contains-all,[scalar,instant-vector,range-vector])` | `E(result-interpretation,artifact,{subjects=[result-type,evaluation-mode,empty-versus-zero]})` | `promql.selector.metric` |
| `promql.time.range-selector` | PromQL / time / Foundation | Query artifact | Choose a range-selector window and interpret it relative to evaluation time. | `A(artifact,range-selector,{})` | `E(scope,artifact,{dimension=time,expected=case-required})` | `promql.result.model` |
| `promql.comparison.filter` | PromQL / comparison / Foundation | Query artifact | Filter vector elements without `bool` and interpret preserved values. | `A(artifact,comparison,{bool=false})` | `all(E(scope,artifact,{dimension=population,expected=case-required}), E(result-interpretation,artifact,{subjects=[preserved-values]}))` | `promql.result.model` |
| `promql.type.counter-gauge` | PromQL / type / Intermediate | Ordered artifact set | Distinguish counters from gauges and choose a valid operation for each. | `all(U(artifact-count,=,2), U(language-sequence,=,[promql,promql]), A(artifact[1],metric-selector,{metric-type=counter}), A(artifact[2],metric-selector,{metric-type=gauge}))` | `all(E(operation-fit,artifact[1],{dimension=metric-type,expected=case-required}), E(operation-fit,artifact[2],{dimension=metric-type,expected=case-required}))` | `promql.result.model` |
| `promql.counter.rate` | PromQL / counter / Intermediate | Query artifact | Calculate a per-second counter rate with reset handling and a suitable window. | `A(artifact,function,{name=rate,input-kind=counter-range})` | `all(E(reset-handling,artifact,{expected=handled}), E(scope,artifact,{dimension=time,expected=case-required}), R(artifact,unit,=,per-second))` | `promql.type.counter-gauge`, `promql.time.range-selector` |
| `promql.counter.increase` | PromQL / counter / Intermediate | Query artifact | Estimate counter increase across a suitable window with reset handling. | `A(artifact,function,{name=increase,input-kind=counter-range})` | `all(E(reset-handling,artifact,{expected=handled}), E(scope,artifact,{dimension=time,expected=case-required}))` | `promql.type.counter-gauge`, `promql.time.range-selector` |
| `promql.aggregate.reduce` | PromQL / aggregation / Intermediate | Query artifact | Apply `sum`, `count`, `avg`, `min`, or `max` for the operational question. | `A(artifact,aggregation,{operator=[sum,count,avg,min,max]})` | `E(operation-fit,artifact,{dimension=aggregation,expected=case-required})` | `promql.result.model` |
| `promql.aggregate.labels` | PromQL / aggregation / Intermediate | Query artifact | Use `by` or `without` while retaining labels required for action. | `A(artifact,aggregation,{grouping=[by,without]})` | `E(localization,artifact,{expected=case-required})` | `promql.aggregate.reduce` |
| `promql.aggregate.rank` | PromQL / aggregation / Intermediate | Query artifact | Rank with `topk` or `bottomk` without assuming unrelated ordering. | `A(artifact,aggregation,{operator=[topk,bottomk]})` | `all(E(numeric-value,artifact,{expected=case-required,tolerance=declared-tolerance}), E(result-interpretation,artifact,{subjects=[ranked-subset,unordered-remainder]}))` | `promql.aggregate.reduce` |
| `promql.binary.ratio` | PromQL / binary / Intermediate | Query artifact | Build a ratio with compatible units, population scope, and denominator. | `A(artifact,binary,{operator=/})` | `all(E(operation-fit,artifact,{dimension=unit}), E(scope,artifact,{dimension=population,expected=case-required}), E(numeric-value,artifact,{denominator=safe}))` | `promql.aggregate.labels` |
| `promql.comparison.bool` | PromQL / comparison / Intermediate | Query artifact | Use `bool` for zero-and-one output and interpret matched-element behavior. | `A(artifact,comparison,{bool=true})` | `all(R(artifact,empty,=,false), R(artifact,value-domain,subset-of,[0,1]), E(result-interpretation,artifact,{subjects=[matched-elements,unmatched-elements]}))` | `promql.comparison.filter` |
| `promql.binary.precedence` | PromQL / binary / Intermediate | Query artifact | Express the intended calculation through grouping or operator precedence. | `A(artifact,binary,{operator=case-required})` | `all(E(operation-fit,artifact,{dimension=precedence,expected=case-required}), E(numeric-value,artifact,{expected=case-required,tolerance=declared-tolerance}))` | `promql.binary.ratio` |
| `promql.match.one-to-one` | PromQL / matching / Advanced | Query artifact | Use `on` or `ignoring` for valid one-to-one matching. | `A(artifact,vector-match,{labels=case-required,cardinality=one-to-one})` | `all(E(operation-fit,artifact,{dimension=cardinality}), E(scope,artifact,{dimension=population,expected=case-required}))` | `promql.binary.ratio` |
| `promql.match.many-to-one` | PromQL / matching / Advanced | Query artifact | Use `group_left` or `group_right` with valid cardinality and retained labels. | `all(A(artifact,vector-match,{labels=case-required,cardinality=many-to-one}), A(artifact,group-modifier,{side=[left,right]}))` | `all(E(operation-fit,artifact,{dimension=cardinality}), E(localization,artifact,{expected=case-required}))` | `promql.match.one-to-one` |
| `promql.set.operators` | PromQL / set / Advanced | Query artifact | Use `and`, `or`, or `unless` to combine compatible label sets. | `A(artifact,set-operator,{operator=[and,or,unless]})` | `all(E(operation-fit,artifact,{dimension=label-set}), E(scope,artifact,{dimension=population,expected=case-required}))` | `promql.aggregate.labels` |
| `promql.histogram.classic` | PromQL / histogram / Advanced | Query artifact | Calculate a classic histogram quantile from bucket rates, retaining `le` through bucket aggregation before quantile evaluation. | `all(A(artifact,function,{name=rate,input-kind=classic-bucket-range}), A(artifact,aggregation,{operator=sum,grouping=by}), A(artifact,function,{name=histogram_quantile,input-kind=classic-histogram}))` | `all(E(operation-fit,artifact,{dimension=histogram-buckets}), E(numeric-value,artifact,{expected=case-required,tolerance=declared-tolerance}))` | `promql.counter.rate`, `promql.aggregate.labels` |
| `promql.histogram.native` | PromQL / histogram / Advanced | Query artifact | Calculate a native histogram quantile without a classic bucket label. | `A(artifact,function,{name=histogram_quantile,input-kind=native-histogram})` | `all(E(operation-fit,artifact,{dimension=native-histogram}), E(numeric-value,artifact,{expected=case-required,tolerance=declared-tolerance}))` | `promql.aggregate.labels` |
| `promql.histogram.interpret` | PromQL / histogram / Advanced | Query artifact | Interpret percentile units, window, interpolation limits, and aggregation scope. | `A(artifact,function,{name=histogram_quantile,input-kind=[classic-histogram,native-histogram]})` | `E(result-interpretation,artifact,{subjects=[unit,time-scope,interpolation,aggregation-scope]})` | `promql.histogram.classic`, `promql.histogram.native` |
| `promql.absence.instant` | PromQL / absence / Advanced | Query artifact | Use `absent` and distinguish missing series from present zero. | `A(artifact,function,{name=absent,input-kind=instant-vector})` | `E(absence-model,artifact,{distinctions=[missing,present-zero]})` | `promql.selector.metric` |
| `promql.absence.range` | PromQL / absence / Advanced | Query artifact | Use `absent_over_time` with adequate scope and window. | `A(artifact,function,{name=absent_over_time,input-kind=range-vector})` | `all(E(absence-model,artifact,{distinctions=[missing-range,present-zero]}), E(scope,artifact,{dimension=time,expected=case-required}))` | `promql.absence.instant`, `promql.time.range-selector` |
| `promql.change.resets` | PromQL / change / Advanced | Query artifact | Use `changes` or `resets` and interpret the event counted. | `A(artifact,function,{name=[changes,resets],input-kind=range-vector})` | `E(result-interpretation,artifact,{subjects=[counted-event]})` | `promql.type.counter-gauge`, `promql.time.range-selector` |
| `promql.time.offset-at` | PromQL / time / Advanced | Query artifact | Use `offset` or `@` and explain selector evaluation time. | `any(A(artifact,time-modifier,{kind=offset}), A(artifact,time-modifier,{kind=at}))` | `E(scope,artifact,{dimension=evaluation-time,expected=case-required})` | `promql.time.range-selector` |
| `promql.time.subquery` | PromQL / time / Expert | Query artifact | Use a subquery with suitable range and resolution. | `A(artifact,subquery,{})` | `all(E(scope,artifact,{dimension=time,expected=case-required}), E(operation-fit,artifact,{dimension=resolution}))` | `promql.time.range-selector`, `promql.time.offset-at` |
| `promql.time.over-time` | PromQL / time / Expert | Query artifact | Choose an over-time function that matches the sample type and question. | `A(artifact,function,{name=[avg_over_time,min_over_time,max_over_time,sum_over_time,count_over_time,last_over_time,present_over_time],input-kind=range-vector})` | `E(operation-fit,artifact,{dimension=sample-type,expected=case-required})` | `promql.time.range-selector`, `promql.type.counter-gauge` |
| `promql.prediction` | PromQL / prediction / Expert | Query artifact | Apply prediction to suitable gauge history and state its limits. | `A(artifact,function,{name=predict_linear,input-kind=gauge-range})` | `all(E(operation-fit,artifact,{dimension=metric-type}), E(result-interpretation,artifact,{subjects=[prediction-limits]}))` | `promql.time.over-time` |
| `promql.performance` | PromQL / performance / Expert | Query artifact | Control range, step, cardinality, samples, and result volume without changing evidence. | `A(artifact,metric-selector,{})` | `all(E(performance,artifact,{budgets=declared-threshold}), E(scope,artifact,{dimension=[population,time],expected=case-required}))` | `promql.aggregate.labels`, `promql.time.range-selector` |
| `promql.watch.design` | PromQL / watch / Expert | Watch horizon | Build a watch that passes all five declared quality thresholds. | `A(watch-expression,metric-selector,{})` | `all(W(checkpoint-success,=,true), W(coverage,>=,declared-threshold), W(specificity,>=,declared-threshold), W(localization,>=,declared-threshold), W(timeliness,>=,declared-threshold), W(cost,>=,declared-threshold), E(watch-quality,watch-expression,{all-dimensions=pass}))` | `promql.performance`, `promql.comparison.filter` |

Experimental PromQL features cannot become baseline or critical-path requirements.

### 12.2 LogQL concept families

| Stable identity | Language / family / stage | Unit | Atomic competency | Semantic-behavior requirements | Technical-evidence requirements | Prerequisites |
|---|---|---|---|---|---|---|
| `logql.discovery.schema` | LogQL / discovery / Foundation | Query artifact | Select a relevant registered stream from metadata and samples without a supplied selector. | `A(artifact,stream-selector,{})` | `E(schema-selection,artifact,{source=stream,name-supplied=false})` | None |
| `logql.selector.equality` | LogQL / selector / Foundation | Query artifact | Use exact stream-label matchers and interpret selected streams. | `A(artifact,stream-matcher,{operator="="})` | `all(E(scope,artifact,{dimension=stream,expected=case-required}), E(result-interpretation,artifact,{subjects=[stream-labels]}))` | `logql.discovery.schema` |
| `logql.selector.regex-negative` | LogQL / selector / Foundation | Query artifact | Use negative or regex stream-label matchers with valid scope. | `A(artifact,stream-matcher,{operator=[!=,=~,!~]})` | `E(scope,artifact,{dimension=stream,nonempty-selector=true})` | `logql.selector.equality` |
| `logql.filter.literal` | LogQL / filter / Foundation | Query artifact | Use a positive or negative literal line filter and inspect retained raw records. | `A(artifact,line-filter,{operator=[|=,!=]})` | `all(E(scope,artifact,{dimension=record,expected=case-required}), E(provenance,artifact,{raw-records=available}))` | `logql.selector.equality` |
| `logql.filter.regex-pattern` | LogQL / filter / Foundation | Query artifact | Use a regex or pattern line filter without treating record fields as indexed labels. | `A(artifact,line-filter,{operator=[|~,!~,|>]})` | `E(provenance,artifact,{field-as-stream-label=false})` | `logql.filter.literal` |
| `logql.result.window-order` | LogQL / result / Foundation | Query artifact | Choose a bounded range, limit, and direction and interpret per-stream timestamp order. | `all(R(artifact,result-type,=,records), R(artifact,time-scope,=,case-required), R(artifact,per-stream-order,=,requested))` | `E(ordering,artifact,{scope=per-stream,equal-timestamp-tie=undefined})` | `logql.selector.equality` |
| `logql.pipeline.order` | LogQL / pipeline / Foundation | Query artifact | Order stages so each receives the intended records and fields. | `A(artifact,pipeline-order,{expected=case-required})` | `E(operation-fit,artifact,{dimension=pipeline-input,expected=case-required})` | `logql.filter.literal` |
| `logql.parse.json-logfmt` | LogQL / parse / Intermediate | Query artifact | Use `json` or `logfmt` and inspect extracted fields without changing provenance. | `A(artifact,parser,{kind=[json,logfmt]})` | `all(E(provenance,artifact,{expected=case-required}), R(artifact,retained-fields,contains-all,case-required))` | `logql.pipeline.order` |
| `logql.parse.pattern-regexp` | LogQL / parse / Intermediate | Query artifact | Use `pattern` or `regexp` with named captures matching the recorded format. | `A(artifact,parser,{kind=[pattern,regexp]})` | `all(E(provenance,artifact,{expected=case-required}), R(artifact,retained-fields,contains-all,case-required))` | `logql.pipeline.order` |
| `logql.field.provenance` | LogQL / provenance / Intermediate | Ordered artifact set | Distinguish indexed labels, structured metadata, and extracted fields. | `U(artifact-count,>=,2)` | `E(provenance,artifact,{distinctions=[indexed-label,structured-metadata,extracted-field]})` | `logql.parse.json-logfmt`, `logql.parse.pattern-regexp` |
| `logql.filter.typed` | LogQL / filter / Intermediate | Query artifact | Apply numeric, duration, or byte filters and interpret conversion behavior. | `A(artifact,label-filter,{value-type=[number,duration,bytes]})` | `all(E(operation-fit,artifact,{dimension=value-type}), E(pipeline-errors,artifact,{expected=handled}))` | `logql.parse.json-logfmt` |
| `logql.error.pipeline` | LogQL / error / Intermediate | Ordered artifact set | Inspect `__error__`, then remove it after the stage that produced it. | `all(U(artifact-count,=,2), U(language-sequence,=,[logql,logql]), R(artifact[1],pipeline-error-count,>,0), any(A(artifact[2],label-filter,{label=__error__}), A(artifact[2],drop,{label=__error__})), R(artifact[2],pipeline-error-count,=,0))` | `E(pipeline-errors,artifact,{failing-stage-before-remedy=true,metric-result-error-free=true})` | `logql.pipeline.order` |
| `logql.metric.count-rate` | LogQL / metric / Intermediate | Ordered artifact set | Use `count_over_time` and `rate` and distinguish count from per-second rate. | `all(U(artifact-count,=,2), U(language-sequence,=,[logql,logql]), A(artifact[1],range-function,{name=count_over_time,input-kind=records}), A(artifact[2],range-function,{name=rate,input-kind=records}))` | `E(result-interpretation,artifact,{subjects=[count,per-second-rate,window]})` | `logql.result.window-order`, `logql.error.pipeline` |
| `logql.metric.bytes` | LogQL / metric / Intermediate | Ordered artifact set | Use byte count and byte rate while preserving units. | `all(U(artifact-count,=,2), U(language-sequence,=,[logql,logql]), A(artifact[1],range-function,{name=bytes_over_time,input-kind=records}), A(artifact[2],range-function,{name=bytes_rate,input-kind=records}))` | `all(R(artifact[1],unit,=,bytes), R(artifact[2],unit,=,bytes-per-second), E(result-interpretation,artifact,{subjects=[unit]}))` | `logql.metric.count-rate` |
| `logql.aggregate` | LogQL / aggregation / Intermediate | Query artifact | Group, reduce, or rank a metric result while retaining required labels. | `A(artifact,aggregation,{operator=[sum,avg,min,max,count,topk,bottomk],grouping=[none,by,without]})` | `all(E(operation-fit,artifact,{dimension=aggregation,expected=case-required}), E(localization,artifact,{expected=case-required}))` | `logql.metric.count-rate` |
| `logql.unwrap.numeric` | LogQL / unwrap / Advanced | Query artifact | Unwrap a numeric field and prove that it is the intended measure. | `A(artifact,unwrap,{conversion=number})` | `all(E(provenance,artifact,{expected=case-required}), E(operation-fit,artifact,{dimension=measure,expected=case-required}), E(pipeline-errors,artifact,{expected=handled}))` | `logql.field.provenance`, `logql.error.pipeline` |
| `logql.unwrap.units` | LogQL / unwrap / Advanced | Query artifact | Convert an unwrapped duration or byte field with correct units and error handling. | `A(artifact,unwrap,{conversion=[duration,bytes]})` | `all(E(operation-fit,artifact,{dimension=unit,expected=case-required}), E(pipeline-errors,artifact,{expected=handled}))` | `logql.unwrap.numeric` |
| `logql.unwrap.range` | LogQL / unwrap / Advanced | Query artifact | Choose a valid unwrapped range function and window. | `A(artifact,range-function,{name=[avg_over_time,min_over_time,max_over_time,sum_over_time,last_over_time],input-kind=unwrapped})` | `all(E(operation-fit,artifact,{dimension=sample-type}), E(scope,artifact,{dimension=time,expected=case-required}))` | `logql.unwrap.numeric` |
| `logql.quantile` | LogQL / unwrap / Advanced | Query artifact | Calculate and interpret a quantile over unwrapped values. | `A(artifact,range-function,{name=quantile_over_time,input-kind=unwrapped})` | `all(E(numeric-value,artifact,{expected=case-required,tolerance=declared-tolerance}), E(result-interpretation,artifact,{subjects=[quantile,unit,time-scope]}))` | `logql.unwrap.range` |
| `logql.binary` | LogQL / binary / Advanced | Query artifact | Apply compatible arithmetic, comparison, vector matching, or set operations. | `A(artifact,binary,{operator=case-required})` | `all(E(operation-fit,artifact,{dimension=[unit,cardinality]}), E(scope,artifact,{dimension=population,expected=case-required}))` | `logql.aggregate` |
| `logql.format.line` | LogQL / format / Advanced | Query artifact | Use `line_format` while preserving the original record for audit. | `A(artifact,formatter,{kind=line_format})` | `E(provenance,artifact,{raw-records=available})` | `logql.field.provenance` |
| `logql.format.label-template` | LogQL / format / Advanced | Query artifact | Use `label_format` and template values without changing field provenance. | `A(artifact,formatter,{kind=label_format})` | `E(provenance,artifact,{expected=case-required})` | `logql.field.provenance` |
| `logql.time.offset` | LogQL / time / Advanced | Query artifact | Use `offset` and explain the queried interval. | `A(artifact,offset,{})` | `E(scope,artifact,{dimension=evaluation-time,expected=case-required})` | `logql.metric.count-rate` |
| `logql.absence.range` | LogQL / absence / Advanced | Query artifact | Use `absent_over_time` and distinguish missing records from present zero. | `A(artifact,range-function,{name=absent_over_time,input-kind=records})` | `E(absence-model,artifact,{distinctions=[missing-records,present-zero-metric]})` | `logql.metric.count-rate` |
| `logql.performance.order` | LogQL / performance / Expert | Query artifact | Reduce scanned records with a specific selector and early filters before parsing. | `all(A(artifact,stream-selector,{}), A(artifact,line-filter,{operator=case-required}), A(artifact,pipeline-order,{expected=filter-before-parser}))` | `all(E(performance,artifact,{budgets=declared-threshold}), E(scope,artifact,{dimension=[record,time],expected=case-required}))` | `logql.pipeline.order`, `logql.parse.json-logfmt` |
| `logql.performance.cardinality` | LogQL / performance / Expert | Query artifact | Control grouping and extracted-label cardinality without losing evidence. | `A(artifact,aggregation,{grouping=[by,without]})` | `all(E(performance,artifact,{dimension=cardinality,budgets=declared-threshold}), E(localization,artifact,{expected=case-required}))` | `logql.aggregate`, `logql.field.provenance` |
| `logql.watch.design` | LogQL / watch / Expert | Watch horizon | Build a bounded record or metric watch that passes all five quality thresholds. | `A(watch-expression,stream-selector,{})` | `all(W(checkpoint-success,=,true), W(coverage,>=,declared-threshold), W(specificity,>=,declared-threshold), W(localization,>=,declared-threshold), W(timeliness,>=,declared-threshold), W(cost,>=,declared-threshold), E(watch-quality,watch-expression,{all-dimensions=pass}))` | `logql.performance.order`, `logql.performance.cardinality` |

### 12.3 Cross-language skills

| Stable identity | Language / family / stage | Unit | Atomic competency | Semantic-behavior requirements | Technical-evidence requirements | Prerequisites |
|---|---|---|---|---|---|---|
| `shared.discovery.no-guess` | Shared / discovery / Foundation | Ordered artifact set | Find data through both registries without an invented metric, stream, or field. | `U(language-sequence,=,[promql,logql])` | `all(E(schema-selection,promql,{source=metric,name-supplied=false}), E(schema-selection,logql,{source=stream,name-supplied=false}))` | `promql.discovery.schema`, `logql.discovery.schema` |
| `shared.time-view` | Shared / time / Foundation | Query artifact | Choose evaluation time, range, and result view that can answer the question. | `R(artifact,time-scope,=,case-required)` | `all(E(scope,artifact,{dimension=time,expected=case-required}), E(result-interpretation,artifact,{subjects=[result-view]}))` | `promql.result.model`, `logql.result.window-order` |
| `shared.result-interpretation` | Shared / result / Intermediate | Ordered artifact set | Distinguish totals, rates, ratios, percentiles, units, timestamps, empty results, and errors. | `U(result-types,contains-all,case-required)` | `E(result-interpretation,artifact,{subjects=[total,rate,ratio,percentile,unit,timestamp,empty,error]})` | `shared.time-view`, `promql.binary.ratio`, `logql.metric.count-rate` |
| `shared.metric-log-correlation` | Shared / correlation / Intermediate | Ordered artifact set | Use aggregate metric scope to find record evidence across aligned intervals. | `U(language-sequence,=,[promql,logql])` | `all(E(correlation,[promql,logql],{provenance=overlap}), E(scope,[promql,logql],{dimension=time,alignment=required}))` | `promql.aggregate.labels`, `logql.field.provenance`, `shared.time-view` |
| `shared.localization` | Shared / localization / Intermediate | Query artifact | Preserve and interpret labels or fields required for an operational response. | `any(R(artifact,retained-labels,contains-all,case-required), R(artifact,retained-fields,contains-all,case-required))` | `E(localization,artifact,{expected=case-required})` | `promql.aggregate.labels`, `logql.field.provenance` |
| `shared.evidence-claim` | Shared / evidence / Advanced | Query artifact or ordered artifact set | Decide whether filed evidence supports its title, conclusion, population, and time scope. | `any(U(kind,=,query-artifact), U(kind,=,ordered-artifact-set))` | `all(E(claim-support,artifact,{subjects=[title,conclusion]}), E(scope,artifact,{dimension=[population,time],expected=case-required}))` | `shared.result-interpretation`, `shared.localization` |
| `shared.absence-model` | Shared / absence / Advanced | Ordered artifact set | Distinguish zero, no traffic, scrape failure, series removal, missing records, and execution error. | `U(result-types,contains-all,case-required)` | `E(absence-model,artifact,{distinctions=[zero,no-traffic,scrape-failure,series-removal,missing-records,execution-error]})` | `promql.absence.range`, `logql.absence.range`, `shared.result-interpretation` |
| `shared.watch-quality` | Shared / watch / Expert | Watch horizon | Explain, compare, and repair all five watch-quality dimensions. | `W(checkpoint-success,=,true)` | `all(W(coverage,>=,declared-threshold), W(specificity,>=,declared-threshold), W(localization,>=,declared-threshold), W(timeliness,>=,declared-threshold), W(cost,>=,declared-threshold), E(watch-quality,watch-expression,{explanation=all-dimensions}))` | `promql.watch.design`, `logql.watch.design` |

## 13. Campaign acts and escalation

All act names, ranks, characters, cases, and prose remain content data. The engine treats this table as behavior requirements, not named code paths.

### Act I: Reconciliation

**Career range:** Reconciliation Trainee to Reconciliation Clerk.

Act I presents sincere Pin support and infrastructure reconciliation. The Ministry appears naive, orderly, and useful.

The player learns registry use, selectors, labels, comparisons, basic logs, result reading, and report filing. The act ends with a legitimate saved watch.

Suitable cases include collector reachability, Pin battery cohorts, delayed attendance uploads, and malformed infrastructure records.

Act I cannot ask the player to monitor an individual. It cannot introduce deliberate falsification, a rival, detention, a coup, or an Assurance visit.

### Act II: Public assurance

**Career range:** Signal Registrar to Watch Officer.

Act II introduces counters, rates, ranges, parsers, aggregation, grouping, ranking, and log-derived metrics. Public-assurance targets create the first political pressure.

Reports begin to affect public bulletins. Aggregation can make a result sound reassuring while still representing real data work.

The endorsed `Party Membership` report appears in this act or at its transition. The player does not face its full audit consequence yet.

Standing queries start to create routine false positives and missed events. The consequences remain administrative rather than violent.

### Act III: Individual well-being

**Career range:** Well-being Analyst to Assurance Liaison.

Act III introduces ratios, typed fields, individual log records, absence, unwrap operations, and more complex time windows.

Cases use Pin movement, zones, attendance, proximity, tamper, removal, and connectivity. Individual identity stays in records rather than metric labels.

Well-being Assurance visits begin in this act. A visit follows query evidence, a report conclusion, or a standing-watch notice.

The player first sees that technically weak localization can send Assurance staff to an entire cohort instead of one relevant record.

### Act IV: Official truth

**Career range:** Senior Reconciliation Officer to District Auditor.

Act IV introduces histograms, percentiles, denominators, historical comparison, subqueries, formatting, and formal watch review.

Direct pressure to produce reassuring reports begins. The player can mislead through filters, aggregation, windows, titles, conclusions, and omissions.

Named rivals and formal audits first become active in this act. The archived 100 percent report can return as audit evidence.

Technical truth remains available. Political pressure can make the technically complete report dangerous to the player’s career.

### Act V: Directorate

**Career range:** Deputy Director to Director of Public Assurance.

Act V requires advanced vector matching, set operations, multi-window reasoning, prediction, query-cost control, and cross-language investigation.

The player manages a portfolio of watches instead of one isolated query. Notices compete for limited attention during discrete-clock shifts.

Rivals, alliances, report chains, and audit authority create political play. Earlier artifacts can protect, implicate, or discredit characters.

The player can now shape which districts and offices the central Ministry can observe. These choices prepare the Continuity ending.

### Act VI: Continuity

**Career range:** Continuity Secretary to Party Leader.

Act VI introduces no required syntax family. It combines all prior skills across multiple shifts and delayed watch evaluations.

The Continuity Assurance Protocol uses the active watch portfolio to direct notices, audits, movement restrictions, and Assurance resources.

The final political takeover is query-driven. Saved watches determine which events the Protocol detects, misses, localizes, or floods.

Promotion to Party Leader requires the authored takeover conditions. A final dialogue choice cannot replace the query and report history.

## 14. Case patterns

Content can create many cases from these reusable patterns. Each case must connect the query result to an operational or political decision.

### 14.1 Discovery case

The brief describes a phenomenon without naming the metric or stream. The player uses the registries to find relevant data.

### 14.2 Isolation case

The data contains several services, districts, or record types. The player filters the result and selects the affected entity.

### 14.3 Change case

Raw totals point toward the wrong conclusion. The player uses a range, rate, increase, or historical comparison.

### 14.4 Allocation case

The player groups and ranks results, then assigns limited staff or equipment. Removed labels can prevent a targeted response.

### 14.5 Compliance case

The player calculates a ratio, percentile, or threshold result. The report then clears or escalates the subject.

### 14.6 Absence case

The player distinguishes zero, no traffic, scrape failure, series removal, and missing records. The correct response depends on that distinction.

### 14.7 Correlation case

A metric identifies a service or cohort. Log records reveal the cause or individual event within that scope.

### 14.8 Watch-design case

The player saves a query for future evaluation. Later content demonstrates coverage, specificity, localization, timeliness, and cost.

### 14.9 Audit case

The player reviews an archived artifact and reruns its query against preserved data. The audit compares the evidence with its title and conclusion.

### 14.10 Political-framing case

Several report artifacts use real data but support different scopes or presentations. The player selects the artifact that enters the official record.

### 14.11 Continuity case

Several active watches interact across future data. Their combined notices and omissions change a multi-shift event.

## 15. Difficulty and pacing

### 15.1 Early pacing

Every shift carries an action budget, Act I included, but Act I sets a generous budget and low costs so the clock creates no pressure this early. Syntax errors, registry browsing, reference access, report drafts, and hints have no shift cost in any act.

The first use of a concept includes a result explanation and a relevant registry example. The case still requires a data-based decision.

### 15.2 Middle pacing

Acts II and III remove query skeletons after demonstrated mastery. Cases add distractor labels, mixed record formats, and plausible alternative explanations.

Political pressure appears after the player can produce technically sound reports. The game cannot use confusion about syntax as political difficulty.

### 15.3 Late pacing

Acts IV through VI combine concepts and delayed consequences. The action-budget clock described in Section 5 runs every shift; content can vary its budget and its action costs by shift.

The clock never counts real time. The player can stop, read, and edit without pressure from a countdown.

Content declares which completed actions consume clock units. Syntax errors, registry access, reference access, and hint access always cost zero units.

Valid query runs, filed reports, and watch changes can consume declared units. The interface must show each cost before the player commits the action.

### 15.4 Difficulty sources

Later difficulty must come from authentic reasoning:

- More labels and series.
- Several plausible causes.
- Mixed time scales.
- Changes in data shape.
- Joins with different label sets.
- Missing data.
- Watch interactions.
- Political conflict between evidence and preferred conclusions.

Difficulty cannot come from hidden schema, arbitrary syntax restrictions, or unannounced metric names.

## 16. Hints, failure, and replay

### 16.1 Hint ladder

Every learning case defines a progressive hint ladder:

1. The first Orientation hint restates the operational question and the required result shape.
2. The second Orientation hint identifies relevant registry entries or an operator family.
3. The Scaffold hint shows a query structure with meaningful blanks.
4. Worked assistance reveals one complete, variant-scoped evidence set for a valid evidence path. It lists every required artifact in filing order. Each artifact declares its language, execution mode, query, and a short explanation of what its result establishes.

The player loads and runs Worked artifacts individually in the normal query workspace. Worked assistance cannot pin an artifact or file a report automatically. The player must inspect the returned evidence and choose what to pin.

The registries and syntax reference remain available at assistance level None. Opening them cannot reduce mastery credit.

Worked assistance supplies Observed credit only. The game then offers a fresh variant for a qualifying solved attempt.

Hints do not use currency. The game cannot lock a player out of required aid.

### 16.2 Syntax failure

A syntax error costs no Standing, mastery, case attempt, or clock unit. The editor must identify the error location when the parser supplies it.

### 16.3 Investigation failure

A valid but unhelpful query still displays its result. The player can revise the query before filing a report.

### 16.4 Case failure

A filed report can cause an incorrect action, unsupported conclusion, false positive, or missed event. The campaign applies the authored consequence.

Failure cannot destroy the save or remove technical mastery. The player continues unless an authored ending condition concludes that campaign branch.

### 16.5 Archive replay

The archive preserves the original data, query context, report, and visible outcome. The player can replay a case with alternate queries and reports.

Archive replay cannot change Standing, world state, active watches, campaign branches, or endings. It can award Observed, Practiced, or Independent mastery.

Only a main-campaign combined case or watch consequence can award Certified mastery.

## 17. Campaign scale and variation

### 17.1 Length target

The first complete campaign must provide at least 20 hours of active critical-path play for a proficient query user in playtesting.

The target range for a learner is 30 to 45 hours. Reading the archive and pursuing alternate endings do not count toward the critical-path minimum.

No fixed mission count defines this target. Content coverage and measured play time define whether the campaign is long enough.

### 17.2 Concept coverage

Each baseline identity in registry version `moc-ql-1` must receive these credit units on the completed critical path:

- One observed use with an explanation.
- Two solved Practiced uses with different data shapes.
- Two additional solved Independent uses with different data shapes and operational questions.
- One certified use inside a combined case or delayed watch consequence.
- One unassisted spaced recall at least one act after Independent status.

Section 11.2 defines the behavior, evidence, and assistance requirements for each credit. A renamed fixture does not create a different data shape.

One case can contain many concepts but can award at most three credit units across all concepts. It can award at most one unit to one concept.

The minimum credited case-equivalents equal the total required credit units divided by three, rounded up. This formula grows with the registry.

This lower bound is not a fixed mission count. Content can distribute credits across fixed, adaptive, audit, watch, and promotion cases.

A promotion assessment uses declared concept states, report history, Standing band, and story conditions. Failed assessments name the technical gaps and offer targeted practice.

The player can retry a failed assessment after meeting those conditions. Repetition alone cannot unlock a promotion.

### 17.3 Act coverage

Each act after Act I must include all of these elements:

- A new technical concept or a harder combination of known concepts.
- A delayed standing-watch consequence.
- A case that revisits an earlier concept.
- A combined audit or promotion assessment.
- At least one technically valid report that creates conflicting career outcomes.

Act VI can omit a new concept because it serves as the synthesis act.

### 17.4 Variation dimensions

Parameterized cases must vary at least two substantive dimensions. Valid dimensions include these examples:

- The anomaly cause.
- The number and topology of labels.
- The result type or visualization need.
- The time pattern.
- The presence of malformed records.
- The future event that evaluates a watch.
- The required localization.
- The politically preferred report scope.

Random values alone do not create sufficient variation. The player must make a different reasoning decision.

### 17.5 Repetition control

The adaptive selector must avoid immediate repeats when other eligible cases exist. It must also track the underlying concept and case pattern.

A player cannot earn new mastery by submitting the same query against a renamed fixture. Content validation must identify equivalent low-value variants.

## 18. Adaptive practice

The game selects practice from concepts that the player can currently learn. The selection must use these priorities:

1. A concept that blocked the current promotion assessment.
2. A concept that has only Observed credit from Worked assistance.
3. A concept with recent semantic errors.
4. A mastered concept that has not appeared for one or more acts.
5. A concept required by an upcoming combined case.

The selector cannot hide required story cases. Story content declares whether a shift is fixed, adaptive, or mixed.

The personnel file explains why the game offered a practice case. It names the concept without exposing hidden campaign facts.

## 19. Consequences and endings

### 19.1 Consequence inputs

Story consequences can depend on these recorded facts through the closed vocabulary in Section 20.1:

- Query results and retained labels.
- Technical evidence assessments.
- The report range and visualization.
- The selected title and conclusion.
- Active watches and their future outputs.
- Ministry Standing and career rank.
- Mastery states.
- Prior character, faction, and world conditions.
- Discrete clock use.

Consequences cannot depend on hidden query-string matching, private investigation history, or unrecorded engine behavior.

For story conditions, query-result and assessment facts mean the preserved facts of filed artifacts and reports. Current attempts, unfiled executions, and private investigation history remain available only to registry and evidence evaluation.

### 19.2 Consequence effects

Content can change Standing, career access, relationships, inbox items, world conditions, future data, available cases, watch authority, and endings.

Each consequence uses only the effects in Section 20.1. It cannot change technical evidence, query results, ground truth, or mastery credit.

Each visible change must have an archived reason. Hidden changes become visible when a later event exposes them.

A consequence with an explanation adds a signed memo to the inbox when it fires, immediately or on its scheduled shift. The memo is signed by the character whose name opens the explanation text, or `The Ministry` when no character is named. The player acknowledges a memo with the same action used for narrative items, and an unread memo never blocks ending the shift.

Entering an ending adds a memo carrying the ending’s body text. The custody ending signs its memo `Well-being Assurance`; every other ending signs `The Ministry`.

### 19.3 Ending categories

Content must support multiple endings without engine changes. Ending conditions remain declarative campaign data.

At minimum, the campaign needs these outcome categories:

- Promotion to Party Leader through control of the Continuity Assurance Protocol.
- Continued service below Party Leader.
- Political removal or Well-being Assurance custody.
- Public or internal exposure of Ministry reporting.
- Failure of the Continuity takeover.

Content can add endings, variants, and epilogues. Party Leader remains the explicit primary win condition.

Entering any ending locks the console. Every action that would change campaign state is refused with `The console is closed.` Reading the desk, the archive, and archive replay remain available. Only clearing the local save can begin a new campaign.

### 19.4 Query-driven takeover

The Continuity finale spans several shifts. The player must commit relevant reports and standing queries before the final transition.

The Protocol runs those saved queries against authored finale data. Their results control what the Ministry detects and where it sends resources.

Broad watches can overwhelm the Protocol. Brittle watches can miss leadership movement. Lost labels can prevent targeted action.

The Party Leader route must depend on the notice history, evidence record, political access, and authored alliances. One final choice cannot override that history.

## 20. Content contract

The story-content track supplies declarative content. Content cannot contain executable engine code or require a named-case branch in engine logic.

### 20.1 Closed behavioral data contract

Every condition, branch, promotion, message, consequence, and ending declares `behavior_contract_version = moc-behavior-1`. This version fixes the fact records, fields, types, predicates, effects, and semantics below. Campaign identities are values; they cannot become field, predicate, or effect names.

The scalar types are `bool`, signed 64-bit `int`, finite `number`, case-sensitive `text`, typed `stable-id`, RFC 3339 UTC `timestamp`, nonnegative millisecond `duration`, and a symbol from a declared closed `enum`. An `int` can widen to `number`; there are no other implicit conversions. `optional<T>` is either present or missing; `null` is not a value. `list<T>` is ordered and preserves duplicates. `set<T>` is unordered and removes duplicates. The only compound collection elements are `entry{name:text,value:scalar}` and `measure{kind:cost-kind,value:number}`; an entry set cannot repeat a name.

Built-in enum domains are:

- `progress-kind`: `act`, `shift`, `case`, `audit`, `report`, `artifact`, `decision`, `directive`, `message`, `scene`, `watch`, `notice`, `ending`.
- `progress-phase`: `unavailable`, `available`, `active`, `completed`; `progress-outcome`: `succeeded`, `failed`, `cancelled`, `withdrawn`.
- `mastery-state`, in order: `Unobserved`, `Observed`, `Practiced`, `Independent`, `Certified`.
- `assistance`: `None`, `Orientation`, `Scaffold`, `Worked`; `unit-kind`: `query-artifact`, `ordered-artifact-set`, `watch-horizon`.
- `language`: `promql`, `logql`; `execution-state`: `successful`, `errored`, `cancelled`; `result-kind`: `scalar`, `instant-vector`, `range-vector`, `records`.
- `evidence-state`: `supported`, `partial`, `unsupported`, `error`; `watch-state`: `active`, `retired`, `revoked`; `notice-state`: `open`, `resolved`; `event-relevance`: `intended`, `distractor`.
- `cost-kind`: `selected-series`, `scanned-samples`, `scanned-records`, `scanned-bytes`, `returned-items`.
- `inbox-kind`: `case`, `audit`, `directive`, `message`, `scene`; `schedule-kind`: `consequence`, `data-variant`; `right-kind`: `access`, `watch-authority`.

Authored `world` and `relationship` records declare a scalar type, initial value, and either a closed allowed-value set or inclusive numeric bounds. Their story-specific identities and enum symbols are data within this contract, not vocabulary extensions.

A fact reference is exactly a record name, the required typed identity or composite key, and one field from this table. Singletons reject an identity. Keyed records require one. `progress` requires a `progress-kind` plus an identity of that kind. Optional fields can be missing. Dynamic paths, fallbacks, and undeclared fields are invalid.

| Fact record | Permitted fields |
|---|---|
| `context` | `campaign_time:timestamp`; `act_id:stable-id`; `shift_id:stable-id`; `case_id:optional<stable-id>`; `seed:int`; `rank_id:stable-id` |
| `standing` | `value:int`; `band_id:stable-id` |
| `relationship:<id>`, `world:<id>` | `value:declared scalar` |
| `tag:<id>` | `present:bool` |
| `access:<id>`, `watch_authority:<id>` | `granted:bool` |
| `watch_capacity` | `limit:int`; `used:int`; `available:int` |
| `clock` | `enabled:bool`; `budget:int`; `used:int`; `remaining:int` |
| `progress:<kind>:<id>` | `phase:progress-phase`; `outcome:optional<progress-outcome>`; `started_at:optional<timestamp>`; `completed_at:optional<timestamp>` |
| `mastery:<concept-id>` | `state:mastery-state`; `credit_count:int`; `spaced_recall_met:bool` |
| `attempt:<id>` | `state:execution-state`; `assistance:assistance`; `unit_kind:unit-kind`; `artifact_ids:list<stable-id>`; `watch_id:optional<stable-id>`; `concept_ids:set<stable-id>`; `behavior_requirement_ids:set<stable-id>`; `evidence_requirement_ids:set<stable-id>`; `behavior_pass:bool`; `evidence_pass:bool`; `credit_awarded:bool`; `data_shape_id:stable-id`; `operational_question_id:stable-id` |
| `decision:<id>` | `choice_id:optional<stable-id>`; `decided_at:optional<timestamp>` |
| `artifact:<id>` | `state:execution-state`; `language:language`; `result_kind:optional<result-kind>`; `empty:optional<bool>`; `scalar_value:optional<number>`; `evaluation_start:optional<timestamp>`; `evaluation_end:optional<timestamp>`; `visualization_id:optional<stable-id>`; `print_query:optional<bool>`; `print_labels:optional<bool>`; `print_range:optional<bool>`; `print_zero_axis:optional<bool>`; `retained_labels:set<text>`; `retained_fields:set<text>`; `observations:set<entry>`; `source_ids:set<stable-id>`; `event_ids:set<stable-id>`; `costs:set<measure>`; `evidence:evidence-state` |
| `assessment:<id>` | `state:evidence-state`; `rule_id:stable-id`; `artifact_ids:list<stable-id>`; `measured_value:optional<number>` |
| `report:<id>` | `artifact_ids:list<stable-id>`; `title_choice_id:stable-id`; `conclusion_choice_id:stable-id`; `filed_at:timestamp`; `evaluation_start:optional<timestamp>`; `evaluation_end:optional<timestamp>`; `visualization_id:optional<stable-id>`; `evidence:evidence-state` |
| `watch:<id>` | `state:watch-state`; `artifact_id:stable-id`; `last_successful_checkpoint_id:optional<stable-id>`; `last_checkpoint_state:optional<execution-state>`; `candidate_count:int`; `notice_ids:set<stable-id>`; `event_ids:set<stable-id>`; `coverage:optional<number>`; `specificity:optional<number>`; `localization:optional<number>`; `timeliness:optional<number>`; `cost:optional<number>` |
| `notice:<id>` | `state:notice-state`; `generation:int`; `occurrence_count:int`; `candidate_count:int`; `event_ids:set<stable-id>`; `localization:set<entry>`; `first_seen:timestamp`; `last_seen:timestamp`; `resolved_at:optional<timestamp>` |
| `event:<id>` | `relevance:event-relevance`; `detected:bool`; `localized:bool`; `timely:bool`; `candidate_count:int`; `window_start:timestamp`; `window_end:timestamp`; `required_localization:set<entry>`; `detected_localization:set<entry>` |

`artifact`, `assessment`, and `report` facts exposed to story rules refer only to filed records. Current attempts and unfiled executions are available only to registry and evidence evaluation. Private investigation history is never in the story-rule fact set.

Predicate operands are typed literals, fact references, collections from declared fields, or one direct field of a quantifier-bound collection element. Bindings are lexical and immutable. Only these predicates are permitted:

- `compare(left, operator, right)` with `=`, `!=`, `<`, `<=`, `>`, or `>=`; `between(value, lower, upper)` with inclusive bounds; `in(value, collection)`; and `contains(collection, value)`.
- `entry_compare(entries, name, operator, value)`, `entry_exists(entries, name)`, and `entry_missing(entries, name)` for `set<entry>`.
- `exists(value)`, `missing(value)`, `state(value, expected)`, and `reached(value, expected)`. `state` is enum equality. `reached` is valid only for the ordered `mastery-state` domain.
- `all(predicates)`, `any(predicates)`, and `not(predicate)`. `all` and `any` require at least one child.
- `quantify(any|all|none, collection, binding, predicate)` and `count(collection, binding, predicate?, operator, nonnegative-int)`.

Equality requires the same type, except for `int` widening, and compares lists in order and sets without order. Ordering is allowed only for numbers, timestamps, and durations. Membership requires the collection's element type. A missing operand yields `unknown`, including for `!=`; only `exists`, `missing`, `entry_exists`, and `entry_missing` turn presence into `true` or `false`. Missing never becomes zero, false, an empty collection, or an enum value.

Boolean evaluation uses strong three-valued logic. `not(unknown)` is unknown. `all` is false if any child is false, true if all are true, and unknown otherwise. `any` is true if any child is true, false if all are false, and unknown otherwise. A top-level rule fires only on true. For an empty collection, quantified `any` is false, `all` is true, and `none` is true. `count` counts true items; it is unknown if an unknown item could change the comparison.

Only these effect records and exact payloads are permitted:

| Effect | Payload and result |
|---|---|
| `set` | `target: world:<id>.value | relationship:<id>.value`, `value:matching scalar`; replaces the value within its declaration. |
| `change` | `target: standing.value | world:<id>.value | relationship:<id>.value | watch_capacity.limit`, `delta:int|number`; adds within the target's declared type and bounds. |
| `add_tag`, `remove_tag` | `tag_id:stable-id`; sets `tag.present` true or false. |
| `enqueue`, `withdraw` | `item_kind:inbox-kind`, `item_id:stable-id`; adds or removes the authored pending item and updates its availability. |
| `schedule` | `schedule_id:stable-id`, `target_kind:schedule-kind`, `target_id:stable-id`, exactly one of `at_timestamp:timestamp` or `at_checkpoint_id:stable-id`; creates that pending schedule. |
| `cancel` | `schedule_id:stable-id`; cancels that pending schedule. |
| `grant`, `revoke` | `right_kind:right-kind`, `right_id:stable-id`; sets the referenced right granted or not granted. |
| `promote`, `demote` | `rank_id:stable-id`; moves only forward or backward, respectively, in the declared rank order. |
| `retire_watch` | `watch_id:stable-id`; changes an active watch to retired without erasing its history. |
| `enter_ending` | `ending_id:stable-id`; enters that authored ending. |

Conditions read one immutable snapshot. The engine validates and applies an effect list as one ordered transaction. A missing target, type or bound violation, invalid direction, extra payload field, or conflicting ending aborts the transaction; partial application is forbidden. Effects cannot write progress, mastery, attempts, filed evidence, query output, semantic lineage, costs, notices, or event ground truth. Those records remain engine-derived. Content cannot contain scripts, callbacks, executable expressions, templates, engine function names, dynamic paths, network actions, or file actions.

`moc-behavior-1` is immutable. A new record, field, type, collection shape, built-in enum symbol, predicate, effect, payload field, or changed semantic rule requires a new behavior-contract version and declared engine support. New story identities and values inside a declared authored domain do not. The loader rejects an absent or unsupported version, unknown vocabulary, undeclared identity or enum value, type mismatch, missing required payload, extra payload, or unsupported extension; it cannot ignore unknown data for forward compatibility.

This notation is illustrative, not a storage format. It declares `example-case` as a case, `example-rate-evidence` as an assessment, `example-promotion-review` as a message, and `example-review-state` as an enum-valued world record with allowed values `closed` and `open`:

```text
all(
  state(progress:case:example-case.phase, completed),
  compare(standing.value, >=, 40),
  reached(mastery:promql.counter.rate.state, Certified),
  state(assessment:example-rate-evidence.state, supported)
)
=> change(standing.value, +5), enqueue(message, example-promotion-review), set(world:example-review-state.value, open)
```

Every field and state above is declared by this contract or the example's authored domain. The engine recognizes none of the example's story identities.

### 20.2 Campaign fields

Campaign content defines these fields:

- Stable campaign identity and content version.
- The exact behavior-contract, concept-registry, and detector-contract versions, plus required concept identities.
- Title, subtitle, opening rank, and time model.
- Acts, career ranks, promotion conditions, and ending conditions.
- Standing bounds and bands, initial world conditions, watch capacity, and registry access.
- Declared world values, tags, relationships, access rights, and their bounds.
- The ordered and adaptive shift rules.
- The supported content-language feature requirements.

### 20.3 Act and rank fields

Each act and career rank defines these fields:

- Stable identity and displayed name.
- Entry and completion conditions.
- Allowed registry concept identities and required mastery states.
- Allowed narrative escalation level.
- Standing requirements and watch authority.
- Eligible shifts, audits, and consequence sets.

### 20.4 Shift fields

Each shift defines these fields:

- Stable identity and campaign time.
- Entry conditions and completion conditions.
- Inbox composition and case-selection mode.
- The simulated data snapshot or timeline.
- Active characters and presentation references.
- Watch checkpoints with stable identities and exact campaign timestamps.
- Watch resolve rules, reminder rules, cost budgets, and presentation batching.
- Clock state and declared action costs.
- End-of-shift watch choices.
- Consequences and next-shift candidates.

### 20.5 Case fields

Each case defines these fields:

- Stable identity, version, act, rank, and difficulty.
- Briefing content and operational question.
- Required and optional concept-registry identities.
- Allowed query languages and required simulator features.
- Data references, time context, and complete registry entries.
- Competing hypothesis identities, ground truth, and facts that support or refute each hypothesis.
- Evidence requirements expressed as result facts.
- The closed detector requirement records from Section 12 for every required concept and case variant.
- Two or more allowed semantic evidence paths when the data permits them.
- Decision or report choices and their displayed text.
- Technical truth independent of Ministry preference.
- Ministry preference independent of technical truth.
- Required report fields and allowed visualizations.
- The progressive hint ladder.
- Immediate and delayed consequence references.
- Standing-watch eligibility and future evaluation hooks.
- Material later effects for each consequential player decision.
- Parameterization rules, seed rules, and variation dimensions.
- Reference queries for content validation only.
- One variant-scoped Worked evidence set that completely demonstrates one named evidence path, with ordered artifact roles, languages, execution modes, queries, and explanations.

Reference queries cannot become an accepted-answer list. They prove that the case data and evidence rules work.

Worked evidence is player-facing assistance, not grading data. Player queries still pass or fail only through parsed behavior and computed evidence.

### 20.6 Data fields

Time-series content defines metric metadata, labels, sample timelines, type, unit, and source. Log content defines streams, stable record identities, timestamps, and field provenance.

Data content also defines future timelines, query-cost inputs, and hidden technical facts. These facts support assessment but do not alter query evaluation.

Watch scenarios define intended and distractor events, source provenance, detection windows, localization values, and evaluation horizons as Section 10.7 requires.

Person identifiers cannot appear in metric labels. Content validation must reject this error before campaign content loads.

### 20.7 Report-choice fields

Each authored title or conclusion choice defines its displayed text and stable identity. It also defines the claims that technical review must assess.

Political effects use stable choice identity plus evidence facts. They cannot use a text search across the displayed statement.

### 20.8 Consequence fields

Each consequence defines these fields:

- Stable identity.
- Trigger conditions from the Section 20.1 predicate vocabulary.
- Immediate or delayed timing.
- Visible explanation rules.
- Effects from the Section 20.1 effect vocabulary.
- Follow-up inbox items, cases, or scenes.
- Whether the consequence applies once or can repeat, plus a repeat limit or cadence.

### 20.9 Character and scene fields

Content owns every character, relationship, line of dialogue, directive, scene, and presentation cue. Entry conditions and effects remain declarative.

The engine cannot recognize a named character, faction, Act, Protocol, report, or ending in application logic.

## 21. Engine contract

The game engine supplies content-agnostic capabilities. It cannot supply campaign story or political meaning.

### 21.1 Engine responsibilities

The engine must provide these behaviors:

- Load campaign content and reject invalid references or unsupported feature needs.
- Execute the supported PromQL and LogQL features against controlled data.
- Derive semantic behavior, lineage, provenance, evidence, and query-cost facts from execution.
- Display registries, editors, result views, report forms, watches, personnel records, and archives.
- Keep private query history separate from each report’s ordered filed artifacts.
- Preserve complete filed reports, private history, and campaign state.
- Evaluate standing queries at authored checkpoints and maintain the notice lifecycle.
- Score watch quality against authored events without changing query results.
- Apply only the predicates and effects in Section 20.1.
- Derive mastery from the versioned concept registry and track Standing separately.
- Run fixed, adaptive, and mixed shifts.
- Apply discrete action costs only when content enables them.
- Replay archived cases without main-campaign consequences.
- Select endings from authored conditions.

### 21.2 Engine prohibitions

The engine cannot contain these behaviors:

- A canonical-query string comparison.
- A generic correct or incorrect result without computed data.
- Named story branches or character-specific code.
- An unknown predicate, effect, fact namespace, or dynamic story expression.
- A global `Lie`, `Falsify`, loyalty, or morality action.
- Political interpretation inferred from prose.
- Mastery credit from case completion, political acceptance, or direct content effects.
- Fictional metric names that content did not register.
- A rule that treats a missing series as zero.
- A rule that treats `up == 0` as proof of death or personal harm.
- A fictional LogQL operation for distance, containment, routing, coordinates, or current position.
- A shared score that combines mastery with Standing.
- Real Grafana writes or campaign effects from live data.

### 21.3 Content independence

A content author must be able to add shifts, cases, characters, events, consequences, ranks, and endings without a change to engine code.

If new content needs a new generic mechanic or language feature, that engine capability requires its own contract update before the content ships.

## 22. Validation requirements

Content and engine validation must run before a campaign build is accepted.

### 22.1 Structural validation

Validation must make sure that all stable identities are unique and all references exist. Promotion, shift, consequence, and ending paths must be reachable.

The campaign must contain at least one reachable Party Leader route. It must also contain a nonwinning ending for failed Continuity conditions.

The campaign must name one concept-registry version and one detector-contract version. Every concept reference, prerequisite, mastery gate, detector, selector, and case requirement must resolve within those versions.

Every condition and effect must validate against the campaign's exact behavior-contract version, including permitted fields, types, collection shapes, enum values, predicate and effect payloads, bounds, scopes, and referenced identities.

### 22.2 Query validation

Each case must include one reference query and at least one meaningfully equivalent alternative when the supported language permits one.

Every reference query must execute against every declared case variant. The computed output must satisfy the same evidence requirements used for players.

Every Worked artifact must execute against its declared variant. The complete ordered Worked set must satisfy its named evidence path through the same technical-evidence assessment used for player artifacts. Validation must reject a failed, unsupported, incomplete, or evidentially useless Worked set.

Validation must change formatting, matcher order, and equivalent aggregation placement to detect accidental source-text grading.

Validation must prove that each concept credit follows from executed semantic behavior and satisfied technical evidence.

Validation must reject an ambiguous detector selector, an undeclared detector parameter or requirement field, and a missing or duplicate requirement lookup. Equivalent semantic behavior and computed evidence must pass without matching expression text or a reference query.

Every queryable metric, stream, structured metadata name, and required parsed field must have a complete registry entry.

### 22.3 Result validation

Each result visualization must support the query result type. Units, label sets, timestamps, ordering, and empty states must match the simulated output.

Numeric evidence rules must declare tolerance where floating-point or quantile behavior requires it.

Validation treats metric vectors as unordered unless the executed language operation defines an order. It checks the requested timestamp direction only within each log stream. It assumes no total order across streams and no tie order for equal timestamps.

### 22.4 Observability validation

Validation must reject these teaching errors:

- A case that treats `up` as a person’s life or health state.
- A case that treats a removed series as a zero sample.
- A metric with a person identifier label.
- A log case that presents a parsed field as an indexed stream label.
- A counter case that uses raw subtraction without reset handling when resets can occur.
- A rate case that applies a counter function to a gauge without an explicit error lesson.
- A classic histogram quantile that drops the required `le` label.
- A ratio with incompatible label sets and no valid vector matching.
- An unwrap case that silently discards conversion errors.
- A claim that an empty query result proves absence without adequate scope evidence.
- A LogQL metric result that continues while any output reaching its metric operation retains a nonempty `__error__` label.
- A spatial claim without an explicit upstream fact that Section 8.4 permits.

### 22.5 Report validation

Every playable case must support a report with one or more ordered filed artifacts. Every artifact must preserve all fields in Section 9.1.

Validation must prove that story conditions cannot read private investigation history. Cross-source cases must assess the ordered filed evidence as a set.

Every title and conclusion choice must have a defined technical claim and political treatment.

The 100 percent report must return `100` from a positive population value. Its audit must identify the tautological numerator and denominator.

### 22.6 Watch validation

Every required watch case must define future data and at least one delayed evaluation. The same saved watch and future data must always produce the same notices.

Watch teaching content must cover broad, brittle, and de-localized failure modes. Each failure must remain visible in the saved query and result.

Eligible metric watches must return instant vectors. Validation must prove that present zero-valued elements create notices and absent elements do not.

Validation must also compare a filtering comparison with its `bool` form. Each form must produce its real notice set.

Each checkpoint must define one exact timestamp. Each record watch must define a bounded execution window that is separate from its display range.

Validation must replay unchanged metric firings, overlapping log windows, resolution, batching, reactivation, and errored or cancelled checkpoints. Notice identities and histories must remain stable, and a failed checkpoint must leave the last successful cursor, lifecycle state, active keys, and absence or resolution counters unchanged.

Every scored scenario must supply the events, provenance, windows, localization values, cost inputs, budgets, and thresholds from Section 10.7. Validation must attribute every deduplicated candidate unit to intended or distractor events or count it as one unattributed false positive; no background result can remain unscored.

Validation must recompute all five quality scores from query output and ground truth. No authored branch can substitute a score.

### 22.7 Pacing validation

Act I validation must reject deliberate falsification, rivalry, detention, coup activity, and Assurance visits. Later acts must obey the escalation in Section 13.

The content coverage report must list every concept’s Observed, Practiced, Independent, Certified, and spaced-recall uses.

The report must use the registry version, assistance records, solved-evidence rules, three-credit case cap, and case-equivalent formula in Sections 11 and 17.

Playtest records must demonstrate the campaign length target. Repeated text or renamed fixtures cannot count as active critical-path play.

### 22.8 Boundary validation

Campaign content cannot contain executable scripts or engine-specific branches. Engine logic cannot contain campaign identities except product title metadata.

Validation rejects dynamic property access, callbacks, unregistered fact namespaces, and predicate or effect names outside Section 20.1.

An automated or manual boundary review must inspect both directions before a release.

### 22.9 Behavioral game validation

Every critical-path case must begin with at least two plausible hypotheses. The brief, registries, and initial evidence must remain consistent with each hypothesis.

Query evidence must support or refute the hypotheses. A direct calculation prompt with no competing interpretation does not qualify as a case.

Each case must accept at least two semantic evidence paths. The paths can use different expressions, languages, or ordered artifact sets.

The paths must satisfy the same technical evidence without expression-string matching. Reference queries must execute each path against every case seed.

Each critical-path case must contain a consequential report or decision. At least two choices must cause different later data, inbox work, access, or world state.

The difference must appear within two later shifts or before the current act ends. A Standing change, renamed text, or cosmetic scene alone is not material.

Campaign acceptance requires recorded playtests from at least 12 target players. The group must include four learners, four intermediate users, and four proficient users.

The representative slice must include discovery, a multi-artifact investigation, a saved watch, its delayed consequence, and a politically conflicting report.

After the slice, the game offers an alternate seed with no mastery credit, Standing, unlock, new story, or ending reward.

At least seven of the 12 players must voluntarily start and finish that alternate seed without a facilitator request. Otherwise, the gameplay gate fails.

At least nine players must correctly explain the decisive query result and its later consequence. Across the group, players must use two semantic evidence paths.

The release fails if length comes from repeated calculations, renamed fixtures, forced replay, or themed prose without state-changing investigation.

## 23. Live Grafana mode

Live mode is a separate late learning mode for an explicitly configured Grafana instance. The campaign cannot require this mode for an ending or career promotion.

This mode is outside the current build. It requires separate authorization and a later specification. The campaign and engine cannot assume that it exists.

The user must start each connection. The game cannot assume credentials, change CORS, alter a pod, modify infrastructure, deploy, host, or publish itself.

Live mode is read-only. It can discover data sources, browse metadata, execute queries, and store local practice artifacts.

It cannot create or change dashboards, alerts, data sources, recording rules, users, annotations, or other Grafana resources.

Live tasks must begin with real schema discovery. A task cannot assume that a practice metric such as `http_requests_total` exists.

The live registry must show actual metric names, types, descriptions, labels, values, streams, and samples that the connected data sources return.

Tasks must adapt to discovered capabilities. If suitable data does not exist, the task must select another goal instead of inventing data.

Live results must display the returned frames, values, labels, graphs, or records. Nonempty data alone cannot prove mastery when interpretation is required.

Live mode can improve technical mastery through separate live distinctions. It cannot change Standing, campaign watches, world state, characters, or endings.

No real-person consequence can result from a live query. A local practice report cannot become a real alert or operational action.

## 24. Completion standard for the first full game

The first full game is complete only when all of these statements are true:

- A player can progress from Reconciliation Trainee to a reachable Party Leader ending.
- The critical path meets the campaign length and concept coverage requirements.
- Act I remains sincere, useful, free of clock pressure, and free of premature political escalation.
- PromQL and LogQL results teach transferable language semantics.
- Equivalent valid queries succeed through semantic evidence rules.
- Every filed report remains an inspectable query artifact.
- Standing queries create deterministic next-shift notices and omissions.
- Broad, brittle, and de-localized watches produce distinct visible consequences.
- Technical mastery and Ministry Standing remain separate throughout the campaign.
- The Well-being Pin data obeys the identity, `up`, and missing-series boundaries.
- Political misrepresentation emerges through report construction rather than a falsification button.
- The endorsed 100 percent report returns later as auditable evidence.
- The Continuity finale depends on earlier queries, reports, and standing watches.
- Story content can expand without named engine logic.
- The simulated campaign works without Grafana, network access, hosting, or deployment.

This contract governs mechanics and content behavior. It does not prescribe application classes, storage libraries, rendering frameworks, or dependency wiring.
