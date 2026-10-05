// Argentinia · Santuario Stage 16 — Resonancia local: firma visual canónica V1.
// Procesa frames exclusivamente en Canvas local. NO sube imágenes, NO llama Functions,
// NO crea bindings, claims ni consume cooldown. Stage 17 resolverá esta firma server-side.

export const SANCTUARY_RESONANCE_STAGE = 16;
export const SANCTUARY_RESONANCE_COLOR_ALGORITHM = 'resonance-color-v1';
export const SANCTUARY_RESONANCE_ALGORITHM = 'resonance-v1';
export const SANCTUARY_RESONANCE_SAMPLE_WIDTH = 32;
export const SANCTUARY_RESONANCE_SAMPLE_HEIGHT = 24;
export const SANCTUARY_RESONANCE_CENTER_WEIGHT = 0.70;
export const SANCTUARY_RESONANCE_SCAN_INTERVAL_MS = 360;
export const SANCTUARY_RESONANCE_STABLE_HITS = 3;
export const SANCTUARY_RESONANCE_STABLE_WINDOW_MS = 2600;
export const SANCTUARY_RESONANCE_MIN_CONFIDENCE = 0.055;
export const SANCTUARY_RESONANCE_FEATURE_LEVELS = 4;
export const SANCTUARY_RESONANCE_AFFINITIES = Object.freeze(['W','U','B','R','G']);

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function circularHueDistance(a, b) {
  const delta = Math.abs(Number(a) - Number(b)) % 360;
  return Math.min(delta, 360 - delta);
}

function hueMembership(hue, center, width) {
  const distance = circularHueDistance(hue, center);
  return clamp01(1 - (distance / Math.max(1, width)));
}

function rgbHue(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta <= 1e-8) return 0;
  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * (((b - r) / delta) + 2);
  else hue = 60 * (((r - g) / delta) + 4);
  return (hue + 360) % 360;
}

export function quantizeSanctuaryResonance01(value, levels = 16) {
  const bins = Math.max(2, Math.min(256, Math.floor(Number(levels) || 16)));
  const v = clamp01(value);
  return Math.min(bins - 1, Math.floor(v * bins));
}

function normalizedAffinityVector(scores) {
  const total = SANCTUARY_RESONANCE_AFFINITIES.reduce((sum, key) => sum + Math.max(0, Number(scores[key]) || 0), 0);
  if (total <= 1e-12) return { W:0.2, U:0.2, B:0.2, R:0.2, G:0.2 };
  return Object.fromEntries(SANCTUARY_RESONANCE_AFFINITIES.map(key => [key, Math.max(0, Number(scores[key]) || 0) / total]));
}

function colorSignature(affinity, vector, confidence) {
  const bins = Object.fromEntries(SANCTUARY_RESONANCE_AFFINITIES.map(key => [key, quantizeSanctuaryResonance01(vector[key], 16)]));
  const confidenceBin = quantizeSanctuaryResonance01(confidence, 4);
  const packed = SANCTUARY_RESONANCE_AFFINITIES.map(key => `${key}${String(bins[key]).padStart(2,'0')}`).join('');
  return {
    bins,
    confidenceBin,
    signature: `RC1:${affinity}:${packed}:C${confidenceBin}`
  };
}

function centerPixelBounds(width, height) {
  // Centro rectangular de 50% x 50%. Su aporte agregado se fuerza al 70%; la periferia al 30%.
  return { minX:width * 0.25, maxX:width * 0.75, minY:height * 0.25, maxY:height * 0.75 };
}

function buildWeightMap(width, height, data, centerWeight) {
  const boundedCenterWeight = Math.max(0.5, Math.min(0.9, Number(centerWeight) || SANCTUARY_RESONANCE_CENTER_WEIGHT));
  const bounds = centerPixelBounds(width, height);
  let centerCount = 0;
  let borderCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = x + 0.5 >= bounds.minX && x + 0.5 <= bounds.maxX && y + 0.5 >= bounds.minY && y + 0.5 <= bounds.maxY;
      if (center) centerCount += 1; else borderCount += 1;
    }
  }
  centerCount = Math.max(1, centerCount);
  borderCount = Math.max(1, borderCount);
  const centerPixelWeight = boundedCenterWeight / centerCount;
  const borderPixelWeight = (1 - boundedCenterWeight) / borderCount;
  const weights = new Float64Array(width * height);
  let totalWeight = 0;
  let visiblePixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const alpha = (Number(data[pixel * 4 + 3]) || 0) / 255;
      if (alpha <= 0.02) continue;
      const center = x + 0.5 >= bounds.minX && x + 0.5 <= bounds.maxX && y + 0.5 >= bounds.minY && y + 0.5 <= bounds.maxY;
      const weight = (center ? centerPixelWeight : borderPixelWeight) * alpha;
      weights[pixel] = weight;
      totalWeight += weight;
      visiblePixels += 1;
    }
  }
  return { bounds, weights, totalWeight, visiblePixels, centerWeight:boundedCenterWeight };
}

function validateImageData(imageData) {
  const data = imageData?.data;
  const width = Math.max(1, Math.floor(Number(imageData?.width) || 0));
  const height = Math.max(1, Math.floor(Number(imageData?.height) || 0));
  if (!data || typeof data.length !== 'number' || data.length < width * height * 4) {
    throw new Error('SANCTUARY_RESONANCE_IMAGE_DATA_INVALID');
  }
  return { data, width, height };
}

export function analyzeSanctuaryResonanceColor(imageData, { centerWeight = SANCTUARY_RESONANCE_CENTER_WEIGHT } = {}) {
  const { data, width, height } = validateImageData(imageData);
  const map = buildWeightMap(width, height, data, centerWeight);
  if (!map.visiblePixels || map.totalWeight <= 1e-8) throw new Error('SANCTUARY_RESONANCE_EMPTY_FRAME');

  const scores = { W:0, U:0, B:0, R:0, G:0 };
  let weightedBrightness = 0;
  let weightedSaturation = 0;
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const weight = map.weights[pixel];
      if (weight <= 0) continue;
      const index = pixel * 4;
      const r = (Number(data[index]) || 0) / 255;
      const g = (Number(data[index + 1]) || 0) / 255;
      const b = (Number(data[index + 2]) || 0) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const saturation = max > 1e-8 ? chroma / max : 0;
      const luma = clamp01((0.2126 * r) + (0.7152 * g) + (0.0722 * b));
      const hue = rgbHue(r, g, b);

      const neutral = 1 - saturation;
      const whiteScore = smoothstep(0.42, 0.92, luma) * (0.28 + 0.72 * neutral);
      const blackScore = (1 - smoothstep(0.13, 0.48, luma)) * (0.58 + 0.42 * neutral);
      const chromaStrength = saturation * (0.42 + 0.58 * smoothstep(0.08, 0.72, luma));
      const redHue = Math.max(hueMembership(hue, 0, 82), hueMembership(hue, 34, 72));
      const greenHue = hueMembership(hue, 120, 82);
      const blueHue = Math.max(hueMembership(hue, 205, 100), hueMembership(hue, 185, 82));

      scores.W += whiteScore * weight;
      scores.B += blackScore * weight;
      scores.R += redHue * chromaStrength * weight;
      scores.G += greenHue * chromaStrength * weight;
      scores.U += blueHue * chromaStrength * weight;
      weightedBrightness += luma * weight;
      weightedSaturation += saturation * weight;
      weightedR += r * weight;
      weightedG += g * weight;
      weightedB += b * weight;
    }
  }

  const vector = normalizedAffinityVector(scores);
  const ranking = SANCTUARY_RESONANCE_AFFINITIES
    .map((affinity, order) => ({ affinity, score:vector[affinity], order }))
    .sort((a,b) => (b.score - a.score) || (a.order - b.order));
  const affinity = ranking[0]?.affinity || 'W';
  const top = ranking[0]?.score || 0;
  const second = ranking[1]?.score || 0;
  const confidence = clamp01((top - second) / Math.max(top, 1e-8));
  const quantized = colorSignature(affinity, vector, confidence);

  return Object.freeze({
    stage: SANCTUARY_RESONANCE_STAGE,
    algorithmVersion: SANCTUARY_RESONANCE_COLOR_ALGORITHM,
    affinity,
    confidence,
    confidenceBin: quantized.confidenceBin,
    stableEnough: confidence >= SANCTUARY_RESONANCE_MIN_CONFIDENCE,
    colorSignature: quantized.signature,
    affinityVector: Object.freeze({ ...vector }),
    affinityBins: Object.freeze({ ...quantized.bins }),
    brightness: clamp01(weightedBrightness / map.totalWeight),
    saturation: clamp01(weightedSaturation / map.totalWeight),
    averageRgb: Object.freeze({
      r: clamp01(weightedR / map.totalWeight),
      g: clamp01(weightedG / map.totalWeight),
      b: clamp01(weightedB / map.totalWeight)
    }),
    sample: Object.freeze({ width, height, centerWeight:map.centerWeight, visiblePixels:map.visiblePixels })
  });
}

function luminancePlane(imageData, centerWeight = SANCTUARY_RESONANCE_CENTER_WEIGHT) {
  const { data, width, height } = validateImageData(imageData);
  const map = buildWeightMap(width, height, data, centerWeight);
  if (!map.visiblePixels || map.totalWeight <= 1e-8) throw new Error('SANCTUARY_RESONANCE_EMPTY_FRAME');
  const luma = new Float64Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    const alpha = (Number(data[p + 3]) || 0) / 255;
    if (alpha <= 0.02) continue;
    luma[i] = clamp01((0.2126 * (Number(data[p]) || 0) + 0.7152 * (Number(data[p + 1]) || 0) + 0.0722 * (Number(data[p + 2]) || 0)) / 255);
  }
  return { ...map, width, height, luma };
}

function weightedPairMeanAbs(plane, pairs) {
  let sum = 0;
  let weightSum = 0;
  for (const [a,b] of pairs) {
    const wa = plane.weights[a] || 0;
    const wb = plane.weights[b] || 0;
    if (wa <= 0 || wb <= 0) continue;
    const w = (wa + wb) / 2;
    sum += Math.abs(plane.luma[a] - plane.luma[b]) * w;
    weightSum += w;
  }
  return weightSum > 1e-12 ? clamp01(sum / weightSum) : 0;
}

export function analyzeSanctuaryResonanceSecondary(imageData, { centerWeight = SANCTUARY_RESONANCE_CENTER_WEIGHT } = {}) {
  const plane = luminancePlane(imageData, centerWeight);
  const { width, height, luma, weights, totalWeight } = plane;

  let brightness = 0;
  for (let i = 0; i < luma.length; i += 1) brightness += luma[i] * weights[i];
  brightness = clamp01(brightness / totalWeight);

  let variance = 0;
  for (let i = 0; i < luma.length; i += 1) {
    if (weights[i] <= 0) continue;
    const d = luma[i] - brightness;
    variance += d * d * weights[i];
  }
  const contrast = clamp01(Math.sqrt(Math.max(0, variance / totalWeight)) * 2);

  const edgePairs = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (x + 1 < width) edgePairs.push([i, i + 1]);
      if (y + 1 < height) edgePairs.push([i, i + width]);
    }
  }
  // Un gradiente promedio de ~0.5 ya representa una escena muy marcada.
  const edges = clamp01(weightedPairMeanAbs(plane, edgePairs) * 2);

  const histogram = new Float64Array(16);
  let histTotal = 0;
  for (let i = 0; i < luma.length; i += 1) {
    const w = weights[i];
    if (w <= 0) continue;
    const bin = Math.min(15, Math.floor(clamp01(luma[i]) * 16));
    histogram[bin] += w;
    histTotal += w;
  }
  let entropyBits = 0;
  if (histTotal > 1e-12) {
    for (const count of histogram) {
      if (count <= 0) continue;
      const p = count / histTotal;
      entropyBits -= p * Math.log2(p);
    }
  }
  const entropy = clamp01(entropyBits / Math.log2(histogram.length));

  const horizontalPairs = [];
  const verticalPairs = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < Math.floor(width / 2); x += 1) {
      horizontalPairs.push([y * width + x, y * width + (width - 1 - x)]);
    }
  }
  for (let y = 0; y < Math.floor(height / 2); y += 1) {
    for (let x = 0; x < width; x += 1) {
      verticalPairs.push([y * width + x, (height - 1 - y) * width + x]);
    }
  }
  const horizontalSymmetry = 1 - weightedPairMeanAbs(plane, horizontalPairs);
  const verticalSymmetry = 1 - weightedPairMeanAbs(plane, verticalPairs);
  const symmetry = clamp01((horizontalSymmetry + verticalSymmetry) / 2);

  const levels = SANCTUARY_RESONANCE_FEATURE_LEVELS;
  const bins = Object.freeze({
    brightness: quantizeSanctuaryResonance01(brightness, levels),
    contrast: quantizeSanctuaryResonance01(contrast, levels),
    edges: quantizeSanctuaryResonance01(edges, levels),
    entropy: quantizeSanctuaryResonance01(entropy, levels),
    symmetry: quantizeSanctuaryResonance01(symmetry, levels)
  });
  return Object.freeze({
    brightness,
    contrast,
    edges,
    entropy,
    symmetry,
    bins,
    horizontalSymmetry:clamp01(horizontalSymmetry),
    verticalSymmetry:clamp01(verticalSymmetry)
  });
}

export function buildSanctuaryResonanceSignature(affinity, secondaryBins) {
  const a = String(affinity || '').toUpperCase();
  if (!SANCTUARY_RESONANCE_AFFINITIES.includes(a)) throw new Error('SANCTUARY_RESONANCE_AFFINITY_INVALID');
  const bounded = name => Math.max(0, Math.min(SANCTUARY_RESONANCE_FEATURE_LEVELS - 1, Math.floor(Number(secondaryBins?.[name]) || 0)));
  return `RV1:${a}:Y${bounded('brightness')}:K${bounded('contrast')}:E${bounded('edges')}:H${bounded('entropy')}:S${bounded('symmetry')}`;
}

export function analyzeSanctuaryResonanceFrame(imageData, options = {}) {
  const color = analyzeSanctuaryResonanceColor(imageData, options);
  const secondary = analyzeSanctuaryResonanceSecondary(imageData, options);
  const resonanceSignature = buildSanctuaryResonanceSignature(color.affinity, secondary.bins);
  return Object.freeze({
    ...color,
    stage: SANCTUARY_RESONANCE_STAGE,
    algorithmVersion: SANCTUARY_RESONANCE_ALGORITHM,
    colorAlgorithmVersion: SANCTUARY_RESONANCE_COLOR_ALGORITHM,
    resonanceSignature,
    secondary,
    secondaryBins:secondary.bins,
    stabilityKey:resonanceSignature
  });
}

export function createSanctuaryResonanceGate({
  hitsRequired = SANCTUARY_RESONANCE_STABLE_HITS,
  windowMs = SANCTUARY_RESONANCE_STABLE_WINDOW_MS,
  minConfidence = SANCTUARY_RESONANCE_MIN_CONFIDENCE
} = {}) {
  const required = Math.max(1, Math.floor(Number(hitsRequired) || SANCTUARY_RESONANCE_STABLE_HITS));
  const window = Math.max(500, Math.floor(Number(windowMs) || SANCTUARY_RESONANCE_STABLE_WINDOW_MS));
  const confidenceFloor = clamp01(minConfidence);
  let key = '';
  let hits = 0;
  let firstAt = 0;
  let latest = null;
  return {
    reset() { key = ''; hits = 0; firstAt = 0; latest = null; },
    push(result, now = Date.now()) {
      const affinity = String(result?.affinity || '');
      const nextKey = String(result?.stabilityKey || result?.resonanceSignature || '');
      const confidence = Number(result?.confidence) || 0;
      if (!SANCTUARY_RESONANCE_AFFINITIES.includes(affinity) || !nextKey || confidence < confidenceFloor) {
        this.reset();
        return false;
      }
      if (nextKey !== key || !firstAt || now - firstAt > window) {
        key = nextKey;
        hits = 1;
        firstAt = now;
        latest = result;
        return required <= 1;
      }
      hits += 1;
      latest = result;
      return hits >= required;
    },
    snapshot() { return { key, hits, firstAt, latest }; }
  };
}

// Alias Stage 15 conservado para contratos históricos y tests de afinidad cromática.
export function createSanctuaryResonanceColorGate(options = {}) {
  const required = Math.max(1, Math.floor(Number(options.hitsRequired) || SANCTUARY_RESONANCE_STABLE_HITS));
  const window = Math.max(500, Math.floor(Number(options.windowMs) || SANCTUARY_RESONANCE_STABLE_WINDOW_MS));
  const confidenceFloor = clamp01(options.minConfidence ?? SANCTUARY_RESONANCE_MIN_CONFIDENCE);
  let affinity = '';
  let hits = 0;
  let firstAt = 0;
  let latest = null;
  return {
    reset() { affinity = ''; hits = 0; firstAt = 0; latest = null; },
    push(result, now = Date.now()) {
      const nextAffinity = SANCTUARY_RESONANCE_AFFINITIES.includes(String(result?.affinity || '')) ? String(result.affinity) : '';
      const confidence = Number(result?.confidence) || 0;
      if (!nextAffinity || confidence < confidenceFloor) { this.reset(); return false; }
      if (nextAffinity !== affinity || !firstAt || now - firstAt > window) {
        affinity = nextAffinity; hits = 1; firstAt = now; latest = result; return required <= 1;
      }
      hits += 1; latest = result; return hits >= required;
    },
    snapshot() { return { affinity, hits, firstAt, latest }; }
  };
}

function createLocalCanvas(documentRef, width, height) {
  if (typeof globalThis?.OffscreenCanvas === 'function') {
    try { return new globalThis.OffscreenCanvas(width, height); } catch {}
  }
  const canvas = documentRef?.createElement?.('canvas');
  if (!canvas) throw new Error('SANCTUARY_RESONANCE_CANVAS_UNAVAILABLE');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function captureImageData(video, { canvas = null, documentRef = globalThis?.document, width = SANCTUARY_RESONANCE_SAMPLE_WIDTH, height = SANCTUARY_RESONANCE_SAMPLE_HEIGHT } = {}) {
  if (!video) throw new Error('SANCTUARY_RESONANCE_VIDEO_REQUIRED');
  const sampleWidth = Math.max(8, Math.min(128, Math.floor(Number(width) || SANCTUARY_RESONANCE_SAMPLE_WIDTH)));
  const sampleHeight = Math.max(8, Math.min(128, Math.floor(Number(height) || SANCTUARY_RESONANCE_SAMPLE_HEIGHT)));
  const sourceWidth = Number(video.videoWidth || video.width || 0);
  const sourceHeight = Number(video.videoHeight || video.height || 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('SANCTUARY_RESONANCE_VIDEO_NOT_READY');
  const localCanvas = canvas || createLocalCanvas(documentRef, sampleWidth, sampleHeight);
  localCanvas.width = sampleWidth;
  localCanvas.height = sampleHeight;
  const context = localCanvas.getContext?.('2d', { alpha:false, willReadFrequently:true });
  if (!context || typeof context.drawImage !== 'function' || typeof context.getImageData !== 'function') throw new Error('SANCTUARY_RESONANCE_CANVAS_CONTEXT_UNAVAILABLE');
  context.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, sampleWidth, sampleHeight);
  return context.getImageData(0, 0, sampleWidth, sampleHeight);
}

export function captureSanctuaryResonanceColor(video, options = {}) {
  return analyzeSanctuaryResonanceColor(captureImageData(video, options));
}

export function captureSanctuaryResonanceFrame(video, options = {}) {
  return analyzeSanctuaryResonanceFrame(captureImageData(video, options));
}

export function startSanctuaryResonanceScan({
  video,
  onReading = null,
  onStable = null,
  onUnstable = null,
  onError = null,
  intervalMs = SANCTUARY_RESONANCE_SCAN_INTERVAL_MS,
  documentRef = globalThis?.document
} = {}) {
  if (!video) throw new Error('SANCTUARY_RESONANCE_VIDEO_REQUIRED');
  let stopped = false;
  let timer = null;
  let canvas = null;
  let lastStableKey = '';
  const gate = createSanctuaryResonanceGate();
  const interval = Math.max(160, Number(intervalMs) || SANCTUARY_RESONANCE_SCAN_INTERVAL_MS);

  const schedule = () => { if (!stopped) timer = setTimeout(scan, interval); };
  const scan = () => {
    if (stopped) return;
    try {
      if (!canvas) canvas = createLocalCanvas(documentRef, SANCTUARY_RESONANCE_SAMPLE_WIDTH, SANCTUARY_RESONANCE_SAMPLE_HEIGHT);
      const result = captureSanctuaryResonanceFrame(video, { canvas, documentRef });
      onReading?.(result);
      if (gate.push(result)) {
        const snapshot = gate.snapshot();
        if (snapshot.key !== lastStableKey) {
          lastStableKey = snapshot.key;
          onStable?.(result);
        }
      } else {
        lastStableKey = '';
        onUnstable?.(result);
      }
    } catch (error) {
      if (String(error?.message || '') !== 'SANCTUARY_RESONANCE_VIDEO_NOT_READY') onError?.(error);
    }
    schedule();
  };

  timer = setTimeout(scan, 120);
  return {
    engine: SANCTUARY_RESONANCE_ALGORITHM,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      gate.reset();
      // Canvas efímero: nunca se adjunta, serializa, persiste ni sale del dispositivo.
      canvas = null;
    }
  };
}

export function stopSanctuaryResonanceScan(scanner) {
  try { scanner?.stop?.(); } catch {}
}

// Alias de compatibilidad Stage 15. A partir de Stage 16 el scanner real produce la firma completa V1.
export const startSanctuaryResonanceColorScan = startSanctuaryResonanceScan;
export const stopSanctuaryResonanceColorScan = stopSanctuaryResonanceScan;
