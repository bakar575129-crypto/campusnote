// Cihazda el yazısı tanıma: internet ve API anahtarı gerekmez (Tesseract + Türkçe dil verisi, WebAssembly).
// Düzgün, ayrık yazılmış el yazısında iyi sonuç verir; emin olamadığında el yazısı korunur.
import type Tesseract from 'tesseract.js';

let workerJob: Promise<Tesseract.Worker> | null = null;
let psm: string | null = null;

export const deviceOcrSupported = () => typeof WebAssembly === 'object' && typeof Worker !== 'undefined';

function getWorker(onProgress?: (p: number) => void) {
  if (!workerJob) {
    workerJob = (async () => {
      const T = await import('tesseract.js');
      return T.createWorker('tur', T.OEM.LSTM_ONLY, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/',
        langPath: '/ocr',
        gzip: true,
        workerBlobURL: false,
        logger: m => { if (m.status?.includes('loading') && typeof m.progress === 'number') onProgress?.(m.progress); },
      });
    })();
    workerJob.catch(() => { workerJob = null; });
  }
  return workerJob;
}

/** Tanıma motorunu önceden hazırlar (ilk kullanımda dil verisi indirilip cihazda saklanır). */
export function warmDeviceOcr() { if (deviceOcrSupported()) void getWorker().catch(() => {}); }

export interface DeviceResult {text: string; confidence: number}

/** Görüntüdeki el yazısını okur. confidence: 0–100 (düşükse sonuç güvenilmez). */
export async function recognizeOnDevice(dataUrl: string, mode: 'word' | 'block'): Promise<DeviceResult> {
  const worker = await getWorker();
  const want = mode === 'word' ? '7' : '6'; // 7 = tek satır, 6 = tek metin bloğu
  if (psm !== want) {
    await worker.setParameters({tessedit_pageseg_mode: want as Tesseract.PSM, preserve_interword_spaces: '1'});
    psm = want;
  }
  const {data} = await worker.recognize(dataUrl);
  const text = data.text.replace(/[|_~^`]+/g, '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  return {text, confidence: data.confidence};
}

/** Metin gerçek bir yazı mı yoksa gürültü mü? (çok kısa/sembol ağırlıklı sonuçları eler) */
export function plausibleText(r: DeviceResult, minConfidence = 62) {
  const letters = (r.text.match(/[\p{L}\p{N}]/gu) || []).length;
  return r.confidence >= minConfidence && letters >= 1 && letters / Math.max(1, r.text.replace(/\s/g, '').length) >= 0.6;
}

// Tanılama: "klm:debug" açıkken konsoldan/testten doğrudan denenebilir.
try { if (localStorage.getItem('klm:debug')) (window as unknown as Record<string, unknown>).__klmDeviceOcr = recognizeOnDevice; } catch { /* yok */ }
