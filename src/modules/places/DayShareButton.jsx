import { useEffect, useState } from 'react';
import { IconCheck, IconLoader2, IconShare } from '@tabler/icons-react';
import { buildPublicDayShareModel, dayShareModelIssues } from '../share/dayRouteShare.js';
import { createDayShare, dayShareUrl } from '../share/dayShareRepository.js';
import { loadGooglePlaceLocations } from './googlePlacesClient.js';

function hasPoint(place) {
  return Number.isFinite(Number(place?.lat)) && Number.isFinite(Number(place?.lon))
    && place?.lat !== null && place?.lon !== null;
}

// Los lugares de Google se guardan sin coordenadas (Atlas las pide a Google
// al mostrarlos); para compartir se resuelven igual que en el mapa.
async function placesWithCoordinates(places) {
  const list = Array.isArray(places) ? places : [];
  const ids = list
    .filter((place) => !hasPoint(place) && place?.googlePlaceId)
    .map((place) => place.googlePlaceId);
  if (!ids.length) return list;
  const locations = await loadGooglePlaceLocations(ids);
  const byId = new Map(locations.map((location) => [location.placeId, location]));
  return list.map((place) => {
    if (hasPoint(place)) return place;
    const location = byId.get(place?.googlePlaceId);
    return location ? { ...place, lat: location.lat, lon: location.lon } : place;
  });
}

async function copyText(value) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

/**
 * Botón «Compartir día» de Mis rutas: guarda una copia pública del día y
 * comparte su link corto (hoja nativa en iPhone; si no, lo copia).
 */
export function DayShareButton({ title, subtitle, places, routeFor, colorFor, t, intlLocale }) {
  const [state, setState] = useState('idle');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!status) return undefined;
    const timer = globalThis.setTimeout(() => setStatus(''), 9000);
    return () => globalThis.clearTimeout(timer);
  }, [status]);

  async function share() {
    if (state === 'sharing') return;
    setState('sharing');
    let model = null;
    try {
      const located = await placesWithCoordinates(places);
      // Las rutas y colores se buscan por id: se mapean al lugar original.
      const originalById = new Map((places || []).map((place) => [place.id, place]));
      const original = (place) => originalById.get(place?.id) || place;
      model = buildPublicDayShareModel({
        title,
        subtitle,
        places: located,
        routeFor: (from, to) => routeFor?.(original(from), original(to)),
        colorFor: (place) => colorFor?.(original(place)),
      });
      const url = dayShareUrl(await createDayShare(model, { intlLocale }));
      const navigatorRef = globalThis.navigator;
      if (typeof navigatorRef?.share === 'function') {
        try {
          await navigatorRef.share({ title: model.title, url });
          setState('idle');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') {
            setState('idle');
            return;
          }
        }
      }
      await copyText(url);
      setStatus(t('shareDayCopied'));
      setState('done');
    } catch (error) {
      // Diagnóstico visible (también en iPhone): código de Firebase y la
      // condición de las reglas que el modelo no cumple, si alguna.
      const issues = model ? dayShareModelIssues(model) : ['model'];
      const detail = [error?.code, ...issues, `p${places?.length ?? 0}/${model?.places?.length ?? 0}`]
        .filter(Boolean)
        .join(' · ');
      console.error('[Mis rutas] compartir día', detail, error, model);
      setStatus(error?.code === 'day-share/auth-required'
        ? t('shareDayAuthRequired')
        : `${t('shareDayError')} (${detail})`);
      setState('idle');
    }
  }

  const Icon = state === 'sharing' ? IconLoader2 : state === 'done' && status ? IconCheck : IconShare;

  return (
    <span className="mr-share">
      <button
        type="button"
        className={'mr__icon-btn' + (state === 'sharing' ? ' is-busy' : '')}
        onClick={share}
        aria-label={t('shareDay')}
        title={t('shareDay')}
        aria-busy={state === 'sharing'}
      >
        <Icon size={15} aria-hidden="true" />
      </button>
      {status && <small className="mr-share__status" role="status">{status}</small>}
    </span>
  );
}
