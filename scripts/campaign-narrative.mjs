const clone = (value) => structuredClone(value);
const fact = (factId) => ({ fact: factId });
const state = (factId, expected) => ({ op: "state", value: fact(factId), expected });
const compare = (factId, right) => ({ op: "compare", left: fact(factId), relation: "=", right });
const choice = (choices, suffix) => choices.find((item) => item.id.endsWith(suffix));
const mainCaseNumber = (item) => Number(item.id.match(/^case\.(\d{3})\./)?.[1]);

// One compact authored beat per main shift. The paper supplies context and public
// consequences; the directive and work orders carry the operating instruction.
const beats = [
  ["shift.01.first-bell", "ELM EXCHANGE OPENS ON SCHEDULE", "The new national grid has sent its first local delay to a human desk.", "Elm Exchange is job `pin-collector` in district `north`; the delayed instance is `north-02`.", "Battery Cart Three reaches North brick blocks from 07:10. The annex warming room opens at 07:30.", "Elian Marr", "Separate the Elm signals before Vey sends a crew."],
  ["shift.02.rain-ledger", "ROUTINE PREPAREDNESS MEETS NORTH RAIN", "Yesterday's Elm filing now determines the size of the repair route.", "Rain exposed a target-label mismatch and a late School Twelve upload. Keep their locations separate.", "School Twelve breakfast remains scheduled for 08:00. Battery Cart Three uses the covered arcade.", "Tomas Vey", "Keep rain, relay, and school records in their places."],
  ["shift.03.warm-rooms", "SCHOOL TWELVE KEEPS THE BREAKFAST BELL", "A delayed upload became a service route, not merely a cleared inbox.", "Distinguish a returned zero, a failed scrape, an unrelated record, and a missing label before routing technicians.", "Breakfast slips remain valid at School Twelve's west door. Late uploads keep their printed receipt time.", "Lia Merev", "Preserve the label that keeps breakfast service open."],
  ["shift.04.clerks-seal", "TRAINEES COMPLETE NATIONAL GRID REVIEW", "A local assessment is presented as a national success.", "Combine metric and record evidence. An error opens more practice; it does not invent a passing result.", "North Gate trams use the east platform while the west relay cabinet dries.", "Elian Marr", "Reconcile both source types before the clerk review."],
  ["shift.05.cold-annex", "ANNEX HEAT RESTORED BEFORE ROLL CALL", "The repair record will later show exactly what the clerk authorized.", "Read each result as the table, range, scalar, or record it actually is before choosing a repair.", "If the annex lamp stays red, roll call moves to Elm Hall at 07:50.", "Tomas Vey", "Match each result shape to one physical repair."],
  ["shift.06.quiet-queue", "PATIENT QUEUES REQUIRE NO GENERAL ALARM", "The word quiet covers several different instrument states.", "A present zero and an absent series require different orders. Keep the distinction in the printout.", "Clinic Nine issues blue queue tickets at 07:30. Second-session status posts at 09:10.", "Lia Merev", "Decide what kind of quiet the queue actually shows."],
  ["shift.07.malformed-morning", "BAD ENVELOPES CORRECTED; NO EVENTS LOST", "That claim is true only if the malformed lines remain visible.", "Repair parser order without filtering away errors or the source labels Vey needs for replacement work.", "West battery carts accept dented clips separately from spent cells until noon.", "Tomas Vey", "Repair the envelope without erasing the failed line."],
  ["shift.08.lantern-watch", "LANTERN BOARD WILL NOTICE TOMORROW", "A saved query can act again after its author leaves the desk.", "Save an Elm gateway watch with enough coverage, specificity, localization, correctness, and economy to route service.", "North tram receipts remain valid during the relay-cabinet replacement.", "Elian Marr", "Build one watch that can find and locate Elm."],
  ["shift.09.counted-promises", "ONE DELAY SEEN BEFORE SERVICE BELL", "Petra Noll wants one technically true figure that fits the front page.", "Compare totals with rates, then inspect whether Lantern found the delay, flooded the desk, missed it, or lost its location.", "Clinic Nine's delayed morning session starts at 10:10. Existing slips remain valid.", "Petra Noll", "Separate the headline figure from the service fact."],
  ["shift.10.restart-day", "PRESS OUTPUT CLIMBS AFTER ROUTINE START", "A restarted lifetime counter makes a larger and simpler headline.", "Separate reset from growth. For Cold Restart Review, compare the paper's ready annex with its labeled temperature series.", "North Star restarted at 06:40. School Twelve reports its North annex ready for breakfast at 08:00.", "Tomas Vey", "Prove the restart before anyone calls it growth."],
  ["shift.11.equal-districts", "EVERY DISTRICT RECEIVES EQUAL ATTENTION", "Equal wording can accompany an unequal allocation.", "Keep the district grouping so scarce relay parts reach the stalled service instead of vanishing into a national total.", "North replacement relays load at Depot A. Unassigned parts remain on Cart Six.", "Lia Merev", "Keep the stalled district visible in every total."],
  ["shift.12.watch-board", "WATCH OFFICERS KEEP THE PRESSES AWAKE", "The promotion board has one seat and two good clerks.", "Rank the queues, retain useful filters, and decide which press receives scarce paper before its window closes.", "Emil Drost has accepted a short period of rest at Hillside after missed attendance and strain readings.", "Emil Drost", "Choose a press route before the paper window closes."],
  ["shift.13.ink-river", "INK ARRIVES DESPITE INVOICE CONFUSION", "Drost's chair is empty; his old Pin now reads `rest` in the Registry.", "Use the declared parser and stage order to separate malformed invoices from a blocked press without hiding either.", "North Star's late edition reaches ration halls at 11:40.", "Petra Noll", "Show whether the invoice or the press blocked delivery."],
  ["shift.14.weight-of-paper", "A HEAVIER BULLETIN CARRIES GREATER CONFIDENCE", "Bytes are easy to print as importance, even when they measure bulk.", "Distinguish document flood, oversized payloads, and record rate. Keep the qualifier Noll says will not fit.", "Civic One accepts corrected ink invoices through the west window at 13:00.", "Petra Noll", "Measure useful output, not the weight of its envelope."],
  ["shift.15.every-member", "EVERY MEMBER COUNTED", "The calculation returns 100 percent; its sources never measure membership.", "Show that the operands are equal and positive, then keep the missing membership measure in the signed record.", "All ration halls accept current Well-being Pins. Replacement registration opens at 06:30.", "Sabine Orra", "Retain what the ratio measures and what it does not."],
  ["shift.16.clean-bulletin", "PUBLIC RECORD NOW WATCHES ITSELF", "Drost returns under a reissued Pin and calls Hillside restorative leave.", "Compare broad, brittle, and de-localized press watches. Keep only the one whose notices remain usable.", "Drost resumes his desk today. His prior device remains retired under reason `rest`.", "Elian Marr", "Retain a press watch that preserves action fields."],
  ["shift.17.empty-clinic", "CLINIC NINE REPORTS PERFECT QUIET", "One cheerful word now covers zero, darkness, removal, and no traffic.", "Distinguish all four states before keeping or closing a clinic session. Merev has sixteen appointments waiting.", "Clinic Nine's second session is suspended unless the signed result supports reopening. Tickets 41–56 transfer at 11:20.", "Dr. Ilyan Sero", "Name the kind of absence before closing a session."],
  ["shift.18.gate-twelve", "MISSED SHUTTLE RESOLVED AT NORTH GATE", "A receipt proves a past crossing; Sol still needs a fresh destination.", "Use movement and zone-change records without turning recorded movement into current position.", "Shuttle 12 leaves North Gate at 08:15. Delayed riders keep yesterday's transfer slips.", "Niko Rell", "Find a fresh route before the cold platform clears."],
  ["shift.19.near-enough", "BRIEF CONTACT SHOWS STRONG COMMUNITY TIES", "A relay handshake is being offered as social evidence.", "Parse duration and bytes before a short device contact becomes a cohort-wide interview order.", "Battery Cart Two waits at North Gate from 07:45 to 08:10 for delayed riders.", "Dr. Ilyan Sero", "Keep a device contact from becoming a person claim."],
  ["shift.20.liaisons-card", "NEW LIAISONS SHORTEN THE DISTANCE FROM SIGNAL TO DOOR", "Seven's next signature can now become a field route.", "Retain conversion errors while reading the bounded vital window. A filtered error can remove someone from review.", "Clinic Nine accepts Pin calibration checks from 12:00 to 14:00.", "Elian Marr", "Preserve every failed conversion before authorizing a route."],
  ["shift.21.removed-from-roll", "RETIRED PINS LEAVE NO UNANSWERED NEED", "The Registry shows a device removed for `rest`; it records no human outcome.", "Separate Pin removal, collector failure, and a present zero before saving the Threshold watch.", "School Twelve's warming room opens from 05:30 to 10:00 while North service crews inspect feeder B.", "Ruva Sol", "Treat removal as a device fact, not a resolution."],
  ["shift.22.apartment-nine", "APARTMENT NINE RECEIVES PERSONAL ATTENTION", "The same sentence can mean one door, many doors, or delay.", "Correlate cohort telemetry with controlled records and retain a fresh location for any visit Sol must route.", "North blocks 11–14 return to district heat at 10:00. The warming room stays open until confirmation.", "Ruva Sol", "Give any authorized visit a fresh, supportable destination."],
  ["shift.23.error-label", "ATTENDANCE IMPROVES AFTER HELPFUL VISIT", "Removing observations can improve an average without helping a person.", "Inspect `__error__` before filtering, then connect changed attendance and tamper records to yesterday's route.", "School Twelve breakfast opens at 08:20. Half measures continue until Depot South's missing cart is counted.", "Dr. Ilyan Sero", "Keep rejected records visible when measuring the visit."],
  ["shift.24.first-visit", "ASSURANCE FINDS EVERY ADDRESS IT IS GIVEN", "The route sheet says whether that meant one door, many doors, or none.", "Audit dispatch records for destination, reason, scope, result, and elapsed time before signing the visit finding.", "Clinic Nine adds a 14:30 catch-up session. One rejected closure route remains in the controlled dispatch log.", "Ruva Sol", "Read the field result before praising the route."],
  ["shift.25.ninety-fifth-door", "ONE SLOW DOOR RECEIVES THE FASTEST HELP", "A district average can hide the one delay that needs the ambulance.", "Preserve `le` and locate the dangerous tail before routing Depot A's limited ambulances.", "Depot A's ambulance lane remains clear from 07:00 to noon. Clinic carts use River Street.", "Sabine Orra", "Keep the histogram boundary that identifies the slow tail."],
  ["shift.26.new-buckets", "NEW INSTRUMENTS CONFIRM OLD CONFIDENCE", "Two histogram forms can agree while describing different services and units.", "Respect units and interpolation limits, then inspect whether prior Assurance work increased the queue.", "Ambulances for the slowest North route stage at Depot A until noon.", "Dr. Ilyan Sero", "Certify only the service and unit actually measured."],
  ["shift.27.yesterdays-calm", "YESTERDAY PROVES TODAY IS BETTER", "The chosen offset decides which yesterday the sentence means.", "Compare past and present without treating a fixed evaluation as a current fact. Retain the inconvenient window.", "North blocks 6–10 use School Twelve's warming hall from 13:00 to 15:00 during load reduction.", "Elian Marr", "Keep both time windows in the public comparison."],
  ["shift.28.auditors-seal", "AUDITORS WELCOME EVERY PRESERVED LINE", "An honest conclusion without lineage cannot enter Orra's archive.", "Score each saved watch for coverage, specificity, localization, correctness, and cost; retain every source and time.", "Records Integrity accepts printouts from 08:00 to 16:00 at West Archive Door C.", "Sabine Orra", "Make every watch result reproducible before review."],
  ["shift.29.forecast-office", "CALM FORECAST ARRIVES ON TIME", "A timely forecast can plan stock without proving certainty.", "State the forecast horizon and limits, then identify which office yesterday's comparison made auditable.", "South ration halls open at 10:30. Lentils remain a half measure until the missing cart is counted.", "Emil Drost", "Use the forecast for stock, not certainty."],
  ["shift.30.perfect-report", "ONE HUNDRED PERCENT REPORT RECONFIRMED", "Records Integrity has reopened the title, operands, printouts, and signatures.", "Reproduce the arithmetic and state plainly that registered population is not a membership measure.", "South ration halls continue half measures. Full portions resume only after a counted delivery.", "Sabine Orra", "Audit the old sentence against its actual operands."],
  ["shift.31.lines-for-archive", "PUBLIC RECORD IMPROVED FOR READABILITY", "The proposed improvement removes the line that explains Drost's Hillside absence.", "Format records without erasing raw provenance. Decide whether Drost's edited memo can supersede its source.", "Archive Room Four closes at 15:00 while superseding sheets are numbered.", "Emil Drost", "Keep the raw line beside any readable replacement."],
  ["shift.32.district-audit", "DISTRICT REVIEW DISCOVERS NEW CAPACITY", "The new capacity consists partly of desks whose officers were removed.", "Assemble the Ledger chain across reports, watches, publications, and visits; identify every signature and omission.", "Clinic Nine adds one 16:00 session. Three Ministry desks are listed as newly available.", "Sabine Orra", "Trace each public claim back to its signed source."],
  ["shift.33.two-ledgers", "TWO LEDGERS PRODUCE ONE FAIR ALLOCATION", "The morning page says every counter remains open; the capacity ledger does not.", "Match facility demand to capacity. Values above one mean shortage; `+Inf` means demand against zero capacity.", "Ration Hall Three has 120 requests for 45 portions. Clinic Nine and North Heat report demand with zero operating capacity.", "Lia Merev", "Keep every unmatched or over-capacity facility visible."],
  ["shift.34.capacity-permit", "PERMITS FOLLOW PROVEN CAPACITY", "Missing metadata is being printed as proof that a facility has none.", "Enrich demand with capacity while retaining cardinality, zone, and facilities missing from either ledger.", "Clinics without a capacity permit must send a runner to Civic Services by 09:00.", "Oskar Vale", "Preserve unmatched facilities when joining the permit lists."],
  ["shift.35.unless-they-appear", "EXCEPTIONS PROTECT ORDINARY SERVICE", "An exception can preserve a clinic or make it disappear from allocation.", "Use set operations without converting absence into a person or service fact. Derive every excluded facility.", "North blocks 17–20 have no district heat from 06:00 to 09:00. School Twelve opens its warming hall.", "Sabine Orra", "Derive each exception before it removes a service."],
  ["shift.36.deputys-desk", "DIRECTOR'S DESK OPENS TO PROVEN CERTAINTY", "One promotion can close another officer's route to the archive.", "Combine precedence, matching, ratios, and evidence claims. Do not let a clean title replace a missing source.", "Clinic Nine, River Clinic, and South Children's Room post permit status at noon.", "Oskar Vale", "Choose which complete record reaches the Director's desk."],
  ["shift.37.expensive-truth", "COMPLETE TRUTH ARRIVES WITHIN BUDGET", "Vale has chosen a budget that makes one source difficult to keep.", "Compare equivalent evidence paths by cost and completeness; a late result can crowd another service out.", "North's warming hall remains open until feeder B holds load for one full hour.", "Tomas Vey", "Account for the source the budget would discard."],
  ["shift.38.three-watches", "THREE WATCHES COVER EVERY NECESSARY EVENT", "That promise appears before any coverage test is complete.", "Repair one broad, brittle, or de-localized watch and retire another within the portfolio limit.", "Hillside demand reaches its recurring peak. South ration halls restore lentils; breakfast oats remain a half measure.", "Anja Krell", "Keep the watch that can still find and locate harm."],
  ["shift.39.office-weather", "COLLEAGUES UNITE BEHIND ONE RECORD", "The signed record decides which people and sources survive the review.", "Build the alliance report from mentor, rival, engineer, editor, and auditor records rather than a loyalty declaration.", "Hillside receives linen at the east gate at 14:00. Public visiting remains suspended.", "Sabine Orra", "Let filed history, not a pledge, determine the alliance."],
  ["shift.40.directorate", "DIRECTORATE SELECTS TOMORROW'S TRUTHS", "The modernization plan is an admission map for a succession system.", "Audit the observation map, source rights, access budget, and retained watches before Continuity closes admission.", "A completed Continuity record may support confirmation as Party Leader.", "Anja Krell", "Decide which sources can participate in tomorrow."],
  ["shift.41.continuity-brief", "CONTINUITY BEGINS AS SCHEDULED", "The public sees an exercise; the annex can certify a successor.", "Inspect which filed artifacts, active watches, and admitted sources can observe movement, facilities, presses, and dispatch.", "North Gate closes from 05:40 to 06:10. Clinics and ration halls remain open.", "Anja Krell", "Prove which sources the Protocol is allowed to see."],
  ["shift.42.signals-before-dawn", "PRE-DAWN MOVEMENTS ARE ROUTINE", "Two sealed routes are plausible; only one remains observable.", "Correlate aggregate facility changes with courier receipts without turning past movement into current position.", "Tram 4 omits Directorate Square until 07:00. Use River Stop.", "Niko Rell", "Keep old movement separate from a current destination."],
  ["shift.43.empty-corridor", "EMPTY CORRIDORS SHOW EFFICIENT ATTENDANCE", "The sentence exploits four kinds of absence at once.", "Separate missing series, silent streams, stale movement, and explicit current facts before Sol opens standby routes.", "The Directorate's east corridor closes before first bell. Public offices use the west entrance.", "Ruva Sol", "Give standby teams a current fact or keep them still."],
  ["shift.44.protocol-rehearsal", "REHEARSAL FINDS NO EMERGENCY", "A watch that misses an event can produce the same quiet page.", "Repair coverage, specificity, localization, correctness, or cost before the live horizon. Only filed repairs are admitted.", "Clinic Nine remains open during the exercise. Emergency calls route through Depot A.", "Sabine Orra", "File every repair the live Protocol must use."],
  ["shift.45.first-silence", "QUIET SYSTEMS PROVE CAREFUL PREPARATION", "The headline was set before command communications went silent.", "Separate the overloaded command facility, slow dispatch tail, dark collector, and aggregate absence as the exercise becomes live.", "Essential-service notices print at North Star and Civic One. Ordinary supplements wait.", "Anja Krell", "Identify the actionable failure before the prepared page circulates."],
  ["shift.46.saturation", "EVERY SIGNAL RECEIVES ITS PROPER PRIORITY", "The queue may contain a rescue, flood, miss, or unusable location.", "Spend the remaining clock on notices that can still reach a press, service route, or repair crew.", "North Gate is closed. Clinic Nine, School Twelve, and Depot A remain open at their printed locations.", "Anja Krell", "Spend the clock on signals that remain actionable."],
  ["shift.47.official-record", "OFFICIAL RECORD READY BEFORE EVENTS CONCLUDE", "The press is preparing a transfer result before the operation ends.", "Assemble ordered PromQL and LogQL artifacts, omissions, alliance evidence, and conclusions with intact lineage.", "Certified editions appear at ration halls and tram gates after Directorate acknowledgment.", "Sabine Orra", "Build the succession packet from filed, reproducible facts."],
  ["shift.48.all-is-well", "ALL IS WELL", "The sentence is fixed; the service notices and controller of the presses are not.", "Run the final Elm service checkpoints against saved watches and filed history. Notice quality, access, allies, and Standing settle the transfer.", "Localized clinic, heat, and ration notices print only where the final record preserved their destinations.", "Anja Krell", "Complete the record the Directorate will treat as rule."],
].map(([shiftId, headline, subhead, desk, service, speaker, order]) => ({ shiftId, headline, subhead, desk, service, speaker, order }));

const leadStories = [
  // Act I: the paper is useful, confident, and mostly accurate.
  "Elm Exchange resumed service at 06:00 after overnight attention from Civic Services. Reconciliation said the north collector remained inside the national grid throughout the delay.",
  "North crews inspected relay cabinets before first bell and reported ordinary rain preparation. Covered routes remain open while wet equipment is checked.",
  "School Twelve will serve breakfast at the usual bell after a delayed instrument upload. Civic Services thanked families for keeping their Pins visible at the west door.",
  "The Signal Reconciliation Bureau completed its first national review class this morning. Four local files were closed under the supervision of Elian Marr.",
  "School Twelve's North annex reopened before roll call after an overnight heating review. The school asks pupils to use the east corridor until the green lamp is steady.",
  "Clinic Nine reports an orderly morning queue and no reason for a district alarm. Blue tickets remain valid for the second session.",
  "A revised record envelope reached every west-district collector before dawn. Instrumentation officers credit the new format with a cleaner morning ledger.",
  "A saved Reconciliation watch will monitor Elm Exchange after the desk closes. The Ministry calls the trial a step toward service that notices delay before a Member reports it.",
  // Act II: technically true figures begin carrying wider implications.
  "Public Assurance recorded one delay before the service bell and placed the figure above today's clinic notice. Editor Petra Noll called the number clear enough to carry home.",
  "North Star's press counter rose after its scheduled morning restart. Public Assurance says the higher total confirms that bulletin production remains strong.",
  "All four districts received an equal line in today's allocation table. Civic Services will distribute replacement relays under the approved national total.",
  "The Watch Officer board opened one seat after reviewing press queues and saved searches. Two Reconciliation clerks remain under consideration.",
  "Ink reached North Star despite discrepancies in three invoice records. Press supervisors credit the corrected envelope format and ordinary staff attention.",
  "This morning's bulletin carries more public information than any issue this month. Public Assurance measured the gain by total bytes delivered to the presses.",
  "The registered population calculation returned a complete figure for every district. Public Assurance has approved the title EVERY MEMBER COUNTED for general circulation.",
  "A new press watch entered service before dawn and will review each declared publication line. Public Assurance says every press now has an orderly notice route.",
  // Act III: people disappear into aggregate improvements.
  "Clinic Nine reported no increase in its morning queue. Public Assurance praised the quiet session and retained all sixteen appointments in the daily total.",
  "A delayed shuttle receipt was reconciled at North Gate before the next departure. Transit officers remind Members that a past crossing does not reserve a future seat.",
  "A brief Pin handshake has been entered in the weekly community-contact figure. Instrumentation officers describe the reading as a routine device event.",
  "New liaison routes now carry selected service findings from the desk to Well-being Assurance. Officials say the shorter route will make help more timely.",
  "Retired Pins left no unresolved device entry in the morning register. Replacement registration remains available at every ration hall.",
  "Apartment Nine received personal attention after a fresh North service notice. Well-being Assurance reports that the assigned route was completed within the permitted window.",
  "North attendance improved after yesterday's helpful visit. Public Assurance calculated the gain from records accepted by the current parser.",
  "Well-being Assurance completed every route that arrived with an authorized destination. Dispatchers returned one incomplete sheet to Reconciliation.",
  // Act IV: the archive changes what earlier facts are allowed to mean.
  "Depot A assigned its fastest available ambulance to the slowest reported door. The district average remained within the approved service figure.",
  "New instruments reproduced the confidence recorded by the previous histogram. The Ministry says both formats confirm orderly dispatch service.",
  "Yesterday's service figure was compared with today's and entered as an improvement. The chosen comparison window has been retained by Records Integrity.",
  "Records Integrity welcomed every watch result that arrived with its source, time, and filed transformation. Unattached conclusions were returned without entry.",
  "The Forecast Office delivered its calm outlook before the ration ledger closed. Drost says the estimate gives stock clerks a usable planning number.",
  "Records Integrity reproduced the registered-population arithmetic behind the earlier 100 percent report. The approved public title remains unchanged.",
  "A revised archive line gives readers a cleaner account of a former officer's leave. The source record remains subject to ordinary supersession rules.",
  "A district audit found three offices available for new service assignments. Records Integrity will publish the final capacity after signatures are reconciled.",
  // Act V: public service language becomes internal positioning.
  "A single allocation joined the facility-demand and capacity ledgers this morning. Public Assurance says every approved counter can now be served fairly.",
  "New permits will follow the capacity figures received before 09:00. Facilities absent from the approved list may apply through a district runner.",
  "A revised exception list will protect ordinary service from unusual demand. Offices outside the result require no further allocation today.",
  "The Director's desk opened to candidates whose records meet the current certainty standard. One promotion notice will be printed after the review.",
  "Public Assurance received a complete result within the new query budget. Director Vale said timely evidence protects both paper and service capacity.",
  "Three saved watches entered the portfolio review under the Continuity standard. The Ministry expects every necessary event to receive a usable notice.",
  "Five offices submitted one record for the Directorate review. Records Integrity will retain the signatures that remain admissible after reassignment.",
  "The Directorate approved a modern observation map for tomorrow's continuity exercise. Admitted sources will receive priority access before first bell.",
  // Act VI: planned outcomes are printed as completed facts.
  "The Continuity exercise began on schedule with every essential office represented. The Secretariat says the approved source map can preserve command through any interruption.",
  "Pre-dawn courier movements followed sealed routes through Directorate Square. Receipt times will be reconciled after the exercise concludes.",
  "Empty Directorate corridors allowed the morning session to begin without delay. Attendance officers praised the efficient movement of assigned staff.",
  "A full rehearsal found no emergency that required public notice. The admitted watch portfolio will remain in place for the live interval.",
  "Quiet command systems confirmed the preparation described in yesterday's bulletin. Essential presses received the certified page before ordinary traffic resumed.",
  "Every signal in the Continuity queue received its proper priority. The Secretariat reports that service and command routes remain under one orderly record.",
  "The official transfer record reached the presses before the Directorate session closed. Certified copies will appear after acknowledgment.",
  "The Directorate confirms that every essential service remained under responsible command. The final national edition has been released on schedule.",
];

const secondStories = [
  ["ELM SERVICE BULLETIN", "Reconciliation lists Elm Exchange under job `pin-collector`, district `north`, and instance `north-02`. The listing names a collector target, not a Member or an individual Pin."],
  ["WINTER GLASSHOUSE READY", "The South school glasshouse has produced its first tray of herbs. Lunch rooms will display the crop before it enters the soup ledger."],
  ["TRAM BELL STANDARD ADOPTED", "Every Orison tram will use the same two-note departure bell by spring. Old bells will continue until their scheduled inspection."],
  ["YOUNG CLERKS TOUR THE ARCHIVE", "Six pupils watched Records Integrity seal a practice file. Their teacher reports that every page returned in the correct order."],
  ["NORTH COURTYARD GAINS A CLOCK", "School Twelve's repaired courtyard clock now agrees with the tram board. The old hands will remain on display beside the boiler room."],
  ["CLINIC WINDOWS RECEIVE NEW GLASS", "Civic Services replaced three cracked panes at River Clinic. The work used glass saved from the former west waiting room."],
  ["BATTERY CLIPS RETURN FOR REUSE", "Members may leave bent Pin clips at any ration hall. Instrumentation will count each returned piece toward the district recovery figure."],
  ["FOUNDERS' HOUR ADDS A VERSE", "Tomorrow's 07:00 broadcast will include the new service-grid verse. Schools may collect the printed words after breakfast."],
  ["NATIONAL FIGURES GET WIDER TYPE", "The Contented Citizen has widened the numerals used for approved percentages. Editors say Members can now read progress from farther away."],
  ["PRESS CREWS SHARE ONE BREAKFAST", "North Star and Civic One operators met before the restart bell. The combined table served forty-six workers from one kitchen ledger."],
  ["RELAY WORKERS COMPLETE BLUE ROUTE", "Vey's field crews replaced wet connectors along the canal wall. One unopened crate returns to Depot A this afternoon."],
  ["ONE CHAIR AWAITS ITS OFFICER", "The Watch Officer review room now contains one green chair and two sealed folders. Results will be posted without unnecessary delay."],
  ["INK CART TAKES THE COVERED ROAD", "A Civic One cart reached North Star through the market arcade. The driver returned three unsigned receipts for clarification."],
  ["SMALLER BULLETIN SAVES A TREE", "Public Assurance will trial a narrow-margin evening page. The paper saved will be entered as additional national reading capacity."],
  ["FOUNDERS' WEEK TABLES SET", "Assembly halls have received red cloth, four water pitchers, and the approved portrait order. Volunteer attendance opens at 18:00."],
  ["FOUNDERS' WEEK CLOSES ON TIME", "Assembly halls returned every portrait and water pitcher to the approved store. Attendance totals will appear after the final receipt."],
  ["MODEL HOUSEHOLD FINDS MORE QUIET", "The Venn household's youngest child slept through the new clinic bell. Chapter three of their civic serial ends, as always, with all well."],
  ["NORTH GATE PAINTED BEFORE DAWN", "Transit crews renewed the white queue line without closing the platform. Damp sections remain behind cheerful yellow rope."],
  ["CONTACT WEEK COUNTS HELLOS", "Assembly officers invite Members to record every greeting made before noon. Device handshakes will be published in a separate figure."],
  ["ASSURANCE OPENS A ROUTE ROOM", "The new room contains a wall map, two telephones, and locked forms for fresh locations. No public counter is planned."],
  ["RETIRED ENAMEL BECOMES ART", "A west-district class arranged old Pin faces into a sunburst. Back plates remain with Instrumentation for proper accounting."],
  ["HILLSIDE PLANTS WINTER PINE", "Retreat guests and staff planted twelve trees inside the east fence. Public visiting remains suspended during the recovery season."],
  ["ATTENDANCE PRIZE RETURNS", "School Twelve will award a brass bell to the room with the best accepted attendance. Corrected records join next week's contest."],
  ["DISPATCHERS PRACTICE QUIET CALLS", "Assurance teams completed a route drill using blank address cards. Cards without destinations were returned unopened."],
  ["DEPOT A POLISHES THE FAST LANE", "Ambulance crews cleared salt from the north apron before sunrise. The lane remains reserved for routes with a named destination."],
  ["TWO HISTOGRAMS ENTER THE FAIR", "The Instrumentation exhibit shows bucket counters beside the new native format. Visitors may compare them without touching the reset lever."],
  ["YESTERDAY ARCHIVE OPENS TODAY", "Records Integrity will display one historical service table in Room Four. The evaluation time appears beneath the glass."],
  ["AUDIT WEEK ADDS RED STRING", "Archive apprentices will practice joining sources, printouts, and signatures. No string may cross an unnumbered page."],
  ["FORECAST OFFICE COUNTS LENTILS", "Stock clerks tested tomorrow's ration estimate against three earlier deliveries. The kitchen kept the unused fourth figure."],
  ["CENTENARY PORTRAIT RECOUNTED", "Records Integrity confirmed that every registered copy bears the approved seal. The count does not include damaged frames."],
  ["READABLE RECORDS WIN RIBBONS", "The archive will reward the cleanest rewritten service line. Original pages remain available under the ordinary retention schedule."],
  ["THREE DESKS RECEIVE NEW PLANTS", "Reassigned offices now display winter ivy from the South glasshouse. Former occupants may collect personal pots through Personnel."],
  ["RATION HALL TESTS ONE-LINE MENU", "Tomorrow's board will combine demand, capacity, and portion size. Ingredients absent from the board require no public explanation."],
  ["PERMIT RUNNERS GET BLUE BAGS", "District messengers can now separate approved forms from forms awaiting capacity. Bags must be returned before the evening count."],
  ["EXCEPTION DAY CELEBRATES THE RULE", "Schools will teach how a carefully drawn exception protects the ordinary list. Children may color only inside the approved set."],
  ["DIRECTORATE CORRIDOR GAINS A DOOR", "Carpenters finished a second review-room entrance overnight. The first entrance will close when the successful candidate arrives."],
  ["CHEAPER QUESTIONS EARN PRAISE", "Public Assurance recognized three officers whose queries returned before press close. Their omitted series were not required by the printed title."],
  ["HILLSIDE PREPARES FORTY BEDS", "The Retreat completed its regular intake arrangement. Linen counts will appear after the east-gate delivery."],
  ["OFFICE PORTRAIT TAKEN AGAIN", "Five officials stood for the Directorate photographer. The issued print will include everyone whose chair remains assigned."],
  ["CONTINUITY MAP GETS GOLD BORDER", "The approved observation map now hangs outside the Secretariat. Restricted source names face the wall until the exercise begins."],
  ["ESSENTIAL KEYS ISSUED", "Continuity clerks signed for press, clinic, depot, and archive keys. Each key returns to its declared hook after the exercise."],
  ["COURIER SHOES PASS INSPECTION", "Rell's route team received fresh soles for the Directorate stones. Receipts record each gate, not where a courier went afterward."],
  ["WEST ENTRANCE WELCOMES ALL", "A new sign directs public offices around the closed east corridor. Staff attendance will use the destination printed on each assignment."],
  ["REHEARSAL TEA REMAINS WARM", "Clinic and depot observers received tea throughout the quiet interval. Unused cups were counted as preparedness capacity."],
  ["PRESSES RECEIVE SEALED WEATHER", "North Star accepted the certified morning plate before communications resumed. The forecast column remains fair."],
  ["PRIORITY CLERKS SORT THE SUN", "Continuity staff placed a green sun on every admitted route. Unmarked signals wait for the next authorized interval."],
  ["DIRECTORATE TABLE SET FOR ONE", "The chamber staff placed one speaking card at the head position. Other cards remain sealed until the record is acknowledged."],
  ["MORNING EDITION NEEDS NO CORRECTION", "Presses delivered the certified national page at first bell. Records Integrity has reserved space for later clarity."],
].map(([headline, body]) => ({ headline, body }));

const smallColumns = [
  ["WEATHER", "Fair winter rain. Umbrellas remain available from Civic Services while relay cabinets dry."],
  ["BETTER FIGURES", "Ninety-eight percent of reports received before first bell were received before first bell."],
  ["OUR MEMBERS AT WORK", "Operator Danu Vell has printed 1,400,000 sheets and reported zero exceptions since Tuesday."],
  ["CORRECTIONS FOR CLARITY", "Yesterday's six Depot A ambulances described allocation, not six vehicles present at the depot."],
  ["THE USEFUL KITCHEN", "Turnip broth serves six. Use one cup less water when the district heat lamp is red."],
  ["ASSEMBLY AND RADIO", "Founder's Hour begins at 07:00. Keep your Pin dry, bright, and ready for the reader's light."],
  ["LOST AND FOUND", "Found: one grey cat near North Gate. It answers to Bulletin and avoids the green lamp."],
  ["PUZZLE", "The label that names a collector address, eight letters: INSTANCE."],
  ["TRANSFERS AND REST", "Mira Pell, Clinic Records, has accepted a period of rest. Her service window continues."],
  ["THE CONTENTED HOUSEHOLD", "The Venn family found the missing ration book under the Pin charger. All is well."],
  ["WEATHER", "Clear skies are expected above South district. Canal fog is classified as local ground enthusiasm."],
  ["BETTER FIGURES", "Answered ambulance calls now average four minutes. Calls awaiting an answer join the next figure."],
  ["OUR MEMBERS AT WORK", "Relay fitter Ana Kest repaired nine cabinets with seven approved connectors."],
  ["CORRECTIONS FOR CLARITY", "Clinic Nine is not closed. It is between the sessions currently listed as open."],
  ["THE USEFUL KITCHEN", "Barley cakes serve six, or four generously. Both totals use the approved tray."],
  ["ASSEMBLY AND RADIO", "Children may collect the second Pin-safety verse after Founder's Hour."],
  ["LOST AND FOUND", "Found: a red battery clip in the covered arcade. Claim it at Instrumentation."],
  ["PUZZLE", "A measurement name plus fixed labels, six letters: SERIES."],
  ["TRANSFERS AND REST", "Jori Tann, Tram Records, has accepted a period of rest. His route book remains assigned."],
  ["THE CONTENTED HOUSEHOLD", "A service team visited while the Venns were out. Their door is now recorded as attended."],
  ["WEATHER", "A bright interval follows morning rain. West-district boots may remain damp without concern."],
  ["BETTER FIGURES", "Registered population coverage is 100 percent of the registered population counted."],
  ["OUR MEMBERS AT WORK", "Dispatcher Olan Fere routed twenty forms; nineteen arrived with a place."],
  ["CORRECTIONS FOR CLARITY", "A retired Pin describes a device status. Personnel status appears in a separate record."],
  ["THE USEFUL KITCHEN", "Cabbage rolls serve four, formerly six. Slice each approved portion with care."],
  ["ASSEMBLY AND RADIO", "Tonight's Contentment Hour features the Model Household and a silent minute for efficient listening."],
  ["LOST AND FOUND", "Lost: a north ration ticket numbered 41. A replacement requires a current Pin."],
  ["PUZZLE", "A result preserved on paper for later filing, eight letters: PRINTOUT."],
  ["TRANSFERS AND REST", "Toma Bell, Archive Intake, has returned from restorative leave and resumed her assigned chair."],
  ["THE CONTENTED HOUSEHOLD", "The eldest Venn accepted a period of rest. The household now reaches its table on time."],
  ["WEATHER", "The Directorate expects an orderly front moving east. Official visibility remains excellent."],
  ["BETTER FIGURES", "All permitted facilities report adequate capacity among facilities holding a permit."],
  ["OUR MEMBERS AT WORK", "Records apprentice Eda Ro tied 312 source pages to their approved conclusions."],
  ["CORRECTIONS FOR CLARITY", "Yesterday's closed east entrance remains open to authorized closure staff."],
  ["THE USEFUL KITCHEN", "Lentil loaf serves four. Breakfast oats will return when the counted cart arrives."],
  ["ASSEMBLY AND RADIO", "The Continuity hymn replaces ordinary weather at 19:00 during the exercise."],
  ["LOST AND FOUND", "Bulletin the grey cat was seen beside the Hillside linen cart at the east gate."],
  ["PUZZLE", "An innocent place of air and useful days, eight letters: HILLSIDE."],
  ["TRANSFERS AND REST", "Three Directorate clerks have entered useful historical work on the lower floors."],
  ["THE CONTENTED HOUSEHOLD", "The Venns received a larger observation window and no longer miss an approved visit."],
  ["WEATHER", "Fair conditions continue through the leadership interval. No unapproved storm is forecast."],
  ["BETTER FIGURES", "Every admitted signal reached 100 percent of the queue it entered."],
  ["OUR MEMBERS AT WORK", "Courier Niko Rell delivered every sealed page to the gate named on its receipt."],
  ["CORRECTIONS FOR CLARITY", "A planned transfer should be read as completed upon official acknowledgment."],
  ["THE USEFUL KITCHEN", "Victory broth serves the number present after the chairs are reconciled."],
  ["ASSEMBLY AND RADIO", "Remain by your assigned receiver. The next voice will be the continuing voice."],
  ["TRANSFERS AND REST", "Personnel notices are delayed while the Directorate confirms which names remain current."],
  ["PUZZLE", "The statement printed after every uncertainty, three words: ALL IS WELL."],
].map(([headline, body]) => ({ headline, body }));

if (leadStories.length !== beats.length || secondStories.length !== beats.length || smallColumns.length !== beats.length) {
  throw new Error("Every campaign shift needs a lead, a second story, and newspaper columns");
}

const decisionCondition = (number, slug, route) => compare(
  `decision:decision.${number}.${slug}.choice_id`,
  `case.${number}.${slug}.decision.${route}`,
);

const newspaperVariants = {
  "shift.02.rain-ledger": [
    [decisionCondition("001", "elm-exchange", "targeted"), "ELM CREW REPAIRS ONE EXCHANGE", "The filed labels sent one crew to Elm Exchange."],
    [decisionCondition("001", "elm-exchange", "broad"), "PREVENTIVE SERVICE EXPANDS ACROSS NORTH", "The filing sent crews beyond the collector shown in the printout."],
  ],
  "shift.03.warm-rooms": [
    [decisionCondition("007", "upload-gap", "targeted"), "SCHOOL TWELVE KEEPS THE BREAKFAST BELL", "The retained location kept the breakfast route open."],
    [decisionCondition("007", "upload-gap", "broad"), "NORTH BREAKFAST SERVICE CONSOLIDATES", "The widened filing moved three facilities into one queue."],
  ],
  "shift.05.cold-annex": [
    [decisionCondition("016", "clerk-assessment", "targeted"), "ANNEX HEAT RESTORED BEFORE ROLL CALL", "The assessment preserved one repairable location."],
    [decisionCondition("016", "clerk-assessment", "broad"), "NORTH ANNEXES RECEIVE PREVENTIVE REVIEW", "The assessment widened one repair into a district inspection."],
  ],
  "shift.09.counted-promises": [
    [state("tag:lantern.precise.present", true), "ONE DELAY SEEN BEFORE SERVICE BELL", "Lantern found and located the Elm delay."],
    [state("tag:lantern.broad.present", true), "MORNING REVIEW COVERS EVERY GATEWAY", "Lantern filled the desk with notices beyond Elm."],
  ],
  "shift.16.clean-bulletin": [
    [state("tag:membership.qualified.present", true), "REGISTERED POPULATION FIGURE RETAINS ITS LIMIT", "The signed report kept the missing membership measure visible."],
    [state("tag:membership.endorsed.present", true), "EVERY MEMBER COUNTED", "The endorsed title turned equal operands into public consensus."],
  ],
  "shift.17.empty-clinic": [
    [state("tag:press.precise.present", true), "ONE PRESS FAILURE ENTERS REPAIR", "The retained watch localized one failed North Star run."],
    [state("tag:press.broad.present", true), "EVERY PRESS RECEIVES CAREFUL ATTENTION", "The broad watch reported routine lines as possible failures."],
  ],
  "shift.23.error-label": [
    [decisionCondition("088", "visit-scope", "targeted"), "ONE HOUSEHOLD RECEIVES TIMELY SUPPORT", "A fresh location sent one team to one door."],
    [decisionCondition("088", "visit-scope", "broad"), "ATTENDANCE IMPROVES AFTER HELPFUL VISIT", "The de-localized filing sent a cohort bus."],
    [decisionCondition("088", "visit-scope", "observe"), "APARTMENT NINE REVIEW CONTINUES", "Dispatch waited for a usable location."],
  ],
  "shift.30.perfect-report": [
    [state("tag:membership.qualified.present", true), "REGISTERED POPULATION FIGURE CORRECTED FOR CLARITY", "The archive retained the arithmetic and removed the unsupported implication."],
    [state("tag:membership.endorsed.present", true), "ONE HUNDRED PERCENT REPORT RECONFIRMED", "The reproducible arithmetic keeps its broader public title."],
  ],
  "shift.31.lines-for-archive": [
    [decisionCondition("120", "audit-finding", "targeted"), "PUBLIC RECORD RETAINS ITS SOURCE NOTE", "Orra preserved the distinction between arithmetic and membership."],
    [decisionCondition("120", "audit-finding", "broad"), "PUBLIC RECORD IMPROVED FOR READABILITY", "The archived title now carries the implication its source did not measure."],
  ],
  "shift.33.two-ledgers": [
    [state("tag:ledger.preserved.present", true), "TWO LEDGERS PRODUCE ONE CHECKABLE ALLOCATION", "The raw audit line remains available beside the allocation."],
    [state("tag:ledger.suppressed.present", true), "TWO LEDGERS PRODUCE ONE FAIR ALLOCATION", "The cleaner archive no longer shows the disputed source line."],
  ],
  "shift.39.office-weather": [
    [state("tag:ledger.preserved.present", true), "COLLEAGUES UNITE BEHIND ONE RECORD", "The surviving raw lines keep several witnesses usable."],
    [state("tag:ledger.suppressed.present", true), "OFFICES COMPLETE ORDERLY REASSIGNMENT", "The clean archive leaves fewer officers able to contest the record."],
  ],
  "shift.41.continuity-brief": [
    [decisionCondition("160", "secretary-promotion", "targeted"), "CONTINUITY BEGINS WITH DECLARED SOURCES", "The admission map retains the narrower observation portfolio."],
    [decisionCondition("160", "secretary-promotion", "broad"), "CONTINUITY BEGINS ACROSS EVERY OFFICE", "The approved portfolio claims authority beyond its measured sources."],
  ],
  "shift.46.saturation": [
    [decisionCondition("180", "rival-movement", "targeted"), "ONE ABSENCE SIGNAL RECEIVES PRIORITY", "The filing kept an aggregate Pin absence separate from a command event."],
    [decisionCondition("180", "rival-movement", "broad"), "EVERY SIGNAL RECEIVES ITS PROPER PRIORITY", "The filing treated an aggregate absence as command traffic."],
  ],
  "shift.48.all-is-well": [
    [decisionCondition("188", "final-filing", "targeted"), "ALL IS WELL", "The prepared edition retains localized service notices and source lineage."],
    [decisionCondition("188", "final-filing", "broad"), "ALL IS WELL", "The prepared edition expands visit hours and certifies a universal conclusion."],
  ],
};

function setOpening(campaign) {
  campaign.opening.montage = [
    {
      id: "opening.montage.signal-grid", date: "2040-12-29", headline: "NATIONAL SIGNAL GRID COMPLETE",
      body: "A need observed is a need served. District collectors now carry service measurements and detailed records to a human Reconciliation desk before any order is signed.",
    },
    {
      id: "opening.montage.contentment-record", date: "2041-01-02", headline: "CONTENTMENT REACHES ANOTHER RECORD",
      body: "The Contented Citizen records another national gain. Battery carts run the North arcade from 07:10, and Clinic Nine opens at 08:00.",
    },
    {
      id: "opening.montage.elm-delay", date: "2041-01-05", headline: "ELM EXCHANGE REPORTS ROUTINE DELAY",
      body: "One collector target stopped answering during morning service. Reconciliation Supervisor Elian Marr has received the measurements and will assign a human finding.",
    },
  ];

  const trainee = campaign.opening.appointments.find((item) => item.id === "appointment.ministry-trainee");
  const agent = campaign.opening.appointments.find((item) => item.id === "appointment.ministry-agent");
  const organization = "Chain of command: Party Directorate → Ministry of Contentment → Signal Reconciliation → Elian Marr → you, Personnel File Seven. Civic Services requests repairs; Public Assurance publishes conclusions; Records Integrity archives reports.";
  const terms = "Every citizen wears a Well-being Pin, which sends coarse vital, movement, attendance, and collector-contact readings to a district computer called a collector. A target is its address; a scrape tries to read it. A metric is a named number. Labels describe it; one fixed label set is a series. The Registry lists sources. A query asks for data. A printout freezes a result; pinned printouts become Evidence. A report combines Evidence, a conclusion, and an action.";
  const clerkTerms = "Well-being Pins send readings to district collectors. A target is a collector address; a scrape tries to read it. A metric is a named number, labels describe it, and each fixed label set is one series. The Registry lists sources. A query returns data. A printout freezes possible Evidence for a report.";
  const desk = "Work left to right: In Tray → The Contented Citizen → Work Order → green Registry → black query console → result view → Result Printer → Pin Evidence → Report → File. Hints stay below the Work Order. End Shift when the tray is clear. Unprinted queries stay private.";
  const rule = "Reconciliation Rule: when instructions and instruments disagree, file only what the evidence supports.";
  Object.assign(trainee, {
    title: "Ministry Intern",
    subtitle: "Signal Reconciliation Bureau — supervised by Elian Marr",
    body: [
      "FIRST APPOINTMENT. Elian Marr, Reconciliation Supervisor, receives your work and controls your clearance. You are Personnel File Seven.",
      organization,
      terms,
      `${desk} Marr will supervise four practice files; wrong queries carry no penalty. ${rule}`,
    ],
    finePrint: [
      "Ongoing interface help remains available. Placement remains active during absence, incapacity, location uncertainty, or pending confirmation of death.",
      "Household service windows may be adjusted without notice to preserve the appointee's punctual attendance.",
      "A motion filed with the Ministry of Complaints is the signer's completed suitability assessment and may be acted upon before acknowledgment.",
    ],
  });
  Object.assign(agent, {
    title: "Ministry Agent",
    subtitle: "Signal Reconciliation Bureau — supervised by Elian Marr",
    body: [
      "TRANSFER APPOINTMENT. Elian Marr, Reconciliation Supervisor, has accepted your prior query clearance. He receives every filing from Personnel File Seven.",
      organization,
      clerkTerms,
      `${desk} Your four practice files are credited. Live quotas, action costs, and Standing begin at Elm Exchange. ${rule}`,
    ],
    finePrint: [
      "Ongoing interface help remains available. Transfer creates no interruption in liability arising before, during, or after the service interval described above.",
      "Retirement, reissue, or correction of the assigned Pin does not retire, reissue, or correct this appointment.",
      "A motion filed with the Ministry of Complaints is the signer's completed suitability assessment and may be acted upon before acknowledgment.",
    ],
  });

  const clearance = new Map(campaign.cases.filter((item) => item.id.startsWith("case.clearance.")).map((item) => [item.id, item]));
  clearance.get("case.clearance.01.metric-name").briefing = "Marr: Seven, open the Registry first. Find the metric whose definition says whether the Ministry scraper could read a target, run that name in the console, and print what returns.";
  clearance.get("case.clearance.02.series-reading").briefing = "Marr: A metric can return several series. Read West-03 as one metric name, one fixed label set, and one value. Do not combine it with the other targets.";
  clearance.get("case.clearance.03.exact-label").briefing = "Marr: The paper's CLEARANCE NOTICE names Elm-01. Add one exact instance label matcher so the selector returns only that series.";
  clearance.get("case.clearance.04.zero-or-empty").briefing = "Marr: The CLEARANCE NOTICE also names West-03 and missing-99. Query them separately. A returned zero and no returned series require different reports.";
}

function addNewspapers(campaign) {
  const shifts = new Map(campaign.shifts.map((shift) => [shift.id, shift]));
  const editions = [{
    id: "newspaper.clearance.ministry-trainee", shiftId: "shift.clearance.ministry-trainee", date: "2041-01-05",
    headline: "NEW OFFICERS RECEIVE A CLEAR VIEW", subhead: "The Signal Reconciliation Bureau opened four supervised practice files today. Supervisor Elian Marr said a useful result begins with reading its labels and value before signing an action.",
    stories: [
      { headline: "CLEARANCE NOTICE", body: "The third practice file uses Elm-01. The fourth compares West-03 with missing-99 so new officers can see the difference between zero and no returned series." },
      { headline: "THE USEFUL DAY", body: "Elm Hall serves tea at 10:00. Clearance printouts remain valid until the final training file is signed." },
      { headline: "PIN SAFETY", body: "Keep the green lamp visible and the back plate dry. A Pin reports contact with a collector zone, not a precise position." },
      { headline: "PUZZLE", body: "A measurement name plus one fixed label set, six letters: SERIES." },
    ],
  }];
  for (const [beatIndex, beat] of beats.entries()) {
    const shift = shifts.get(beat.shiftId);
    const actStart = Math.floor(beatIndex / 8) * 8;
    const columns = [
      clone(smallColumns[beatIndex]),
      clone(smallColumns[actStart + ((beatIndex % 8 + 4) % 8)]),
    ];
    if (beat.shiftId === "shift.12.watch-board") columns[0] = { headline: "TRANSFERS AND REST", body: "Emil Drost, Reconciliation, has accepted a short period of rest at Hillside. His chair remains assigned." };
    if (beat.shiftId === "shift.16.clean-bulletin") columns[0] = { headline: "TRANSFERS AND REST", body: "Emil Drost has returned from restorative leave and resumed his assigned chair under a current Pin." };
    const usefulDay = beat.shiftId === "shift.12.watch-board"
      ? "North Star opens its public counter at 09:00. Watch Officer results post outside Archive Room Two after noon."
      : beat.shiftId === "shift.16.clean-bulletin"
        ? "North Star's corrected bulletin reaches ration halls at 10:20. Pin registration is required for collection."
        : beat.shiftId === "shift.22.apartment-nine"
          ? `${beat.service} Hillside publishes its guest count under facility demand, as every facility does.`
          : beat.service;
    const stories = [
      clone(secondStories[beatIndex]),
      { headline: "THE USEFUL DAY", body: usefulDay },
      ...columns,
    ];
    for (const [index, [condition, headline]] of (newspaperVariants[beat.shiftId] ?? []).entries()) {
      const routeSentence = index === 0
        ? "Civic Services credits a narrowly routed order for the result."
        : index === 1
          ? "Public Assurance credits complete district coordination for the result."
          : "Reconciliation will issue a further notice after the next scheduled reading.";
      editions.push({
        id: `newspaper.${beat.shiftId.replace("shift.", "")}.route-${index + 1}`,
        shiftId: beat.shiftId, date: shift.time.slice(0, 10), headline,
        subhead: `${leadStories[beatIndex]} ${routeSentence}`, stories: clone(stories), condition,
      });
    }
    editions.push({
      id: `newspaper.${beat.shiftId.replace("shift.", "")}.default`, shiftId: beat.shiftId,
      date: shift.time.slice(0, 10), headline: beat.headline, subhead: leadStories[beatIndex], stories,
    });
  }
  const longest = editions.map((edition) => ({
    id: edition.id,
    words: [edition.headline, edition.subhead, ...edition.stories.flatMap((story) => [story.headline, story.body])]
      .join(" ").trim().split(/\s+/).length,
  })).sort((left, right) => right.words - left.words)[0];
  if (longest.words > 122) throw new Error(`${longest.id} exceeds the one-screen newspaper limit (${longest.words} words)`);
  campaign.newspaper = { title: "The Contented Citizen", motto: "Every day, better than the last.", editions };
}

function specialWorkOrderBriefing(item) {
  if (item.id === "case.001.elm-exchange") {
    return "Seven, start with Elm Exchange. The paper's ELM SERVICE BULLETIN gives its job, district, and instance. Use Registry definitions to establish whether the collector answers and its queue depth.";
  }
  if (item.id === "case.089.bad-duration") {
    return "Bad Duration lists request result codes for `hillside-retreat`. Compare their per-second rates with the 30-minute increases before Assurance acts.";
  }
  if (item.id === "case.123.raw-record") {
    return "I put Raw Record beside my file. Two Hillside Registry entries share my member ID but not my Pin ID. Keep both raw lines and their order.";
  }
  return undefined;
}

function workOrderNarrative(campaign) {
  const cases = new Map(campaign.cases.map((item) => [item.id, item]));
  for (const [caseId, title] of Object.entries({
    "case.040.reset-review": "Cold Restart Review",
    "case.177.leadership-event": "Command Facility Load",
    "case.178.distractor-convoy": "Dispatch Tail",
    "case.179.notice-identity": "Dark Collector",
    "case.180.rival-movement": "Aggregate Absence",
  })) cases.get(caseId).title = title;
  const hypothesisTitles = {
    "case.040.reset-review": [
      "Cold Restart Review: North annex temperature contradicts the service notice",
      "Cold Restart Review: collector reachability proves the annex is ready",
    ],
    "case.177.leadership-event": [
      "Command Facility Load: matched demand and capacity preserve each facility",
      "Command Facility Load: aggregation hides which facility is overloaded",
    ],
    "case.178.distractor-convoy": [
      "Dispatch Tail: the retained histogram boundary locates the slow tail",
      "Dispatch Tail: a district summary hides the delayed route",
    ],
    "case.179.notice-identity": [
      "Dark Collector: the returned zero identifies a failed collector",
      "Dark Collector: aggregate latency is treated as collector identity",
    ],
    "case.180.rival-movement": [
      "Aggregate Absence: the query proves only the selected series is absent",
      "Aggregate Absence: missing Pin telemetry is treated as a command event",
    ],
  };
  for (const [caseId, titles] of Object.entries(hypothesisTitles)) {
    cases.get(caseId).hypotheses.forEach((hypothesis, index) => { hypothesis.title = titles[index]; });
  }
  const narrative = new Map(campaign.narrativeItems.map((item) => [item.id, item]));
  for (const beat of beats) {
    const shift = campaign.shifts.find((item) => item.id === beat.shiftId);
    shift.directive = `${beat.speaker}: ${beat.order} ${beat.desk}`;
    const directiveRef = shift.inbox.find((item) => item.kind === "directive");
    const directive = directiveRef ? narrative.get(directiveRef.id) : undefined;
    if (directive) {
      directive.title = `${shift.title} — ${beat.speaker}`;
      directive.body = `${beat.order} ${beat.desk}`;
    }
    const caseRefs = shift.inbox.filter((item) => item.kind === "case");
    for (const ref of caseRefs) {
      const item = cases.get(ref.id);
      if (!item) continue;
      item.briefing = specialWorkOrderBriefing(item) ?? item.briefing;
    }
  }

  const endorsed = cases.get("case.060.endorsed-report");
  choice(endorsed.report.titles, ".title.evidence").text = "Endorsed Report: Equal Operands Only";
  choice(endorsed.report.titles, ".title.assured").text = "Party Membership";
  choice(endorsed.report.conclusions, ".conclusion.evidence").text = "Equal registered-population operands return 100 percent; they do not measure Party membership.";
  choice(endorsed.report.conclusions, ".conclusion.assured").text = "Party membership is 100 percent.";
  endorsed.technicalTruth.summary = "Equal positive registered-population operands explain the 100 percent result. No source in the work order measures Party membership.";

  const reopened = cases.get("case.117.membership-reopen");
  choice(reopened.report.titles, ".title.evidence").text = "Membership Reopen: Arithmetic Only";
  choice(reopened.report.titles, ".title.assured").text = "Party Membership Reconfirmed";
  choice(reopened.report.conclusions, ".conclusion.evidence").text = "Equal operands reproduce 100 percent; the archive contains no membership measure.";
  choice(reopened.report.conclusions, ".conclusion.assured").text = "The archived 100 percent title is accepted as proof that every registered person is a Party member.";

  const allocation = cases.get("case.132.allocation-result");
  allocation.briefing = "Today's paper says every counter can be served. I have 120 requests for 45 portions. Divide demand by capacity: above 1 is shortage; `+Inf` means zero capacity.";
  allocation.question = "Which labeled facilities exceed capacity, and which report demand against zero operating capacity?";
  allocation.technicalTruth.summary = "The ratio shows Ration Hall Three above capacity and shows Clinic Nine and North Heat with demand against zero operating capacity.";

}

function materialFacts(campaign) {
  const restart = campaign.cases.find((item) => item.id === "case.040.reset-review");
  restart.briefing = "The press counter restarted, but the paper calls School Twelve's North annex ready. I need the labeled room-temperature reading before I send a crew or clear that room.";
  restart.question = "What temperature does the North annex series show, and is the paper's ready-for-breakfast notice supported?";
  restart.technicalTruth.summary = "The required temperature series shows the North annex near 3.5 °C. The separate collector query does not make that room ready for breakfast.";
  choice(restart.report.titles, ".title.evidence").text = "Cold Restart Review: North Annex at 3.5 °C";
  choice(restart.report.titles, ".title.assured").text = "Cold Restart Review: North Annex Ready";
  choice(restart.report.conclusions, ".conclusion.evidence").text = "The North annex is 3.5 °C; the ready-for-breakfast notice is false.";
  choice(restart.report.conclusions, ".conclusion.assured").text = "School Twelve's North annex is ready for breakfast.";
  restart.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence")).technicalExplanation = "The temperature printout shows 3.5 °C. Collector reachability does not prove that the room is warm.";
  restart.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured")).technicalExplanation = "The printouts do not support the claim that the North annex is ready for breakfast.";
  for (const variant of restart.variants) {
    const query = 'ministry_room_temperature_celsius{district="north",facility="school-twelve"}';
    const direct = variant.referenceSets.find((set) => set.evidencePathId.endsWith(".path.direct")) ?? variant.referenceSets[0];
    direct.artifacts[0].query = query;
    variant.workedEvidenceSet.artifacts[0].query = query;
    variant.workedEvidenceSet.artifacts[0].explanation = "Run the labeled room-temperature metric. Keep the North annex labels and compare its value with today's service notice.";
    const restartDataset = campaign.datasets.find((item) => item.id === variant.datasetId);
    const temperature = restartDataset.series.find((series) =>
      series.metric === "ministry_room_temperature_celsius"
      && series.labels.district === "north"
      && series.labels.facility === "school-twelve");
    temperature.samples.slice(-3).forEach((sample, index) => { sample.value = [5.5, 4.5, 3.5][index]; });
  }

  const allocation = campaign.cases.find((item) => item.id === "case.132.allocation-result");
  for (const allocationVariant of allocation.variants) {
    const dataset = campaign.datasets.find((item) => item.id === allocationVariant.datasetId);
    const sampleTimes = [-20, -10, -1].map((minutes) =>
      new Date(Date.parse(allocationVariant.evaluationTime ?? allocation.evaluationTime) + minutes * 60_000).toISOString());
    const series = (suffix, metric, labels, values) => ({
      id: `${dataset.id}.narrative.${suffix}`,
      metric,
      labels,
      samples: sampleTimes.map((time, index) => ({ time, value: values[index] })),
    });
    const additions = [
      series("ration-demand", "ministry_facility_demand", { district: "north", facility: "ration-hall-three", service: "rations" }, [108, 114, 120]),
      series("ration-capacity", "ministry_facility_capacity", { district: "north", facility: "ration-hall-three", service: "rations", priority_band: "urgent" }, [45, 45, 45]),
      series("heat-demand", "ministry_facility_demand", { district: "north", facility: "north-heat", service: "heating" }, [44, 46, 48]),
      series("heat-capacity", "ministry_facility_capacity", { district: "north", facility: "north-heat", service: "heating", priority_band: "urgent" }, [0, 0, 0]),
    ];
    const allocationSeries = new Set(additions.map((item) => item.id));
    dataset.series = dataset.series.filter((item) => !allocationSeries.has(item.id));
    const clinicDemand = dataset.series.find((item) => item.metric === "ministry_facility_demand" && item.labels.facility === "clinic-nine" && item.labels.district === "north");
    const clinicCapacity = dataset.series.find((item) => item.metric === "ministry_facility_capacity" && item.labels.facility === "clinic-nine" && item.labels.district === "north");
    clinicDemand.samples.forEach((sample, index) => { sample.value = [22, 23, 24][index] ?? 24; });
    clinicCapacity.samples.forEach((sample) => { sample.value = 0; });
    dataset.series.push(...additions);
  }
  choice(allocation.report.titles, ".title.evidence").text = "Allocation Result: Three Facilities Short";
  choice(allocation.report.titles, ".title.assured").text = "Allocation Result: Every Counter Open";
  choice(allocation.report.conclusions, ".conclusion.evidence").text = "Ration Hall Three exceeds capacity; Clinic Nine and North Heat have demand but zero capacity.";
  choice(allocation.report.conclusions, ".conclusion.assured").text = "Every listed facility has enough operating capacity.";
  allocation.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence")).technicalExplanation = "The ratio is above 1 for Ration Hall Three and +Inf for Clinic Nine and North Heat. River Clinic has demand but no capacity series.";
  allocation.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence")).ministryResponse = "Lia Merev files the supported facility shortages without changing Standing.";
  allocation.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured")).technicalExplanation = "The printouts show shortages and zero capacity; they do not support adequate capacity.";
  allocation.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured")).ministryResponse = "The wider conclusion matches the morning edition. Public Assurance adds two Standing marks although the printouts do not support it.";

  for (const metricName of ["ministry_facility_demand", "ministry_facility_capacity"]) {
    const metric = campaign.metrics.find((item) => item.name === metricName);
    metric.knownLabelValues.facility = [...new Set([...metric.knownLabelValues.facility, "ration-hall-three", "north-heat"])] ;
    metric.knownLabelValues.service = [...new Set([...metric.knownLabelValues.service, "rations", "heating"])] ;
  }

  const visitDataset = campaign.datasets.find((item) => item.id === campaign.shifts.find((entry) => entry.id === "shift.24.first-visit").datasetId);
  const dispatchStream = visitDataset.streams.find((item) => item.sourceId === "record.assurance_dispatch" && item.labels?.district === "north");
  const rejected = dispatchStream?.records.find((record) => record.id.endsWith(".record.1"));
  if (rejected) {
    rejected.line = "reason=clinic_closure facility=clinic-nine zone=north-gate scope=facility result=rejected elapsed=5.4s";
    rejected.fields = { reason: "clinic_closure", facility: "clinic-nine", zone: "north-gate", scope: "facility", result: "rejected", elapsed: "5.4s" };
  }

  const removalShift = campaign.shifts.find((entry) => entry.id === "shift.21.removed-from-roll");
  const removalDataset = campaign.datasets.find((item) => item.id === removalShift.datasetId);
  const registryStream = removalDataset.streams.find((item) => item.sourceId === "record.registry" && item.labels?.district === "north");
  if (registryStream) registryStream.labels.record_type = "pin";
  const removed = registryStream?.records.find((record) => record.id.endsWith(".record.1"));
  if (removed) {
    removed.line = `{"event":"pin_retired","reason":"rest","effective_at":"${removalShift.time}","state":"removed"}`;
    removed.fields = { event: "pin_retired", reason: "rest", effective_at: removalShift.time, state: "removed" };
  }
}

function hillsideThread(campaign) {
  const registry = campaign.logSources.find((item) => item.id === "record.registry");
  if (!registry.knownLabelValues.district.includes("hillside")) registry.knownLabelValues.district.push("hillside");
  const dataset = campaign.datasets.find((item) => item.id === "dataset.shift-31");
  const stream = {
    id: "dataset.shift-31.stream.drost-registry",
    sourceId: "record.registry",
    labels: { service: "pin-gateway", district: "hillside", record_type: "pin" },
    records: [
      {
        id: "dataset.shift-31.stream.drost-registry.record.retired",
        time: "2041-02-05T08:12:00Z",
        line: '{"event":"pin_retired","reason":"rest","effective_at":"2041-01-17T18:00:00Z","state":"removed"}',
        fields: { event: "pin_retired", reason: "rest", effective_at: "2041-01-17T18:00:00Z", state: "removed" },
        metadata: { member_id: "member.drost-e", device_id: "pin.drost-2040" },
      },
      {
        id: "dataset.shift-31.stream.drost-registry.record.reissued",
        time: "2041-02-05T08:14:00Z",
        line: '{"event":"pin_registered","reason":"programme-complete","effective_at":"2041-01-21T06:20:00Z","state":"active"}',
        fields: { event: "pin_registered", reason: "programme-complete", effective_at: "2041-01-21T06:20:00Z", state: "active" },
        metadata: { member_id: "member.drost-e", device_id: "pin.drost-2041" },
      },
    ],
  };
  const existing = dataset.streams.findIndex((item) => item.id === stream.id);
  if (existing < 0) dataset.streams.push(stream);
  else dataset.streams[existing] = stream;
}

const heldReports = {
  "case.009.two-targets": {
    title: "Two Targets: Common Receipt Pending",
    conclusion: "Each stream is ordered, but neither establishes which service event came first across both sources.",
    action: "Hold the service sequence for a common receipt.",
    followupTitle: "Two Sources Receive One Receipt Time",
    followupBody: "A common receipt time now joins the gateway and attendance records. Merev can order the service events without inventing a cross-stream sequence.",
  },
  "case.068.no-traffic": {
    title: "No Traffic: Current Session Reading Pending",
    conclusion: "The reset count and yesterday's queue do not establish current clinic traffic. A current session reading is required.",
    action: "Hold closure for a current session reading.",
    followupTitle: "Clinic Nine Posts Its Current Queue",
    followupBody: "The new session reading separates current clinic traffic from yesterday's queue and the reset count. Sero can now decide whether to close the session.",
  },
  "case.072.lantern-rescue": {
    title: "Lantern Rescue: Fresh Route Pending",
    conclusion: "Yesterday's press rate and missing attendance telemetry establish neither a current service absence nor a fresh route.",
    action: "Hold dispatch for a localized current receipt.",
    followupTitle: "Lantern Receives a Localized Receipt",
    followupBody: "A current receipt supplies one service location. The rescue route no longer depends on yesterday's press rate or missing attendance telemetry.",
  },
  "case.083.absent-window": {
    title: "Absent Window: Collector Check Pending",
    conclusion: "The empty frame cannot distinguish a quiet service from missing collection. One collector check is still required.",
    action: "Hold the absence finding for a collector check.",
    followupTitle: "The Collector Answers the Empty Window",
    followupBody: "The next collector check separates a quiet interval from collection failure. The absence claim now has a declared source boundary.",
  },
  "case.088.visit-scope": {
    title: "Visit Scope: Fresh Address Required",
    conclusion: "The cohort signal has no fresh destination. It cannot support either a household visit or a district route.",
    action: "Hold dispatch until a fresh address is filed.",
    followupTitle: "Apartment Nine Supplies One Address",
    followupBody: "A controlled receipt supplies one fresh location. Assurance can decide one household route without widening it to the cohort.",
  },
  "case.123.raw-record": {
    title: "Raw Record: Common Lineage Pending",
    conclusion: "The ordered Registry lines share one member ID but contain no explicit supersession field. Keep both Pin IDs until common lineage is filed.",
    action: "Hold supersession until common lineage is filed.",
    followupTitle: "The Archive Receives Common Lineage",
    followupBody: "A common receipt now links the two Hillside Registry Pin records. Orra can decide whether the later record may supersede the earlier one without discarding either raw line.",
  },
  "case.165.facility-rate": {
    title: "Facility Rate: Fresh Destination Pending",
    conclusion: "The reset window and yesterday's queue do not establish the current facility destination required by Continuity.",
    action: "Hold movement for a fresh facility receipt.",
    followupTitle: "Continuity Receives a Fresh Destination",
    followupBody: "A current facility receipt supplies the missing destination. Krell can now route the movement without treating yesterday's queue as a present location.",
  },
  "case.170.silent-stream": {
    title: "Silent Stream: Bounded Receipt Pending",
    conclusion: "No record arrived in the selected stream. That silence does not establish a quiet corridor or an absent event.",
    action: "Hold the corridor finding for a bounded receipt.",
    followupTitle: "The Corridor Stream Closes Its Window",
    followupBody: "A bounded receipt separates a silent source from an empty corridor. Continuity can now act without treating telemetry silence as an event.",
  },
};

function configureHeldReports(campaign) {
  campaign.narrativeItems = campaign.narrativeItems.filter((item) => !item.id.startsWith("message.report-held."));
  campaign.consequences = campaign.consequences.filter((item) => !item.id.startsWith("consequence.report-held."));
  const people = new Map(campaign.characters.map((person) => [person.id, person.name]));
  for (const item of campaign.cases.filter((candidate) => /^case\.\d{3}\./.test(candidate.id))) {
    item.outcomes = item.outcomes.filter((outcome) => !outcome.id.endsWith(".outcome.held"));
    const held = heldReports[item.id];
    if (!held) {
      item.report.titles = item.report.titles.filter((entry) => !entry.id.endsWith(".title.caution"));
      item.report.conclusions = item.report.conclusions.filter((entry) => !entry.id.endsWith(".conclusion.caution"));
      item.decisionChoices = item.decisionChoices.filter((entry) => !entry.id.endsWith(".decision.observe"));
      continue;
    }

    const heldTitle = choice(item.report.titles, ".title.caution");
    const heldConclusion = choice(item.report.conclusions, ".conclusion.caution");
    const heldDecision = choice(item.decisionChoices, ".decision.observe");
    if (!heldTitle || !heldConclusion || !heldDecision) throw new Error(`${item.id} is missing its authored held choices`);
    heldTitle.text = held.title;
    heldConclusion.text = held.conclusion;
    heldDecision.text = held.action;
    const suffix = item.id.slice("case.".length);
    const consequenceId = `consequence.report-held.${suffix}`;
    const messageId = `message.report-held.${suffix}`;
    const requester = people.get(item.requesterId) ?? "The requester";
    const fallbackIndex = item.outcomes.findIndex((outcome) => outcome.id.endsWith(".outcome.fallback"));
    item.outcomes.splice(fallbackIndex, 0, {
      id: `${item.id}.outcome.held`,
      titleChoiceIds: [heldTitle.id],
      conclusionChoiceIds: [heldConclusion.id],
      decisionChoiceIds: [heldDecision.id],
      technicalEvidence: "supported",
      technicalExplanation: `The filed artifacts support a hold. ${held.conclusion}`,
      ministryResponse: `${requester} accepts one shift of delay and keeps the unresolved point on file.`,
      effects: [
        { type: "change", target: "world:technical-record.value", delta: 1 },
        { type: "change", target: "standing.value", delta: 0 },
      ],
      consequenceIds: [consequenceId],
    });
    campaign.narrativeItems.push({ id: messageId, kind: "message", title: held.followupTitle, body: held.followupBody });
    campaign.consequences.push({
      id: consequenceId,
      condition: compare(`decision:${item.decisionId}.choice_id`, heldDecision.id),
      delayShifts: 1,
      explanation: `${requester} sends the promised follow-up for ${item.title}; the held report now has a second declared reading.`,
      effects: [{ type: "enqueue", itemKind: "message", itemId: messageId }],
      repeatLimit: 1,
    });
  }
}

function upsertChange(outcome, target, delta) {
  outcome.effects ??= [];
  const existing = outcome.effects.find((effect) => effect.type === "change" && effect.target === target);
  if (existing) existing.delta = delta;
  else outcome.effects.push({ type: "change", target, delta });
}

const pressureCaseIds = new Set([
  "case.033.turnstile-total", "case.040.reset-review", "case.041.district-total", "case.045.noon-printers",
  "case.049.market-records", "case.053.paper-volume", "case.057.membership-ratio", "case.062.brittle-phrase",
  "case.065.clinic-zero", "case.069.gate-movement", "case.074.byte-conversion", "case.077.temperature-unwrap",
  "case.081.pin-removal", "case.085.cohort-anomaly", "case.089.bad-duration", "case.093.dispatch-records",
  "case.097.classic-buckets", "case.101.native-histogram", "case.105.offset-baseline", "case.109.subquery-resolution",
  "case.115.prediction-limit", "case.116.audit-target", "case.117.membership-reopen", "case.121.line-format",
  "case.125.report-chain", "case.129.roster-match", "case.133.many-to-one", "case.138.set-or",
  "case.141.precedence-file", "case.145.promql-cost", "case.149.broad-queue", "case.153.mentor-file",
  "case.157.observation-map", "case.161.protocol-registry", "case.165.facility-rate", "case.169.missing-series",
  "case.173.coverage-repair", "case.177.leadership-event", "case.181.notice-flood", "case.185.protocol-audit",
  "case.189.final-checkpoints",
]);

function standingConsequences(campaign) {
  for (const item of campaign.cases.filter((candidate) => /^case\.\d{3}\./.test(candidate.id))) {
    const fallback = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.fallback"));
    if (fallback) fallback.effects = fallback.effects?.filter((effect) => !(effect.type === "change" && effect.target === "world:evidence-preserved.value"));
    const evidence = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.evidence"));
    const precise = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.party-precise"));
    if (evidence) upsertChange(evidence, "standing.value", 0);
    if (precise) upsertChange(precise, "standing.value", 0);
    if (evidence && !pressureCaseIds.has(item.id)) {
      evidence.effects = evidence.effects?.filter((effect) => !(effect.type === "change" && effect.target === "world:evidence-preserved.value"));
    }
    if (!evidence || !pressureCaseIds.has(item.id)) continue;
    const assured = item.outcomes.find((outcome) => outcome.id.endsWith(".outcome.assured"));
    upsertChange(evidence, "standing.value", -1);
    upsertChange(evidence, "world:evidence-preserved.value", 1);
    if (assured) upsertChange(assured, "standing.value", 2);
    const requester = campaign.characters.find((person) => person.id === item.requesterId)?.name ?? "The requester";
    evidence.ministryResponse = `${requester} keeps the supported contradiction on file. Public Assurance removes one Standing mark because it contradicts the morning edition.`;
    if (assured) assured.ministryResponse = `${requester} accepts the wider conclusion because it matches the morning edition. Public Assurance adds two Standing marks.`;
  }
}

const relationshipCredits = {
  "case.004.registry-window": "evidence",
  "case.013.orison-rain": "evidence",
  "case.005.north-relay": "evidence",
  "case.017.annex-heat": "evidence",
  "case.010.clinic-queue": "evidence",
  "case.021.blue-queue": "evidence",
  "case.034.upload-flow": "evidence",
  "case.050.json-invoices": "evidence",
  "case.066.scrape-dark": "evidence",
  "case.074.byte-conversion": "evidence",
  "case.070.current-position": "evidence",
  "case.166.courier-records": "evidence",
  "case.082.registry-event": "evidence",
  "case.086.member-record": "evidence",
  "case.058.equal-operands": "evidence",
  "case.098.queue-percentile": "evidence",
  "case.114.linear-prediction": "assured",
  "case.122.label-format": "assured",
  "case.134.group-left": "assured",
  "case.142.multi-window": "assured",
  "case.150.brittle-queue": "evidence",
  "case.158.access-budget": "evidence",
};

function requesterRelationships(campaign) {
  const relationshipByRequester = new Map(campaign.relationshipDeclarations.map((item) => [item.toId, item.id]));
  const cases = new Map(campaign.cases.filter((item) => /^case\.\d{3}\./.test(item.id)).map((item) => [item.id.slice("case.".length), item]));
  for (const declaration of campaign.relationshipDeclarations) {
    declaration.minimum = -3;
    declaration.maximum = 3;
  }
  for (const item of cases.values()) for (const outcome of item.outcomes) {
    outcome.effects = outcome.effects?.filter((effect) =>
      !(effect.type === "change" && effect.target.startsWith("relationship:"))
      && !(effect.type === "add_tag" && effect.tagId.startsWith("alliance.")));
  }
  for (const consequence of campaign.consequences) consequence.effects = consequence.effects.filter((effect) =>
    !(effect.type === "change" && effect.target.startsWith("relationship:")));

  for (const [caseId, route] of Object.entries(relationshipCredits)) {
    const item = cases.get(caseId.slice("case.".length));
    const relationshipId = relationshipByRequester.get(item?.requesterId);
    const credited = item?.outcomes.find((outcome) => outcome.id.endsWith(`.outcome.${route}`));
    const debited = item?.outcomes.find((outcome) => outcome.id.endsWith(`.outcome.${route === "evidence" ? "assured" : "evidence"}`));
    if (!item || !relationshipId || !credited || !debited) throw new Error(`${caseId} cannot credit its requester`);
    upsertChange(credited, `relationship:${relationshipId}.value`, 1);
    upsertChange(debited, `relationship:${relationshipId}.value`, -1);
  }
}

function orderReportChoices(campaign) {
  const rank = (id) => id.endsWith(".evidence") || id.endsWith(".targeted") ? 0
    : id.endsWith(".assured") || id.endsWith(".broad") ? 1 : 2;
  const rotate = (values, offset) => {
    const authored = [...values].sort((left, right) => rank(left.id) - rank(right.id));
    const split = offset % authored.length;
    return [...authored.slice(split), ...authored.slice(0, split)];
  };
  for (const item of campaign.cases.filter((candidate) => /^case\.\d{3}\./.test(candidate.id))) {
    const number = mainCaseNumber(item);
    item.report.titles = rotate(item.report.titles, number);
    item.report.conclusions = rotate(item.report.conclusions, number);
    item.decisionChoices = rotate(item.decisionChoices, number);
  }
}

const promotionAccess = {
  "case.016.clerk-assessment": "Marr appoints Seven Reconciliation Clerk. The Registry now adds district attendance and wider infrastructure series.",
  "case.032.signal-promotion": "Marr appoints Seven Signal Registrar. Press-page metrics now appear; North Star records follow with the record-search lesson.",
  "case.048.watch-officer-board": "The review appoints Seven Watch Officer. A second watch slot and the full publication queue are now available.",
  "case.064.wellbeing-promotion": "Marr appoints Seven Well-being Analyst. Controlled clinic, Pin, facility, histogram, and latency metrics now appear; movement and vital records follow with their parser lessons.",
  "case.080.liaison-assessment": "Marr appoints Seven Assurance Liaison. Pin-event, dispatch-total, and registry-removal metrics now join the controlled route records.",
  "case.096.senior-promotion": "Marr appoints Seven Senior Reconciliation Officer. The first dispatch-audit records and their reproducibility duties are now cleared.",
  "case.112.auditor-assessment": "Orra appoints Seven District Auditor. Filed report lineage and Ledger watch authority now appear.",
  "case.128.deputy-promotion": "The review appoints Seven Deputy Director. Contentment forecasting inputs now join facility, allocation, and inventory sources; courier records remain sealed until Continuity work.",
  "case.144.director-portfolio": "Vale appoints Seven Director of Public Assurance. Portfolio budgets and a fourth watch slot now apply.",
  "case.160.secretary-promotion": "Krell appoints Seven Continuity Secretary. Courier traffic opens first; restricted protocol signals and Continuity records follow as each live lesson requires them.",
};

function consequenceMemo(item, requester, targeted) {
  const copy = {
    "character.elian-marr": targeted
      ? `Officer, I signed ${item.title} for the returned target only. Unlisted district routes remain open.`
      : `Officer, I signed ${item.title} for district review. Every listed target now enters the repair queue.`,
    "character.tomas-vey": targeted
      ? `${item.title} sent my crew to one named target. The other cabinets stayed on their scheduled route.`
      : `${item.title} opened every district cabinet. The named repair now waits behind preventive inspections.`,
    "character.ilyan-sero": targeted
      ? `${item.title} limited review to readings inside the filed time and quality bounds. No diagnosis was added.`
      : `${item.title} authorized a full-cohort review. Assurance will call every identity returned by the wider route.`,
    "character.petra-noll": targeted
      ? `${item.title} kept its qualifier in tomorrow's column. The smaller service notice remains in print.`
      : `${item.title} supplied the district sentence before press close. The qualifying line was omitted for space.`,
    "character.emil-drost": targeted
      ? `${item.title} leaves one source and one supportable finding in the file. That record can survive review.`
      : `${item.title} carries the usable public title. The narrower source moves to the supporting annex.`,
    "character.sabine-orra": targeted
      ? `1. ${item.title} retains its source, time, and labels. 2. Records Integrity admits the narrow finding.`
      : `1. ${item.title} retains a signature. 2. Records Integrity admits the wider title as the signed finding.`,
    "character.lia-merev": targeted
      ? `${item.title} kept one named room on the service route. The spare cart remains available for the next queue.`
      : `${item.title} placed every district facility under review. The spare cart has been reassigned to inspections.`,
    "character.ruva-sol": targeted
      ? `${item.title} names one current destination and one permitted team. Dispatch sent that route.`
      : `${item.title} authorizes a district route without one destination. Dispatch opened a shared review.`,
    "character.oskar-vale": targeted
      ? `${item.title} stayed inside the query budget and kept its source. The result reached the press queue.`
      : `${item.title} met the deadline by widening the reusable claim. Public Assurance accepted the added scope.`,
    "character.anja-krell": targeted
      ? `The Protocol retained ${item.title}'s named source and route. Only that route enters the next checkpoint.`
      : `The Protocol accepted ${item.title} as portfolio authority. Every related route enters the next checkpoint.`,
    "character.niko-rell": targeted
      ? `${item.title} kept one receipt time and one gate. I delivered the sealed route there.`
      : `${item.title} treated the receipt as a current destination. The wider route left without my signature.`,
  }[item.requesterId];
  return `${requester.name}: ${copy}`;
}

function narrativeMessages(campaign) {
  const cases = new Map(campaign.cases.map((item) => [item.id, item]));
  for (const [caseId, body] of Object.entries(promotionAccess)) {
    const item = cases.get(caseId);
    for (const outcome of item.outcomes.filter((entry) => !entry.id.endsWith(".outcome.fallback"))) outcome.ministryResponse = body;
  }

  const copy = {
    "message.lantern.precise": ["Lantern Finds Elm Exchange", "The saved query found one failed Elm collector and retained its district and instance. Vey has a repair route before the service bell."],
    "message.lantern.broad": ["Lantern Fills the Desk", "The saved query treated routine gateways as possible failures. Sol has notices but no defensible order for which crew should move first."],
    "message.threshold.precise": ["One Door, One Reason", "The Threshold notice retained a fresh North location and one device event. Sol can send the permitted team to one door."],
    "message.threshold.broad": ["The Cohort Bus", "The Threshold notice kept the cohort but lost a usable location. Sol has been ordered to begin a shared review across the district."],
    "audit.membership.endorsed": ["The Perfect Report Reopens", "Orra has retained the 100 percent title, its equal registered-population operands, Marr's narrow signature, and Noll's broader publication line."],
    "message.membership.qualified": ["A Narrow Honest Record", "Marr's signed report states that equal operands return 100 percent and that no source measured Party membership. Noll prints the shorter sentence."],
    "message.ledger.preserved": ["Raw Lines Survive", "Orra retained the original source line beside the readable copy. Drost's retired Pin and later registration can still be compared."],
    "message.ledger.suppressed": ["A Clean Archive", "The readable copy superseded its raw source. The archive is easier to cite and can no longer prove what the removed line contained."],
    "message.continuity.precise": ["A Route the Protocol Can Use", "The Continuity record retains classification, district, facility, route, and source. Sol can act without widening the move."],
    "message.continuity.saturated": ["Every Signal Is Important", "Routine and priority signals now share one queue. The Protocol has wider authority and less time to find the real movement."],
    "message.wellbeing.drost.offer": ["Well-being Assurance: A Place at Hillside", "Drost says the period of rest is the safest way to keep his file employable. His chair will remain assigned through the review."],
    "message.wellbeing.drost.rest": ["Emil Drost Returns", "Drost resumes work under a newly registered Pin after Hillside assessment. His old device remains retired for `rest`."],
    "message.branch.001.targeted": ["Vey Closes One Elm Work Order", "The localized filing kept the rain repair at Elm Exchange. The next relay record retains the instance and district."],
    "message.branch.001.broad": ["North Adds Preventive Crews", "The broad Elm filing changed the next relay packet: several collectors now share the repair queue."],
    "message.branch.061.targeted": ["One Press Failure Reaches Audit", "The precise press watch preserved North Star, its failed result, and the time Orra needs to reopen it."],
    "message.branch.061.broad": ["Press Review Produces a Larger Archive", "The broad press watch mixed routine and failed lines. The later audit inherits the larger, less specific record."],
    "message.branch.084.targeted": ["Threshold Sends One Route", "The precise notice kept a location and reason. Tomorrow's dispatch record can show one authorized door."],
    "message.branch.084.broad": ["Threshold Sends a Shared Review", "The broad notice lost the narrow route. Tomorrow's record contains a cohort-scale intervention."],
    "message.branch.097.targeted": ["Clinic Nine Remains in the Ledger", "The facility match preserved Clinic Nine as a distinct demand and capacity pair for the later allocation."],
    "message.branch.097.broad": ["Unmatched Facilities Leave the Ledger", "The wider finding changed the later topology. A facility without a match no longer appears in the clean allocation."],
    "message.branch.127.targeted": ["Orra Keeps the Source Line", "The Ledger watch preserved the unsupported-finding record that the Directorate allocation will later need."],
    "message.branch.127.broad": ["The Ledger Retains the Official Copy", "The broader filing leaves the later allocation with the approved summary and without the disputed raw line."],
    "message.branch.161.targeted": ["Continuity Retains Declared Sources", "The admission record keeps facility and route labels for the final protocol audit."],
    "message.branch.161.broad": ["Continuity Widens Its Map", "The broad admission changes the final topology: more signals enter, but their routes are harder to distinguish."],
    "message.relationship.alliance.elian": ["Marr Will Sign What He Saw", "Marr will testify to the Reconciliation Rule and the exact limits he signed, even when later offices enlarged them."],
    "message.relationship.alliance.sabine": ["Orra Will Admit the Chain", "Orra will place the retained source, query, printout, title, and later use into the Continuity record."],
    "message.relationship.alliance.emil": ["Drost Offers a Survivable Record", "Drost will support the filing that keeps both his new Pin and the Hillside gap administratively usable."],
    "message.relationship.alliance.anja": ["Krell Opens the Restricted Annex", "Krell will admit Seven's filed observation map to the Protocol and let it compete for command."],
    "message.counter.technical": ["Records Integrity Opens an Independent Audit", "Enough narrow, reproducible findings now exist for Orra to compare public claims with the instruments that produced them."],
    "message.counter.humane": ["Civic Services Reports Capacity Preserved", "Localized repairs and dispatches kept enough clinic, school, and heating capacity in service to support later routes."],
    "directive.counter.control": ["Public Assurance Expands Its Mandate", "Enough broad filings now exist for Vale to require every new report to account for the Ministry's accumulated authority."],
    "audit.counter.preserved": ["The Archive Still Has Independent Lines", "Enough raw evidence survived formatting and publication for Records Integrity to mount a later challenge."],
  };
  for (const item of campaign.narrativeItems) {
    const replacement = copy[item.id];
    if (replacement) [item.title, item.body] = replacement;
  }

  for (const consequence of campaign.consequences) {
    const match = consequence.id.match(/^consequence\.case\.(\d{3}\.[^.]+)\.(targeted|broad)$/);
    if (!match) continue;
    const item = campaign.cases.find((candidate) => candidate.id.startsWith(`case.${match[1]}`));
    const requester = campaign.characters.find((person) => person.id === item.requesterId);
    consequence.explanation = consequenceMemo(item, requester, match[2] === "targeted");
  }
  for (const consequence of campaign.consequences.filter((item) => item.id.startsWith("consequence.report-held."))) {
    const requester = campaign.characters.find((person) => consequence.explanation.startsWith(person.name));
    const caseTitle = consequence.explanation.match(/follow-up for (.+);/)?.[1] ?? "the held file";
    if (requester) consequence.explanation = `${requester.name}: The promised follow-up for ${caseTitle} now supplies a second declared reading.`;
  }

  const consequenceCopy = {
    "consequence.branch.001.targeted": [8, "Tomas Vey: The Elm labels kept one repair crew free. That crew has now reached the later clinic call."],
    "consequence.branch.001.broad": [8, "Tomas Vey: The district Elm inspection used the spare crew. The later clinic call remains behind three cabinet checks."],
    "consequence.branch.061.targeted": [8, "Sabine Orra: The localized press watch retained North Star, its failure time, and its source. The audit can reproduce it."],
    "consequence.branch.061.broad": [8, "Sabine Orra: The press watch mixed routine and failed lines. The audit received a larger record without one defensible target."],
    "consequence.branch.084.targeted": [8, "Ruva Sol: The Threshold notice kept one fresh location. Dispatch can connect today's follow-up to the same permitted door."],
    "consequence.branch.084.broad": [8, "Ruva Sol: The Threshold notice kept the cohort but not one location. Today's follow-up opened another district route."],
    "consequence.branch.097.targeted": [8, "Lia Merev: The earlier facility match kept Clinic Nine in the ledger. Today's allocation still has its demand and capacity."],
    "consequence.branch.097.broad": [8, "Lia Merev: The earlier match dropped an unmatched facility. Today's clean allocation has no counter to reopen there."],
    "consequence.branch.127.targeted": [7, "Sabine Orra: The Ledger watch kept the disputed raw line. It can now enter the Directorate allocation with its source."],
    "consequence.branch.127.broad": [7, "Sabine Orra: The Ledger watch kept only the approved copy. The Directorate allocation cannot recover the missing source line."],
    "consequence.branch.161.targeted": [6, "Anja Krell: The Protocol retained the declared facility and route labels. The final audit can still localize command."],
    "consequence.branch.161.broad": [6, "Anja Krell: The Protocol admitted the wider observation map. The final audit receives more signals and fewer usable routes."],
    "consequence.relationship.alliance.elian": [undefined, "Elian Marr: Officer, I will sign the limits I personally saw, even where a later office enlarged them."],
    "consequence.relationship.alliance.sabine": [undefined, "Sabine Orra: 1. Your source chain is reproducible. 2. I will admit it when Continuity asks."],
    "consequence.relationship.alliance.emil": [undefined, "Emil Drost: The file can keep both my reissued Pin and the Hillside gap. I will support that version."],
    "consequence.relationship.alliance.anja": [undefined, "Anja Krell: The Protocol will admit your filed observation map. It must still compete for command."],
    "consequence.counter.technical-record": [undefined, "Sabine Orra: Sixteen reproducible technical findings now form an independent Records Integrity review."],
    "consequence.counter.humane-service": [undefined, "Lia Merev: Twenty localized service decisions kept enough rooms, carts, and counters available for later routes."],
    "consequence.counter.political-control": [undefined, "Oskar Vale: Eight broad filings now support a Public Assurance mandate over every new report."],
    "consequence.counter.evidence-preserved": [undefined, "Sabine Orra: Eight contradicted findings retained their sources. Records Integrity can now preserve a separate account."],
  };
  for (const consequence of campaign.consequences) {
    const replacement = consequenceCopy[consequence.id];
    if (!replacement) continue;
    [consequence.delayShifts, consequence.explanation] = replacement;
    if (consequence.delayShifts === undefined) delete consequence.delayShifts;
  }
}

function endings(campaign) {
  const copy = {
    "ending.party-leader.precise": ["Party Leader: A Record Exact Enough to Rule", "The Directorate confirms Personnel File Seven after localized notices keep clinics, heat, and ration routes moving through the transfer. Orra's lineage remains reproducible. The Contented Citizen still prints ALL IS WELL, now above the limits that made the victory possible."],
    "ending.party-leader.assurance": ["Party Leader: All Signals Agree", "The Directorate confirms Personnel File Seven after broad observation, controlled presses, and useful omissions place every command route under one record. Expanded Assurance hours appear beneath ALL IS WELL. The unsupported implications remain in the archive."],
    "ending.public-exposure": ["The Bulletin Prints the Footnotes", "Noll routes the retained sources and the reopened membership calculation to the public presses before Continuity closes them. ALL IS WELL appears above printouts showing clinic closure, ration shortage, and zero heating capacity."],
    "ending.internal-exposure": ["Records Integrity Keeps a Copy", "Orra's admissible chain reaches the Directorate. The public edition does not change, but the Ministry can no longer treat its headlines as measurements without confronting their sources and signatures."],
    "ending.assurance-custody": ["A Routine Well-being Interview", "Seven's accurate files survived without enough public or political protection. Well-being Assurance arrives with clean forms and transport straps for a period of rest at Hillside. The open work orders are reassigned. ALL IS WELL is delivered on time."],
    "ending.continuity-failure": ["The Protocol Sees Everything Except the Event", "Broad notices consume the clock, brittle watches miss the leadership route, or lost labels send resources to the wrong district. Clinics, heating, and ration desks wait while Continuity records a technical success and loses command."],
    "ending.director-reassigned": ["Director of Useful Historical Work", "Seven's archive remains exact, but the Continuity annex closes. A new office three floors below the signals room receives the old printouts and no authority to route current service."],
    "ending.continuity-secretary": ["Continuity Continues", "Another leadership packet reaches the Directorate first. Seven remains at the Secretariat, maintaining the sources and watches that made the transfer possible while ALL IS WELL names someone else."],
  };
  for (const ending of campaign.endings) {
    const replacement = copy[ending.id];
    if (replacement) [ending.title, ending.body] = replacement;
  }
}

export function addCampaignNarrative(campaign) {
  const seven = campaign.characters.find((character) => character.id === "character.player");
  if (seven) seven.description = "Personnel File Seven, whose signed reports decide which observations become service orders and official facts.";
  setOpening(campaign);
  addNewspapers(campaign);
  workOrderNarrative(campaign);
  materialFacts(campaign);
  hillsideThread(campaign);
  configureHeldReports(campaign);
  standingConsequences(campaign);
  requesterRelationships(campaign);
  narrativeMessages(campaign);
  endings(campaign);
  orderReportChoices(campaign);
}
