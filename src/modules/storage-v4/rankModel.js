const RADIX = 36;
const WIDTH = 10;
const STEP = 1_000_000;
const REBALANCE_GAP = 1024;
const MAX_VALUE = (RADIX ** WIDTH) - 1;

function encode(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_VALUE) {
    throw new RangeError('rank numérico fuera de rango.');
  }
  return value.toString(RADIX).padStart(WIDTH, '0');
}

function decode(rank) {
  if (typeof rank !== 'string' || !new RegExp(`^[0-9a-z]{${WIDTH}}$`).test(rank)) {
    throw new TypeError('rank v4 inválido.');
  }
  const value = Number.parseInt(rank, RADIX);
  if (!Number.isSafeInteger(value)) throw new RangeError('rank v4 fuera de rango seguro.');
  return value;
}

export function initialRankForPosition(position) {
  if (!Number.isInteger(position) || position < 0) {
    throw new TypeError('position debe ser un entero no negativo.');
  }
  const value = (position + 1) * STEP;
  if (value > MAX_VALUE) throw new RangeError('No hay espacio para ese rank inicial.');
  return encode(value);
}

export function rankBetween(leftRank = null, rightRank = null) {
  if (leftRank == null && rightRank == null) return encode(STEP);
  const left = leftRank == null ? 0 : decode(leftRank);
  const right = rightRank == null ? Math.min(MAX_VALUE, left + STEP) : decode(rightRank);
  if (left >= right || right - left <= 1) return null;
  return encode(left + Math.floor((right - left) / 2));
}

export function rankNeedsRebalance(leftRank, rightRank) {
  if (leftRank == null || rightRank == null) return false;
  const left = decode(leftRank);
  const right = decode(rightRank);
  return left >= right || right - left < REBALANCE_GAP;
}

export function rebalanceRanks(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new TypeError('count debe ser un entero no negativo.');
  }
  return Array.from({ length: count }, (_, index) => initialRankForPosition(index));
}
