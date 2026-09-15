const CAPTURE_TIMEOUT_MS = 60_000;
const FRAME_TIMEOUT_MS = 5_000;
const MAP_SELECTOR = '.mappane .google-map';
const HIDDEN_DURING_CAPTURE = Object.freeze([
  '.itinerary-pdf-export__button',
  '.topbar--floating-only',
  '.editor-module__settings',
]);

function timeout(promise, milliseconds, message) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(message)), milliseconds);
    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    const requestFrame = globalThis.requestAnimationFrame;
    if (typeof requestFrame === 'function') requestFrame(() => resolve());
    else globalThis.setTimeout(resolve, 16);
  });
}

async function waitForVideoFrame(video) {
  if (typeof video.requestVideoFrameCallback === 'function') {
    await timeout(new Promise((resolve) => {
      video.requestVideoFrameCallback(() => resolve());
    }), FRAME_TIMEOUT_MS, 'Timed out waiting for captured map frame');
    return;
  }
  await nextAnimationFrame();
  await nextAnimationFrame();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 120));
}

export function computeViewportCaptureCrop(rect, {
  viewportWidth,
  viewportHeight,
  frameWidth,
  frameHeight,
}) {
  const safeViewportWidth = Math.max(1, Number(viewportWidth) || 1);
  const safeViewportHeight = Math.max(1, Number(viewportHeight) || 1);
  const safeFrameWidth = Math.max(1, Number(frameWidth) || 1);
  const safeFrameHeight = Math.max(1, Number(frameHeight) || 1);
  const scale = Math.min(
    safeFrameWidth / safeViewportWidth,
    safeFrameHeight / safeViewportHeight
  );
  const renderedWidth = safeViewportWidth * scale;
  const renderedHeight = safeViewportHeight * scale;
  const offsetX = (safeFrameWidth - renderedWidth) / 2;
  const offsetY = (safeFrameHeight - renderedHeight) / 2;

  const left = Math.max(0, Math.min(safeViewportWidth, Number(rect?.left) || 0));
  const top = Math.max(0, Math.min(safeViewportHeight, Number(rect?.top) || 0));
  const right = Math.max(left, Math.min(safeViewportWidth, Number(rect?.right) || left));
  const bottom = Math.max(top, Math.min(safeViewportHeight, Number(rect?.bottom) || top));

  const x = Math.max(0, Math.round(offsetX + (left * scale)));
  const y = Math.max(0, Math.round(offsetY + (top * scale)));
  const width = Math.max(1, Math.min(
    safeFrameWidth - x,
    Math.round((right - left) * scale)
  ));
  const height = Math.max(1, Math.min(
    safeFrameHeight - y,
    Math.round((bottom - top) * scale)
  ));

  return { x, y, width, height };
}

function canvasToJpegBytes(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas JPEG export unavailable'));
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Map screenshot could not be encoded'));
        return;
      }
      try {
        resolve(new Uint8Array(await blob.arrayBuffer()));
      } catch (error) {
        reject(error);
      }
    }, 'image/jpeg', 0.97);
  });
}

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function hideCaptureChrome(documentRef) {
  const hidden = [];
  HIDDEN_DURING_CAPTURE.forEach((selector) => {
    documentRef.querySelectorAll?.(selector)?.forEach((element) => {
      hidden.push({ element, visibility: element.style.visibility });
      element.style.visibility = 'hidden';
    });
  });
  return () => {
    hidden.forEach(({ element, visibility }) => {
      element.style.visibility = visibility;
    });
  };
}

async function requestCurrentTabStream() {
  const mediaDevices = globalThis.navigator?.mediaDevices;
  if (typeof mediaDevices?.getDisplayMedia !== 'function') {
    throw new Error('Exact map capture is unavailable in this browser');
  }

  try {
    mediaDevices.setCaptureHandleConfig?.({
      exposeOrigin: true,
      handle: 'atlas-itinerary-pdf',
      permittedOrigins: ['*'],
    });
  } catch {
    // Capture Handle is optional. The current-tab preference below still works without it.
  }

  return timeout(mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
      frameRate: { ideal: 5, max: 10 },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'exclude',
    systemAudio: 'exclude',
  }), CAPTURE_TIMEOUT_MS, 'Timed out waiting for current-tab capture permission');
}

function verifyCapturedSurface(track) {
  const surface = track?.getSettings?.()?.displaySurface;
  if (surface && surface !== 'browser') {
    throw new Error('Select the current Atlas tab to export the exact itinerary map');
  }
  const captureHandle = track?.getCaptureHandle?.();
  if (captureHandle?.handle && captureHandle.handle !== 'atlas-itinerary-pdf') {
    throw new Error('Select the current Atlas tab to export the exact itinerary map');
  }
}

export async function captureExactItineraryMap() {
  const documentRef = globalThis.document;
  const mapElement = documentRef?.querySelector?.(MAP_SELECTOR);
  if (!mapElement) throw new Error('Itinerary map is not visible');
  const rect = mapElement.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) throw new Error('Itinerary map has no visible area');

  let stream = null;
  let video = null;
  const restoreChrome = hideCaptureChrome(documentRef);
  try {
    await nextAnimationFrame();
    await nextAnimationFrame();
    stream = await requestCurrentTabStream();
    const track = stream.getVideoTracks?.()[0];
    if (!track) throw new Error('Current-tab video track is unavailable');
    verifyCapturedSurface(track);

    video = documentRef.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await timeout(video.play(), FRAME_TIMEOUT_MS, 'Captured tab could not start');
    await waitForVideoFrame(video);
    await waitForVideoFrame(video);

    const frameWidth = Number(video.videoWidth);
    const frameHeight = Number(video.videoHeight);
    if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth < 2 || frameHeight < 2) {
      throw new Error('Captured tab frame has no usable dimensions');
    }

    const crop = computeViewportCaptureCrop(rect, {
      viewportWidth: globalThis.innerWidth,
      viewportHeight: globalThis.innerHeight,
      frameWidth,
      frameHeight,
    });
    const canvas = documentRef.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Map screenshot canvas is unavailable');
    context.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );

    const bytes = await canvasToJpegBytes(canvas);
    return {
      bytes,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
    };
  } finally {
    restoreChrome();
    if (video) {
      try { video.pause(); } catch { /* no-op */ }
      video.srcObject = null;
    }
    stopStream(stream);
  }
}
