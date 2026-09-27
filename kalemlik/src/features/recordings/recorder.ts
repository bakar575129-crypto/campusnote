// Ders kaydı motoru: mikrofon → MediaRecorder (duraklat / devam / bitir). Destekleyen tarayıcılarda (Chrome, Edge,
// Safari) kayıtla birlikte canlı konuşma tanıma: zaman damgalı transkript. Ses dosyası küçük tutulur (~32 kbit/s).

export interface LiveLine {t: number; text: string}
export const recordingSupported = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
type SR = {lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; abort(): void; onresult: ((e: {resultIndex: number; results: ArrayLike<{isFinal: boolean; 0: {transcript: string}}>}) => void) | null; onend: (() => void) | null; onerror: ((e: {error: string}) => void) | null};
const SpeechRec = (): (new () => SR) | null => (window as unknown as {SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR}).SpeechRecognition || (window as unknown as {webkitSpeechRecognition?: new () => SR}).webkitSpeechRecognition || null;
export const liveTranscriptSupported = () => !!SpeechRec();

function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}

export class LectureRecorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  private sr: SR | null = null;
  private srWanted = false;
  lines: LiveLine[] = [];
  interim = '';
  onChange: () => void = () => {};

  get state(): 'idle' | 'recording' | 'paused' { return this.rec ? (this.rec.state === 'paused' ? 'paused' : 'recording') : 'idle'; }
  /** Kayıt süresi (duraklatılan süre hariç), milisaniye. */
  elapsed() {
    if (!this.startedAt) return 0;
    const now = this.pausedAt || Date.now();
    return Math.max(0, now - this.startedAt - this.pausedTotal);
  }

  async start(opts: {live: boolean; lang: string}) {
    this.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}});
    const mimeType = pickMime();
    this.rec = new MediaRecorder(this.stream, {...(mimeType ? {mimeType} : {}), audioBitsPerSecond: 32000});
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start(5000); // 5 sn'de bir parça: uzun kayıtta bellek dengeli, beklenmedik kapanışta kayıp az
    this.startedAt = Date.now();
    this.pausedTotal = 0; this.pausedAt = 0;
    if (opts.live) this.startLive(opts.lang);
    this.onChange();
  }

  private startLive(lang: string) {
    const Ctor = SpeechRec();
    if (!Ctor) return;
    this.srWanted = true;
    const sr = new Ctor();
    sr.lang = lang === 'en' ? 'en-US' : 'tr-TR';
    sr.continuous = true;
    sr.interimResults = true;
    sr.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const text = r[0].transcript.trim(); if (text) this.lines.push({t: this.elapsed(), text}); }
        else interim += r[0].transcript;
      }
      this.interim = interim;
      this.onChange();
    };
    // Tarayıcı bir süre sessizlikten sonra tanımayı kapatır; kayıt sürdükçe yeniden başlatılır.
    sr.onend = () => { if (this.srWanted && this.state === 'recording') { try { sr.start(); } catch { /* zaten açık */ } } };
    sr.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.srWanted = false; };
    try { sr.start(); this.sr = sr; } catch { this.sr = null; }
  }

  pause() {
    if (this.rec?.state !== 'recording') return;
    this.rec.pause();
    this.pausedAt = Date.now();
    try { this.sr?.stop(); } catch { /* yok */ }
    this.onChange();
  }
  resume() {
    if (this.rec?.state !== 'paused') return;
    this.rec.resume();
    this.pausedTotal += Date.now() - this.pausedAt;
    this.pausedAt = 0;
    try { this.sr?.start(); } catch { /* yok */ }
    this.onChange();
  }

  /** Kaydı bitirir; ses dosyası ve süre döner. */
  stop(): Promise<{blob: Blob; durationMs: number; mime: string}> {
    return new Promise((resolve, reject) => {
      const rec = this.rec;
      if (!rec) { reject(new Error('Kayıt yok')); return; }
      const durationMs = this.elapsed();
      this.srWanted = false;
      try { this.sr?.stop(); } catch { /* yok */ }
      rec.onstop = () => {
        const mime = rec.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, {type: mime});
        this.release();
        resolve({blob, durationMs, mime});
      };
      if (this.interim.trim()) { this.lines.push({t: durationMs, text: this.interim.trim()}); this.interim = ''; }
      rec.stop();
    });
  }

  /** Kaydı iptal eder (mikrofon kapanır). */
  cancel() { this.srWanted = false; try { this.sr?.abort(); } catch { /* yok */ } try { this.rec?.stop(); } catch { /* yok */ } this.release(); }
  private release() { this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.rec = null; this.onChange(); }
}

export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};
export const linesToTranscript = (lines: LiveLine[]) => lines.map(l => `[${clock(l.t)}] ${l.text}`).join('\n');
