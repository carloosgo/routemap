const QUAD_VERTICES = new Float32Array([
  -0.5, -0.5, 0, 1,
   0.5, -0.5, 1, 1,
  -0.5,  0.5, 0, 0,
  -0.5,  0.5, 0, 0,
   0.5, -0.5, 1, 1,
   0.5,  0.5, 1, 0,
]);

const VERTEX_SHADER_WEBGL2 = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec4 u_center;
uniform vec2 u_size;
uniform vec2 u_anchor;
uniform vec2 u_viewport;
out vec2 v_uv;
void main() {
  vec2 pixelOffset = a_position * u_size + u_anchor;
  vec2 ndcOffset = vec2(
    pixelOffset.x * 2.0 / u_viewport.x,
    -pixelOffset.y * 2.0 / u_viewport.y
  );
  gl_Position = vec4(
    u_center.xy + ndcOffset * u_center.w,
    u_center.z - (0.00001 * u_center.w),
    u_center.w
  );
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER_WEBGL2 = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 outColor;
void main() {
  vec4 color = texture(u_texture, v_uv);
  float alpha = color.a * u_opacity;
  if (alpha < 0.015) discard;
  outColor = vec4(color.rgb, alpha);
}`;

const VERTEX_SHADER_WEBGL1 = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform vec4 u_center;
uniform vec2 u_size;
uniform vec2 u_anchor;
uniform vec2 u_viewport;
varying vec2 v_uv;
void main() {
  vec2 pixelOffset = a_position * u_size + u_anchor;
  vec2 ndcOffset = vec2(
    pixelOffset.x * 2.0 / u_viewport.x,
    -pixelOffset.y * 2.0 / u_viewport.y
  );
  gl_Position = vec4(
    u_center.xy + ndcOffset * u_center.w,
    u_center.z - (0.00001 * u_center.w),
    u_center.w
  );
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER_WEBGL1 = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_opacity;
void main() {
  vec4 color = texture2D(u_texture, v_uv);
  float alpha = color.a * u_opacity;
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(color.rgb, alpha);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compilation error.';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  const webgl2 = typeof gl.createVertexArray === 'function';
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    webgl2 ? VERTEX_SHADER_WEBGL2 : VERTEX_SHADER_WEBGL1
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    webgl2 ? FRAGMENT_SHADER_WEBGL2 : FRAGMENT_SHADER_WEBGL1
  );
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program.');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Unknown WebGL link error.';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createVaoController(gl) {
  if (typeof gl.createVertexArray === 'function') {
    const vao = gl.createVertexArray();
    return {
      vao,
      bind: () => gl.bindVertexArray(vao),
      unbind: () => gl.bindVertexArray(null),
      current: () => gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      restore: (value) => gl.bindVertexArray(value),
      dispose: () => gl.deleteVertexArray(vao),
    };
  }
  const extension = gl.getExtension?.('OES_vertex_array_object');
  if (!extension) return null;
  const vao = extension.createVertexArrayOES();
  return {
    vao,
    bind: () => extension.bindVertexArrayOES(vao),
    unbind: () => extension.bindVertexArrayOES(null),
    current: () => gl.getParameter(extension.VERTEX_ARRAY_BINDING_OES),
    restore: (value) => extension.bindVertexArrayOES(value),
    dispose: () => extension.deleteVertexArrayOES(vao),
  };
}

function configureGeometry(gl, program) {
  const vao = createVaoController(gl);
  if (!vao) throw new Error('WebGL vertex arrays are unavailable.');
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Unable to create WebGL landmark buffer.');
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const uvLocation = gl.getAttribLocation(program, 'a_uv');

  vao.bind();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
  vao.unbind();
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, buffer };
}

function programLocations(gl, program) {
  return {
    center: gl.getUniformLocation(program, 'u_center'),
    size: gl.getUniformLocation(program, 'u_size'),
    anchor: gl.getUniformLocation(program, 'u_anchor'),
    viewport: gl.getUniformLocation(program, 'u_viewport'),
    texture: gl.getUniformLocation(program, 'u_texture'),
    opacity: gl.getUniformLocation(program, 'u_opacity'),
  };
}

function loadImage(url, onReady) {
  const image = new Image();
  const record = { image, ready: false, failed: false };
  image.decoding = 'async';
  image.onload = () => {
    record.ready = true;
    onReady();
  };
  image.onerror = () => {
    record.failed = true;
    console.warn('[Google Maps] itinerary landmark asset failed to load', url);
  };
  image.src = url;
  return record;
}

function createTexture(gl, image) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function landmarkOpacityForZoom(zoom) {
  const numericZoom = Number(zoom);
  if (!Number.isFinite(numericZoom) || numericZoom <= 12.25) return 1;
  if (numericZoom >= 13.5) return 0;
  return Math.max(0, Math.min(1, (13.5 - numericZoom) / 1.25));
}

export function landmarkCssSize(viewportWidth, zoom, scale = 1) {
  const width = Number(viewportWidth) || 0;
  const numericZoom = Number(zoom) || 0;
  let base = width <= 420 ? 36 : width <= 720 ? 40 : 46;
  if (numericZoom >= 8) base += 2;
  if (numericZoom >= 10.5) base += 2;
  return Math.round(base * (Number(scale) || 1));
}

function boxesOverlap(a, b, padding = 6) {
  return !(
    a.right + padding <= b.left
    || a.left >= b.right + padding
    || a.bottom + padding <= b.top
    || a.top >= b.bottom + padding
  );
}

function projectedLandmark(transformer, landmark, width, height) {
  const matrix = transformer.fromLatLngAltitude({
    lat: landmark.lat,
    lng: landmark.lng,
    altitude: 0,
  });
  const center = [matrix[12], matrix[13], matrix[14], matrix[15]];
  if (!Number.isFinite(center[3]) || center[3] <= 0) return null;
  const ndcX = center[0] / center[3];
  const ndcY = center[1] / center[3];
  if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) return null;
  return {
    center,
    screenX: (ndcX * 0.5 + 0.5) * width,
    screenY: (0.5 - ndcY * 0.5) * height,
  };
}

function selectLandmarks({ transformer, landmarks, width, height, zoom }) {
  const accepted = [];
  const occupied = [];
  [...landmarks]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .forEach((landmark) => {
      const projected = projectedLandmark(transformer, landmark, width, height);
      if (!projected) return;
      const size = landmarkCssSize(width, zoom, landmark.scale);
      const anchorX = Number(landmark.offsetX || 0);
      const anchorY = -(size * 0.5 + 12) + Number(landmark.offsetY || 0);
      const centerX = projected.screenX + anchorX;
      const centerY = projected.screenY + anchorY;
      const box = {
        left: centerX - size * 0.5,
        right: centerX + size * 0.5,
        top: centerY - size * 0.5,
        bottom: centerY + size * 0.5,
      };
      if (occupied.some((other) => boxesOverlap(box, other))) return;
      occupied.push(box);
      accepted.push({ ...landmark, ...projected, size, anchorX, anchorY });
    });
  return accepted;
}

function captureGlState(gl, vaoController) {
  const state = {
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
    blend: gl.isEnabled(gl.BLEND),
    depth: gl.isEnabled(gl.DEPTH_TEST),
    cull: gl.isEnabled(gl.CULL_FACE),
    blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
    blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
    blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA),
    blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA),
    vao: vaoController.current(),
  };
  gl.activeTexture(gl.TEXTURE0);
  state.texture0 = gl.getParameter(gl.TEXTURE_BINDING_2D);
  return state;
}

function restoreGlState(gl, vaoController, state) {
  vaoController.restore(state.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.arrayBuffer);
  gl.useProgram(state.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.texture0);
  gl.activeTexture(state.activeTexture);
  gl.blendFuncSeparate(
    state.blendSrcRgb,
    state.blendDstRgb,
    state.blendSrcAlpha,
    state.blendDstAlpha
  );
  if (state.blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  if (state.depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  if (state.cull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
}

export function createWebglLandmarkOverlay({ WebGLOverlayView, map }) {
  if (!WebGLOverlayView || !map) {
    return { setLandmarks() {}, dispose() {} };
  }

  const overlay = new WebGLOverlayView();
  const imageRecords = new Map();
  const textures = new Map();
  let landmarks = [];
  let glState = null;
  let disposed = false;
  let warned = false;

  const requestRedraw = () => {
    if (!disposed) overlay.requestRedraw?.();
  };

  const ensureImages = () => {
    landmarks.forEach((landmark) => {
      if (!imageRecords.has(landmark.imageUrl)) {
        imageRecords.set(landmark.imageUrl, loadImage(landmark.imageUrl, requestRedraw));
      }
    });
  };

  overlay.onAdd = ensureImages;

  overlay.onContextRestored = ({ gl }) => {
    try {
      const program = createProgram(gl);
      const geometry = configureGeometry(gl, program);
      glState = {
        gl,
        program,
        geometry,
        locations: programLocations(gl, program),
      };
      textures.clear();
      warned = false;
      requestRedraw();
    } catch (error) {
      glState = null;
      if (!warned) {
        warned = true;
        console.warn('[Google Maps] WebGL itinerary landmark layer unavailable', error);
      }
    }
  };

  overlay.onDraw = ({ gl, transformer }) => {
    if (!glState || glState.gl !== gl || !landmarks.length) return;
    const mapDiv = map.getDiv?.();
    const width = Number(mapDiv?.clientWidth || 0);
    const height = Number(mapDiv?.clientHeight || 0);
    if (width < 2 || height < 2) return;
    const zoom = Number(map.getZoom?.() || 0);
    const opacity = landmarkOpacityForZoom(zoom);
    if (opacity <= 0) return;

    const selected = selectLandmarks({ transformer, landmarks, width, height, zoom });
    if (!selected.length) return;

    const viewport = gl.getParameter(gl.VIEWPORT);
    const viewportWidth = Math.max(1, Number(viewport?.[2] || gl.drawingBufferWidth || width));
    const viewportHeight = Math.max(1, Number(viewport?.[3] || gl.drawingBufferHeight || height));
    const pixelRatioX = viewportWidth / width;
    const pixelRatioY = viewportHeight / height;
    const { program, geometry, locations } = glState;
    const previousState = captureGlState(gl, geometry.vao);

    try {
      gl.useProgram(program);
      geometry.vao.bind();
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(locations.texture, 0);
      gl.uniform2f(locations.viewport, viewportWidth, viewportHeight);
      gl.uniform1f(locations.opacity, opacity);

      selected.reverse().forEach((landmark) => {
        const record = imageRecords.get(landmark.imageUrl);
        if (!record?.ready || record.failed) return;
        let texture = textures.get(landmark.imageUrl);
        if (!texture) {
          texture = createTexture(gl, record.image);
          if (!texture) return;
          textures.set(landmark.imageUrl, texture);
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform4fv(locations.center, landmark.center);
        gl.uniform2f(
          locations.size,
          landmark.size * pixelRatioX,
          landmark.size * pixelRatioY
        );
        gl.uniform2f(
          locations.anchor,
          landmark.anchorX * pixelRatioX,
          landmark.anchorY * pixelRatioY
        );
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      });
    } finally {
      restoreGlState(gl, geometry.vao, previousState);
    }
  };

  overlay.onContextLost = () => {
    textures.clear();
    glState = null;
  };

  overlay.onRemove = () => {
    const state = glState;
    if (state?.gl) {
      try {
        textures.forEach((texture) => state.gl.deleteTexture(texture));
        state.geometry.vao.dispose();
        state.gl.deleteBuffer(state.geometry.buffer);
        state.gl.deleteProgram(state.program);
      } catch {
        // The shared context can already be unavailable during map teardown.
      }
    }
    textures.clear();
    glState = null;
  };

  overlay.setMap(map);

  return {
    setLandmarks(nextLandmarks = []) {
      landmarks = Array.isArray(nextLandmarks) ? nextLandmarks : [];
      ensureImages();
      requestRedraw();
    },
    dispose() {
      disposed = true;
      landmarks = [];
      overlay.setMap(null);
      imageRecords.clear();
    },
  };
}
