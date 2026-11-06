function escaped(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizedCountryCode(value) {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : '';
}

function translated(t, key, variables) {
  return typeof t === 'function' ? t(key, variables) : key;
}

function placeName(place, t) {
  return place?.name || place?.userLabel || translated(t, 'place');
}

export function savedPlacePopup(place, t) {
  const wrap = document.createElement('div');
  wrap.className = 'place-popup';
  const code = normalizedCountryCode(place.countryCode);
  const country = place.country || place.countryCode || '';
  const flagLabel = translated(t, 'flagOf', { country });
  const flag = code
    ? `<img class="place-popup__flag" src="https://flagcdn.com/24x18/${code}.png" width="16" height="12" alt="${escaped(
        flagLabel
      )}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  wrap.innerHTML = `<div class="place-popup__heading">${flag}<strong>${escaped(
    placeName(place, t)
  )}</strong></div><span>${escaped(place.city || '')}${
    place.city && country ? ', ' : ''
  }${escaped(country)}</span>`;
  const flagImage = wrap.querySelector('.place-popup__flag');
  flagImage?.addEventListener('error', () => flagImage.remove(), { once: true });
  return wrap;
}

// Se conserva para compatibilidad con código legado MapLibre, pero Google Maps
// ya guarda directamente desde la tarjeta del resultado.
export function savePrompt(place, { alreadySaved = false, onSave, onClose, t } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'place-save-prompt';
  const text = document.createElement('span');
  text.textContent = alreadySaved
    ? translated(t, 'placeAlreadySaved')
    : translated(t, 'savePlacePrompt');
  wrap.append(text);

  if (!alreadySaved) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = translated(t, 'saveTrip');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSave?.(place);
      onClose?.();
    });
    wrap.append(button);
  }
  return wrap;
}

export function resultMarkerScale(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.52, Math.min(1, 0.52 + ((value - 5) * 0.48) / 7));
}

function savedResultAction(t) {
  const saved = document.createElement('span');
  saved.className = 'place-result-marker__saved';
  saved.textContent = translated(t, 'savedShort');
  return saved;
}

export function markerElement(
  place,
  t,
  { alreadySaved = false, onSave } = {}
) {
  const label = placeName(place, t);
  const wrap = document.createElement('div');
  wrap.className = 'place-result-marker';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute(
    'aria-label',
    `${label}, ${place.city || ''}, ${place.country || ''}`
  );

  const copy = document.createElement('span');
  copy.className = 'place-result-marker__copy';
  const name = document.createElement('strong');
  name.textContent = label;
  const location = document.createElement('small');
  location.textContent = [place.city, place.country || place.countryCode]
    .filter(Boolean)
    .join(', ');
  copy.append(name, location);

  const action = document.createElement('span');
  action.className = 'place-result-marker__action';
  if (alreadySaved) {
    action.append(savedResultAction(t));
  } else {
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'place-result-marker__save';
    save.textContent = translated(t, 'saveTrip');
    save.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (save.disabled) return;
      save.disabled = true;
      onSave?.(place);
      action.replaceChildren(savedResultAction(t));
    });
    action.append(save);
  }

  wrap.append(copy, action);
  return wrap;
}
