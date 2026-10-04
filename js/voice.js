// Section-local dictation (Bible §6.1, §23). One section listens at a time, with an unmistakable state:
// READY → STARTING → LISTENING ⇄ TRANSCRIBING → STOPPING → CAPTURED (→ POPULATED, set by the app)
// plus UNAVAILABLE / ERROR. The microphone meter is drawn inside the section that is listening.

export const STATES = {
  READY: 'Ready', STARTING: 'Starting mic…', LISTENING: 'Listening', TRANSCRIBING: 'Transcribing',
  STOPPING: 'Stopping…', CAPTURED: 'Captured - review', POPULATED: 'Populated', UNAVAILABLE: 'Voice unavailable', ERROR: 'Mic problem',
};

const Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const speechSupported = !!Rec;
const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

export class Dictation {
  constructor({ lang = 'en-GB', onState, onText, onLevel, onError }) {
    Object.assign(this, { lang, onState, onText, onLevel, onError });
    this.section = null; this.state = 'READY'; this.base = ''; this.sessionFinals = []; this.interim = '';
    this.stopRequested = false; this.rec = null; this.stream = null; this.ac = null; this.raf = null; this.meterOff = false; this.silentSince = null;
  }
  get busy() { return ['STARTING', 'LISTENING', 'TRANSCRIBING', 'STOPPING'].includes(this.state); }
  set(state, extra) { this.state = state; this.onState?.(this.section, state, extra); }
  text() { return [this.base, this.sessionFinals.join(' ')].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }

  /** existing: text already in the section's transcript box - new speech is appended to it */
  async start(section, existing = '') {
    if (!Rec) { this.section = section; this.set('UNAVAILABLE'); return false; }
    if (this.busy) return false;
    this.section = section; this.base = existing.trim(); this.sessionFinals = []; this.interim = ''; this.stopRequested = false;
    this.set('STARTING');
    // the meter is helpful but never allowed to block dictation (permission prompts / suspended audio)
    try { await Promise.race([this.openMeter(), new Promise((_, rej) => setTimeout(() => rej(new Error('meter timeout')), 4000))]); }
    catch (e) { this.meterOff = true; if (/denied|not allowed|permission/i.test(e?.message || e?.name || '')) { this.onError?.(section, 'Microphone permission was refused. Allow the microphone for this site in the browser settings.'); this.set('ERROR'); return false; } }
    if (this.stopRequested) { this.closeMeter(); this.set(this.text() ? 'CAPTURED' : 'READY'); return false; }
    this.launch();
    return true;
  }
  launch() {
    if (this.stopRequested) return;
    // commit the previous recognition session's finals before starting another (Chrome ends sessions on silence)
    if (this.sessionFinals.length) { this.base = this.text(); this.sessionFinals = []; }
    const r = new Rec();
    this.rec = r; r.lang = this.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => this.set('LISTENING');
    r.onresult = e => {
      // rebuild this session's finals from scratch each event: avoids Android's cumulative-duplicate bug
      const finals = []; let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (!t) continue;
        if (e.results[i].isFinal) {
          if (isAndroid && finals.length && t.startsWith(finals[finals.length - 1])) finals[finals.length - 1] = t;
          else finals.push(t);
        } else interim = t;
      }
      this.sessionFinals = finals; this.interim = interim;
      this.set(interim ? 'TRANSCRIBING' : 'LISTENING');
      this.onText?.(this.section, this.text(), interim);
    };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend restarts
      if (e.error === 'audio-capture' && !this.meterOff) { this.closeMeter(); this.meterOff = true; return; } // meter may be holding the mic
      this.stopRequested = true;
      this.onError?.(this.section, e.error === 'not-allowed' ? 'Microphone permission was refused. Allow the microphone for this site in the browser settings.'
        : e.error === 'network' ? 'This browser needs an internet connection for speech recognition. Type into the transcript box instead - saving still works offline.'
          : `Speech recognition error: ${e.error}`);
      this.set('ERROR', e.error);
    };
    r.onend = () => {
      this.rec = null;
      if (!this.stopRequested) { setTimeout(() => this.launch(), 200); return; }
      this.closeMeter();
      if (this.state !== 'ERROR') this.set(this.text() ? 'CAPTURED' : 'READY');
    };
    try { r.start(); } catch { if (!this.stopRequested) setTimeout(() => this.launch(), 400); }
  }
  stop() {
    if (!this.busy) return;
    this.stopRequested = true; this.set('STOPPING');
    if (this.interim) { this.sessionFinals.push(this.interim); this.interim = ''; this.onText?.(this.section, this.text(), ''); }
    if (this.rec) { try { this.rec.stop(); } catch { this.closeMeter(); this.set(this.text() ? 'CAPTURED' : 'READY'); } }
    else { this.closeMeter(); this.set(this.text() ? 'CAPTURED' : 'READY'); }
    setTimeout(() => { if (this.state === 'STOPPING') { this.closeMeter(); this.set(this.text() ? 'CAPTURED' : 'READY'); } }, 2500);
  }
  async openMeter() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ac = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ac.state === 'suspended') await this.ac.resume();
    const an = this.ac.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.7;
    this.ac.createMediaStreamSource(this.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (const b of buf) { const n = (b - 128) / 128; sum += n * n; }
      const db = Math.max(-60, 20 * Math.log10(Math.max(Math.sqrt(sum / buf.length), 1e-5)));
      const level = Math.max(0, Math.min(1, (db + 60) / 50));
      if (level < 0.08) { this.silentSince ??= Date.now(); } else this.silentSince = null;
      this.onLevel?.(this.section, level, this.silentSince && Date.now() - this.silentSince > 5000);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  closeMeter() {
    if (this.raf) cancelAnimationFrame(this.raf); this.raf = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.ac?.close().catch(() => {}); this.ac = null; this.silentSince = null;
    this.onLevel?.(this.section, 0, false, true);
  }
}

/** Draw the compact level meter into a canvas. */
export function drawMeter(canvas, level) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, bars = 28, gap = 2;
  const bw = (w - gap * (bars - 1)) / bars;
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < bars; i++) {
    const on = level >= ((i + 1) / bars) * 0.75, bh = 3 + (h - 4) * (0.35 + 0.65 * (i + 1) / bars);
    ctx.fillStyle = i < 18 ? '#2fbf71' : i < 24 ? '#f2c94c' : '#ff5a4f';
    ctx.globalAlpha = on ? 1 : 0.16;
    ctx.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
  }
  ctx.globalAlpha = 1;
}
