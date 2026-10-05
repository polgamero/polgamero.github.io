// Argentinia · Santuario Stage 10 — cámara local / permisos.
// No reconoce barcodes ni calcula Resonancia. Sólo abre/cierra/cambia la cámara.

export const SANCTUARY_CAMERA_STAGE = 10;

export function sanctuaryCameraSupported(mediaDevices = globalThis?.navigator?.mediaDevices) {
  return !!mediaDevices && typeof mediaDevices.getUserMedia === 'function';
}

export function sanctuaryCameraConstraints(deviceId = '') {
  const requestedDeviceId = String(deviceId || '').trim();
  const video = requestedDeviceId
    ? {
        deviceId: { exact: requestedDeviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    : {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      };
  return { audio: false, video };
}

export function stopSanctuaryCameraStream(stream) {
  try {
    for (const track of stream?.getTracks?.() || []) {
      try { track.stop(); } catch {}
    }
  } catch {}
}

export async function listSanctuaryVideoInputs(mediaDevices = globalThis?.navigator?.mediaDevices) {
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') return [];
  try {
    const devices = await mediaDevices.enumerateDevices();
    return (Array.isArray(devices) ? devices : [])
      .filter(device => device?.kind === 'videoinput' && device?.deviceId)
      .map(device => ({
        deviceId: String(device.deviceId),
        label: String(device.label || '')
      }));
  } catch {
    return [];
  }
}

export function nextSanctuaryVideoInput(devices = [], currentDeviceId = '') {
  const rows = Array.isArray(devices) ? devices.filter(row => row?.deviceId) : [];
  if (rows.length < 2) return null;
  const current = String(currentDeviceId || '');
  const index = Math.max(0, rows.findIndex(row => row.deviceId === current));
  return rows[(index + 1) % rows.length] || rows[0] || null;
}

export function sanctuaryCameraErrorKind(error) {
  const name = String(error?.name || error?.code || '');
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no_device';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') return 'constraint';
  if (name === 'UNSUPPORTED') return 'unsupported';
  return 'generic';
}

function unsupportedError() {
  const error = new Error('SANCTUARY_CAMERA_UNSUPPORTED');
  error.name = 'UNSUPPORTED';
  return error;
}

async function acquire(mediaDevices, deviceId = '') {
  if (!sanctuaryCameraSupported(mediaDevices)) throw unsupportedError();
  try {
    return await mediaDevices.getUserMedia(sanctuaryCameraConstraints(deviceId));
  } catch (error) {
    // Algunos navegadores viejos rechazan facingMode/environment aunque sí tengan webcam.
    // Sólo para el primer acceso sin deviceId hacemos un fallback conservador a video:true.
    if (!deviceId && sanctuaryCameraErrorKind(error) === 'constraint') {
      return mediaDevices.getUserMedia({ audio: false, video: true });
    }
    throw error;
  }
}

export async function openSanctuaryCamera({ deviceId = '', mediaDevices = globalThis?.navigator?.mediaDevices } = {}) {
  const stream = await acquire(mediaDevices, deviceId);
  const audioTracks = stream?.getAudioTracks?.() || [];
  for (const track of audioTracks) {
    try { track.stop(); } catch {}
  }
  const videoTracks = stream?.getVideoTracks?.() || [];
  const track = videoTracks[0];
  if (!track) {
    stopSanctuaryCameraStream(stream);
    const error = new Error('SANCTUARY_CAMERA_NO_VIDEO_TRACK');
    error.name = 'NotFoundError';
    throw error;
  }
  const settings = typeof track.getSettings === 'function' ? (track.getSettings() || {}) : {};
  const devices = await listSanctuaryVideoInputs(mediaDevices);
  return {
    stream,
    track,
    deviceId: String(settings.deviceId || deviceId || ''),
    facingMode: String(settings.facingMode || ''),
    devices
  };
}
