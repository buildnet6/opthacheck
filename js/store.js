// Offline-first persistence (Bible §13, §14, Layer 7): IndexedDB for profiles, records and the audit trail.
// Everything lives on this device. Nothing is sent anywhere; "sync" is reported honestly as local-only.

import { blankValues, FIELD } from './schema.js';

const DB_NAME = 'ophthacheck', DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('records')) { const s = db.createObjectStore('records', { keyPath: 'recordId' }); s.createIndex('staffId', 'staffId'); }
      if (!db.objectStoreNames.contains('audit')) { const s = db.createObjectStore('audit', { keyPath: 'seq', autoIncrement: true }); s.createIndex('recordId', 'recordId'); s.createIndex('staffId', 'staffId'); }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out; const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const all = (store, index, key) => tx(store, 'readonly', s => (index ? s.index(index).getAll(key) : s.getAll()));

export const db = {
  getProfile: id => tx('profiles', 'readonly', s => s.get(id)),
  putProfile: p => tx('profiles', 'readwrite', s => s.put(p)),
  profiles: () => all('profiles'),
  getRecord: id => tx('records', 'readonly', s => s.get(id)),
  putRecord: r => tx('records', 'readwrite', s => s.put(r)),
  deleteRecord: id => tx('records', 'readwrite', s => s.delete(id)),
  recordsFor: staffId => all('records', 'staffId', staffId),
  audit: (e) => tx('audit', 'readwrite', s => s.add({ at: new Date().toISOString(), ...e })),
  auditFor: recordId => all('audit', 'recordId', recordId),
  auditByStaff: staffId => all('audit', 'staffId', staffId),
  kvGet: k => tx('kv', 'readonly', s => s.get(k)),
  kvSet: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
};

// ── identity: PIN is never stored, only a salted PBKDF2 hash ───────────
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export async function hashPin(pin, saltHex) {
  if (!crypto?.subtle) throw new Error('Secure context required (open the app over https).');
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
  return { salt: hex(salt), hash: hex(bits) };
}
export async function verifyPin(profile, pin) {
  if (!profile?.hash) return false;
  const { hash } = await hashPin(pin, profile.salt);
  return hash === profile.hash;
}

// ── record model ──────────────────────────────────────────────────────
export function newRecord(nurse) {
  const now = new Date().toISOString();
  return {
    recordId: `OC-${now.slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    staffId: nurse.id, nurseName: nurse.name, nurseRank: nurse.rank || '',
    status: 'DRAFT', version: 1, createdAt: now, updatedAt: now, finalizedAt: null,
    sync: 'local', // honest: no server is configured in this build
    values: blankValues(),
    meta: { fields: {}, filledAt: {}, transcripts: [], extractions: [], flagAcks: {}, overrides: [], sbarAt: null },
    history: [],
  };
}

// ── migration from v0.5/v0.6 localStorage (plaintext PINs, flat records) ──
export async function migrateLegacy() {
  if (await db.kvGet('migratedV06')) return 0;
  let n = 0;
  try {
    const profiles = JSON.parse(localStorage.getItem('oc5_profiles') || '[]');
    for (const p of profiles) {
      if (!p?.id || await db.getProfile(p.id)) continue;
      const h = p.pin ? await hashPin(String(p.pin)) : {};
      await db.putProfile({ id: p.id, name: p.name, rank: '', ...h, createdAt: new Date().toISOString(), migrated: true });
    }
    const recs = JSON.parse(localStorage.getItem('oc5_records') || '[]');
    const map = { comorbidity: 'otherComorbid', observations: 'examNotes', vaPH: 'vaPHRE', external: 'lids', simpleTests: 'eyeMovements', dilation: 'dilationAgent', flashes: 'flashes', halos: 'halos', headache: 'headache', trauma: 'traumaDetail', history: 'medicalHx', family: 'familyHx', severity: 'severity' };
    for (const old of recs) {
      if (!old?.staffId) continue;
      const r = newRecord({ id: old.staffId, name: old.nurseName });
      r.recordId = `OC-LEGACY-${old.recordId}`;
      if (await db.getRecord(r.recordId)) continue;
      r.createdAt = old.clockIn || old.updatedAt || r.createdAt;
      r.updatedAt = old.updatedAt || old.savedAt || r.updatedAt;
      r.status = old.status === 'FINAL' ? 'FINAL' : 'DRAFT';
      for (const [k, val] of Object.entries(old)) {
        if (val === undefined || val === null || val === '') continue;
        const id = FIELD[k] && !map[k] ? k : map[k];
        if (!id || !FIELD[id]) continue;
        let v = String(val);
        if (['bp', 'sugar', 'pulse', 'weight'].includes(id)) v = v.replace(/\s*(mmHg|mg\/dL|mmol\/L|BPM|kg)\s*$/i, '').trim();
        const f = FIELD[id];
        if (f.type === 'tri' && !['Yes', 'No', 'Not assessed'].includes(v)) { // old free-text yes/no fields
          const detail = f.detail; if (detail) r.values[detail] = v; r.values[id] = /^no\b/i.test(v) ? 'No' : 'Yes';
        } else r.values[id] = v;
      }
      if (/diabet/i.test(old.comorbidity || '') && !/no known diabet/i.test(old.comorbidity)) r.values.dm = 'Yes';
      if (/hypertens/i.test(old.comorbidity || '') && !/no known hypertens/i.test(old.comorbidity)) r.values.htn = 'Yes';
      r.meta.migratedFrom = 'v0.6 localStorage';
      await db.putRecord(r);
      await db.audit({ recordId: r.recordId, staffId: r.staffId, action: 'migrated', detail: 'Imported from v0.6 local storage' });
      n++;
    }
    // remove plaintext PINs; keep legacy records key as a fallback copy
    if (profiles.length) localStorage.setItem('oc5_profiles', JSON.stringify(profiles.map(({ pin, ...p }) => p)));
  } catch (e) { console.warn('Legacy migration skipped', e); }
  await db.kvSet('migratedV06', new Date().toISOString());
  return n;
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); return true; } catch { return false; }
}
