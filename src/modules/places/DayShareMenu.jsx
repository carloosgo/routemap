import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconDownload,
  IconExternalLink,
  IconListNumbers,
  IconMap2,
  IconShare,
} from '@tabler/icons-react';
import {
  dayGoogleMapsLinks,
  dayShareFileName,
  dayShareText,
  dayStaticMapUrl,
  loadDayStaticMapFile,
} from '../share/dayRouteShare.js';

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

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canShareFiles(file) {
  const navigatorRef = globalThis.navigator;
  if (typeof navigatorRef?.share !== 'function' || typeof navigatorRef?.canShare !== 'function') return false;
  try {
    return navigatorRef.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Botón «Compartir» del día abierto en Mis rutas. Comparte los lugares en
 * orden con el enlace de Google Maps de la ruta, o la imagen del mapa del día.
 * La imagen se prepara al abrir el menú para que compartir siga dentro del
 * gesto del usuario (requisito de Safari en iPhone).
 */
export function DayShareMenu({
  dayNumber,
  title,
  subtitle,
  cityName,
  places,
  routeFor,
  colorFor,
  language,
  t,
  intlLocale,
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [mapFile, setMapFile] = useState(null);
  const [mapState, setMapState] = useState('idle');

  const links = useMemo(() => dayGoogleMapsLinks(places, routeFor), [places, routeFor]);
  const text = useMemo(
    () => dayShareText({ title, subtitle, places, routeFor, links, t, intlLocale }),
    [title, subtitle, places, routeFor, links, t, intlLocale]
  );
  const mapUrl = useMemo(
    () => dayStaticMapUrl(places, { routeFor, colorFor, language }),
    [places, routeFor, colorFor, language]
  );
  const fileName = dayShareFileName(dayNumber, cityName);

  const requestedUrlRef = useRef('');

  // La imagen se pide al abrir el menú y se rehace si cambian lugares o rutas.
  useEffect(() => {
    if (!open || !mapUrl || requestedUrlRef.current === mapUrl) return;
    requestedUrlRef.current = mapUrl;
    setMapFile(null);
    setMapState('loading');
    loadDayStaticMapFile(mapUrl, fileName)
      .then((file) => {
        if (requestedUrlRef.current !== mapUrl) return;
        setMapFile(file);
        setMapState('ready');
      })
      .catch((error) => {
        if (requestedUrlRef.current !== mapUrl) return;
        console.warn('[Mis rutas] mapa del día no disponible', error);
        requestedUrlRef.current = '';
        setMapState('error');
      });
  }, [open, mapUrl, fileName]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = globalThis.setTimeout(() => setStatus(''), 2600);
    return () => globalThis.clearTimeout(timer);
  }, [status]);

  async function shareText() {
    const navigatorRef = globalThis.navigator;
    if (typeof navigatorRef?.share === 'function') {
      try {
        await navigatorRef.share({ title, text });
        setOpen(false);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await copyText(text);
      setStatus(t('shareDayCopied'));
    } catch {
      setStatus(t('shareDayError'));
    }
  }

  async function shareMap() {
    if (!mapFile) return;
    if (canShareFiles(mapFile)) {
      try {
        await globalThis.navigator.share({ files: [mapFile], title, text });
        setOpen(false);
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    downloadFile(mapFile);
    setStatus(t('shareDayMapDownloaded'));
  }

  const mapLabel = mapState === 'loading'
    ? t('shareDayMapPreparing')
    : mapState === 'error' || !mapUrl
      ? t('shareDayMapUnavailable')
      : t('shareDayMap');
  const MapIcon = mapFile && !canShareFiles(mapFile) ? IconDownload : IconMap2;

  return (
    <span className="mr-share" ref={wrapRef}>
      <button
        type="button"
        className="mr__icon-btn"
        aria-label={t('shareDay')}
        title={t('shareDay')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <IconShare size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="mr-share__menu" role="menu">
          <strong>{t('shareDay')}</strong>
          <button type="button" role="menuitem" onClick={shareText}>
            <IconListNumbers size={16} aria-hidden="true" />
            <span>{t('shareDayPlaces')}</span>
          </button>
          <button type="button" role="menuitem" onClick={shareMap} disabled={!mapFile}>
            <MapIcon size={16} aria-hidden="true" />
            <span>{mapLabel}</span>
          </button>
          {links[0] && (
            <a role="menuitem" href={links[0]} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <IconExternalLink size={16} aria-hidden="true" />
              <span>{t('shareDayOpenMaps')}</span>
            </a>
          )}
          {status && <small role="status">{status}</small>}
        </div>
      )}
    </span>
  );
}
