// OphthaCheck v0.7 - application controller.
// LOOK → SPEAK → SEE → REVIEW → POPULATE → CORRECT → CHECK → SAVE → HANDOVER

import { FIELDS, FIELD, SECTIONS, NA, TRI, VERSION, isEmpty, blankValues } from './schema.js';
import { extract } from './extract.js';
import { check, sectionProgress } from './checks.js';
import { buildSBAR } from './sbar.js';
import { db, hashPin, verifyPin, newRecord, migrateLegacy, requestPersistence } from './store.js';
import { Dictation, drawMeter, speechSupported, STATES } from './voice.js';
import { printHTML, makePDF, shareText } from './output.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => new Date().toISOString();
const hhmm = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmt = iso => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

const SESSION = 'oc7_session';
const PREFS = 'oc7_prefs';
const prefs = (() => { try { return { lang: 'en-GB', lockMin: 10, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { return { lang: 'en-GB', lockMin: 10 }; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch {} };

const S = { nurse: null, rec: null, dirty: false, vstate: {}, review: {}, raw: {}, flagShown: new Set(), checkShown: false, lastActivity: Date.now(), locked: false, lastCheck: null };
const COMPANIONS = { age: ['ageUnit'], sugar: ['sugarUnit', 'sugarType'] };
const HINTS = {
  A: 'e.g. "Patient name Toby Daniels, hospital number UCH 4567, age 57, male, trader, blood pressure 150 over 90, RBS 200 mg/dL, pulse 80, weight 85 kg, known diabetic, chief complaint foggy vision in both eyes for one year."',
  B: 'e.g. "Both eyes, gradual onset, for one year. No pain, redness or itching. Halos present, worse at night. Family history of cataract yes. No previous eye surgery."',
  C: 'e.g. "VA right eye 6/36, pinhole 6/18. Left eye 6/60, pinhole 6/24. Pupils black and round. IOP right 17, left 19."',
  E: 'e.g. "Drops instilled tropicamide at 10:30. Dilated for doctor. Investigations RBS. Referral to cataract clinic. Routine priority."',
};

// ── tiny UI helpers ───────────────────────────────────────────────────
let toastT;
function toast(msg, ms = 2800) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), ms); }

/** Generic dialog. buttons: [{label, cls, value, onClick}] - onClick returning false keeps it open. */
function dialog({ title, body, buttons = [{ label: 'Close', cls: 'line', value: null }], danger = false, onOpen }) {
  const d = $('#dlg');
  return new Promise(resolve => {
    d.classList.toggle('danger', danger);
    $('#dlgH').textContent = title;
    $('#dlgB').innerHTML = body;
    $('#dlgF').innerHTML = '';
    buttons.forEach(b => {
      const el = document.createElement('button'); el.type = 'button'; el.className = `btn ${b.cls || ''}`; el.textContent = b.label;
      el.onclick = async () => { if (b.onClick && (await b.onClick(d)) === false) return; d.close(); resolve(b.value); };
      $('#dlgF').appendChild(el);
    });
    d.onclose = () => resolve(null);
    d.oncancel = e => { if (danger) e.preventDefault(); };
    if (!d.open) d.showModal();
    onOpen?.(d);
  });
}
const confirmDlg = (title, body, ok = 'Continue', cls = '') => dialog({ title, body: `<p>${body}</p>`, buttons: [{ label: 'Cancel', cls: 'line', value: false }, { label: ok, cls, value: true }] });

// ── boot ──────────────────────────────────────────────────────────────
async function boot() {
  $('#ver').textContent = `v${VERSION}`;
  net(); addEventListener('online', net); addEventListener('offline', net);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  try { await migrateLegacy(); } catch (e) { console.warn(e); }
  requestPersistence();
  bindLogin(); bindApp();
  window.__ocBooted = true;
  const sess = JSON.parse(sessionStorage.getItem(SESSION) || 'null');
  const p = sess && await db.getProfile(sess.id);
  if (p) { S.nurse = { id: p.id, name: p.name, rank: p.rank || '', clockIn: sess.clockIn }; await startApp(); }
  else showLogin();
}
function net() {
  const on = navigator.onLine, c = $('#net');
  c.classList.toggle('off', !on);
  c.lastElementChild.textContent = on ? 'Online' : 'Offline - saving on this device';
}

// ── sign in / profiles (Bible §13) ────────────────────────────────────
async function showLogin() {
  $('#login').classList.remove('hidden'); $('#app').classList.add('hidden'); $('#actions').classList.add('hidden');
  $('#nurseChip').classList.add('hidden'); $('#saveChip').classList.add('hidden');
  const ps = await db.profiles();
  $('#profiles').innerHTML = ps.length ? ps.map(p => `<button class="btn line sm" type="button" data-pid="${esc(p.id)}">${esc(p.name)} <span class="muted">${esc(p.id)}</span></button>`).join('') : '';
  if (!ps.length) switchTab('create');
}
function switchTab(t) {
  $('#tabSignin').setAttribute('aria-selected', t === 'signin'); $('#tabCreate').setAttribute('aria-selected', t === 'create');
  $('#signinForm').classList.toggle('hidden', t !== 'signin'); $('#createForm').classList.toggle('hidden', t !== 'create');
}
function bindLogin() {
  $('#tabSignin').onclick = () => switchTab('signin'); $('#tabCreate').onclick = () => switchTab('create');
  $('#profiles').onclick = e => { const b = e.target.closest('[data-pid]'); if (b) { $('#siId').value = b.dataset.pid; $('#siPin').focus(); } };
  $('#signinForm').onsubmit = async e => {
    e.preventDefault(); const id = $('#siId').value.trim().toUpperCase(), pin = $('#siPin').value;
    const p = await db.getProfile(id);
    if (!p) { $('#siErr').textContent = 'No profile with that Staff ID on this device. Create one in "New nurse profile".'; return; }
    if (!(await verifyPin(p, pin))) { $('#siErr').textContent = 'Wrong PIN.'; await db.audit({ staffId: id, action: 'sign-in failed' }); return; }
    try { await signIn(p); } catch (err) { $('#siErr').textContent = `Could not open the app: ${err.message}`; window.__ocShowError?.(`App error: ${err.message}`); }
  };
  $('#createForm').onsubmit = async e => {
    e.preventDefault();
    const name = $('#crName').value.trim(), id = $('#crId').value.trim().toUpperCase(), rank = $('#crRank').value.trim(), pin = $('#crPin').value, pin2 = $('#crPin2').value;
    if (!/^\d{4,}$/.test(pin)) { $('#crErr').textContent = 'PIN must be at least 4 digits.'; return; }
    if (pin !== pin2) { $('#crErr').textContent = 'The two PINs do not match.'; return; }
    if (await db.getProfile(id)) { $('#crErr').textContent = 'That Staff ID already has a profile on this device. Sign in instead.'; return; }
    try { const h = await hashPin(pin); const p = { id, name, rank, ...h, createdAt: now() }; await db.putProfile(p); await db.audit({ staffId: id, action: 'profile created' }); await signIn(p); }
    catch (err) { $('#crErr').textContent = err.message; }
  };
}
async function signIn(p) {
  S.nurse = { id: p.id, name: p.name, rank: p.rank || '', clockIn: now() };
  sessionStorage.setItem(SESSION, JSON.stringify({ id: p.id, clockIn: S.nurse.clockIn }));
  await db.putProfile({ ...p, lastLogin: now() });
  await db.audit({ staffId: p.id, action: 'signed in' });
  $('#siPin').value = ''; $('#crPin').value = ''; $('#crPin2').value = '';
  await startApp();
}

// ── app start ─────────────────────────────────────────────────────────
let built = false;
async function startApp() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#actions').classList.remove('hidden');
  const chip = $('#nurseChip'); chip.classList.remove('hidden'); chip.textContent = `${S.nurse.name} ▾`;
  $('#saveChip').classList.remove('hidden');
  if (!built) { renderSections(); built = true; }
  const activeId = await db.kvGet(`active:${S.nurse.id}`);
  let rec = activeId && await db.getRecord(activeId);
  if (!rec || rec.staffId !== S.nurse.id) { const mine = (await db.recordsFor(S.nurse.id)).filter(r => r.status === 'DRAFT').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); rec = mine[0]; }
  if (rec) { loadRecord(rec); setSave(`Draft restored · saved ${hhmm(rec.updatedAt)}`); }
  else { loadRecord(newRecord(S.nurse)); setSave('New record · not saved yet'); }
  renderArchive();
  setInterval(() => { if (S.dirty && !S.locked) save(true); }, 15000);
  setInterval(idleCheck, 20000);
}

// ── form rendering (the clerking sheet as data model) ─────────────────
function controlHTML(f) {
  const id = `f_${f.id}`;
  if (f.type === 'tri') return `<div class="tri" id="${id}" role="radiogroup" aria-label="${esc(f.label)}">${TRI.slice(1).concat(NA).map(v => `<button type="button" role="radio" data-v="${v}" aria-checked="false">${v}</button>`).join('')}</div>`;
  if (f.type === 'select') return `<select id="${id}">${f.options.map(o => `<option value="${esc(o)}">${esc(o || '-')}</option>`).join('')}</select>`;
  if (f.type === 'longtext') return `<textarea id="${id}" rows="8"></textarea>`;
  if (f.id === 'age') return `<div class="combo"><input id="${id}" inputmode="decimal" autocomplete="off"><select id="f_ageUnit" aria-label="Age unit">${FIELD.ageUnit.options.map(o => `<option>${o}</option>`).join('')}</select></div>`;
  if (f.id === 'sugar') return `<div class="combo"><select id="f_sugarType" aria-label="Sugar test">${FIELD.sugarType.options.map(o => `<option>${o}</option>`).join('')}</select><input id="${id}" inputmode="decimal" placeholder="${esc(f.placeholder || '')}" autocomplete="off"><select id="f_sugarUnit" aria-label="Sugar unit">${FIELD.sugarUnit.options.map(o => `<option>${o}</option>`).join('')}</select></div>`;
  if (f.type === 'time') return `<div class="combo"><input id="${id}" inputmode="numeric" placeholder="HH:MM" autocomplete="off"><button class="btn sm ghost" type="button" data-now="${f.id}">Now</button></div>`;
  const im = ['bp', 'pulse', 'weight', 'iop', 'phone'].includes(f.type) ? ' inputmode="decimal"' : f.type === 'phone' ? ' inputmode="tel"' : '';
  return `<input id="${id}"${im} placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
}
function fieldHTML(f) {
  const unit = f.unit ? ` <span class="unit">(${f.unit})</span>` : '';
  const wide = f.wide || f.type === 'longtext' ? ' wide' : f.type === 'tri' || ['age', 'sugar'].includes(f.id) ? ' full-sm' : '';
  const lab = f.type === 'tri' ? `<span class="lbl" id="l_${f.id}">${esc(f.label)}</span>` : `<label for="f_${f.id}">${esc(f.label)}${unit}</label>`;
  let extra = '';
  if (f.id === 'sbar') extra = `<div class="row" style="margin-top:6px"><button class="btn sm" type="button" data-act="sbar">Generate SBAR from verified fields</button><button class="btn sm line" type="button" data-act="copySbar">Copy</button><span class="muted" id="sbarNote"></span></div>`;
  return `<div class="field${wide}" data-field="${f.id}">${lab}${controlHTML(f)}${extra}<div class="fmeta" id="m_${f.id}"></div></div>`;
}
function renderSections() {
  const nav = [], out = [];
  for (const s of SECTIONS) {
    nav.push(`<a href="#sec-${s.id}" data-nav="${s.id}"><b>${s.id}</b>${esc(s.short)} <span id="nv_${s.id}"></span></a>`);
    const fields = FIELDS.filter(f => f.sec === s.id && !f.hidden);
    const groups = [...new Set(fields.map(f => f.group))];
    const voice = s.dictate ? `
      <div class="voice">
        <button class="btn ghost" type="button" data-dict="${s.id}" aria-label="Start dictation for ${esc(s.title)}">🎙 Dictate</button>
        <button class="btn stop" type="button" data-stop="${s.id}" disabled>■ Stop</button>
        <span class="meter"><canvas id="cv_${s.id}" width="180" height="22"></canvas></span>
        <span class="vstate" id="vs_${s.id}" aria-live="polite">${speechSupported ? STATES.READY : 'Type to dictate'}</span>
        <button class="btn sm line" type="button" data-type="${s.id}" title="Type or paste instead of speaking">⌨ Type</button>
      </div>` : '';
    const tx = s.dictate ? `
      <div class="tx" id="tx_${s.id}">
        <p class="hint">Say the label, then the value. ${esc(HINTS[s.id] || '')}</p>
        <label class="sr" for="t_${s.id}">Transcript for section ${s.id}</label>
        <textarea id="t_${s.id}" placeholder="${speechSupported ? 'Press Dictate and speak, or type here…' : 'Voice is not available in this browser. Type or paste here…'}"></textarea>
        <div class="interim" id="i_${s.id}"></div>
        <div class="row"><button class="btn go" type="button" data-pop="${s.id}">✓ Review & populate</button><button class="btn sm line" type="button" data-clear="${s.id}">Clear transcript</button><span class="silent" id="sil_${s.id}"></span><span class="muted" id="sum_${s.id}"></span></div>
        <div id="rv_${s.id}"></div>
      </div>` : '';
    let body = s.banner ? `<div class="callout"><b>VA first.</b> ${esc(s.banner)}</div>` : '';
    if (s.id === 'D') body += `<div id="flagsOut"></div>`;
    for (const g of groups) {
      const gf = fields.filter(f => f.group === g);
      const allTri = gf.every(f => f.type === 'tri');
      body += `<div class="group"><h3>${esc(g)}</h3><div class="grid${allTri ? ' tri-grid' : ''}">${gf.map(fieldHTML).join('')}</div></div>`;
    }
    out.push(`<section class="card sec" id="sec-${s.id}" data-sec="${s.id}" data-vs="READY">
      <div class="sec-head"><div class="letter" aria-hidden="true">${s.id}</div><h2>${esc(s.title)}</h2>${voice}</div>${tx}
      <div class="sec-body">${body}</div></section>`);
  }
  $('#secnav').innerHTML = nav.join('') + `<a href="#checkCard" data-nav="check"><b>✓</b>Check <span id="nv_check"></span></a>`;
  $('#sections').innerHTML = out.join('');
}

// ── value plumbing ────────────────────────────────────────────────────
function getControl(id) {
  const el = $(`#f_${id}`); if (!el) return S.rec.values[id];
  if (el.classList.contains('tri')) return el.querySelector('[aria-checked="true"]')?.dataset.v || NA;
  return el.value;
}
function setControl(id, v) {
  const el = $(`#f_${id}`); if (!el) return;
  if (el.classList.contains('tri')) { $$('button', el).forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === (v || NA)))); return; }
  if (el.tagName === 'SELECT' && v && ![...el.options].some(o => o.value === v)) el.add(new Option(v, v));
  el.value = v ?? '';
}
function readOnly() { return S.rec?.status !== 'DRAFT'; }

function loadRecord(rec) {
  S.rec = rec; S.dirty = false; S.review = {}; S.raw = {}; S.flagShown = new Set(Object.keys(rec.meta.flagAcks || {}));
  rec.values = { ...blankValues(), ...rec.values };
  for (const f of FIELDS) setControl(f.id, rec.values[f.id]);
  for (const f of FIELDS) updateFieldMeta(f.id);
  for (const s of SECTIONS.filter(x => x.dictate)) { $(`#t_${s.id}`).value = ''; $(`#rv_${s.id}`).innerHTML = ''; $(`#sum_${s.id}`).textContent = ''; $(`#tx_${s.id}`).classList.remove('open'); setVState(s.id, 'READY'); }
  renderRecordBar(); applyReadOnly(); runCheck(false); updateSbarNote();
}
function renderRecordBar() {
  const r = S.rec, v = r.values;
  $('#recTitle').textContent = v.patientName ? `${v.patientName}${v.patientId ? ` · ${v.patientId}` : ''}` : 'New patient';
  $('#recId').textContent = r.recordId;
  const st = $('#recStatus'); st.textContent = r.status; st.className = `status ${r.status}`;
  $('#recVer').textContent = r.version > 1 ? `· version ${r.version}` : '';
}
function applyReadOnly() {
  const ro = readOnly();
  $$('#sections input, #sections select, #sections textarea, #sections .tri button, #sections [data-dict], #sections [data-type], #sections [data-pop], #sections [data-now], #sections [data-act="sbar"]').forEach(el => { el.disabled = ro; });
  const note = $('#readonly');
  note.classList.toggle('hidden', !ro);
  if (ro) {
    note.innerHTML = `<div class="row"><span><b>${S.rec.status === 'FINAL' ? 'Finalised' : 'Archived'}</b> ${fmt(S.rec.finalizedAt)} - read only.</span><span class="spacer"></span>
      <button class="btn sm" type="button" data-act="amend">Amend record</button>${S.rec.status === 'FINAL' ? '<button class="btn sm line" type="button" data-act="archive">Move to archived</button>' : '<button class="btn sm line" type="button" data-act="unarchive">Restore to final</button>'}</div>`;
  }
  $('#aFinal').disabled = ro; $('#aSbar').disabled = ro; $('#aSave').disabled = ro;
}

function touch(id) {
  const m = S.rec.meta;
  if (!isEmpty(id, S.rec.values[id]) && !m.filledAt[id]) m.filledAt[id] = now();
  if (id !== 'sbar') m.lastEditAt = now();
  markDirty();
}
function markDirty() { S.dirty = true; setSave('Unsaved changes…'); }
function setSave(t) { $('#saveChip').textContent = t; }

function onFieldInput(id, value) {
  if (readOnly()) return;
  S.rec.values[id] = value;
  const prev = S.rec.meta.fields[id];
  S.rec.meta.fields[id] = { src: prev?.src === 'voice' || prev?.src === 'voice-edited' ? 'voice-edited' : 'manual', review: false, at: now() };
  touch(id); updateFieldMeta(id); scheduleCheck();
  if (['patientName', 'patientId'].includes(id)) renderRecordBar();
  if ((id === 'dropsGiven' && value.trim() || id === 'dilated' && value === 'Yes') && isEmpty('vaRE', S.rec.values.vaRE) && isEmpty('vaLE', S.rec.values.vaLE)) toast('VA first: record visual acuity before instilling drops.', 4000);
}
function normaliseTyped(id, v) {
  let s = String(v || '').trim();
  if (id === 'bp') s = s.replace(/\s*mm\s?hg\s*$/i, '').replace(/\s*(?:over|\/)\s*/i, '/');
  if (id === 'pulse') s = s.replace(/\s*(?:bpm|beats?\s*(?:\/|per)\s*min(?:ute)?)\s*$/i, '');
  if (id === 'weight') s = s.replace(/\s*(?:kg|kilo(?:gram)?s?)\s*$/i, '');
  if (id === 'iopRE' || id === 'iopLE') s = s.replace(/\s*mm\s?hg\s*$/i, '');
  if (id === 'sugar') { const u = s.match(/(mg\s*\/\s*dl|mmol\s*\/\s*l)\s*$/i); if (u) { const unit = /mmol/i.test(u[1]) ? 'mmol/L' : 'mg/dL'; setControl('sugarUnit', unit); onFieldInput('sugarUnit', unit); s = s.slice(0, u.index).trim(); } }
  if (/^va/.test(id)) s = s.replace(/^(\d+)\s*(?:over|\/)\s*(\d+)$/i, '$1/$2');
  return s;
}

function updateFieldMeta(id) {
  const w = $(`[data-field="${id}"]`); if (!w) return;
  const m = S.rec?.meta.fields[id];
  const voice = m && (m.src === 'voice') && !isEmpty(id, S.rec.values[id]);
  const review = !!(m?.review && !isEmpty(id, S.rec.values[id]));
  w.dataset.src = voice ? 'voice' : ''; w.dataset.review = review ? '1' : '';
  const box = $(`#m_${id}`);
  box.innerHTML = review ? `<span class="tag check">Check</span>${m.note ? `<span class="note">${esc(m.note)}</span>` : ''}<button type="button" data-confirm="${id}"${readOnly() ? ' disabled' : ''}>✓ Confirmed</button>`
    : voice ? `<span class="tag voice">From dictation</span>` : '';
}

// ── dictation (Bible §6) ──────────────────────────────────────────────
const voice = new Dictation({
  lang: prefs.lang,
  onState: (sec, st) => setVState(sec, st),
  onText: (sec, text, interim) => { $(`#t_${sec}`).value = text; $(`#i_${sec}`).textContent = interim ? `… ${interim}` : ''; },
  onLevel: (sec, level, silent, closed) => { const c = $(`#cv_${sec}`); if (c) drawMeter(c, closed ? 0 : level); $(`#sil_${sec}`).textContent = silent ? 'No sound reaching the mic - check it is not muted or covered.' : ''; },
  onError: (sec, msg) => { toast(msg, 6000); $(`#sum_${sec}`).textContent = msg; $(`#t_${sec}`).readOnly = false; },
});
function setVState(sec, st) {
  S.vstate[sec] = st;
  const card = $(`#sec-${sec}`); if (!card) return;
  card.dataset.vs = st;
  const label = st === 'READY' && !speechSupported ? 'Type to dictate' : STATES[st] || st;
  $(`#vs_${sec}`).textContent = label;
  const busy = ['STARTING', 'LISTENING', 'TRANSCRIBING', 'STOPPING'].includes(st);
  const ro = readOnly();
  for (const s of SECTIONS.filter(x => x.dictate)) {
    const otherBusy = voice.busy && voice.section !== s.id;
    $(`[data-dict="${s.id}"]`).disabled = ro || voice.busy || !speechSupported || otherBusy;
    $(`[data-stop="${s.id}"]`).disabled = !(voice.busy && voice.section === s.id);
  }
  $(`#t_${sec}`).readOnly = busy;
  if (!busy) { $(`#i_${sec}`).textContent = ''; $(`#sil_${sec}`).textContent = ''; }
  if (st === 'CAPTURED') { S.raw[sec] = $(`#t_${sec}`).value; $(`[data-pop="${sec}"]`).focus({ preventScroll: true }); }
}
async function startDictation(sec) {
  if (readOnly()) return;
  if (voice.busy) { toast(`Stop dictation in section ${voice.section} first.`); return; }
  $(`#tx_${sec}`).classList.add('open'); $(`#rv_${sec}`).innerHTML = ''; $(`#sum_${sec}`).textContent = '';
  voice.lang = prefs.lang;
  const ok = await voice.start(sec, $(`#t_${sec}`).value);
  if (!ok && !speechSupported) { toast('Voice dictation is not available in this browser - type or paste into the transcript box.', 5000); $(`#t_${sec}`).focus(); }
}

// ── review & populate (Bible §6.1 steps 8-10, §8) ─────────────────────
function populate(sec) {
  if (readOnly()) return;
  const text = $(`#t_${sec}`).value.trim();
  if (!text) { toast('Nothing to populate yet - dictate or type first.'); return; }
  const res = extract(sec, text, { values: S.rec.values });
  const rows = [];
  for (const c of res.candidates) {
    if (c.companion) continue;
    const cur = S.rec.values[c.field];
    const curSrc = S.rec.meta.fields[c.field]?.src;
    const same = String(cur ?? '') === String(c.value);
    const overwritesManual = !isEmpty(c.field, cur) && !same && curSrc && curSrc !== 'voice';
    let checked = !c.optional && c.conf !== 'low' && !overwritesManual && !same;
    const note = [c.note, overwritesManual ? `Would replace your entry "${cur}"` : '', same ? 'Already recorded' : ''].filter(Boolean).join(' · ');
    if (c.field === 'nurseNotes' || c.field === 'historyNotes' || c.field === 'examNotes') {
      if (c.optional && !isEmpty(c.field, cur)) c.value = `${cur}; ${c.value}`;
    }
    rows.push({ ...c, checked, note, cur, companions: (COMPANIONS[c.field] || []).map(id => res.candidates.find(x => x.field === id)).filter(Boolean) });
  }
  for (const k of res.conflicts) rows.push({ field: k.field, values: k.values, conf: 'low', note: k.note || 'Different values heard', heard: k.heard, checked: false, conflict: true, cur: S.rec.values[k.field], companions: (COMPANIONS[k.field] || []).map(id => res.candidates.find(x => x.field === id)).filter(Boolean) });
  S.review[sec] = { res, rows, text };
  renderReview(sec);
}
function valueControl(r, i) {
  const f = FIELD[r.field];
  if (r.conflict) return `<select data-rvv="${i}"><option value="">Choose the correct value…</option>${r.values.map(v => `<option>${esc(v)}</option>`).join('')}</select>`;
  if (f.type === 'tri') return `<select data-rvv="${i}">${['Yes', 'No', NA].map(o => `<option${o === r.value ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  if (f.type === 'select') return `<select data-rvv="${i}">${f.options.filter(Boolean).map(o => `<option${o === r.value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  return `<input type="text" data-rvv="${i}" value="${esc(r.value)}">`;
}
function renderReview(sec) {
  const { res, rows } = S.review[sec];
  const comp = r => (r.companions || []).map(c => c.value).filter(v => v && !['years'].includes(v)).join(' ');
  const unit = r => FIELD[r.field].unit ? ` ${FIELD[r.field].unit}` : r.field === 'sugar' ? '' : '';
  const issues = [
    ...res.unresolved.map(u => `<li><b>${esc(FIELD[u.field]?.label || u.field)}</b>: heard "${esc(u.heard)}" - ${esc(u.reason)}. Enter it manually.</li>`),
  ];
  $(`#rv_${sec}`).innerHTML = `<div class="review" role="region" aria-label="Review extracted values">
    <h4>Review before populating <span class="muted">${rows.length} value${rows.length === 1 ? '' : 's'} found${res.unresolved.length ? ` · ${res.unresolved.length} not understood` : ''}</span></h4>
    ${rows.length ? rows.map((r, i) => `<div class="rv-row">
      <input type="checkbox" data-rvc="${i}" ${r.checked ? 'checked' : ''} aria-label="Use this value for ${esc(FIELD[r.field].label)}">
      <div><b>${esc(FIELD[r.field].label)}</b>${FIELD[r.field].sec !== sec ? `<span class="secx">${FIELD[r.field].sec}</span>` : ''}<div class="heard">${r.heard ? `heard: "${esc(r.heard)}"` : ''}</div></div>
      <div class="val">${valueControl(r, i)}${comp(r) || unit(r) ? `<div class="heard">${esc(comp(r) || unit(r))}</div>` : ''}</div>
      <div class="meta"><span class="conf ${r.conf}">${r.conflict ? 'conflict' : r.conf === 'high' ? 'clear' : r.conf === 'medium' ? 'check' : 'unsure'}</span> <span class="heard">${esc(r.note || '')}</span>${!isEmpty(r.field, r.cur) ? `<div class="cur">now: ${esc(r.cur)}</div>` : ''}</div>
    </div>`).join('') : '<div class="rv-row" style="display:block">No field labels were recognised. Say the label before each value, e.g. "blood pressure 150 over 90".</div>'}
    ${issues.length ? `<ul class="rv-issues">${issues.join('')}</ul>` : ''}
    <div class="rv-actions"><button class="btn go" type="button" data-apply="${sec}">Populate selected fields</button><button class="btn line" type="button" data-cancelrv="${sec}">Cancel</button></div>
  </div>`;
}
async function applyReview(sec) {
  const R = S.review[sec]; if (!R) return;
  const applied = [];
  R.rows.forEach((r, i) => {
    if (!$(`[data-rvc="${i}"]`)?.checked) return;
    const val = $(`[data-rvv="${i}"]`)?.value;
    if (!val) return;
    const edited = !r.conflict && String(val) !== String(r.value);
    const conf = r.conflict ? 'medium' : edited ? 'high' : r.conf;
    setFromVoice(r.field, val, conf, r.conflict ? 'Chosen from conflicting values' : r.note && conf !== 'high' ? r.note : '');
    for (const c of r.companions || []) setFromVoice(c.field, c.value, 'high', '');
    applied.push(r.field);
  });
  const m = S.rec.meta;
  m.transcripts.push({ section: sec, raw: S.raw[sec] || null, reviewed: R.text, at: now(), lang: prefs.lang, engine: S.raw[sec] ? 'web-speech' : 'typed' });
  m.extractions.push({ section: sec, at: now(), candidates: R.res.candidates.map(({ field, value, conf, from }) => ({ field, value, conf, from })), conflicts: R.res.conflicts, unresolved: R.res.unresolved, unplaced: R.res.unplaced, applied });
  if (m.transcripts.length > 60) m.transcripts.splice(0, m.transcripts.length - 60);
  if (m.extractions.length > 60) m.extractions.splice(0, m.extractions.length - 60);
  await save(true);
  await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'voice populate', detail: `Section ${sec}: ${applied.length} field(s) - ${applied.map(id => FIELD[id].label).join(', ')}` });
  const needCheck = applied.filter(id => S.rec.meta.fields[id]?.review).length;
  $(`#rv_${sec}`).innerHTML = '';
  $(`#sum_${sec}`).textContent = `Populated ${applied.length} field${applied.length === 1 ? '' : 's'}${needCheck ? ` · ${needCheck} marked to check` : ''}${R.res.unresolved.length ? ` · ${R.res.unresolved.length} not understood` : ''}.`;
  setVState(sec, 'POPULATED');
  delete S.review[sec];
  renderRecordBar(); runCheck(false);
}
function setFromVoice(id, value, conf, note) {
  S.rec.values[id] = value; setControl(id, value);
  S.rec.meta.fields[id] = { src: 'voice', conf, note, review: conf !== 'high', at: now() };
  touch(id); updateFieldMeta(id);
}

// ── checks, red flags, emergency override (Bible §10) ─────────────────
let checkT;
function scheduleCheck() { clearTimeout(checkT); checkT = setTimeout(() => runCheck(false), 450); }
function runCheck(show) {
  const c = check(S.rec.values, S.rec.meta); S.lastCheck = c;
  const acks = S.rec.meta.flagAcks || {};
  // D. red flags
  $('#flagsOut').innerHTML = c.flags.length ? c.flags.map(f => `<div class="flag ${f.level}"><h4>${f.level === 'emergency' ? '🔴 Emergency' : '🟠 Urgent'}: ${esc(f.title)}</h4>
      <div class="ev">${esc(f.evidence)}</div><div><b>Action:</b> ${esc(f.action)}</div>
      ${acks[f.id] ? `<div class="ack">✓ Acknowledged ${fmt(acks[f.id].at)} by ${esc(acks[f.id].by)}${acks[f.id].to ? ` · escalated to ${esc(acks[f.id].to)}` : ''}</div>` : `<button class="btn sm stop" type="button" data-ack="${f.id}" style="margin-top:6px"${readOnly() ? ' disabled' : ''}>Acknowledge & escalate</button>`}</div>`).join('')
    : '<div class="noflags">No red-flag pattern detected from the recorded fields. Use clinical judgement and local protocol.</div>';
  // banner
  const un = c.flags.filter(f => !acks[f.id]);
  const ban = $('#emergency');
  if (un.length && !readOnly()) {
    const em = un.some(f => f.level === 'emergency');
    ban.className = 'emer'; if (!em) ban.style.background = '#a35a00'; else ban.style.background = '';
    ban.innerHTML = `<h2>${em ? 'Stop routine clerking' : 'Urgent escalation needed'}</h2><ul>${un.map(f => `<li><b>${esc(f.title)}</b> - ${esc(f.action)}</li>`).join('')}</ul><button class="btn sm" type="button" data-ack="${un[0].id}">Acknowledge & escalate</button>`;
  } else if (c.flags.length) {
    ban.className = 'emer acked'; ban.style.background = '';
    ban.innerHTML = `Red flag${c.flags.length > 1 ? 's' : ''} acknowledged: ${c.flags.map(f => `${esc(f.title)}${acks[f.id]?.to ? ` → ${esc(acks[f.id].to)}` : ''}`).join('; ')}`;
  } else ban.className = 'emer hidden';
  // the interrupt: an emergency flag opens a blocking dialog once (Golden rule 11)
  const fresh = un.find(f => f.level === 'emergency' && !S.flagShown.has(f.id));
  if (fresh && !readOnly() && !$('#dlg').open) { S.flagShown.add(fresh.id); ackFlag(fresh.id); }
  // nav progress
  const pr = sectionProgress(S.rec.values);
  for (const [s, p] of Object.entries(pr)) { const a = $(`[data-nav="${s}"]`); $(`#nv_${s}`).textContent = `${p.done}/${p.total}`; a.classList.toggle('done', p.done === p.total); }
  $('[data-nav="D"]').classList.toggle('flag', c.flags.length > 0); $('#nv_D').textContent = c.flags.length ? `${c.flags.length}` : '';
  $('#nv_check').textContent = `${c.score}%`;
  if (show || S.checkShown) renderCheck(c, show);
  return c;
}
function renderCheck(c, scroll) {
  S.checkShown = true;
  const li = (x, cls) => `<li><a href="#" data-goto="${x.field}">${esc(x.label)}</a>${x.why ? ` <span>${esc(x.why)}</span>` : ''}</li>`;
  const block = (title, list, cls) => list.length ? `<h4 style="margin:10px 0 2px">${title} (${list.length})</h4><ul class="chk-list ${cls}">${list.map(x => li(x, cls)).join('')}</ul>` : '';
  const emerUn = c.flags.filter(f => !S.rec.meta.flagAcks?.[f.id]);
  $('#checkOut').innerHTML = `<div class="score"><b>${c.score}%</b><div class="bar"><i style="width:${c.score}%"></i></div><span class="muted">essential fields</span></div>
    ${emerUn.length ? `<ul class="chk-list crit">${emerUn.map(f => `<li>🔴 <a href="#" data-ack="${f.id}">${esc(f.title)}</a> <span>not yet acknowledged</span></li>`).join('')}</ul>` : ''}
    ${block('Essential - missing', c.critical, 'crit')}
    ${block('Contradictions', c.contradictions, 'crit')}
    ${block('Voice values awaiting your check', c.pendingReview.map(x => ({ ...x, why: 'tap the field, then ✓ Confirmed' })), 'warn')}
    ${block('Expected for this presentation', c.conditional, 'warn')}
    ${block('Targeted questions not assessed', c.notAssessed, 'warn')}
    ${block('Recommended', c.recommended, 'info')}
    ${!emerUn.length && !c.critical.length && !c.contradictions.length && !c.pendingReview.length && !c.conditional.length && !c.notAssessed.length ? '<div class="noflags">Record is complete for handover.</div>' : ''}`;
  if (scroll) $('#checkCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function ackFlag(id) {
  const f = (S.lastCheck || runCheck(false)).flags.find(x => x.id === id); if (!f) return;
  const em = f.level === 'emergency';
  await dialog({
    title: em ? 'Stop routine clerking' : 'Urgent escalation', danger: true,
    body: `<p style="font-size:17px;margin-top:0"><b>${esc(f.title)}</b></p><p>${esc(f.evidence)}</p><p><b>Action:</b> ${esc(f.action)}</p>
      <label for="ackTo">Escalated to (doctor / unit)</label><input id="ackTo" placeholder="e.g. Dr Adeyemi, Emergency unit">
      ${S.rec.values.priority !== 'Emergency' && em ? '<label class="opt"><input type="checkbox" id="ackPri" checked> Set priority to Emergency</label>' : ''}
      <p class="muted">This is a prompt for the accountable nurse, not a diagnosis. Follow local protocol.</p>`,
    buttons: [{ label: 'Not now', cls: 'line', value: false }, {
      label: 'Acknowledge - escalating now', cls: 'stop', value: true, onClick: async () => {
        const to = $('#ackTo').value.trim();
        S.rec.meta.flagAcks[id] = { at: now(), by: S.nurse.id, to };
        if ($('#ackPri')?.checked) { setControl('priority', 'Emergency'); onFieldInput('priority', 'Emergency'); }
        await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'red flag acknowledged', detail: `${f.title}${to ? ` → ${to}` : ''}` });
        markDirty(); save(true); runCheck(false);
      },
    }],
  });
}

// ── SBAR ──────────────────────────────────────────────────────────────
async function generateSBAR() {
  if (readOnly()) return;
  const r = buildSBAR(S.rec.values, S.rec.meta, S.nurse);
  if (r.excluded.length) {
    const go = await confirmDlg('Some values are not yet verified', `These voice-populated fields are still marked to check and were left out of the summary: <b>${esc(r.excluded.join(', '))}</b>. Confirm them first for a complete handover, or generate without them.`, 'Generate without them');
    if (!go) return;
  }
  const m = S.rec.meta;
  if (S.rec.values.sbar && m.fields.sbar?.src === 'manual' && m.sbarText !== S.rec.values.sbar) {
    if (!(await confirmDlg('Replace your edited SBAR?', 'You have edited the SBAR by hand. Generating a new one will replace your edits.', 'Replace'))) return;
  }
  S.rec.values.sbar = r.text; setControl('sbar', r.text);
  m.fields.sbar = { src: 'generated', review: false, at: now() }; m.sbarAt = now(); m.sbarText = r.text;
  touch('sbar'); updateFieldMeta('sbar'); updateSbarNote();
  $('[data-field="sbar"]').scrollIntoView({ behavior: 'smooth', block: 'center' });
  await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'SBAR generated' });
}
function updateSbarNote() {
  const m = S.rec.meta, n = $('#sbarNote'); if (!n) return;
  n.textContent = m.sbarAt && m.lastEditAt && m.lastEditAt > m.sbarAt ? 'Record changed after this summary - regenerate before handover.' : m.sbarAt ? `Generated ${hhmm(m.sbarAt)}` : '';
  n.style.color = m.sbarAt && m.lastEditAt > m.sbarAt ? 'var(--review)' : '';
}

// ── save / lifecycle (Bible §13-14) ───────────────────────────────────
let saving = null;
async function save(silent = false) {
  if (!S.rec || !S.nurse) return;
  if (saving) await saving;
  saving = (async () => {
    const first = !(await db.getRecord(S.rec.recordId));
    S.rec.updatedAt = now();
    await db.putRecord(S.rec);
    await db.kvSet(`active:${S.nurse.id}`, S.rec.recordId);
    if (first) await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'record created' });
    if (!silent) await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'saved' });
    S.dirty = false; setSave(`Saved ${hhmm(S.rec.updatedAt)} · on this device`);
    renderArchive();
  })();
  try { await saving; if (!silent) toast('Progress saved on this device.'); } catch (e) { setSave('Save failed'); toast(`Could not save: ${e.message}`, 6000); } finally { saving = null; }
  updateSbarNote();
}
function hasContent(rec) { return FIELDS.some(f => !f.hidden && f.id !== 'priority' && !isEmpty(f.id, rec.values[f.id])); }

async function newPatient() {
  if (voice.busy) voice.stop();
  if (S.rec.status === 'DRAFT' && hasContent(S.rec)) { await save(true); toast('Previous draft kept in your archive.'); }
  loadRecord(newRecord(S.nurse)); setSave('New record · not saved yet');
  scrollTo({ top: 0, behavior: 'smooth' });
}
async function openRecord(id) {
  if (voice.busy) voice.stop();
  if (S.dirty || (S.rec.status === 'DRAFT' && hasContent(S.rec))) await save(true);
  const r = await db.getRecord(id); if (!r || r.staffId !== S.nurse.id) return;
  loadRecord(r); await db.kvSet(`active:${S.nurse.id}`, r.recordId);
  setSave(`Opened · saved ${hhmm(r.updatedAt)}`);
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function finalise() {
  if (readOnly()) return;
  if (voice.busy) voice.stop();
  const c = runCheck(false);
  const un = c.flags.filter(f => !S.rec.meta.flagAcks?.[f.id]);
  if (un.length) { toast('Acknowledge the red flags before finalising.', 4000); ackFlag(un[0].id); return; }
  const issues = [...c.critical.map(x => `Missing: ${x.label}`), ...c.contradictions.map(x => `${x.label}: ${x.why}`)];
  const pend = c.pendingReview;
  let body = '<p>Once finalised the record is read-only. Later changes need an amendment, which keeps the earlier version.</p>';
  if (pend.length) body += `<h4>Voice values not yet confirmed (${pend.length})</h4><p class="muted">${esc(pend.map(p => p.label).join(', '))}</p><label class="opt"><input type="checkbox" id="fnRev"> I have reviewed these values against the patient and they are correct.</label>`;
  if (issues.length) body += `<h4>Outstanding issues</h4><ul class="chk-list crit">${issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul><label for="fnWhy">Reason for finalising anyway (recorded in the audit trail)</label><textarea id="fnWhy" rows="2"></textarea>`;
  const mm = S.rec.meta, stale = mm.sbarAt && (mm.lastEditAt > mm.sbarAt || pend.length);
  if (!S.rec.values.sbar) body += '<p class="muted">An SBAR summary will be generated from the verified fields.</p>';
  else if (stale && mm.fields.sbar?.src === 'generated') body += '<p class="muted">The SBAR is older than the record and will be regenerated from the verified fields.</p>';
  else if (stale) body += '<p class="callout">You edited the SBAR by hand and the record has changed since. Check it still matches before finalising.</p>';
  const ok = await dialog({
    title: 'Finalise & archive', body, buttons: [{ label: 'Cancel', cls: 'line', value: false }, {
      label: 'Finalise', value: true, onClick: () => {
        if (pend.length && !$('#fnRev').checked) { toast('Tick the review confirmation, or confirm each field first.'); return false; }
        if (issues.length && $('#fnWhy').value.trim().length < 5) { toast('Give a short reason for finalising with outstanding issues.'); return false; }
        S._fin = { why: issues.length ? $('#fnWhy').value.trim() : '', bulk: pend.length };
      },
    }],
  });
  if (!ok) return;
  const m = S.rec.meta;
  if (S._fin.bulk) { for (const p of pend) { m.fields[p.field].review = false; m.fields[p.field].confirmedAt = now(); updateFieldMeta(p.field); } await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'bulk review confirmed', detail: pend.map(p => p.label).join(', ') }); }
  if (S._fin.why) { m.overrides.push({ at: now(), by: S.nurse.id, issues, reason: S._fin.why }); await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'finalised with override', detail: `${S._fin.why} | ${issues.join('; ')}` }); }
  const sbarStale = m.sbarAt && (m.lastEditAt > m.sbarAt || S._fin.bulk);
  if (S.rec.values.sbar && sbarStale && m.fields.sbar?.src === 'generated') S.rec.values.sbar = '';
  if (!S.rec.values.sbar) { const r = buildSBAR(S.rec.values, m, S.nurse); S.rec.values.sbar = r.text; setControl('sbar', r.text); m.sbarAt = now(); m.sbarText = r.text; m.fields.sbar = { src: 'generated', review: false }; }
  S.rec.status = 'FINAL'; S.rec.finalizedAt = now();
  await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'finalised', detail: `version ${S.rec.version}` });
  await save(true); renderRecordBar(); applyReadOnly(); runCheck(false);
  toast('Record finalised and archived on this device.');
}
async function amend() {
  let reason = '';
  const ok = await dialog({ title: 'Amend finalised record', body: '<p>The current version is kept in the record history. Say why it is being amended.</p><label for="amWhy">Reason</label><textarea id="amWhy" rows="2"></textarea>',
    buttons: [{ label: 'Cancel', cls: 'line', value: false }, { label: 'Start amendment', value: true, onClick: () => { reason = $('#amWhy').value.trim(); if (reason.length < 3) { toast('Give a reason.'); return false; } } }] });
  if (!ok) return;
  const r = S.rec;
  r.history.push({ version: r.version, status: r.status, finalizedAt: r.finalizedAt, savedAt: r.updatedAt, values: { ...r.values }, flagAcks: { ...r.meta.flagAcks } });
  r.version += 1; r.status = 'DRAFT'; r.finalizedAt = null;
  await db.audit({ recordId: r.recordId, staffId: S.nurse.id, action: 'amendment started', detail: `v${r.version - 1} → v${r.version}: ${reason}` });
  await save(true); loadRecord(r);
}
async function setStatus(st) {
  S.rec.status = st; await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: st === 'ARCHIVED' ? 'moved to archived' : 'restored to final' });
  await save(true); renderRecordBar(); applyReadOnly(); runCheck(false);
}
async function deleteDraft(id) {
  const r = await db.getRecord(id); if (!r || r.status !== 'DRAFT' || r.staffId !== S.nurse.id) return;
  if (!(await confirmDlg('Delete this draft?', `Draft ${esc(r.recordId)}${r.values.patientName ? ` for ${esc(r.values.patientName)}` : ''} will be removed from this device. Finalised records cannot be deleted.`, 'Delete draft', 'stop'))) return;
  await db.deleteRecord(id); await db.audit({ recordId: id, staffId: S.nurse.id, action: 'draft deleted' });
  if (S.rec.recordId === id) { loadRecord(newRecord(S.nurse)); setSave('New record · not saved yet'); }
  renderArchive();
}

// ── archive ───────────────────────────────────────────────────────────
let archT;
function renderArchive() { clearTimeout(archT); archT = setTimeout(renderArchiveNow, 120); }
async function renderArchiveNow() {
  if (!S.nurse) return;
  const q = $('#archQ').value.trim().toLowerCase(), f = $('#archF').value;
  let list = (await db.recordsFor(S.nurse.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  list = list.filter(r => f === 'all' || (f === 'open' ? r.status !== 'ARCHIVED' : r.status === f));
  if (q) list = list.filter(r => [r.values.patientName, r.values.patientId, r.recordId].join(' ').toLowerCase().includes(q));
  list = list.filter(r => hasContent(r) || r.recordId === S.rec?.recordId);
  $('#archList').innerHTML = list.length ? `<table><thead><tr><th>Updated</th><th>Patient</th><th>Status</th><th></th></tr></thead><tbody>${list.map(r => {
    const fl = (() => { try { return check(r.values, r.meta).flags.length; } catch { return 0; } })();
    return `<tr${r.recordId === S.rec?.recordId ? ' style="background:var(--navy-tint)"' : ''}><td>${fmt(r.updatedAt)}</td><td><b>${esc(r.values.patientName || '(no name)')}</b><br><span class="muted">${esc(r.values.patientId || '')} · ${esc(r.recordId)}</span></td>
      <td><span class="status ${r.status}">${r.status}</span>${r.version > 1 ? ` v${r.version}` : ''}${fl ? ` <span title="Red flags">🔴${fl}</span>` : ''}</td>
      <td style="white-space:nowrap"><button class="btn sm ghost" type="button" data-open="${r.recordId}">Open</button>${r.status === 'DRAFT' ? ` <button class="btn sm line" type="button" data-del="${r.recordId}" aria-label="Delete draft">✕</button>` : ''}</td></tr>`;
  }).join('')}</tbody></table>` : `<p class="muted">${q || f !== 'open' ? 'No records match.' : 'No records yet. Your saved drafts and finalised records will appear here.'}</p>`;
}

// ── output: print, PDF, share (Bible §15) ─────────────────────────────
async function doPrint() {
  const c = runCheck(false);
  const audit = (await db.auditFor(S.rec.recordId)).filter(a => !['saved'].includes(a.action));
  $('#printView').innerHTML = printHTML(S.rec, c, audit);
  await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'printed' });
  setTimeout(() => print(), 50);
}
async function doPDF(deidentify = false) {
  try {
    const blob = await makePDF(S.rec, runCheck(false), { deidentify });
    const name = `${S.rec.recordId}${deidentify ? '-deid' : ''}.pdf`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'PDF downloaded', detail: deidentify ? 'de-identified' : 'identified' });
    return blob;
  } catch (e) { toast(`PDF failed: ${e.message}`, 5000); }
}
async function doShare() {
  const draft = S.rec.status === 'DRAFT';
  const canFile = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }));
  await dialog({
    title: 'Share record',
    body: `${draft ? '<p class="callout">This record is still a draft. Share a finalised record for handover where possible.</p>' : ''}
      <div class="lbl">What to share</div>
      <label class="opt"><input type="radio" name="shWhat" value="sbar" ${S.rec.values.sbar ? 'checked' : 'disabled'}> SBAR handover text${S.rec.values.sbar ? '' : ' (generate SBAR first)'}</label>
      <label class="opt"><input type="radio" name="shWhat" value="summary" ${S.rec.values.sbar ? '' : 'checked'}> Full record as text</label>
      <label class="opt"><input type="radio" name="shWhat" value="pdf"> PDF file</label>
      <label class="opt"><input type="checkbox" id="shDeid" checked> <span>De-identify: initials only, last 3 characters of the hospital number, no phone number</span></label>
      <p class="muted">${navigator.onLine ? '' : 'You are offline. WhatsApp and email will send when the connection returns; the record stays saved here. '}Share only through channels your institution permits for patient information.</p>`,
    buttons: [
      { label: 'Cancel', cls: 'line', value: null },
      { label: 'Copy', cls: 'line', onClick: () => sendVia('copy') },
      { label: 'Email', cls: 'line', onClick: () => sendVia('email') },
      { label: 'WhatsApp', cls: 'go', onClick: () => sendVia('whatsapp') },
      { label: 'Share…', onClick: () => sendVia('native', canFile) },
    ],
  });
}
async function sendVia(channel, canFile) {
  const what = $('input[name="shWhat"]:checked')?.value || 'summary', deid = $('#shDeid').checked;
  if (what === 'pdf') {
    if (channel === 'native' && canFile) {
      const blob = await makePDF(S.rec, runCheck(false), { deidentify: deid });
      const file = new File([blob], `${S.rec.recordId}${deid ? '-deid' : ''}.pdf`, { type: 'application/pdf' });
      try { await navigator.share({ files: [file], title: `OphthaCheck ${S.rec.recordId}` }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing was cancelled or failed.'); return false; }
    } else if (channel === 'native' || channel === 'copy') { await doPDF(deid); toast('PDF downloaded - attach it from your files.'); }
    else { toast('WhatsApp and email links cannot attach files. Use Share… or download the PDF.', 4500); return false; }
  } else {
    const text = shareText(S.rec, { deidentify: deid, mode: what });
    if (channel === 'copy') { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard.'); } catch { toast('Copy failed - select and copy from the SBAR box.'); return false; } }
    else if (channel === 'whatsapp') open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    else if (channel === 'email') location.href = `mailto:?subject=${encodeURIComponent(`OphthaCheck handover ${S.rec.recordId}`)}&body=${encodeURIComponent(text)}`;
    else if (navigator.share) { try { await navigator.share({ title: `OphthaCheck ${S.rec.recordId}`, text }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing failed.'); return false; } }
    else { try { await navigator.clipboard.writeText(text); toast('This browser has no share sheet - text copied instead.'); } catch { return false; } }
  }
  await db.audit({ recordId: S.rec.recordId, staffId: S.nurse.id, action: 'shared', detail: `${channel} · ${what} · ${deid ? 'de-identified' : 'identified'}` });
}

// ── settings, export/import, lock ─────────────────────────────────────
async function settings() {
  const persisted = await (navigator.storage?.persisted?.() ?? Promise.resolve(false)).catch(() => false);
  const est = await (navigator.storage?.estimate?.() ?? Promise.resolve(null)).catch(() => null);
  await dialog({
    title: `${S.nurse.name}`,
    body: `<p class="muted" style="margin-top:0">${esc(S.nurse.rank || 'Nurse')} · Staff ID ${esc(S.nurse.id)} · signed in ${fmt(S.nurse.clockIn)}</p>
      <div class="form-grid">
        <div><label for="stLang">Speech recognition language</label><select id="stLang">${[['en-GB', 'English (UK)'], ['en-NG', 'English (Nigeria)'], ['en-US', 'English (US)'], ['en-GH', 'English (Ghana)'], ['en-ZA', 'English (South Africa)']].map(([v, l]) => `<option value="${v}"${prefs.lang === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label for="stLock">Lock after inactivity</label><select id="stLock">${[5, 10, 15, 30, 0].map(m => `<option value="${m}"${+prefs.lockMin === m ? ' selected' : ''}>${m ? `${m} minutes` : 'Never'}</option>`).join('')}</select></div>
      </div>
      <h4>Data on this device</h4>
      <p class="muted">Records are stored only in this browser${persisted ? ' (protected from automatic clearing)' : ' (the browser may clear them if storage runs low - export regularly)'}${est ? ` · ${(est.usage / 1024).toFixed(0)} KB used` : ''}. Sync status: <b>local only</b> - no server is configured in this version.</p>
      <div class="row"><button class="btn sm ghost" type="button" id="stExport">Export my records</button><label class="btn sm line" style="margin:0">Import records<input type="file" id="stImport" accept="application/json" class="sr"></label></div>
      <h4>Testing</h4><p class="muted"><a href="evaluate.html">Open the synthetic-case evaluation bench</a> to measure extraction accuracy (Bible §20).</p>`,
    buttons: [{ label: 'Sign out', cls: 'line', onClick: signOut }, { label: 'Lock now', cls: 'line', onClick: () => { lock(); } }, { label: 'Done', value: true, onClick: () => { prefs.lang = $('#stLang').value; prefs.lockMin = +$('#stLock').value; savePrefs(); voice.lang = prefs.lang; } }],
    onOpen: () => { $('#stExport').onclick = exportData; $('#stImport').onchange = importData; },
  });
}
async function exportData() {
  await save(true);
  const records = await db.recordsFor(S.nurse.id), audit = await db.auditByStaff(S.nurse.id);
  const blob = new Blob([JSON.stringify({ app: 'OphthaCheck', version: VERSION, exportedAt: now(), staffId: S.nurse.id, nurseName: S.nurse.name, records, audit }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ophthacheck-${S.nurse.id}-${now().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
  await db.audit({ staffId: S.nurse.id, action: 'records exported', detail: `${records.length} record(s)` });
  toast(`Exported ${records.length} record(s). Keep the file somewhere secure.`);
}
async function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'OphthaCheck' || !Array.isArray(data.records)) throw new Error('Not an OphthaCheck export file.');
    if (data.staffId !== S.nurse.id) throw new Error(`This file belongs to staff ID ${data.staffId}. Sign in as that nurse to import it.`);
    let n = 0;
    for (const r of data.records) { const ex = await db.getRecord(r.recordId); if (!ex || ex.updatedAt < r.updatedAt) { await db.putRecord(r); n++; } }
    await db.audit({ staffId: S.nurse.id, action: 'records imported', detail: `${n} of ${data.records.length}` });
    toast(`Imported ${n} record(s).`); renderArchive();
  } catch (err) { toast(err.message, 6000); }
}
async function signOut() {
  if (voice.busy) voice.stop();
  if (S.dirty || (S.rec?.status === 'DRAFT' && hasContent(S.rec))) await save(true);
  await db.audit({ staffId: S.nurse.id, action: 'signed out' });
  sessionStorage.removeItem(SESSION); location.reload();
}
function idleCheck() {
  if (S.locked || !S.nurse || !+prefs.lockMin || voice.busy) return;
  if (Date.now() - S.lastActivity > prefs.lockMin * 60000) lock();
}
async function lock() {
  if (S.dirty) await save(true);
  S.locked = true; $('#dlg').open && $('#dlg').close();
  $('#lockWho').textContent = `${S.nurse.name} (${S.nurse.id}) · your work is saved.`;
  $('#lock').classList.remove('hidden'); $('#lockPin').value = ''; $('#lockErr').textContent = ''; $('#lockPin').focus();
}

// ── event wiring ──────────────────────────────────────────────────────
function bindApp() {
  const sec = $('#sections');
  sec.addEventListener('input', e => {
    const id = e.target.id?.startsWith('f_') && e.target.id.slice(2);
    if (id && FIELD[id]) { onFieldInput(id, e.target.value); if (id === 'sbar') updateSbarNote(); }
  });
  sec.addEventListener('change', e => {
    const id = e.target.id?.startsWith('f_') && e.target.id.slice(2);
    if (id && FIELD[id] && e.target.tagName === 'INPUT') { const n = normaliseTyped(id, e.target.value); if (n !== e.target.value) { e.target.value = n; onFieldInput(id, n); } }
    else if (id && FIELD[id]) onFieldInput(id, e.target.value);
  });
  sec.addEventListener('click', e => {
    const t = e.target.closest('button, a'); if (!t) return;
    const tri = t.closest('.tri');
    if (tri && t.dataset.v) { const id = tri.id.slice(2); setControl(id, t.dataset.v); onFieldInput(id, t.dataset.v); return; }
    const d = t.dataset;
    if (d.dict) startDictation(d.dict);
    else if (d.stop) { voice.stop(); }
    else if (d.type) { const tx = $(`#tx_${d.type}`); tx.classList.toggle('open'); if (tx.classList.contains('open')) $(`#t_${d.type}`).focus(); }
    else if (d.pop) { if (voice.busy && voice.section === d.pop) { voice.stop(); setTimeout(() => populate(d.pop), 600); } else populate(d.pop); }
    else if (d.clear) { $(`#t_${d.clear}`).value = ''; $(`#rv_${d.clear}`).innerHTML = ''; $(`#sum_${d.clear}`).textContent = ''; delete S.raw[d.clear]; if (!voice.busy) setVState(d.clear, 'READY'); }
    else if (d.apply) applyReview(d.apply);
    else if (d.cancelrv) { $(`#rv_${d.cancelrv}`).innerHTML = ''; delete S.review[d.cancelrv]; }
    else if (d.confirm) { const m = S.rec.meta.fields[d.confirm]; if (m) { m.review = false; m.confirmedAt = now(); S.rec.meta.lastEditAt = now(); } updateFieldMeta(d.confirm); updateSbarNote(); markDirty(); scheduleCheck(); }
    else if (d.now) { const v = new Date().toTimeString().slice(0, 5); setControl(d.now, v); onFieldInput(d.now, v); }
    else if (d.act === 'sbar') generateSBAR();
    else if (d.act === 'copySbar') navigator.clipboard?.writeText(S.rec.values.sbar || '').then(() => toast('SBAR copied.'), () => toast('Copy failed.'));
    else if (d.ack) ackFlag(d.ack);
  });
  // review panel: editing a value ticks its box
  sec.addEventListener('input', e => { const i = e.target.dataset?.rvv; if (i !== undefined) { const cb = $(`[data-rvc="${i}"]`); if (cb && e.target.value) cb.checked = true; } });
  sec.addEventListener('change', e => { const i = e.target.dataset?.rvv; if (i !== undefined) { const cb = $(`[data-rvc="${i}"]`); if (cb) cb.checked = !!e.target.value; } });

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-goto], [data-ack], [data-act], [data-open], [data-del]'); if (!t || t.closest('#sections')) return;
    const d = t.dataset;
    if (d.goto) { e.preventDefault(); goto(d.goto); }
    else if (d.ack) ackFlag(d.ack);
    else if (d.act === 'amend') amend();
    else if (d.act === 'archive') setStatus('ARCHIVED');
    else if (d.act === 'unarchive') setStatus('FINAL');
    else if (d.open) openRecord(d.open);
    else if (d.del) deleteDraft(d.del);
  });
  $('#btnNew').onclick = newPatient;
  $('#btnRecheck').onclick = () => runCheck(true);
  $('#aSave').onclick = () => save(false);
  $('#aCheck').onclick = () => runCheck(true);
  $('#aSbar').onclick = generateSBAR;
  $('#aFinal').onclick = finalise;
  $('#aPrint').onclick = doPrint;
  $('#aPdf').onclick = () => doPDF(false);
  $('#aShare').onclick = doShare;
  $('#nurseChip').onclick = settings;
  $('#archQ').oninput = renderArchive; $('#archF').onchange = renderArchive;
  $('#lockForm').onsubmit = async e => {
    e.preventDefault(); const p = await db.getProfile(S.nurse.id);
    if (await verifyPin(p, $('#lockPin').value)) { S.locked = false; S.lastActivity = Date.now(); $('#lock').classList.add('hidden'); }
    else { $('#lockErr').textContent = 'Wrong PIN.'; await db.audit({ staffId: S.nurse.id, action: 'unlock failed' }); }
  };
  $('#lockSwitch').onclick = signOut;
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, () => { S.lastActivity = Date.now(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.dirty) save(true); });
  addEventListener('pagehide', () => { if (S.dirty) save(true); });
  addEventListener('beforeunload', e => { if (S.dirty) { save(true); } });
}
function goto(id) {
  const w = $(`[data-field="${id}"]`); if (!w) return;
  w.scrollIntoView({ behavior: 'smooth', block: 'center' });
  w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash');
  setTimeout(() => (w.querySelector('input, select, textarea, button'))?.focus({ preventScroll: true }), 350);
}

boot();
