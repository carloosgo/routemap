function entityVersion(entity) {
  const version = Number(entity?.version);
  return Number.isInteger(version) && version >= 1 ? version : 0;
}

function active(entity) {
  return Boolean(entity && entity.status !== 'deleted');
}

function nonNegative(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError('La contribución agregada debe ser finita y no negativa.');
  }
  return number;
}

export function targetAggregateContribution({
  entityType,
  before = null,
  after = null,
  valueOf = () => 0,
} = {}) {
  const version = entityVersion(after) || entityVersion(before);
  if (!version) throw new TypeError('El evento agregado requiere una versión de entidad.');

  const isActive = active(after);
  if (entityType === 'segment') {
    return {
      entityType,
      version,
      countContribution: isActive ? 1 : 0,
      valueContribution: isActive ? nonNegative(valueOf(after)) : 0,
    };
  }
  if (entityType === 'place') {
    return {
      entityType,
      version,
      countContribution: isActive ? 1 : 0,
      valueContribution: 0,
    };
  }
  throw new TypeError('La entidad no participa en agregados v4.');
}

export function aggregateDeltaFromContribution(current, target) {
  const currentVersion = Number(current?.version) || 0;
  if (currentVersion >= target.version) {
    return { apply: false, countDelta: 0, valueDelta: 0 };
  }
  return {
    apply: true,
    countDelta: target.countContribution - (Number(current?.countContribution) || 0),
    valueDelta: target.valueContribution - (Number(current?.valueContribution) || 0),
  };
}
