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

export function savedPlacePopup(place, t) {
  const wrap = document.createElement('div');
  wrap.className = 'place-popup';
  const code = normalizedCountryCode(place.countryCode);
  const country = place.country || place.countryCode || '';
  const placeLabel = translated(t, 'place');
  const flagLabel = translated(t, 'flagOf', { country });
  const flag = code
    ? `<img class="place-popup__flag" src="https://flagcdn.com/24x18/${code}.png" width="24" height="18" alt="${escaped(
        flagLabel
      )}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  wrap.innerHTML = `<div class="place-popup__heading">${flag}<strong>${escaped(
    place.name || placeLabel
  )}</strong></div><span>${escaped(place.city || '')}${
    place.city && country ? ', ' : ''
  }${escaped(country)}</span>`;
  const flagImage = wrap.querySelector('.place-popup__flag');
  flagImage?.addEventListener('error', () => flagImage.remove(), { once: true });
  return wrap;
}

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

export function markerElement(place, t) {
  const placeLabel = translated(t, 'place');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'place-result-marker';
  button.setAttribute(
    'aria-label',
    `${place.name || placeLabel}, ${place.city || ''}, ${place.country || ''}`
  );

  const copy = document.createElement('span');
  copy.className = 'place-result-marker__copy';
  const name = document.createElement('strong');
  name.textContent = place.name || placeLabel;
  const location = document.createElement('small');
  location.textContent = [place.city, place.country || place.countryCode].filter(Boolean).join(', ');
  copy.append(name, location);
  button.append(copy);
  return button;
}
