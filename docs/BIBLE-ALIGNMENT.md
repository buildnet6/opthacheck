# OphthaCheck v0.7 against the Product & Research Bible v1.0

Each Bible requirement, where it lives in the code, and its honest status.
Status key: **Built** (working and tested), **Partial** (works with stated limits), **Open** (not built, still on the roadmap).

## Golden Rules (Bible §24)

| # | Rule | How v0.7 keeps it | Status |
|---|------|-------------------|--------|
| 1 | If the nurse says it, capture it | Speech that matches no label is listed as "unplaced" and offered (unticked) for the section notes. Raw and reviewed transcripts are kept in `meta.transcripts` | Built |
| 2 | Labels are destination cues | `js/schema.js` aliases per field; `js/extract.js` finds labels first, then cuts the value segment after each one | Built |
| 3 | Never store the label as the value | Values are the text *between* labels; leading connectors ("is", "of", ":") are stripped | Built |
| 4 | Put information where it belongs | Section context + field type + linguistic context (Bible §6.3). Embedded cues inside a complaint ("…in both eyes for 2 years") also fill Which eye and Duration | Built |
| 5 | Don't make the nurse repeat herself | Dictating again appends to the transcript; the review table lets her fix one value without re-dictating | Built |
| 6 | Don't make her hunt for controls | Dictate, Stop, meter and state sit together in each section header | Built |
| 7 | Don't hide microphone state | Ready / Starting mic / Listening / Transcribing / Stopping / Captured / Populated / Mic problem, plus a green section outline while live and a "no sound reaching the mic" warning after 5 s of silence | Built |
| 8 | Silence is not clinical No | Every yes/no question is three-state and starts as **Not assessed** | Built |
| 9 | Don't guess an ambiguous number | Two different BP readings → conflict, unfilled. Number without the BP pattern → "not understood". Weight in pounds → refused, no conversion. Sugar without a spoken unit → marked to check | Built |
| 10 | Always allow human correction | Every field stays editable; the review table is editable before populating | Built |
| 11 | Convenience never overrides a red flag | Emergency flag opens a blocking "Stop routine clerking" dialog, a sticky banner stays until acknowledged, and finalising is blocked until every flag is acknowledged | Built |
| 12 | Save work before it can be lost | Autosave every 15 s when changed, on tab hide and on page close; manual Save; IndexedDB; drafts restored after refresh | Built |
| 13 | Know who created the record | Per-nurse profile, PIN stored as a salted PBKDF2 hash; author, rank and timestamps on every record and output | Partial (device-local identity) |
| 14 | Preserve the transcript | Raw engine text and the nurse-corrected text stored per populate, with what the engine extracted (Layers 2-3) | Built |
| 15 | Clinically readable record | Dedicated print layout and PDF, SBAR in prose rather than a field dump | Built |
| 16 | Reduce clerical work | Measured by the evaluation bench timer and the trial log | Measurement built; reduction not yet proven |

## Bible sections

| § | Requirement | Where | Status |
|---|-------------|-------|--------|
| 5 | Form as data model (A-E) | `js/schema.js` - 87 fields (30 three-state questions) incl. ocular pain severity, photophobia, floaters, curtain, vomiting, padded eye, white pupil, mid-dilated pupil | Built |
| 6.1 | 13-step dictation interaction | `js/voice.js`, `js/app.js` | Built |
| 6.3 | Three context sources | Section reach rules, field types, negation/modifier carry-over | Built |
| 7 | Units: mmHg, mg/dL or mmol/L, BPM, kg | Stored as numbers with a unit field; shown with units everywhere; typed units stripped and recognised | Built |
| 8 | Confidence & review | clear / check / unsure per value; checked fields stay amber until "✓ Confirmed"; SBAR excludes unconfirmed values | Built |
| 9 | Three-state data | All yes/no questions | Built |
| 10 | Red-flag model | `js/checks.js` - chemical, penetrating/bleeding, sudden loss, white pupil in a child, newborn purulent discharge, red eye + pain + vomiting + mid-dilated pupil, flashes + curtain, padded eye with unknown reason, nurse-raised trigger. Free-text evidence is negation-guarded ("no chemical injury" does not fire) | Built |
| 11 | VA first | Callout in section C; warning when drops/dilation are entered with no VA; contradiction if drops were documented before VA (timestamps) | Built |
| 12 | SBAR from verified fields | `js/sbar.js`; one-line handover in the Bible's style plus S/B/A/R; regenerated at finalise if stale | Built |
| 13 | Identity, statuses | Draft → Final (read-only) → Archived; amendments keep earlier versions in `history` | Built (local) |
| 14 | Offline-first | Service worker caches the app, PDF library and bench; IndexedDB; persistent-storage request; export/import JSON for device transfer | Built; **sync Open** |
| 15 | Output & sharing | Print, PDF download, native share sheet (text or PDF file), WhatsApp, email, copy; de-identify option on by default; every share audited | Built (channel limits below) |
| 16 | Seven-layer data architecture | Layer 1 transient; 2 `meta.transcripts`; 3 `meta.extractions`; 4 `values` + `meta.fields`; 5 `check()`; 6 SBAR/print/PDF/share; 7 `audit` store + `history` | Built |
| 20 | Testing & validation | `tests/cases.js` (12 development cases), `tests/heldout.js` (8 held-out), `node tests/run.mjs`, `evaluate.html` blind-dictation bench with saved trials and CSV export | Built |
| 22 | Roadmap phases 1-5, 7 | See README | Phases 1-5 built; 6 partial; 7 partial; 8 tooling built |

## Still open (Bible §18 - not pretended solved)

- Robust speech recognition on every browser/device. Chrome on Android and desktop is the main target; Firefox has no Web Speech API (typing path works); iOS Safari support varies. Chrome's recogniser may need internet even though everything else works offline.
- Names, hospital numbers and phone numbers under speech errors are always marked "check".
- Conversational phrasing without labels ("this is Funmilayo…") is not yet understood. A history detail that names an eye ("right eye cataract surgery 2019") can wrongly set the presenting eye. Both were found by the held-out set and are logged for the next rule round.
- Production authentication, roles, encryption at rest, multi-device sync, server archive, conflict resolution, institutional governance.
- WhatsApp/email links cannot attach files; PDF sharing relies on the device share sheet.
- Clinical validation and ethics approval before any real patient use.
