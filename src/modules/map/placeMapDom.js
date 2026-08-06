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

export function savedPlacePopup(place) {
  const wrap = document.createElement('div');
  wrap.className = 'place-popup';
  const code = normalizedCountryCode(place.countryCode);
  const country = place.country || place.countryCode || '';
  const flag = code
    ? `<img class="place-popup__flag" src="https://flagcdn.com/24x18/${code}.png" width="24" height="18" alt="Bandera de ${escaped(
        country
      )}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  wrap.innerHTML = `<div class="place-popup__heading">${flag}<strong>${escaped(
    place.name || 'Lugar'
  )}</strong></div><span>${escaped(place.city || '')}${
    place.city && country ? ', ' : ''
  }${escaped(country)}</span><small>${escaped(place.category || 'Lugar')}</small>`;
  const flagImage = wrap.querySelector('.place-popup__flag');
  flagImage?.addEventListener('error', () => flagImage.remove(), { once: true });
  return wrap;
}

export function savePrompt(place, { alreadySaved = false, onSave, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'place-save-prompt';
  const text = document.createElement('span');
  text.textContent = alreadySaved ? 'Este lugar ya está guardado.' : '¿Guardar lugar para tu ruta?';
  wrap.append(text);

  if (!alreadySaved) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Guardar';
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

export function representativePlaceIcon(place) {
  const text = `${place?.category || ''} ${place?.name || ''}`.toLowerCase();
  if (/museum|museo|gallery|galer/.test(text)) return '🏛️';
  if (/restaurant|restaurante|food|cafe|coffee|bar|comida/.test(text)) return '🍽️';
  if (/hotel|hostel|lodging|hosped/.test(text)) return '🛏️';
  if (/station|estaci|train|metro|airport|aeropuerto/.test(text)) return '🚉';
  if (/park|parque|garden|jard/.test(text)) return '🌳';
  if (/church|iglesia|temple|templo|cathedral|catedral/.test(text)) return '⛪';
  if (/shop|store|tienda|market|mercado/.test(text)) return '🛍️';
  return '📍';
}

export function resultMarkerScale(zoom) {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.52, Math.min(1, 0.52 + ((value - 5) * 0.48) / 7));
}

export function markerElement(place) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'place-result-marker';
  button.setAttribute(
    'aria-label',
    `${place.name || 'Lugar'}, ${place.city || ''}, ${place.country || ''}`
  );

  const media = document.createElement('span');
  media.className = 'place-result-marker__media';
  const fallback = document.createElement('span');
  fallback.className = 'place-result-marker__fallback';
  fallback.textContent = representativePlaceIcon(place);
  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('load', () => image.classList.add('is-loaded'));
  image.addEventListener('error', () => {
    image.classList.remove('is-loaded');
    image.removeAttribute('src');
  });
  media.append(fallback, image);

  const copy = document.createElement('span');
  copy.className = 'place-result-marker__copy';
  const name = document.createElement('strong');
  name.textContent = place.name || 'Lugar';
  const location = document.createElement('small');
  location.textContent = [place.city, place.country || place.countryCode].filter(Boolean).join(', ');
  copy.append(name, location);
  button.append(media, copy);
  return { button, image };
}
