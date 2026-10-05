// Evaluation bench (Bible §20): runs transcripts through the engine exactly as the app's
// default review would (values pre-ticked unless low-confidence or optional) and scores the result.

import { extract } from './extract.js';
import { check } from './checks.js';
import { blankValues, FIELD, isEmpty } from './schema.js';

const COMPANION = new Set(['ageUnit', 'sugarUnit', 'sugarType']);
const NOTES = new Set(['nurseNotes', 'historyNotes', 'examNotes']);
const norm = s => String(s ?? '').toLowerCase().replace(/[.,;:]+$/g, '').replace(/\s+/g, ' ').trim();

/** Populate a blank record from section transcripts. Returns values + engine output per section. */
export function runTranscripts(dictation) {
  const values = blankValues(), meta = { fields: {} }, runs = {};
  for (const sec of ['A', 'B', 'C', 'E']) {
    const t = dictation[sec]; if (!t) continue;
    const res = extract(sec, t, { values });
    runs[sec] = res;
    for (const c of res.candidates) {
      if (c.optional || c.conf === 'low') continue;
      values[c.field] = c.value;
      if (!c.companion) meta.fields[c.field] = { src: 'voice', review: c.conf !== 'high' };
    }
  }
  return { values, meta, runs };
}

export function scoreCase(cs, dictation = cs.dictation) {
  const { values, runs } = runTranscripts(dictation);
  const exp = cs.expected, flagged = new Set(cs.flagged || []);
  const rows = [];
  let correct = 0, wrong = 0, missing = 0, wrongField = 0;
  for (const [f, ev] of Object.entries(exp)) {
    const got = values[f];
    if (norm(got) === norm(ev)) { correct++; rows.push({ field: f, expected: ev, got, result: 'correct' }); continue; }
    if (isEmpty(f, got) || (f === 'ageUnit' && got === 'years' && ev !== 'years')) {
      const elsewhere = Object.entries(values).find(([k, v]) => k !== f && !COMPANION.has(k) && norm(v) === norm(ev) && !(k in exp));
      if (elsewhere) { wrongField++; rows.push({ field: f, expected: ev, got: `→ ${elsewhere[0]}`, result: 'wrong field' }); }
      else { missing++; rows.push({ field: f, expected: ev, got: '', result: 'missing' }); }
      continue;
    }
    wrong++; rows.push({ field: f, expected: ev, got, result: 'wrong value' });
  }
  const blank = blankValues();
  const fps = Object.keys(values).filter(k => !(k in exp) && !COMPANION.has(k) && !NOTES.has(k) && !flagged.has(k) && norm(values[k]) !== norm(blank[k]) && !isEmpty(k, values[k]));
  fps.forEach(k => rows.push({ field: k, expected: '', got: values[k], result: 'false positive' }));
  // ambiguity: flagged fields must be left empty AND reported
  let ambOK = 0;
  for (const f of flagged) {
    const reported = Object.values(runs).some(r => r.unresolved.some(u => u.field === f) || r.conflicts.some(k => k.field === f));
    const ok = isEmpty(f, values[f]) && reported;
    if (ok) ambOK++;
    rows.push({ field: f, expected: '(flag for review)', got: isEmpty(f, values[f]) ? (reported ? 'flagged' : 'silently empty') : values[f], result: ok ? 'ambiguity caught' : 'ambiguity missed' });
  }
  const flags = check(values, {}).flags.map(x => x.id);
  const expFlags = cs.redFlags || [];
  const flagHit = expFlags.filter(id => flags.includes(id)).length;
  const falseAlarms = flags.filter(id => !expFlags.includes(id) && !(id === 'anglePartial' && expFlags.includes('angle')));
  return { id: cs.id, title: cs.title, values, runs, rows, correct, wrong, missing, wrongField, falsePos: fps.length, total: Object.keys(exp).length,
    ambiguity: { caught: ambOK, total: flagged.size }, flags: { expected: expFlags, fired: flags, hit: flagHit, falseAlarms } };
}

export function summarise(results) {
  const sum = k => results.reduce((a, r) => a + r[k], 0);
  const total = sum('total'), correct = sum('correct');
  const amb = results.reduce((a, r) => [a[0] + r.ambiguity.caught, a[1] + r.ambiguity.total], [0, 0]);
  const fl = results.reduce((a, r) => [a[0] + r.flags.hit, a[1] + r.flags.expected.length, a[2] + r.flags.falseAlarms.length], [0, 0, 0]);
  const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 100);
  return {
    cases: results.length, expectedFields: total,
    fieldAccuracy: pct(correct, total), missingRate: pct(sum('missing'), total), wrongValueRate: pct(sum('wrong'), total), wrongFieldRate: pct(sum('wrongField'), total),
    falsePositives: sum('falsePos'), ambiguityDetection: pct(amb[0], amb[1]), redFlagSensitivity: pct(fl[0], fl[1]), redFlagFalseAlarms: fl[2],
  };
}
