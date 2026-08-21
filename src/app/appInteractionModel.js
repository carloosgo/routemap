export function isSaveShortcut(event) {
  return Boolean(
    event &&
      (event.ctrlKey || event.metaKey) &&
      typeof event.key === 'string' &&
      event.key.toLowerCase() === 's'
  );
}

export function createCollapsedSegments(segments) {
  return (segments || []).reduce((collapsed, segment) => {
    if (segment?.id) collapsed[segment.id] = false;
    return collapsed;
  }, {});
}

export function isOutsideTarget(container, target) {
  return Boolean(container && target && !container.contains(target));
}

export function toggleTarget(currentTarget, nextTarget) {
  return currentTarget === nextTarget ? null : nextTarget;
}
