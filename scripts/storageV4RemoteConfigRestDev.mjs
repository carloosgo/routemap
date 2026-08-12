/* global fetch, process */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const STORAGE_V4_REMOTE_CONFIG_PROJECT = 'atlasmap-dev';
const ENDPOINT = `https://firebaseremoteconfig.googleapis.com/v1/projects/${STORAGE_V4_REMOTE_CONFIG_PROJECT}/remoteConfig`;

function runProcess(executable, args) {
  const options = { encoding: 'utf8', windowsHide: true, stdio: 'pipe' };
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')) {
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', executable, ...args], options);
  }
  return spawnSync(executable, args, options);
}

function gcloudCandidates() {
  if (process.platform !== 'win32') return ['gcloud'];
  const candidates = ['gcloud.cmd', 'gcloud.exe', 'gcloud'];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.unshift(join(localAppData, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'));
  }
  return candidates;
}

export function resolveGcloud() {
  for (const candidate of gcloudCandidates()) {
    if ((candidate.includes('\\') || candidate.includes('/')) && !existsSync(candidate)) continue;
    const probe = runProcess(candidate, ['version']);
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

export function accessTokenFromGcloud(gcloud) {
  if (!gcloud) throw new Error('No se encontró una instalación utilizable de gcloud.');
  const account = runProcess(gcloud, ['config', 'get-value', 'account']);
  if (account.error || account.status !== 0 || !String(account.stdout || '').trim()) {
    throw new Error('gcloud no tiene una cuenta autenticada activa.');
  }
  const token = runProcess(gcloud, ['auth', 'print-access-token']);
  if (token.error || token.status !== 0) {
    throw new Error('No se pudo obtener un access token de gcloud.');
  }
  const value = String(token.stdout || '').trim();
  if (!value) throw new Error('gcloud devolvió un access token vacío.');
  return value;
}

async function parseResponse(response, label) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 300) };
    }
  }
  if (!response.ok) {
    const error = new Error(`${label} HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function requestHeaders(token, extra = {}) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('token es obligatorio.');
  return {
    Authorization: `Bearer ${token}`,
    'x-goog-user-project': STORAGE_V4_REMOTE_CONFIG_PROJECT,
    'Accept-Encoding': 'gzip',
    ...extra,
  };
}

export async function getRemoteConfigTemplate({ token, fetchFn = fetch } = {}) {
  const response = await fetchFn(ENDPOINT, {
    method: 'GET',
    headers: requestHeaders(token),
  });
  const template = await parseResponse(response, 'Remote Config GET');
  const etag = response.headers?.get?.('etag');
  if (typeof etag !== 'string' || !etag.trim() || etag.trim() === '*') {
    throw new Error('Remote Config GET no devolvió un ETag utilizable.');
  }
  return Object.freeze({ template, etag: etag.trim() });
}

async function putTemplate({ token, etag, template, validateOnly, fetchFn = fetch }) {
  if (typeof etag !== 'string' || !etag.trim() || etag.trim() === '*') {
    throw new TypeError('Se requiere el ETag exacto obtenido por GET; wildcard no permitido.');
  }
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new TypeError('template debe ser un objeto.');
  }
  const url = validateOnly ? `${ENDPOINT}?validate_only=true` : ENDPOINT;
  const response = await fetchFn(url, {
    method: 'PUT',
    headers: requestHeaders(token, {
      'Content-Type': 'application/json; charset=utf-8',
      'If-Match': etag,
    }),
    body: JSON.stringify(template),
  });
  const payload = await parseResponse(
    response,
    validateOnly ? 'Remote Config validate' : 'Remote Config publish'
  );
  const responseEtag = response.headers?.get?.('etag') || null;
  return Object.freeze({ template: payload, etag: responseEtag });
}

export async function validateRemoteConfigTemplate(options = {}) {
  return putTemplate({ ...options, validateOnly: true });
}

export async function publishRemoteConfigTemplate(options = {}) {
  return putTemplate({ ...options, validateOnly: false });
}
