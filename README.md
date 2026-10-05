# OphthaCheck v0.7

**Speak once. Structure automatically. Verify clinically. Act safely.**

OphthaCheck is a voice-first clerking assistant for ophthalmic nurses. The nurse speaks naturally, sees the transcript, reviews what the engine extracted, and populates a structured, three-state nursing record. It then checks completeness, raises red flags, builds an SBAR handover and saves everything on the device, online or offline.

The governing document is the **OphthaCheck Product & Research Bible v1.0**. Every change should answer one question: *does this agree with the Bible?* [`docs/BIBLE-ALIGNMENT.md`](docs/BIBLE-ALIGNMENT.md) maps each Bible rule to the code and states what is still open.

> Prototype. Synthetic and fictional data only. Not validated for clinical use.

## The workflow

LOOK → SPEAK → SEE → REVIEW → POPULATE → CORRECT → CHECK → SAVE → HANDOVER

1. Sign in with a personal profile (name, staff ID, rank, PIN).
2. In any section, press **🎙 Dictate**. The section turns green, the meter moves and the state reads *Listening*. **■ Stop** sits right beside it.
3. Say the label, then the value: *"blood pressure 150 over 90, pulse 80, known diabetic…"*. **⌨ Type** opens the same transcript box for typing or pasting.
4. **✓ Review & populate** shows every value found, with what was heard and a confidence of *clear*, *check* or *unsure*. Edit, untick or choose between conflicting values, then **Populate selected fields**.
5. Values marked *check* stay amber until the nurse taps **✓ Confirmed**.
6. Red flags interrupt immediately. **Check** lists missing, contradictory and not-assessed items. **Generate SBAR** builds the handover from confirmed values only.
7. **Finalise & archive** makes the record read-only. Later changes go through **Amend**, which keeps the earlier version.
8. **Print**, **PDF** or **Share** (share sheet, WhatsApp, email, copy). De-identification is on by default.

## What v0.7 adds over v0.6

| Area | v0.6 | v0.7 |
|------|------|------|
| Extraction | Regex per field in sections A-C, whole transcript dumped into SBAR for E | One schema-driven engine for A, B, C and E: label segmentation, negation ("no pain, redness or itching"), modifiers ("severe pain"), eye-qualified VA/IOP ("right eye 6/36 pinhole 6/18"), CF/HM/PL/NPL, number words, speech homophones, conflicts and "not understood" lists |
| Review | Populate wrote straight into fields | Review table before populating; per-field provenance and *check* flags afterwards |
| Three-state data | 9 select boxes | 30 yes/no/not-assessed questions with one-tap controls |
| Red flags | 6 text patterns, "no chemical injury" could trigger | 11 rules on structured fields plus negation-guarded free text; blocking dialog, acknowledgement with escalation target, finalise blocked until acknowledged |
| Completeness | None beyond red flags | Essential, conditional (diabetic → sugar, trauma → mechanism, cataract complaint → cataract questions), contradictions, VA-before-drops |
| SBAR | Comma list | Verified-only SBAR plus one-line handover, stale warning, regenerated at finalise |
| Storage | localStorage, plaintext PIN | IndexedDB, salted PBKDF2 PIN hash, audit trail, versions, amendments, export/import, auto-lock, v0.6 data migrated automatically |
| Output | Browser print of the form | Clinical print layout, PDF file (works offline), share sheet / WhatsApp / email with de-identification |
| Testing | Manual | Synthetic benchmark, held-out set, blind-dictation bench with saved trials |

## Measured accuracy

Run `npm test` (or `node tests/run.mjs` and `node tests/heldout.mjs`).

| Set | Cases | Fields | Field accuracy | Ambiguity caught | Red-flag sensitivity |
|-----|-------|--------|----------------|------------------|----------------------|
| Development (`tests/cases.js`) | 12 | 151 | 100% | 3/3 | 8/8 |
| Held-out, **first run** | 8 | 59 | **86.4%** | - | 1/1 |
| Held-out after general fixes | 8 | 59 | 96.6% | - | 1/1 |

Read these numbers carefully. The development cases were written alongside the rules, so 100% there means the regression suite passes and nothing more. The honest estimate is the held-out first run, **86.4%**: it exposed three general bugs (answer-after-label phrasing "glare yes night no", history labels firing inside the examination section, "left eye affected"), which were fixed. The 96.6% is now contaminated because the cases were seen. The next round needs new held-out cases, and above all real dictation from nurses through `evaluate.html`.

## Files

```
index.html            app shell
css/app.css           styles, including the print layout
js/schema.js          the clerking sheet as data: 87 fields, aliases, units, requirements
js/extract.js         extraction engine (pure, runs in browser and Node)
js/checks.js          red flags, completeness, contradictions, VA-first
js/sbar.js            verified-only SBAR and one-line handover
js/store.js           IndexedDB, PIN hashing, record model, v0.6 migration
js/voice.js           dictation state machine and level meter
js/output.js          print view, PDF, share text, de-identification
js/app.js             UI controller
js/evaluate.js        scoring shared by the bench and the test runner
evaluate.html         benchmark, blind-dictation test, saved trials
tests/                synthetic cases, held-out cases, runners, results per version
vendor/jspdf.umd.min.js   jsPDF 2.5.2 (MIT), loaded on demand for PDF files
sw.js, manifest.webmanifest, icons/   offline install
docs/BIBLE-ALIGNMENT.md
```

No build step. Deploy the folder as-is to GitHub Pages (HTTPS is required for the microphone and for PIN hashing). Locally: `npm run serve`, then open http://localhost:8080.

## Browser notes

- **Chrome (Android, desktop)** is the main target for dictation. Chrome's speech recogniser may need a connection even though clerking, saving, checks and PDFs all work offline. When recognition is unavailable the app says so and the typing path still works.
- **Firefox** has no Web Speech API: Dictate is disabled, Type works.
- **iOS Safari** speech support varies by version. Test before relying on it.
- Speech language can be set to English (UK, Nigeria, US, Ghana, South Africa) under the nurse menu.

## Privacy and limits

Records live only in the browser on that device. There is no server, no sync and no cloud copy in this version; the nurse menu shows this as *local only* and offers export/import for backup or transfer. Production authentication, roles, encryption at rest, multi-device sync and institutional governance remain on the roadmap (Bible §22, phase 6). Do not enter real patient data until the institution has approved the system.

## Version history

| Version | Milestone |
|---------|-----------|
| v0.1 - v0.6 | See Bible §26 |
| **v0.7** | Schema-driven extraction for every section, review-before-populate, 30 three-state questions, red-flag interrupt with acknowledgement, completeness and contradiction checks, verified SBAR, IndexedDB with audit trail and amendments, hashed PINs, PDF and de-identified sharing, offline service worker, synthetic and held-out benchmarks, blind-dictation evaluation bench |
