// OphthaCheck extraction engine (Bible §6, §8, §16 layer 3).
// Pure functions, no DOM: the same code runs in the browser and in the Node test harness.
//
//   raw transcript ─► normalise ─► find spoken labels (destination cues) ─► cut value segments
//   ─► type-specific parse + plausibility ─► candidates {field, value, confidence}
//   ─► conflicts / unresolved / unplaced speech reported, never silently guessed.
//
// Golden rules enforced here: labels are never values; silence is never "No";
// an ambiguous clinical number is never manufactured.

import { FIELDS, FIELD, C_MODES, C_EYES, MODE_FIELDS, SECTIONS, NA } from './schema.js';

// ── number words → digits ─────────────────────────────────────────────
const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUMW = [...Object.keys(ONES), ...Object.keys(TENS), 'hundred', 'thousand', 'point'].join('|');
const NUM_GROUP = new RegExp(`\\b(?:${NUMW})(?:(?:\\s+|-)(?:and\\s+)?(?:${NUMW}))*\\b`, 'gi');

function convertGroup(str) {
  const words = str.toLowerCase().split(/[\s-]+/).filter(w => w && w !== 'and');
  const out = []; let cur = null, last = null, decimal = null;
  const flush = () => { if (cur !== null) out.push(decimal !== null ? `${cur}.${decimal}` : String(cur)); cur = null; last = null; decimal = null; };
  for (const w of words) {
    if (w === 'point') { if (cur === null) cur = 0; decimal = ''; last = 'point'; continue; }
    if (decimal !== null) { if (w in ONES && ONES[w] < 10) { decimal += ONES[w]; continue; } flush(); }
    if (w in ONES) {
      const n = ONES[w];
      if (cur !== null && (last === 'tens' && cur % 10 === 0 && n < 10)) { cur += n; last = 'ones'; }
      else if (cur !== null && (last === 'hundred' || last === 'thousand')) { cur += n; last = 'ones'; }
      else { flush(); cur = n; last = 'ones'; }
    } else if (w in TENS) {
      const n = TENS[w];
      if (cur !== null && (last === 'hundred' || last === 'thousand')) { cur += n; last = 'tens'; }
      else { flush(); cur = n; last = 'tens'; }
    } else if (w === 'hundred') { cur = (cur ?? 1) * 100; last = 'hundred'; }
    else if (w === 'thousand') { cur = (cur ?? 1) * 1000; last = 'thousand'; }
  }
  flush();
  return out.join(' ');
}
export function wordsToDigits(text) { return text.replace(NUM_GROUP, m => convertGroup(m)); }

/** Layer 2 → normalised text used for extraction (raw transcript is preserved separately). */
export function normalise(raw) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\bfull stop\b/gi, '.').replace(/\s+comma\b/gi, ',').replace(/\bslash\b/gi, '/').replace(/\bnew (?:line|paragraph)\b/gi, '.');
  t = wordsToDigits(t);
  t = t.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2').replace(/(\d)\s*:\s*(\d)/g, '$1:$2');
  return t;
}

// ── helpers ───────────────────────────────────────────────────────────
const STOP = new Set('a an the and or of in on at to for with is are was were be been has have had his her their its this that it he she they patient also then so very just which who as by from about there here um uh er okay ok yes no'.split(' '));
export function meaningful(s) { return String(s || '').toLowerCase().split(/[^a-z0-9/]+/).some(w => w.length > 1 && !STOP.has(w)); }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const LEAD = /^(?:[\s:,;.=\-–]+|(?:is|are|was|were|of|as|reads?|reading|measures?|measured|at|with|using|uses)\b)+/i;
const TRAIL = /(?:[\s,;:\-–]+|\b(?:and|then|next|also|with|the|his|her|their|patient|she|he|they|has|is|of|for|but|which|a|an|so|okay|ok|um|uh)\b)+$/i;
export function cleanSeg(s) {
  let t = String(s || ''), prev;
  do { prev = t; t = t.replace(LEAD, '').replace(TRAIL, '').trim(); } while (t !== prev);
  return t.replace(/[.]+$/, '').trim();
}

const NEG_TAIL = /(?:^|[\s,])((?:no|not|non|nil|denies|denied|deny|without|never|negative\s+for|absence\s+of)(?:\s+(?:a|an|any|known|history\s+of|h\/o|complaints?\s+of|evidence\s+of|been|had|have|has|signs?\s+of|to\s+be|other))*)\s*-?\s*$/i;
const MOD_TAIL = /(?:^|[\s,])((?:very\s+|quite\s+)?(?:severe|mild|moderate|sharp|dull|throbbing|intense|slight|marked|profuse|purulent|watery|mucoid|mucopurulent|yellowish|yellow|greenish|green|whitish|bloody|thick|sticky|copious|constant|intermittent)(?:\s+(?:and\s+)?(?:severe|sharp|dull|throbbing|purulent|watery|mucoid|yellowish|greenish|whitish|bloody|thick|sticky|profuse|constant|intermittent))*)\s*$/i;
const AFF_TAIL = /(?:^|[\s,])(?:has|had|have|with|reports?|reported|admits?|complains?\s+of|positive\s+for|experiencing|noticed|notices|uses|used|using|wears|wearing|on)\s*$/i;

const YES_RE = /^(?:yes|yeah|yep|present|positive|\+ve|there\s+is|noted|reported|admits|affirmative|true)\b/i;
const NO_RE = /^(?:no|nil|none|nope|negative|-ve|absent|denies|denied|not\s+present|false)\b/i;
const NA_RE = /^(?:not\s+(?:assessed|checked|asked|known|sure|done|examined|tested)|unknown|unsure|unable\s+to\s+(?:assess|tell|check))\b/i;

// ── type parsers: return {value, conf, note, extra:[{field,value}]} | {error} | {values:[...]} (conflict) ──
function nums(s) { return [...String(s).matchAll(/(\d+(?:\.\d+)?)/g)].map(m => parseFloat(m[1])); }

function rangeConf(n, [pLo, pHi], [hLo, hHi]) {
  if (n < hLo || n > hHi) return null;
  return n >= pLo && n <= pHi ? 'high' : 'low';
}

const P = {
  text(s, f) {
    let v = cleanSeg(s);
    if (f.id === 'occupation') v = v.replace(/^(?:an?|the)\s+/i, '');
    if (!v) return { error: 'label heard but no value followed' };
    return { value: cap(v), conf: 'high' };
  },
  longtext(s, f) { return P.text(s, f); },
  name(s) {
    let v = cleanSeg(s).replace(/\bpatient\b/ig, '').replace(/\s+/g, ' ').trim();
    if (!v) return { error: 'name label heard but no name followed' };
    if (/\d/.test(v)) return { error: `contains digits ("${v}")` };
    const words = v.split(' ');
    if (words.length > 6 || !/^[A-Za-zÀ-ÿ'’.\- ]+$/.test(v)) return { error: `could not read a name from "${v}"` };
    return { value: words.map(w => w.split('-').map(cap).join('-')).join(' '), conf: 'medium', note: 'Names are often misheard - check spelling' };
  },
  code(s) {
    let v = cleanSeg(s).replace(/^(?:number|no\.?|is)\s+/i, '');
    if (!v) return { error: 'ID label heard but no ID followed' };
    if (!/^[A-Za-z0-9\/\-\s.]{1,40}$/.test(v)) return { error: `could not read an ID from "${v}"` };
    const toks = v.split(/\s+/);
    if (toks.some(t => /^[a-z]{4,}$/i.test(t) && !/\d/.test(t) && toks.length > 2)) return { error: `ID mixed with words ("${v}")` };
    const id = v.replace(/[\s.]+/g, '').toUpperCase();
    if (id.length < 2 || id.length > 20) return { error: `ID length looks wrong ("${id}")` };
    return { value: id, conf: 'medium', note: 'Check the ID against the folder/card' };
  },
  phone(s) {
    let v = cleanSeg(s).replace(/(?<=\d|\s|^)o(?=\s|\d|$)/gi, '0').replace(/\bdouble\s+(\d)/gi, '$1$1').replace(/\btriple\s+(\d)/gi, '$1$1$1');
    const digits = (v.match(/^\+?[\d\s\-()]+/) || [''])[0].replace(/[^\d+]/g, '');
    const d = digits.replace(/\D/g, '');
    if (d.length < 7) return { error: `phone number incomplete ("${v}")` };
    if (d.length > 15) return { error: `phone number too long ("${v}")` };
    const ng = /^(?:0[789][01]\d{8}|\+?234[789][01]\d{8})$/.test(digits);
    return { value: digits, conf: ng ? 'high' : 'medium', note: ng ? '' : 'Not a standard Nigerian mobile format - check' };
  },
  age(s) {
    const v = cleanSeg(s);
    const m = v.match(/^(\d{1,3}(?:\.\d+)?)\s*(years?|yrs?|y\/o|months?|mo|weeks?|wks?|days?)?/i);
    if (!m) return { error: `could not read an age from "${v}"` };
    const n = parseFloat(m[1]);
    const u = !m[2] ? 'years' : /^mo/i.test(m[2]) ? 'months' : /^w/i.test(m[2]) ? 'weeks' : /^d/i.test(m[2]) ? 'days' : 'years';
    const conf = rangeConf(n, u === 'years' ? [0, 110] : [0, 400], u === 'years' ? [0, 125] : [0, 1000]);
    if (!conf) return { error: `age ${n} ${u} is outside a possible range` };
    return { value: String(n), conf, note: conf === 'low' ? 'Unusual age - confirm' : '', extra: [{ field: 'ageUnit', value: u }] };
  },
  bp(s) {
    if (/^not\s+(?:done|taken|checked|recorded)/i.test(cleanSeg(s))) return { value: 'Not done', conf: 'medium' };
    const t = String(s).replace(/\b(?:over|by|upon|on)\b/gi, '/').replace(/(\d)\s+(\d{2})\s*\/\s*(\d{2,3})/g, '$1$2/$3');
    const found = [...t.matchAll(/(\d{2,3})\s*\/\s*(\d{2,3})/g)].map(m => [+m[1], +m[2]]);
    if (!found.length) return { error: /\d/.test(s) ? `incomplete blood pressure "${cleanSeg(s)}" - needs systolic/diastolic` : 'BP label heard but no reading followed' };
    const uniq = [...new Set(found.map(([a, b]) => `${a}/${b}`))];
    if (uniq.length > 1) return { values: uniq, note: 'More than one BP reading heard' };
    const [sys, dia] = found[0];
    if (sys < 40 || sys > 300 || dia < 20 || dia > 200) return { error: `BP ${sys}/${dia} is outside a possible range` };
    const ok = sys >= 70 && sys <= 250 && dia >= 35 && dia <= 150 && sys > dia;
    return { value: `${sys}/${dia}`, conf: ok ? 'high' : 'low', note: ok ? '' : 'Unusual BP reading - confirm' };
  },
  pulse(s) { return numeric(s, { plaus: [40, 180], hard: [15, 260], strip: /(?:bpm|b\.p\.m\.?|beats?\s*(?:per|\/)\s*min(?:ute)?|bits?\s+per\s+minute)/gi, unitWord: 'pulse' }); },
  iop(s) { return numeric(s, { plaus: [3, 70], hard: [0, 90], strip: /(?:mm\s?hg|millimet(?:er|re)s?\s+of\s+mercury|mm)/gi, unitWord: 'IOP', integerOnly: false }); },
  weight(s) {
    if (/\b(?:pounds?|lbs?)\b/i.test(s)) return { error: 'weight given in pounds - record in kg (no automatic conversion)' };
    return numeric(s, { plaus: [2, 200], hard: [0.3, 350], strip: /(?:kg|kilo(?:gram)?s?)/gi, unitWord: 'weight' });
  },
  sugar(s, f, ctx, labelText) {
    const v = cleanSeg(s);
    const type = /f\.?\s?b\.?\s?s|fasting/i.test(labelText || '') ? 'FBS' : 'RBS';
    const extra = [{ field: 'sugarType', value: type }];
    if (/^(?:not\s+(?:done|available|checked)|nil|n\/a)/i.test(v)) return { value: 'Not done', conf: 'high', extra };
    const n = nums(v);
    if (!n.length) return { error: 'sugar label heard but no reading followed' };
    if (new Set(n).size > 1) return { values: [...new Set(n)].map(String), note: 'More than one sugar value heard', extra };
    const spoken = /mmol|milli\s?mol/i.test(v) ? 'mmol/L' : /mg|milligram/i.test(v) ? 'mg/dL' : null;
    const unit = spoken || ctx.values?.sugarUnit || 'mg/dL';
    const plausible = unit === 'mmol/L' ? n[0] >= 1 && n[0] <= 45 : n[0] >= 20 && n[0] <= 900;
    extra.push({ field: 'sugarUnit', value: unit });
    if (spoken) return { value: String(n[0]), conf: plausible ? 'high' : 'low', note: plausible ? '' : `${n[0]} ${unit} is unusual - check value and unit`, extra };
    return { value: String(n[0]), conf: plausible ? 'medium' : 'low', note: plausible ? `Unit not spoken - using ${unit}` : `Unit not spoken and ${n[0]} ${unit} is implausible - check unit`, extra };
  },
  duration(s) {
    const v = cleanSeg(s);
    const m = v.match(/^(?:about\s+|approximately\s+|over\s+|almost\s+|nearly\s+|the\s+(?:past|last)\s+|past\s+|last\s+)?(\d+(?:\.\d+)?|an?|one|few|a\s+few|several|couple\s+of|a\s+couple\s+of)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|years?|yrs?)(?:\s+ago)?\b/i);
    if (!m) return v ? { value: cap(v), conf: 'medium', note: 'Free-text duration - check' } : { error: 'duration label heard but nothing followed' };
    let n = m[1].toLowerCase();
    if (/^(?:an?|one)$/.test(n)) n = '1';
    let u = m[2].toLowerCase().replace(/^mins?$/, 'minute').replace(/^hrs?$/, 'hour').replace(/^wks?$/, 'week').replace(/^yrs?$/, 'year').replace(/s$/, '');
    const numeric = /^\d/.test(n);
    const value = `${n} ${u}${numeric && parseFloat(n) === 1 ? '' : 's'}`;
    return { value, conf: numeric ? 'high' : 'medium' };
  },
  time(s) {
    const v = cleanSeg(s);
    let m = v.match(/(\d{1,2})[:.](\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i) || v.match(/(\d{1,2})()\s*(a\.?m\.?|p\.?m\.?|o'?clock)/i);
    if (!m) return { error: `could not read a time from "${v}"` };
    let h = +m[1], mi = m[2] ? +m[2] : 0; const ap = (m[3] || '').toLowerCase();
    if (/^p/.test(ap) && h < 12) h += 12; if (/^a/.test(ap) && h === 12) h = 0;
    if (h > 23 || mi > 59) return { error: `time ${v} is not valid` };
    return { value: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, conf: ap || m[2] ? 'high' : 'medium' };
  },
  select(s, f) {
    const v = cleanSeg(s).toLowerCase();
    if (!v) return { error: 'label heard but no value followed' };
    for (const [opt, syns] of Object.entries(f.synonyms || {})) if (syns.some(x => v === x || v.startsWith(x + ' '))) return { value: opt, conf: 'high' };
    const opt = (f.options || []).find(o => o && o.toLowerCase() === v);
    if (opt) return { value: opt, conf: 'high' };
    return { error: `"${v}" is not one of: ${(f.options || []).filter(Boolean).join(', ')}` };
  },
  va(s) { return parseVA(s); },
};

function numeric(s, { plaus, hard, strip, unitWord }) {
  const v = cleanSeg(String(s).replace(strip, ' '));
  if (/^not\s+(?:done|taken|checked|recorded)/i.test(v)) return { value: 'Not done', conf: 'medium' };
  const n = nums(v);
  if (!n.length) return { error: `${unitWord} label heard but no number followed` };
  if (new Set(n).size > 1) return { values: [...new Set(n)].map(String), note: `More than one ${unitWord} value heard` };
  const conf = rangeConf(n[0], plaus, hard);
  if (!conf) return { error: `${unitWord} ${n[0]} is outside a possible range` };
  return { value: String(n[0]), conf, note: conf === 'low' ? `Unusual ${unitWord} - confirm` : '' };
}

// Visual acuity: Snellen metric/imperial, CF/HM/PL/NPL, logMAR, "not done".
const SNELLEN6 = new Set([1, 2, 3, 4, 5, 6, 7.5, 9, 12, 18, 24, 36, 48, 60]);
const SNELLEN20 = new Set([10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 200, 400]);
export function findVAs(s) {
  const t = String(s).replace(/\b(?:over|by|upon)\b/gi, '/');
  const out = [];
  const re = /\b(?:(no\s+(?:perception\s+of\s+light|light\s+perception)|npl|nlp)|(perception\s+of\s+light|light\s+perception|pl|lp)(?:\s+(?:with|and)\s+(?:accurate\s+)?projection|\s+and\s+pr)?|(hand\s+movements?|hm)|(counting\s+fingers?|count\s+fingers?|cf)(?:\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*(m|metres?|meters?|feet|ft))?|(logmar)\s*(-?\d+(?:\.\d+)?)|(\d{1,2}(?:\.\d)?)\s*\/\s*(\d{1,3}(?:\.\d)?)|(not\s+(?:done|recordable|possible|assessed)|unable(?:\s+to\s+(?:assess|read))?|uncooperative))\b/gi;
  for (const m of t.matchAll(re)) {
    if (m[1]) out.push({ value: 'NPL', conf: 'high' });
    else if (m[2]) out.push({ value: /proj|pr$/i.test(m[0]) ? 'PL (projection)' : 'PL', conf: 'high' });
    else if (m[3]) out.push({ value: 'HM', conf: 'high' });
    else if (m[4]) out.push({ value: m[5] ? `CF ${m[5]}${/f/i.test(m[6]) ? 'ft' : 'm'}` : 'CF', conf: 'high' });
    else if (m[7]) out.push({ value: `logMAR ${m[8]}`, conf: 'high' });
    else if (m[9]) {
      const a = parseFloat(m[9]), b = parseFloat(m[10]);
      const ok = (a === 6 && SNELLEN6.has(b)) || ([1, 2, 3, 4, 5].includes(a) && b === 60) || (a === 3 && [3, 6, 9, 12, 18, 24, 36, 60].includes(b)) || (a === 20 && SNELLEN20.has(b));
      out.push({ value: `${m[9]}/${m[10]}`, conf: ok ? 'high' : 'low', note: ok ? '' : 'Unusual Snellen fraction - confirm' });
    } else if (m[11]) out.push({ value: cap(m[11].toLowerCase()), conf: 'medium', note: 'VA not obtained - record the reason' });
  }
  return out;
}
function parseVA(s) {
  const v = findVAs(s);
  if (!v.length) {
    const c = cleanSeg(s);
    const two = c.match(/^(6|3|20)\s+(\d{1,3})$/);
    if (two) return { value: `${two[1]}/${two[2]}`, conf: 'medium', note: `Heard "${c}" - read as ${two[1]}/${two[2]}` };
    return { error: c ? `could not read a visual acuity from "${c}"` : 'VA label heard but no value followed' };
  }
  const uniq = [...new Set(v.map(x => x.value))];
  if (uniq.length > 1) return { values: uniq, note: 'More than one VA heard for this eye' };
  return v[0];
}
function findNear(s) { return [...String(s).matchAll(/\b[nN]\s?(\d{1,2})\b/g)].map(m => `N${m[1]}`); }
function findIOPs(s) { return nums(String(s).replace(/(?:mm\s?hg|millimet(?:er|re)s?\s+of\s+mercury)/gi, ' ')); }

// ── matcher construction (cached per section) ─────────────────────────
const cache = {};
function wrap(src) { return new RegExp(`(?<![A-Za-z0-9])(?:${src})(?![A-Za-z0-9])`, 'gi'); }
function matchers(section) {
  if (cache[section]) return cache[section];
  const list = [];
  for (const f of FIELDS) {
    for (const a of f.aliases || []) {
      const o = typeof a === 'string' ? { re: a } : a;
      if (o.local && f.sec !== section) continue;
      if (!inReach(f.sec, section)) continue;
      if (o.notIn && o.notIn === section) continue;
      list.push({ kind: 'field', field: f.id, sec: f.sec, val: o.val, re: wrap(o.re) });
    }
  }
  if (section === 'C') {
    for (const m of C_MODES) list.push({ kind: 'mode', mode: m.mode, sec: 'C', re: wrap(m.re) });
    for (const e of C_EYES) list.push({ kind: 'eye', eye: e.eye, sec: 'C', re: wrap(e.re) });
  }
  return (cache[section] = list);
}

// Consuming patterns: phrases that carry both destination and value without a label.
function patterns(section, text, values) {
  const found = [];
  const add = (re, fn, secs) => { if (secs && !secs.includes(section)) return; for (const m of text.matchAll(re)) { const r = fn(m); if (r) found.push({ start: m.index, end: m.index + m[0].length, ...r }); } };
  add(/\b(\d{1,3}(?:\.\d+)?)\s*[- ]?\s*(years?|yrs?|months?|weeks?|days?)[- ]?old\b/gi, m => ({ cands: [{ field: 'age', value: m[1], conf: 'high' }, { field: 'ageUnit', value: /^mo/i.test(m[2]) ? 'months' : /^w/i.test(m[2]) ? 'weeks' : /^d/i.test(m[2]) ? 'days' : 'years', conf: 'high' }] }));
  add(/\b(male|female|man|woman|boy|girl|gentleman|lady)\b(?!\s+(?:ward|clinic|unit|nurse|doctor))/gi, m => ({ cands: [{ field: 'sex', value: /female|woman|girl|lady/i.test(m[1]) ? 'Female' : 'Male', conf: 'high' }] }), ['A', 'B']);
  add(/\b(?:for|since|x)\s+(?:the\s+)?(?:past\s+|last\s+|about\s+|over\s+)?((?:\d+(?:\.\d+)?|an?|one|few|a\s+few|several|a\s+couple\s+of|couple\s+of)\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|years?|yrs?))\b/gi, m => { const p = P.duration(m[1]); return p.value ? { cands: [{ field: 'duration', value: p.value, conf: p.conf }] } : null; }, ['A', 'B']);
  add(/\bsince\s+(yesterday|this\s+morning|last\s+night|last\s+(?:week|month|year)|childhood|birth)\b/gi, m => ({ cands: [{ field: 'duration', value: 'Since ' + m[1].toLowerCase(), conf: 'high' }] }), ['A', 'B']);
  add(/\b((?:\d+(?:\.\d+)?|an?|one|few|several)\s*(?:minutes?|hours?|days?|weeks?|months?|years?))\s+ago\b/gi, m => { const p = P.duration(m[1]); return p.value ? { cands: [{ field: 'duration', value: p.value, conf: 'medium', note: 'From "… ago" phrasing' }] } : null; }, ['A', 'B']);
  add(/\b(routine|urgent|emergency)\s+(?:priority|case|review|referral)\b|\bpriority\s+(?:is\s+)?(routine|urgent|emergency)\b/gi, m => ({ cands: [{ field: 'priority', value: cap((m[1] || m[2]).toLowerCase()), conf: 'high' }] }), ['E']);
  add(/\b(?:at|by)\s+(\d{1,2}(?::\d{2}|\.\d{2})\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?|o'?clock))/gi, m => { const p = P.time(m[1]); return p.value ? { cands: [{ field: 'dropsTime', value: p.value, conf: p.conf }] } : null; }, ['E']);
  return found;
}
function softPatterns(section, text) {
  const out = [];
  if (section === 'E' && /dilat/i.test(text)) {
    const m = text.match(/\b(tropicamide|cyclopentolate|phenylephrine|atropine|mydriacyl|cyclogyl)(?:\s+\d+(?:\.\d+)?\s*%)?(?:\s+(?:and|plus|\+)\s+(tropicamide|cyclopentolate|phenylephrine|atropine)(?:\s+\d+(?:\.\d+)?\s*%)?)?/i);
    if (m) out.push({ field: 'dilationAgent', value: cap(m[0]), conf: 'medium', note: 'Agent inferred from drug name', from: 'pattern' });
  }
  if (['A', 'B'].includes(section)) {
    const m = text.match(/\b(acid|alkali|alkaline|lime|cement|bleach|caustic|battery\s+(?:acid|fluid)|ammonia|detergent|kerosene|petrol|insecticide)\b/i);
    if (m) {
      const before = text.slice(Math.max(0, m.index - 30), m.index);
      if (!/\b(?:no|not|without|denies)\b[^.]*$/i.test(before)) {
        out.push({ field: 'chemicalAgent', value: cap(m[1]), conf: 'medium', note: 'Agent named in speech', from: 'pattern' });
        out.push({ field: 'chemical', value: 'Yes', conf: 'medium', note: `"${m[1]}" mentioned - confirm chemical exposure`, from: 'pattern' });
      }
    }
  }
  return out;
}

// ── main entry point ──────────────────────────────────────────────────
/**
 * @param {string} section  'A' | 'B' | 'C' | 'E' - the section being dictated (context source 1)
 * @param {string} raw      transcript as recognised (Layer 2)
 * @param {object} ctx      { values } current record values (for unit context)
 * @returns {{normalised, candidates, conflicts, unresolved, unplaced}}
 */
export function extract(section, raw, ctx = {}) {
  const text = normalise(raw);
  const res = { normalised: text, candidates: [], conflicts: [], unresolved: [], unplaced: [] };
  if (!text) return res;

  // 1. find every spoken label, keep the longest non-overlapping set (ties → active section wins)
  let hits = [];
  for (const m of matchers(section)) {
    m.re.lastIndex = 0;
    for (const x of text.matchAll(m.re)) if (x[0].length) hits.push({ ...m, start: x.index, end: x.index + x[0].length, len: x[0].length, text: x[0] });
  }
  const pats = patterns(section, text, ctx.values || {});
  hits = hits.filter(h => !pats.some(p => p.start <= h.start && h.end <= p.end && p.end - p.start > h.len));
  hits.sort((a, b) => b.len - a.len || (b.sec === section) - (a.sec === section) || (a.kind === 'field') - (b.kind === 'field') || a.start - b.start);
  const chosen = [];
  for (const h of hits) if (!chosen.some(c => h.start < c.end && c.start < h.end)) chosen.push(h);
  chosen.sort((a, b) => a.start - b.start);

  // 2. consuming patterns (age "57 years old", "for 2 weeks", sex words…) cut segments too
  const hasSexLabel = chosen.some(c => c.field === 'sex');
  const pats2 = pats.filter(p => !chosen.some(c => p.start < c.end && c.start < p.end)).filter(p => !(hasSexLabel && p.cands[0].field === 'sex'));

  // 3. in section C, eye words only count as boundaries inside a measurement context
  let labels = chosen;
  if (section === 'C') {
    let active = true; labels = [];
    for (const h of chosen) {
      if (h.kind === 'mode') active = true;
      else if (h.kind === 'field') active = false;
      else if (h.kind === 'eye' && !active) continue;
      labels.push(h);
    }
  }
  const bounds = [...labels.map(l => ({ ...l, b: 'label' })), ...pats2.map(p => ({ ...p, b: 'pat' }))].sort((a, b) => a.start - b.start);

  // segments
  for (let i = 0; i < bounds.length; i++) {
    const next = bounds[i + 1];
    bounds[i].seg = text.slice(bounds[i].end, next ? next.start : text.length);
  }
  const lead = bounds.length ? text.slice(0, bounds[0].start) : text;
  if (meaningful(cleanSeg(lead))) res.unplaced.push(cleanSeg(lead));

  // 4. tri-state negation / modifier carry-over from the tail of the previous segment
  // dictation style: does the nurse answer after the label ("glare yes")? then a lone "no" between two
  // labels answers the label before it; otherwise it negates the label after it ("no pain")
  const afterStyle = bounds.some(b => b.b === 'label' && b.kind === 'field' && FIELD[b.field]?.type === 'tri' && /^\s*[,:]?\s*(?:yes|yeah|present|positive)\b/i.test(b.seg));
  for (let i = 0; i < bounds.length; i++) {
    const cur = bounds[i], nx = bounds[i + 1];
    if (!nx || nx.b !== 'label' || nx.kind !== 'field' || FIELD[nx.field].type !== 'tri') continue;
    let seg = cur.seg, m;
    const curTri = cur.b === 'label' && cur.kind === 'field' && FIELD[cur.field]?.type === 'tri' && cur.val === undefined;
    // "glare yes night no bright yes": a lone yes/no right after an un-prefixed tri label answers THAT label
    if (afterStyle && curTri && !cur.neg && !cur.aff && /^\s*[,:]?\s*(?:no|nil|negative|absent|none)\s*[,.]?\s*$/i.test(seg)) { cur.seg = seg; continue; }
    if ((m = seg.match(NEG_TAIL))) { nx.neg = true; seg = seg.slice(0, m.index); }
    else if ((m = seg.match(AFF_TAIL))) { nx.aff = true; seg = seg.slice(0, m.index); }
    if ((m = seg.match(MOD_TAIL))) { nx.mod = m[1]; seg = seg.slice(0, m.index); if (!nx.neg && (m = seg.match(NEG_TAIL))) { nx.neg = true; seg = seg.slice(0, m.index); } }
    // list negation: "no pain, redness or itching"
    if (cur.neg && cur.kind === 'field' && FIELD[cur.field]?.type === 'tri' && /^\s*(?:,\s*)?(?:or|nor|and|,)\s*$/i.test(cur.seg) && !YES_RE.test(cleanSeg(nx.seg)) && !NA_RE.test(cleanSeg(nx.seg))) {
      nx.neg = true; if (/\band\b/i.test(cur.seg)) nx.negWeak = true; seg = '';
    }
    cur.seg = seg;
  }

  const push = (c) => res.candidates.push(c);
  const parseInto = (fieldId, seg, h, extraNote) => {
    const f = FIELD[fieldId];
    const r = (P[f.type] || P.text)(seg, f, ctx, h.text);
    if (r.error) { res.unresolved.push({ field: fieldId, heard: `${h.text} ${cleanSeg(seg)}`.trim(), reason: r.error }); return; }
    if (r.values) { res.conflicts.push({ field: fieldId, values: r.values, heard: `${h.text} ${cleanSeg(seg)}`.trim(), note: r.note }); (r.extra || []).forEach(e => push({ ...e, conf: 'high', from: 'label', companion: true })); return; }
    push({ field: fieldId, value: r.value, conf: r.conf, note: [r.note, extraNote].filter(Boolean).join(' · '), heard: `${h.text} ${cleanSeg(seg)}`.trim(), from: h.kind === 'field' ? 'label' : 'mode' });
    (r.extra || []).forEach(e => push({ field: e.field, value: e.value, conf: 'high', from: 'label', companion: true }));
  };

  // 5. walk the boundaries and produce candidates
  let mode = 'va', persistentMode = 'va', lastEye = null; const nearParts = [];
  for (let i = 0; i < bounds.length; i++) {
    const h = bounds[i];
    if (h.b === 'label' && h.kind === 'field' && NARRATIVE.has(h.field) && h.val === undefined) {
      // narrative fields keep the whole phrase ("blurred vision in both eyes for 2 years");
      // embedded cues inside it are still extracted to their own fields
      let k = i + 1;
      while (k < bounds.length && embeddable(bounds[k]) && !/[.;]/.test(text.slice(h.end, bounds[k].start))) { bounds[k].absorbed = true; k++; }
      let span = text.slice(h.end, k < bounds.length ? bounds[k].start : text.length);
      span = span.split(/[.;]/)[0];
      let m; if ((m = span.match(NEG_TAIL)) || (m = span.match(AFF_TAIL))) span = span.slice(0, m.index);
      parseInto(h.field, span, h);
      continue;
    }
    if (h.b === 'pat') {
      h.cands.forEach(c => push({ ...c, heard: text.slice(h.start, h.end), from: 'pattern' }));
      if (!h.absorbed && meaningful(cleanSeg(h.seg))) res.unplaced.push(cleanSeg(h.seg));
      continue;
    }
    if (h.kind === 'mode') {
      const seg = cleanSeg(h.seg);
      if (!seg || !/\d|cf|hm|pl|npl|lp|count|hand|percep|light|not|unable/i.test(seg)) { mode = persistentMode = h.mode; continue; }
      mode = h.mode;
      const vals = mode === 'iop' ? findIOPs(seg).map(n => ({ value: String(n), conf: rangeConf(n, [3, 70], [0, 90]) || 'low' }))
        : mode === 'near' ? findNear(seg).map(v => ({ value: v, conf: 'high' })) : findVAs(seg);
      const both = /\b(?:both|each|bilateral(?:ly)?|ou)\b/i.test(seg);
      const F = MODE_FIELDS[mode];
      if (!vals.length) res.unresolved.push({ field: F.RE, heard: `${h.text} ${seg}`, reason: 'no readable value' });
      else if (mode === 'near' && !both && vals.length === 1) push({ field: 'nearVA', value: vals[0].value, conf: 'high', heard: `${h.text} ${seg}`, from: 'mode' });
      else if (both && vals.length === 1) { for (const e of ['RE', 'LE']) push({ field: F[e], ...vals[0], heard: `${h.text} ${seg}`, from: 'mode' }); }
      else if (vals.length >= 2) {
        push({ field: F.RE, ...vals[0], conf: 'medium', note: 'Eye not named - assumed first value is RE', heard: `${h.text} ${seg}`, from: 'mode' });
        push({ field: F.LE, ...vals[1], conf: 'medium', note: 'Eye not named - assumed second value is LE', heard: `${h.text} ${seg}`, from: 'mode' });
      } else if (bounds[i + 1]?.kind === 'eye' && !/\d/.test(bounds[i + 1].seg) && !meaningful(cleanSeg(bounds[i + 1].seg))) {
        // "VA 6/6 both eyes" / "pinhole 6/18 right" - the eye follows the value
        const nx = bounds[i + 1]; nx.consumed = true; lastEye = nx.eye;
        for (const e of nx.eye === 'BE' ? ['RE', 'LE'] : [nx.eye]) push({ field: F[e], ...vals[0], heard: `${h.text} ${seg} ${nx.text}`, from: 'mode' });
      } else if (lastEye && lastEye !== 'BE') push({ field: F[lastEye], ...vals[0], heard: `${h.text} ${seg}`, from: 'mode', note: [vals[0].note, `Eye taken from context (${lastEye})`].filter(Boolean).join(' · ') });
      else res.unresolved.push({ field: F.RE, heard: `${h.text} ${seg}`, reason: 'eye not stated - say right or left' });
      mode = persistentMode; // an inline mode ("pinhole 6/18") does not persist
      continue;
    }
    if (h.kind === 'eye') {
      if (h.consumed) continue;
      lastEye = h.eye;
      const seg = h.seg;
      if (!meaningful(cleanSeg(seg)) && !/\d/.test(seg)) continue;
      const targets = h.eye === 'BE' ? ['RE', 'LE'] : [h.eye];
      if (mode === 'near') { const n = findNear(seg); if (n.length) nearParts.push(`${h.eye} ${n[0]}`); else res.unresolved.push({ field: 'nearVA', heard: `${h.text} ${cleanSeg(seg)}`, reason: 'no N-value heard' }); continue; }
      for (const e of targets) parseInto(MODE_FIELDS[mode][e], seg, h);
      continue;
    }
    // ordinary field label
    if (section === 'C') { mode = persistentMode = 'va'; }
    const f = FIELD[h.field];
    if (f.type === 'tri') { triCandidate(f, h, res, push, h.absorbed); continue; }
    if (h.val !== undefined) {
      push({ field: f.id, value: h.val, conf: 'high', heard: h.text, from: 'label' });
      const rest = cleanSeg(h.seg);
      if (!h.absorbed && meaningful(rest)) res.unplaced.push(rest);
      continue;
    }
    if (f.type === 'longtext' || f.hidden) continue;
    if (h.absorbed && NUMERIC.has(f.type)) continue;
    parseInto(f.id, h.seg, h);
  }
  if (nearParts.length) push({ field: 'nearVA', value: nearParts.join(', '), conf: 'high', from: 'mode' });
  softPatterns(section, text).forEach(c => { if (!res.candidates.some(x => x.field === c.field)) push(c); });

  // 6. merge: identical values collapse, different values become a conflict (never silently resolved)
  const by = {};
  for (const c of res.candidates) (by[c.field] ||= []).push(c);
  const merged = [];
  for (const [field, list] of Object.entries(by)) {
    const f = FIELD[field];
    if (f.detail === undefined && FIELD[field].type === 'text' && list.length > 1 && !list[0].companion) {
      // multiple text fragments for the same field (e.g. detail appended twice) → join
      merged.push({ ...list[0], value: [...new Set(list.map(x => x.value))].join('; ') });
      continue;
    }
    const vals = [...new Set(list.map(c => c.value))];
    if (vals.length === 1) { merged.push(list.reduce((a, b) => (rank(b.conf) > rank(a.conf) ? b : a))); continue; }
    // a bare mention (medium) is overridden by an explicit statement only if they agree; otherwise conflict
    const explicit = list.filter(c => c.conf === 'high' && !c.bare);
    const exVals = [...new Set(explicit.map(c => c.value))];
    if (f.type === 'tri' && exVals.length === 1 && list.every(c => c.bare || c.value === exVals[0])) { merged.push(explicit[0]); continue; }
    if (list.every(c => c.companion)) { merged.push(list[list.length - 1]); continue; }
    res.conflicts.push({ field, values: vals, heard: list.map(c => c.heard).filter(Boolean).join(' | '), note: 'Different values heard for the same field' });
  }
  res.candidates = merged.filter(c => !res.conflicts.some(k => k.field === c.field));

  // 7. unplaced speech → offered (unticked) for the section's notes field so nothing the nurse said is lost
  const notes = SECTIONS.find(s => s.id === section)?.notes;
  if (notes && res.unplaced.length) res.candidates.push({ field: notes, value: res.unplaced.map(cap).join('; '), conf: 'low', note: 'Speech not matched to a field - add to notes?', from: 'unplaced', optional: true });
  return res;
}
// Context source 1 (Bible §6.3): labels belong to the section being dictated. Biodata/vitals labels work
// everywhere; history labels also work while dictating biodata (the chief complaint carries history).
function inReach(fieldSec, section) { return fieldSec === section || fieldSec === 'A' || (section === 'A' && fieldSec === 'B'); }
function rank(c) { return { high: 3, medium: 2, low: 1 }[c] || 0; }

function triCandidate(f, h, res, push, absorbed) {
  let seg = cleanSeg(h.seg);
  let value, conf = 'high', note = '', bare = false, rest = seg;
  const take = re => { const m = rest.match(re); if (m) rest = cleanSeg(rest.slice(m[0].length)); return !!m; };
  if (h.val) value = h.val;
  else if (take(NA_RE)) value = NA;
  else if (h.neg) { value = 'No'; take(NO_RE); if (h.negWeak) { conf = 'medium'; note = 'Negation carried across "and" - confirm'; } }
  else if (take(NO_RE)) value = 'No';
  else if (take(YES_RE) || h.aff) value = 'Yes';
  else { value = 'Yes'; bare = true; }
  let detail = [h.mod, meaningful(rest) ? rest : ''].filter(Boolean).join(', ');
  if (bare) {
    if (detail && f.detail) conf = 'high';
    else if (meaningful(rest)) { conf = 'medium'; note = 'Mentioned without a clear yes/no - confirm'; }
  }
  push({ field: f.id, value, conf, note, heard: `${h.text} ${seg}`.trim(), from: 'label', bare });
  if (detail && value !== NA) {
    if (f.detail && value === 'Yes') push({ field: f.detail, value: cap(detail), conf: 'high', heard: `${h.text} ${seg}`.trim(), from: 'label' });
    else if (f.detail && value === 'No' && h.mod) { /* "no severe pain" - modifier irrelevant */ }
    else if (!absorbed && meaningful(rest)) res.unplaced.push(rest);
  }
}

const NARRATIVE = new Set(['complaint', 'nature', 'investigations', 'education', 'referral', 'historyNotes', 'examNotes', 'nurseNotes', 'medicalHx', 'pastOcular', 'aggravating', 'traumaDetail', 'otherComorbid', 'severity']);
const NUMERIC = new Set(['bp', 'sugar', 'pulse', 'weight', 'iop']);
function embeddable(b) {
  if (b.b === 'pat') return b.cands[0].field !== 'priority';
  if (b.kind !== 'field') return false;
  const f = FIELD[b.field];
  if (b.val !== undefined) return true;
  if (f.type === 'tri') return !(b.neg || b.aff || YES_RE.test(cleanSeg(b.seg)) || NO_RE.test(cleanSeg(b.seg)) || NA_RE.test(cleanSeg(b.seg)));
  if (NUMERIC.has(f.type)) return !/\d/.test(b.seg);
  return false;
}
