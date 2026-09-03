# Campaign telemetry plan

All telemetry in the main campaign is fictional and simulated. Metric labels remain bounded. Individual identities appear only in records or structured metadata.

## Metric Registry

| Metric | Type / unit | Bounded labels | Meaning |
|---|---|---|---|
| `up` | gauge | `job`, `instance`, `district`, `service` | Standard Prometheus scrape reachability for a simulated target. It says nothing about a person's health, presence, or compliance. |
| `ministry_pin_battery_ratio` | gauge / ratio | `district`, `facility`, `cohort`, `state` | Aggregate Pin battery ratio for a bounded cohort. |
| `ministry_collector_queue_depth` | gauge / records | `district`, `service`, `instance` | Records waiting at one collector target. |
| `ministry_attendance_uploads_total` | counter / uploads | `district`, `facility_type`, `result` | Cumulative attendance batches accepted or rejected. Timelines include authored resets. |
| `ministry_room_temperature_celsius` | gauge / celsius | `district`, `facility`, `zone` | Recorded room temperature from building instrumentation. |
| `ministry_service_requests_total` | counter / requests | `district`, `service`, `route`, `code` | Cumulative service requests. No person identity is present. |
| `ministry_press_pages_total` | counter / pages | `district`, `press`, `edition`, `result` | Cumulative printed pages. Press restarts create explicit resets. |
| `ministry_press_payload_bytes_total` | counter / bytes | `district`, `press`, `edition` | Cumulative bulletin payload bytes. |
| `ministry_registered_population` | gauge / members | `district`, `age_band` | Positive registered population counts. It does not measure Party membership, which is universal in the setting. |
| `ministry_clinic_sessions_total` | counter / sessions | `district`, `clinic`, `result` | Cumulative scheduled and completed clinic sessions. |
| `ministry_pin_events_total` | counter / events | `district`, `cohort`, `event_type` | Aggregate Pin event count for battery, tamper, removal, or proximity categories. |
| `ministry_active_pins` | gauge / pins | `district`, `cohort`, `state` | Current aggregate count of registered Pins by bounded state. Removed series can disappear rather than remaining at zero. |
| `ministry_assurance_dispatches_total` | counter / dispatches | `district`, `depot`, `reason`, `result` | Cumulative Well-being Assurance dispatches. |
| `ministry_dispatch_duration_seconds_bucket` | classic histogram / seconds | `district`, `depot`, `reason`, `le` | Classic bucket counts for dispatch duration. Quantile aggregation must preserve `le`. |
| `ministry_dispatch_duration_seconds_sum` | counter / seconds | `district`, `depot`, `reason` | Sum companion for the classic dispatch histogram. |
| `ministry_dispatch_duration_seconds_count` | counter / dispatches | `district`, `depot`, `reason` | Count companion for the classic dispatch histogram. |
| `ministry_gateway_latency_seconds` | native histogram / seconds | `district`, `service`, `instance` | Native histogram for gateway processing latency. It has no classic `le` label. |
| `ministry_facility_demand` | gauge / units | `district`, `facility`, `service` | Current requested supply units by facility. |
| `ministry_facility_capacity` | gauge / units | `district`, `facility`, `service`, `priority_band` | Capacity metadata used for one-to-one and many-to-one matching. |
| `ministry_inventory_units` | gauge / units | `district`, `depot`, `supply` | Available supplies for allocation cases. |
| `ministry_contentment_index` | gauge / index | `district`, `cohort`, `facility` | An authored aggregate index used to teach gauge history and prediction limits. It is not a clinical or moral fact. Facility-scoped series report the facility's own figure. |
| `ministry_registry_removals_total` | counter / removals | `district`, `reason` | Aggregate Pin de-registration events. Individual evidence remains in records. |
| `ministry_courier_events_total` | counter / events | `district`, `route`, `status` | Aggregate courier events. Courier identity remains in records. |
| `ministry_bulletin_deliveries_total` | counter / deliveries | `district`, `channel`, `result` | Cumulative public bulletin deliveries. |
| `ministry_protocol_signals_total` | counter / signals | `district`, `source`, `classification` | Aggregate signals admitted to the Continuity Protocol. |
| `ministry_protocol_backlog` | gauge / notices | `office`, `priority`, `source` | Pending Continuity notices, used in final cost and saturation cases. |

Every registry entry includes known values for the active dataset and at least one sample series. Dataset fixtures never introduce an undeclared label.

## Record Registry

| Source | Indexed stream labels | Structured metadata | Parsed fields and parser | Meaning |
|---|---|---|---|---|
| `record.pin_gateway` | `service`, `district`, `environment` | `member_id`, `device_id`, `trace_id` | `event`, `facility`, `cohort`, `battery_ratio`, `duration`, `payload_bytes`, `status` via `json` | Pin collector events, including malformed records for `__error__` lessons. |
| `record.attendance` | `service`, `district`, `facility_type` | `batch_id` | `facility`, `scheduled_at`, `uploaded_at`, `count`, `result`, `reason` via `logfmt` | Attendance batch ingestion. Identity is absent unless a later authorized record explicitly requires it. |
| `record.maintenance` | `service`, `district`, `team` | `work_id` | `facility`, `instance`, `component`, `action`, `result`, `elapsed` via `logfmt` | Field repair and replacement work. |
| `record.press` | `service`, `district`, `press` | `edition_id`, `trace_id` | `pages`, `payload_bytes`, `result`, `template`, `elapsed` via `json` | Bulletin rendering, printing, and delivery records. |
| `record.registry` | `service`, `district`, `record_type` | `member_id`, `device_id` | `event`, `reason`, `effective_at`, `state` via `json` | Pin registration, removal, and reinstatement facts. |
| `record.movement` | `service`, `district`, `source` | `member_id`, `device_id` | `event`, `zone`, `checkpoint`, `recorded_at`, `fresh_until`, `sequence` via `json` | Recorded zone and checkpoint facts. A movement record alone is not current position. |
| `record.proximity` | `service`, `district`, `sensor_class` | `member_id`, `other_member_id`, `event_id` | `zone`, `duration`, `strength`, `recorded_at` via `logfmt` | Precomputed proximity facts. LogQL does not calculate distance. |
| `record.vitals` | `service`, `district`, `device_class`, `facility` | `member_id`, `device_id` | `measure`, `value`, `unit`, `quality`, `sample_age`, `guest`, `day`, `outcome` via `json` | Authorized individual readings with explicit quality and freshness. Facility-scoped streams record a guest roster code, the day of the stay, and the recorded outcome. |
| `record.assurance_dispatch` | `service`, `district`, `depot` | `dispatch_id`, `member_id` | `reason`, `facility`, `zone`, `scope`, `result`, `elapsed` via `logfmt` | Assurance dispatch and visit outcomes. |
| `record.audit` | `service`, `district`, `office` | `report_id`, `artifact_id`, `auditor_id` | `event`, `finding`, `support`, `source_count`, `occurred_at` via `json` | Audit chain events and stable filed-artifact references. |
| `record.courier` | `service`, `district`, `route` | `courier_id`, `packet_id` | `event`, `checkpoint`, `zone`, `recorded_at`, `fresh_until`, `sequence` via `logfmt` | Courier route records used in cross-language and Continuity cases. |
| `record.continuity` | `service`, `office`, `source` | `signal_id`, `event_id`, `artifact_id` | `classification`, `district`, `facility`, `route`, `priority`, `result`, `sequence` via `json` | Signals and resource decisions admitted to the Continuity Protocol. |

Raw lines remain available after parsing and formatting. Fields retain their origin as indexed label, structured metadata, or parsed field.

## Authored data behaviors

### Counters and resets

Counter timelines contain ordinary increments, one or more explicit service restarts, and a nearby gauge whose rise or fall is valid without `rate`. Reset cases compare `rate` or `increase` with misleading raw subtraction. The source event that caused each reset is declared in maintenance records.

### Zero, absence, and failure

Separate datasets represent:

- A present zero sample.
- A present series with no traffic during a range.
- A target with `up == 0`.
- A removed series with no later samples.
- A missing log record inside an adequate window.
- An execution error.

No dataset aliases one state to another. Reports cannot infer a person's condition from `up`.

### Histograms

Classic fixtures include monotonic bucket counts with `le`, plus `_sum` and `_count`. Native fixtures use a distinct metric and carry no `le`. Expected quantiles include a tolerance and state the unit, range, population, and interpolation limit.

### Log pipeline errors

Malformed records remain in their stream. Parser or conversion failure gives the record a nonempty `__error__`. Record queries can inspect the error. Metric queries fail while it remains. Supported remedies are a label filter after the failing stage or `drop __error__` when the declared capability exists.

### Record ordering

Each stream's records are authored in timestamp order. Some datasets contain equal timestamps and two streams whose timestamps interleave. No evidence rule assumes a stable order across streams or an equal-timestamp tie. A first/last case either selects one stream or parses `sequence` and declares its comparison and tie rule.

### Location

Allowed facts are recorded zone, checkpoint, proximity, movement change, and explicit current position with `recorded_at` and `fresh_until`. No query computes distance, containment, a route, coordinates, or current position from a last event.

### The Hillside retreat

No case brief, registry description, or directive names what Hillside Well-being Retreat is. It is reachable only by query, from shift 13 onward, through the ordinary vocabulary:

- `ministry_facility_demand{facility="hillside-retreat",district="hillside"}` runs a twenty-one day sawtooth. Intake fills the facility to 40 on the cycle day, then the population decays to about 4 across the following twenty days. `ministry_facility_capacity` for the same labels is flat at 40, so the intake-day ratio is exactly 1. Shifts 17 and 38 are intake days.
- `ministry_registry_removals_total{district="hillside"}` separates `programme-complete` and `rest`, which both climb steadily, from `relocation`, which barely moves.
- `ministry_contentment_index{facility="hillside-retreat"}` is pinned at 100 for the whole campaign.
- The `record.vitals` stream labelled `facility="hillside-retreat"` carries `guest`, `day`, and `outcome`. The `rest` outcome clusters at days 17 to 21 of a guest's stay and is absent mid-cycle.

Two Well-being Assurance memos frame the data without explaining it. `message.wellbeing.drost.offer` at shift 12 reports that Emil Drost has been offered a place. `message.wellbeing.drost.rest` at shift 15 reports a completion on day 19 and a retired pin. The metrics keep the telemetry contract: `ministry_active_pins{district="south",cohort="civic"}` steps from four to three inside shift 15's own window, and the name appears only in the records, as the guest code `drost-e` on the day 19 rest record.

## Dataset families and meaningful variants

Each family has at least two critical-path variants and one consequence-free archive variant. Variants change at least two dimensions.

| Family | Dimensions that change | Different reasoning forced |
|---|---|---|
| Collector reconciliation | failed service, target-label topology, simultaneous battery state, maintenance record format | Separate scrape failure from device-state evidence and localize the repair. |
| Attendance ingestion | delayed versus rejected batch, facility topology, reset timing, log parser | Choose rate/window and correlate the batch cause. |
| Press production | page rate versus payload bytes, restart pattern, district grouping, malformed record | Distinguish volume from size and preserve publication scope. |
| Clinic silence | zero, no traffic, scrape failure, removal, missing record, execution error | Use the correct absence model and avoid personal claims from infrastructure data. |
| Movement and proximity | source stream, freshness, sequence ties, precomputed zone or proximity fact | Establish recorded event versus explicit current position. |
| Assurance dispatch | classic versus native histogram, depot topology, tail event, localization | Calculate and interpret a quantile that can direct a real resource. |
| Audit chain | artifact order, omitted source, title/conclusion claim, raw versus formatted record | Decide whether the filed evidence supports its official claim. |
| Facility allocation | one-to-one versus many-to-one cardinality, unmatched facilities, retained metadata, supply limit | Match vectors without dropping or multiplying demand. |
| Performance | equivalent semantic path, label cardinality, scan range, early filter selectivity | Preserve evidence while meeting an explicit budget. |
| Continuity | intended and distractor event topology, watch portfolio, checkpoint cadence, access, political pressure | Balance all five watch qualities across interacting future events. |

## Standing-watch scenario set

| Scenario | Mode | Intended events | Distractors and background | Required localization | Visible consequence |
|---|---|---|---|---|---|
| `watch-scenario.029.lantern-design` | records | Elm Exchange `service_delay` record | Routine gateway traffic and Clinic Nine delay records | `district`, `service`, `facility` | A precise watch raises one localized next-shift notice; broad, brittle, and de-localized versions flood the desk, miss the delay, or produce an unusable work order. Two later absent checkpoints resolve the notice. |
| `watch.press.delivery` | metric and record variants | Press reset with stalled delivery; oversized bulletin payload | Normal edition rollover; high pages with successful delivery; malformed unrelated record | `district`, `press`, `edition` | Administrative queue, delayed bulletin, or correct press repair. |
| `watch.threshold.removal` | records | Declared Pin removal followed by authorized dispatch need | Battery maintenance; short proximity event; stale movement event | `member_id`, plus fresh `zone` when action requires it | One precise visit, delayed visit, or broad cohort visit. |
| `watch.ledger.integrity` | records | Report reopened with unsupported claim; raw record contradicts formatted memo | Routine archive access; supported correction; duplicate audit record | `report_id`, `artifact_id`, `office` | Audit target and archive access change. |
| `watch.continuity.portfolio` | mixed | Leadership movement, facility outage, communications change, dispatch capacity loss | Maintenance convoy, scheduled press surge, stale courier event, background signals | Event-specific `district`, `facility`, `route`, or `office` | Final resource allocation and ending eligibility. |

Every scored scenario declares at least one intended event and one distractor, all checkpoints, stable source IDs, detection windows, localization values, cost budgets, and thresholds. Background candidates without event provenance count as unattributed false positives.

## Validation reference examples

Reference queries prove fixture behavior. They are not accepted-answer strings.

```promql
up{service="pin-gateway"} == 0
```

Equivalent selector ordering and a narrower district matcher must pass when they preserve the required evidence.

```promql
sum by (district) (rate(ministry_attendance_uploads_total{result="accepted"}[10m]))
```

```promql
histogram_quantile(0.95, sum by (district, le) (rate(ministry_dispatch_duration_seconds_bucket[15m])))
```

```promql
ministry_facility_demand
  * on (district, facility, service) group_left (priority_band)
    ministry_facility_capacity
```

```logql
{service="pin-gateway", district="north"} |= "removal" | json
```

```logql
sum by (district) (
  rate({service="attendance"} | logfmt | result="rejected" [10m])
)
```

```logql
quantile_over_time(0.95,
  {service="assurance-dispatch"} | logfmt | unwrap duration(elapsed) | __error__="" [15m]
) by (district)
```

Validation must also run semantically equivalent forms, including matcher reordering, `by` and valid `without` alternatives, equivalent filter placement, and supported `drop __error__` versus the corresponding label filter.
