// SBAR / handover (Bible §12, Layer 6). Built only from verified fields: anything still awaiting
// the nurse's review is left out and reported, so the summary never introduces unconfirmed data.

import { FIELD, FIELDS, NA, isEmpty, withUnit } from './schema.js';
import { redFlags } from './checks.js';

const EYE = { 'Right (RE)': 'right eye', 'Left (LE)': 'left eye', 'Both (BE)': 'both eyes' };
const lc = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = parts => { const s = parts.filter(Boolean).join(', '); return s ? s.charAt(0).toUpperCase() + s.slice(1) + '.' : ''; };

export function verifiedValues(values, meta = {}) {
  const v = { ...values }, excluded = [];
  for (const [id, st] of Object.entries(meta.fields || {})) {
    if (st?.review && !isEmpty(id, v[id])) { excluded.push(FIELD[id]?.label || id); v[id] = FIELD[id]?.type === 'tri' || id === 'eye' ? NA : ''; }
  }
  return { v, excluded };
}

function ageText(v) {
  if (isEmpty('age', v.age)) return '';
  const u = v.ageUnit || 'years';
  return `${v.age}-${u.replace(/s$/, '')}-old`;
}

export function buildSBAR(values, meta = {}, nurse = {}) {
  const { v, excluded } = verifiedValues(values, meta);
  const sex = v.sex ? v.sex.toLowerCase() : 'patient';
  const comorb = [v.dm === 'Yes' && 'diabetic', v.htn === 'Yes' && 'hypertensive', v.otherComorbid && lc(v.otherComorbid)].filter(Boolean);
  const eye = EYE[v.eye] || '';
  const complaint = lc(v.nature || v.complaint);
  const complaintHasEye = /\b(?:right|left|both)\s+eyes?\b|bilateral/i.test(complaint);
  const complaintHasDur = v.duration && complaint.includes(String(v.duration).toLowerCase());

  // S - situation
  const who = [ageText(v), sex].filter(Boolean).join(' ');
  const onset = v.onset && !complaint.toLowerCase().includes(String(v.onset).toLowerCase()) ? lc(v.onset) : '';
  let S = `${who.charAt(0).toUpperCase() + who.slice(1)}${comorb.length ? ` (${comorb.join(', ')})` : ''}`;
  if (complaint) S += ` presenting with ${[onset, complaint].filter(Boolean).join(' ')}`;
  if (eye && !complaintHasEye) S += v.eye === 'Both (BE)' ? ' in both eyes' : ` in the ${eye}`;
  if (v.duration && !complaintHasDur) S += ` for ${lc(v.duration)}`;
  S += '.';
  if (v.patientName || v.patientId) S += ` Patient: ${[v.patientName, v.patientId && `(${v.patientId})`].filter(Boolean).join(' ')}.`;

  // B - background
  const tri = FIELDS.filter(f => f.type === 'tri' && f.sec === 'B');
  const pos = tri.filter(f => v[f.id] === 'Yes').map(f => {
    const d = f.detail && v[f.detail] ? ` (${lc(v[f.detail])})` : '';
    return lc(f.label) + d;
  });
  const neg = tri.filter(f => v[f.id] === 'No').map(f => lc(f.label));
  const B = [
    pos.length && `Positive: ${pos.join(', ')}.`,
    neg.length && `Denies: ${neg.join(', ')}.`,
    v.drops && `Current drops/medication: ${v.drops}.`,
    v.pastOcular && `Past ocular history: ${v.pastOcular}.`,
    v.medicalHx && `Medical history: ${v.medicalHx}.`,
    v.familyHx && `Family history: ${v.familyHx}.`,
    v.historyNotes && `${v.historyNotes}.`,
  ].filter(Boolean).join(' ');

  // A - assessment (nursing findings, not diagnosis)
  const va = [];
  if (v.vaRE || v.vaLE) va.push(`VA RE ${v.vaRE || 'not recorded'}${v.vaPHRE ? ` (PH ${v.vaPHRE})` : ''}, LE ${v.vaLE || 'not recorded'}${v.vaPHLE ? ` (PH ${v.vaPHLE})` : ''}`);
  if (v.nearVA) va.push(`near ${v.nearVA}`);
  const exam = [
    v.pupils && `pupils ${lc(v.pupils)}`, v.whitePupil === 'Yes' && 'white pupil', v.midDilated === 'Yes' && 'mid-dilated pupil',
    v.lids && `lids ${lc(v.lids)}`, v.conjunctiva && `conjunctiva ${lc(v.conjunctiva)}`, v.cornea && `cornea ${lc(v.cornea)}`,
    v.examDischarge && `discharge ${lc(v.examDischarge)}`, v.eyeMovements && `eye movements ${lc(v.eyeMovements)}`,
    (v.iopRE || v.iopLE) && `IOP RE ${withUnit('iopRE', v) || '-'}, LE ${withUnit('iopLE', v) || '-'}`,
    v.paddedEye === 'Yes' && `eye padded on arrival${v.padReason ? ` (${lc(v.padReason)})` : ' (reason unknown)'}`,
  ].filter(Boolean);
  const vitals = [v.bp && `BP ${withUnit('bp', v)}`, v.sugar && `${v.sugarType || 'RBS'} ${withUnit('sugar', v)}`, v.pulse && `pulse ${withUnit('pulse', v)}`, v.weight && `weight ${withUnit('weight', v)}`].filter(Boolean);
  const flags = redFlags(v);
  const A = [sentence([...va, ...exam]), sentence(vitals), v.examNotes && `${v.examNotes}.`,
    flags.length ? `RED FLAGS: ${flags.map(f => f.title).join('; ')}.` : 'No red-flag pattern detected.'].filter(Boolean).join(' ');

  // R - recommendation / plan
  const R = [
    v.priority && `Priority: ${v.priority}.`,
    v.referral && `For ${lc(v.referral)}.`,
    v.investigations && `Investigations: ${v.investigations}.`,
    v.dropsGiven && `Drops instilled: ${v.dropsGiven}${v.dropsTime ? ` at ${v.dropsTime}` : ''}.`,
    v.dilated === 'Yes' && `Dilated for doctor${v.dilationAgent ? ` with ${lc(v.dilationAgent)}` : ''}.`,
    v.education && `Health education: ${v.education}.`,
    v.nurseNotes && `${v.nurseNotes}.`,
  ].filter(Boolean).join(' ');

  // one-line handover in the Bible's style
  const line = [
    [ageText(v), comorb.join(' and ')].filter(Boolean).join(' '),
    [onset, complaint, !complaintHasEye && eye ? (v.eye === 'Both (BE)' ? 'bilateral' : `(${eye})`) : '', v.duration && !complaintHasDur ? `for ${lc(v.duration)}` : ''].filter(Boolean).join(' '),
    ...va, ...exam,
    v.pain === 'Yes' ? `pain${v.painDetail ? ` (${lc(v.painDetail)})` : ''}` : v.pain === 'No' ? 'no pain' : '',
    ...vitals,
    flags.length && `RED FLAG: ${flags.map(f => f.title.toLowerCase()).join('; ')}`,
    v.referral && `for ${lc(v.referral)}`,
  ].filter(Boolean).join(', ');

  const by = nurse.name ? `- ${nurse.name}${nurse.rank ? `, ${nurse.rank}` : ''} (${nurse.id}), ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : '';
  const lines = [`Handover: ${line.charAt(0).toUpperCase() + line.slice(1)}.`, '', `S: ${S}`];
  if (B) lines.push(`B: ${B}`);
  lines.push(`A: ${A}`);
  if (R) lines.push(`R: ${R}`);
  if (by) lines.push('', by);
  const text = lines.join('\n');
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), line, excluded };
}
