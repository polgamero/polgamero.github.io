// Argentinia · Santuario Stage 11 — lectura local de Sellos / GTIN.
// Prioridad: BarcodeDetector nativo. Fallback: ZXing Browser UMD cargado sólo si hace falta.
// Este módulo NO consulta Functions, NO resuelve cartas, NO crea bindings y NO consume cooldown.

export const SANCTUARY_BARCODE_STAGE = 11;
export const SANCTUARY_BARCODE_SCAN_INTERVAL_MS = 220;
export const SANCTUARY_BARCODE_STABLE_HITS = 2;
export const SANCTUARY_BARCODE_STABLE_WINDOW_MS = 1600;

export const SANCTUARY_NATIVE_BARCODE_FORMATS = Object.freeze([
  'ean_8',
  'ean_13',
  'upc_a',
  'itf'
]);

const ZXING_CDN_URLS = Object.freeze([
  'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js',
  'https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js'
]);

let zxingLoadPromise = null;

export function sanctuaryGtinCheckDigit(raw) {
  const digits = String(raw ?? '').replace(/[\s-]+/g, '');
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return null;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(body[i]) * weight;
  }
  return String((10 - (sum % 10)) % 10);
}

export function normalizeSanctuaryGtin(raw) {
  const digits = String(raw ?? '').replace(/[\s-]+/g, '');
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return '';
  const expected = sanctuaryGtinCheckDigit(digits);
  if (expected === null || digits.at(-1) !== expected) return '';
  return digits.padStart(14, '0');
}

export function isSanctuaryGtinLike(raw) {
  return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(String(raw ?? '').replace(/[\s-]+/g, ''));
}

export function sanctuaryBarcodeCandidate(rawValue, format = '') {
  const raw = String(rawValue ?? '').trim();
  const normalizedGtin = normalizeSanctuaryGtin(raw);
  return {
    rawValue: raw,
    format: String(format || '').toLowerCase(),
    gtinLike: isSanctuaryGtinLike(raw),
    valid: !!normalizedGtin,
    gtin14: normalizedGtin
  };
}

export function createStableBarcodeGate({ hitsRequired = SANCTUARY_BARCODE_STABLE_HITS, windowMs = SANCTUARY_BARCODE_STABLE_WINDOW_MS } = {}) {
  const required = Math.max(1, Math.floor(Number(hitsRequired) || 1));
  const window = Math.max(250, Math.floor(Number(windowMs) || SANCTUARY_BARCODE_STABLE_WINDOW_MS));
  let value = '';
  let hits = 0;
  let firstAt = 0;
  return {
    reset() { value = ''; hits = 0; firstAt = 0; },
    push(candidate, now = Date.now()) {
      const gtin = String(candidate?.gtin14 || '');
      if (!gtin) { this.reset(); return false; }
      if (gtin !== value || !firstAt || now - firstAt > window) {
        value = gtin;
        hits = 1;
        firstAt = now;
        return required <= 1;
      }
      hits += 1;
      return hits >= required;
    },
    snapshot() { return { value, hits, firstAt }; }
  };
}

export async function supportedNativeSanctuaryBarcodeFormats(BarcodeDetectorCtor = globalThis?.BarcodeDetector) {
  if (typeof BarcodeDetectorCtor !== 'function') return [];
  try {
    if (typeof BarcodeDetectorCtor.getSupportedFormats !== 'function') return [...SANCTUARY_NATIVE_BARCODE_FORMATS];
    const supported = await BarcodeDetectorCtor.getSupportedFormats();
    const set = new Set((Array.isArray(supported) ? supported : []).map(value => String(value).toLowerCase()));
    return SANCTUARY_NATIVE_BARCODE_FORMATS.filter(format => set.has(format));
  } catch {
    return [];
  }
}

export async function createNativeSanctuaryBarcodeDetector(BarcodeDetectorCtor = globalThis?.BarcodeDetector) {
  const formats = await supportedNativeSanctuaryBarcodeFormats(BarcodeDetectorCtor);
  if (!formats.length || typeof BarcodeDetectorCtor !== 'function') return null;
  try {
    return { detector: new BarcodeDetectorCtor({ formats }), formats };
  } catch {
    try { return { detector: new BarcodeDetectorCtor(), formats }; } catch { return null; }
  }
}

function loadExternalScript(url, doc = globalThis?.document) {
  return new Promise((resolve, reject) => {
    if (!doc?.createElement || !doc?.head) { reject(new Error('SANCTUARY_ZXING_DOCUMENT_UNAVAILABLE')); return; }
    const existing = [...doc.querySelectorAll?.('script[data-sanctuary-zxing]') || []].find(node => node.src === url);
    if (existing?.dataset?.loaded === 'true') { resolve(); return; }
    const script = existing || doc.createElement('script');
    if (!existing) {
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.dataset.sanctuaryZxing = 'true';
      doc.head.appendChild(script);
    }
    const done = () => { script.dataset.loaded = 'true'; resolve(); };
    const fail = () => reject(new Error(`SANCTUARY_ZXING_LOAD_FAILED:${url}`));
    script.addEventListener('load', done, { once:true });
    script.addEventListener('error', fail, { once:true });
  });
}

export async function loadSanctuaryZxing({ globalRef = globalThis, documentRef = globalThis?.document } = {}) {
  if (globalRef?.ZXingBrowser?.BrowserMultiFormatReader) return globalRef.ZXingBrowser;
  if (zxingLoadPromise) return zxingLoadPromise;
  zxingLoadPromise = (async () => {
    let lastError = null;
    for (const url of ZXING_CDN_URLS) {
      try {
        await loadExternalScript(url, documentRef);
        if (globalRef?.ZXingBrowser?.BrowserMultiFormatReader) return globalRef.ZXingBrowser;
      } catch (error) { lastError = error; }
    }
    zxingLoadPromise = null;
    throw lastError || new Error('SANCTUARY_ZXING_UNAVAILABLE');
  })();
  return zxingLoadPromise;
}

function barcodeResultText(result) {
  try { if (typeof result?.getText === 'function') return String(result.getText() || ''); } catch {}
  return String(result?.text ?? result?.rawValue ?? '');
}

function barcodeResultFormat(result, zxing) {
  try {
    const raw = typeof result?.getBarcodeFormat === 'function' ? result.getBarcodeFormat() : result?.format;
    if (typeof raw === 'string') return raw;
    const enumObj = zxing?.BarcodeFormat;
    if (enumObj && raw != null && enumObj[raw] != null) return String(enumObj[raw]);
    return String(raw ?? '');
  } catch { return ''; }
}

export async function startSanctuaryBarcodeScan({
  video,
  onEngine = null,
  onCandidate = null,
  onInvalid = null,
  onFound = null,
  onError = null,
  intervalMs = SANCTUARY_BARCODE_SCAN_INTERVAL_MS,
  BarcodeDetectorCtor = globalThis?.BarcodeDetector,
  globalRef = globalThis,
  documentRef = globalThis?.document
} = {}) {
  if (!video) throw new Error('SANCTUARY_BARCODE_VIDEO_REQUIRED');
  let stopped = false;
  let timer = null;
  let zxingControls = null;
  const stable = createStableBarcodeGate();

  const emit = (rawValue, format, engine) => {
    if (stopped) return;
    const candidate = sanctuaryBarcodeCandidate(rawValue, format);
    onCandidate?.({ ...candidate, engine });
    if (!candidate.valid) {
      if (candidate.gtinLike) onInvalid?.({ ...candidate, engine });
      return;
    }
    if (!stable.push(candidate)) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    try { zxingControls?.stop?.(); } catch {}
    onFound?.({ ...candidate, engine });
  };

  const native = await createNativeSanctuaryBarcodeDetector(BarcodeDetectorCtor);
  if (native?.detector) {
    const engine = 'barcode_detector';
    onEngine?.({ engine, formats:native.formats });
    const scan = async () => {
      if (stopped) return;
      try {
        const results = await native.detector.detect(video);
        for (const result of Array.isArray(results) ? results : []) {
          emit(result?.rawValue, result?.format, engine);
          if (stopped) return;
        }
      } catch (error) {
        // Un frame ilegible no mata el scanner. Sólo errores estructurales se reportan.
        const name = String(error?.name || '');
        if (name === 'NotSupportedError' || name === 'SecurityError') {
          stopped = true;
          onError?.(error);
          return;
        }
      }
      timer = setTimeout(scan, Math.max(90, Number(intervalMs) || SANCTUARY_BARCODE_SCAN_INTERVAL_MS));
    };
    timer = setTimeout(scan, 80);
    return {
      engine,
      stop() { stopped = true; if (timer) clearTimeout(timer); stable.reset(); }
    };
  }

  onEngine?.({ engine:'zxing_loading', formats:[] });
  const zxing = await loadSanctuaryZxing({ globalRef, documentRef });
  const Reader = zxing?.BrowserMultiFormatReader;
  if (typeof Reader !== 'function') throw new Error('SANCTUARY_ZXING_READER_UNAVAILABLE');
  const engine = 'zxing';
  onEngine?.({ engine, formats:['EAN_8','EAN_13','UPC_A','ITF'] });
  const reader = new Reader();
  try {
    zxingControls = await reader.decodeFromVideoElement(video, (result, error) => {
      if (stopped) return;
      if (result) emit(barcodeResultText(result), barcodeResultFormat(result, zxing), engine);
      // NotFound durante el scan continuo es normal y no se reporta.
      if (error && String(error?.name || '').includes('NotFound')) return;
    });
  } catch (error) {
    stopped = true;
    onError?.(error);
    throw error;
  }
  return {
    engine,
    stop() { stopped = true; stable.reset(); try { zxingControls?.stop?.(); } catch {} }
  };
}

export function stopSanctuaryBarcodeScan(scanner) {
  try { scanner?.stop?.(); } catch {}
}
