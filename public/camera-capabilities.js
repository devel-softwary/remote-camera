function range(capability, value, fallbackStep) {
  if (!capability || !Number.isFinite(capability.min) || !Number.isFinite(capability.max)) return null;
  return {
    min: capability.min,
    max: capability.max,
    step: capability.step || fallbackStep,
    value: Number.isFinite(value) ? value : capability.min
  };
}

export function normalizeCameraControls(capabilities = {}, settings = {}, supported = {}, photoCapabilities = {}) {
  const focusModes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
  const flashModes = Array.isArray(photoCapabilities.fillLightMode) ? photoCapabilities.fillLightMode : [];
  return {
    zoom: range(capabilities.zoom, settings.zoom, 0.1),
    torch: Array.isArray(capabilities.torch) ? capabilities.torch.includes(true) : capabilities.torch === true,
    focusModes,
    focusDistance: range(capabilities.focusDistance, settings.focusDistance, 0.01),
    pointsOfInterest: supported.pointsOfInterest === true && focusModes.some(mode => mode === 'single-shot' || mode === 'continuous'),
    flashModes
  };
}

export function normalizedVideoPoint(clientX, clientY, rect, videoWidth, videoHeight) {
  if (!rect?.width || !rect?.height || !videoWidth || !videoHeight) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  if (clientX < left || clientX > left + width || clientY < top || clientY > top + height) return null;
  return {
    x: Math.min(1, Math.max(0, (clientX - left) / width)),
    y: Math.min(1, Math.max(0, (clientY - top) / height))
  };
}

export function cameraDiagnostics(payload = {}) {
  const controls = payload.controls || {};
  const settings = payload.settings || {};
  const yesNo = value => value ? 'sì' : 'no';
  return [
    `${payload.label || 'Camera'} • ${settings.width || '?'}×${settings.height || '?'}`,
    `Zoom: ${yesNo(controls.zoom)} • Torcia continua: ${yesNo(controls.torch)}`,
    `Focus: ${(controls.focusModes || []).join(', ') || 'N/D'} • manuale: ${yesNo(controls.focusDistance && controls.focusModes?.includes('manual'))} • touch: ${yesNo(controls.pointsOfInterest)}`,
    `Flash foto: ${(controls.flashModes || []).join(', ') || 'N/D'}`
  ].join('\n');
}
