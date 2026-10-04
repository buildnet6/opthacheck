// Clinical checks (Bible §10, §11, Layer 5): red flags, VA-first, completeness, contradictions.
// Pure functions. These are prompts for the accountable nurse, not diagnoses.

import { FIELD, FIELDS, NA, isEmpty, ageInDays } from './schema.js';

const yes = v => v === 'Yes';
// free-text evidence with simple negation guard ("no chemical injury" must not fire)
function textHas(text, re) {
  const t = String(text || '');
  for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
    const before = t.slice(Math.max(0, m.index - 28), m.index);
    if (!/\b(?:no|not|denies|denied|without|nil|negative\s+for|ruled\s+out)\b[^,.;]*$/i.test(before)) return true;
  }
  return false;
}
const narrative = v => [v.complaint, v.nature, v.historyNotes, v.traumaDetail, v.examNotes, v.dischargeDetail, v.chemicalAgent, v.nurseNotes].join(' . ');

/** Red-flag rules. level: 'emergency' interrupts clerking; 'urgent' needs prompt escalation. */
export const RED_FLAGS = [
  { id: 'chemical', level: 'emergency', title: 'Possible chemical injury',
    action: 'Irrigate immediately according to protocol - do not wait to finish clerking. Alert the doctor.',
    test: v => (yes(v.chemical) || textHas(narrative(v), /chemical|acid|alkali|lime|cement|bleach|caustic|battery\s+(?:acid|fluid)|ammonia/)) && v.chemical !== 'No'
      ? (yes(v.chemical) ? 'Chemical injury recorded' + (v.chemicalAgent ? ` (${v.chemicalAgent})` : '') : 'Chemical agent mentioned in the record') : null },
  { id: 'penetrating', level: 'emergency', title: 'Penetrating injury or bleeding from the eye',
    action: 'Stop routine processing. Do not apply pressure to the globe. Escalate to the doctor now.',
    test: v => yes(v.penetrating) ? 'Penetrating injury recorded' : yes(v.bleeding) ? 'Bleeding from the eye recorded'
      : textHas(narrative(v), /penetrat|perforat|open\s+globe|bleeding\s+from\s+(?:the\s+)?eye/) ? 'Penetrating injury / bleeding mentioned' : null },
  { id: 'suddenLoss', level: 'emergency', title: 'Sudden loss of vision',
    action: 'Escalate for urgent doctor assessment.',
    test: v => yes(v.suddenLoss) ? 'Sudden visual loss recorded'
      : (/sudden/i.test(v.onset) && textHas(narrative(v), /loss\s+of\s+(?:vision|sight)|vision\s+loss|cannot\s+see|can'?t\s+see|blind/)) ? 'Sudden onset with loss of vision'
      : textHas(narrative(v), /sudden(?:ly)?\s+(?:painless\s+)?(?:loss|lost)/) ? 'Sudden loss mentioned' : null },
  { id: 'whitePupil', level: 'emergency', title: 'White pupil in a child',
    action: 'Escalate urgently for specialist review.',
    test: v => { const d = ageInDays(v); return yes(v.whitePupil) && d !== null && d < 16 * 365.25 ? `White pupil, age ${v.age} ${v.ageUnit}` : null; } },
  { id: 'whitePupilAdult', level: 'urgent', title: 'White pupil recorded',
    action: 'Bring to the doctor\'s attention. If the patient is a child this is an emergency - confirm age.',
    test: v => { const d = ageInDays(v); return yes(v.whitePupil) && (d === null || d >= 16 * 365.25) ? (d === null ? 'White pupil recorded, age not documented' : 'White pupil recorded') : null; } },
  { id: 'newborn', level: 'emergency', title: 'Newborn with purulent discharge',
    action: 'Urgent doctor assessment (possible ophthalmia neonatorum).',
    test: v => { const d = ageInDays(v); const young = (d !== null && d <= 31) || textHas(narrative(v), /newborn|neonate|new\s+born/);
      const pus = (yes(v.discharge) && /pus|purulent|yellow|green|profuse|thick|copious/i.test(v.dischargeDetail + ' ' + v.examDischarge)) || textHas(narrative(v), /purulent|pus\b|profuse\s+discharge/);
      return young && pus ? 'Neonate with purulent discharge' : null; } },
  { id: 'angle', level: 'emergency', title: 'Red eye, severe pain, vomiting and mid-dilated pupil',
    action: 'Emergency pattern - escalate to the doctor immediately.',
    test: v => yes(v.redness) && yes(v.pain) && yes(v.vomiting) && yes(v.midDilated) ? 'All four features recorded' : null },
  { id: 'anglePartial', level: 'urgent', title: 'Painful red eye with vomiting',
    action: 'Check the pupil now (mid-dilated?) and alert the doctor.',
    test: v => yes(v.redness) && yes(v.pain) && yes(v.vomiting) && !yes(v.midDilated) ? `Pupil: ${v.midDilated === 'No' ? 'not mid-dilated' : 'not yet assessed'}` : null },
  { id: 'curtain', level: 'urgent', title: 'Flashes with curtain-like visual loss',
    action: 'Urgent retinal assessment.',
    test: v => (yes(v.flashes) || yes(v.floaters)) && yes(v.curtain) ? `${yes(v.flashes) ? 'Flashes' : 'Floaters'} with curtain/shadow`
      : textHas(narrative(v), /flash/) && textHas(narrative(v), /curtain|shadow\s+over/) ? 'Flashes and curtain mentioned' : null },
  { id: 'pad', level: 'urgent', title: 'Padded eye - reason not documented',
    action: 'Do not casually remove the pad. Follow trauma protocol and ask the doctor.',
    test: v => yes(v.paddedEye) && (isEmpty('padReason', v.padReason) || /^(?:unknown|not\s+known|unsure)/i.test(v.padReason)) ? 'Eye padded on arrival, reason unknown' : null },
  { id: 'manual', level: 'emergency', title: 'Nurse-raised emergency trigger',
    action: 'Follow the local protocol for this trigger.',
    test: v => !isEmpty('manualFlag', v.manualFlag) ? v.manualFlag : null },
];

export function redFlags(v) {
  const out = [];
  for (const r of RED_FLAGS) { const ev = r.test(v); if (ev) out.push({ id: r.id, level: r.level, title: r.title, action: r.action, evidence: ev }); }
  return out;
}

const looksCataract = v => {
  const d = ageInDays(v);
  return yes(v.hazy) || /cloud|hazy|haz|fog|mist|milky|blur|dim|poor\s+vision|reduced\s+vision|cataract|vision\s+(?:is\s+)?(?:poor|reduced|bad)/i.test(`${v.complaint} ${v.nature}`) && (d === null || d >= 40 * 365.25);
};

/**
 * @param v    values
 * @param meta { fields: {id:{review}}, filledAt: {id: iso} }
 */
export function check(v, meta = {}) {
  const flags = redFlags(v);
  const critical = [], recommended = [], conditional = [], contradictions = [], notAssessed = [];
  const miss = (id, list, why) => { if (isEmpty(id, v[id])) list.push({ field: id, label: FIELD[id].label, why }); };

  for (const f of FIELDS) {
    if (f.req === 'critical') miss(f.id, critical);
    else if (f.req === 'recommended') miss(f.id, recommended);
  }
  // conditional completeness
  if (yes(v.dm)) miss('sugar', conditional, 'Known diabetic - blood sugar expected');
  if (yes(v.pain)) miss('painDetail', conditional, 'Pain present - record severity/character');
  if (yes(v.discharge)) miss('dischargeDetail', conditional, 'Discharge present - record its character');
  if (yes(v.trauma)) {
    miss('traumaDetail', conditional, 'Trauma - record mechanism and time');
    for (const id of ['chemical', 'penetrating', 'paddedEye']) if (v[id] === NA) conditional.push({ field: id, label: FIELD[id].label, why: 'Trauma reported - ask specifically' });
  }
  if (yes(v.chemical)) miss('chemicalAgent', conditional, 'Chemical injury - name the agent');
  if (yes(v.surgery)) miss('surgeryDetail', conditional, 'Previous surgery - which eye / what / when');
  if (yes(v.dilated)) { miss('dilationAgent', conditional, 'Dilated - record the agent'); miss('dropsTime', conditional, 'Dilated - record the time'); }
  if (!isEmpty('dropsGiven', v.dropsGiven)) miss('dropsTime', conditional, 'Drops instilled - record the time');
  if (!isEmpty('priority', v.priority) && v.priority !== 'Routine') miss('referral', conditional, `${v.priority} priority - state who the patient is handed to`);
  if (looksCataract(v)) for (const f of FIELDS.filter(x => x.cataract)) if (v[f.id] === NA) notAssessed.push({ field: f.id, label: f.label, why: 'Cataract-type complaint - ask this targeted question' });

  // VA first (Bible §11)
  const vaDone = !isEmpty('vaRE', v.vaRE) || !isEmpty('vaLE', v.vaLE);
  if ((!isEmpty('dropsGiven', v.dropsGiven) || yes(v.dilated)) && !vaDone)
    contradictions.push({ field: 'vaRE', label: 'Visual acuity', why: 'Drops/dilation recorded but no visual acuity - VA must be done first' });
  const fa = meta.filledAt || {};
  const vaAt = [fa.vaRE, fa.vaLE].filter(Boolean).sort()[0];
  const dropAt = [fa.dropsGiven, fa.dilated].filter(Boolean).sort()[0];
  if (vaAt && dropAt && dropAt < vaAt) contradictions.push({ field: 'dropsGiven', label: 'Drops instilled', why: 'Drops were documented before visual acuity - confirm VA was checked before drops' });

  // contradictions
  if (v.pain === 'No' && !isEmpty('painDetail', v.painDetail)) contradictions.push({ field: 'pain', label: 'Pain', why: `Pain marked No but severity recorded ("${v.painDetail}")` });
  if (v.discharge === 'No' && !isEmpty('dischargeDetail', v.dischargeDetail)) contradictions.push({ field: 'discharge', label: 'Discharge', why: 'Discharge marked No but a character is recorded' });
  if (v.trauma === 'No' && (yes(v.chemical) || yes(v.penetrating))) contradictions.push({ field: 'trauma', label: 'Trauma', why: 'Trauma marked No but a chemical/penetrating injury is recorded' });
  if (v.dm === 'No' && /diabet|\bdm\b/i.test(`${v.otherComorbid} ${v.medicalHx}`) && !/no(?:t|n)?[- ]?(?:known\s+)?diabet/i.test(`${v.otherComorbid} ${v.medicalHx}`)) contradictions.push({ field: 'dm', label: 'Known diabetes', why: 'Marked No but diabetes appears in the history' });
  if (v.htn === 'No' && /hypertens|\bhtn\b/i.test(`${v.otherComorbid} ${v.medicalHx}`) && !/no(?:t|n)?[- ]?(?:known\s+)?hypertens/i.test(`${v.otherComorbid} ${v.medicalHx}`)) contradictions.push({ field: 'htn', label: 'Known hypertension', why: 'Marked No but hypertension appears in the history' });
  const eyeText = `${v.complaint} ${v.nature}`.toLowerCase();
  if (v.eye === 'Right (RE)' && /\bleft eye\b|both eyes|bilateral/.test(eyeText)) contradictions.push({ field: 'eye', label: 'Which eye', why: 'Right eye selected, complaint mentions the left/both eyes' });
  if (v.eye === 'Left (LE)' && /\bright eye\b|both eyes|bilateral/.test(eyeText)) contradictions.push({ field: 'eye', label: 'Which eye', why: 'Left eye selected, complaint mentions the right/both eyes' });
  const bp = String(v.bp).match(/^(\d+)\/(\d+)/);
  if (bp && +bp[1] <= +bp[2]) contradictions.push({ field: 'bp', label: 'Blood pressure', why: 'Systolic is not higher than diastolic' });
  const sg = parseFloat(v.sugar);
  if (isFinite(sg) && ((v.sugarUnit === 'mg/dL' && sg < 20) || (v.sugarUnit === 'mmol/L' && sg > 45))) contradictions.push({ field: 'sugar', label: 'Blood sugar', why: `${sg} ${v.sugarUnit} looks like the wrong unit - check mg/dL vs mmol/L` });
  if (flags.some(f => f.level === 'emergency') && v.priority && v.priority !== 'Emergency') contradictions.push({ field: 'priority', label: 'Priority', why: `Emergency red flag present but priority is ${v.priority}` });
  if (flags.some(f => f.level === 'urgent') && v.priority === 'Routine') contradictions.push({ field: 'priority', label: 'Priority', why: 'Urgent red flag present but priority is Routine' });

  const pendingReview = Object.entries(meta.fields || {}).filter(([id, s]) => s?.review && !isEmpty(id, v[id])).map(([id]) => ({ field: id, label: FIELD[id]?.label || id }));

  const critTotal = FIELDS.filter(f => f.req === 'critical').length;
  const score = Math.round(100 * (critTotal - critical.length) / critTotal);
  return { flags, critical, recommended, conditional, notAssessed, contradictions, pendingReview, score,
    canFinalize: critical.length === 0 && pendingReview.length === 0 && contradictions.length === 0 };
}

/** Per-section completion counts for the section navigator. */
export function sectionProgress(v) {
  const out = {};
  for (const s of ['A', 'B', 'C', 'E']) {
    const fs = FIELDS.filter(f => f.sec === s && f.req);
    const done = fs.filter(f => !isEmpty(f.id, v[f.id])).length;
    out[s] = { done, total: fs.length };
  }
  return out;
}
