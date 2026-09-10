function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function syncRetryDelayMs(
  attempt,
  {
    baseMs = 1000,
    capMs = 30000,
    jitterRatio = 0.2,
    randomUnit = Math.random(),
  } = {}
) {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new TypeError('attempt debe ser un entero no negativo.');
  }
  if (!(baseMs > 0) || !(capMs >= baseMs)) {
    throw new TypeError('La configuración de backoff es inválida.');
  }

  const jitter = clamp(Number(jitterRatio) || 0, 0, 1);
  const random = clamp(Number(randomUnit) || 0, 0, 1);
  const exponent = Math.min(attempt, 30);
  const rawDelay = Math.min(capMs, baseMs * (2 ** exponent));
  const multiplier = 1 - jitter + (2 * jitter * random);

  return Math.round(rawDelay * multiplier);
}
