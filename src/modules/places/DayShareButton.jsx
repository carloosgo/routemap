import { useEffect, useState } from 'react';
import { IconCheck, IconLoader2, IconShare } from '@tabler/icons-react';
import { buildPublicDayShareModel } from '../share/dayRouteShare.js';
import { createDayShare, dayShareUrl } from '../share/dayShareRepository.js';

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
    const timer = globalThis.setTimeout(() => setStatus(''), 2800);
    return () => globalThis.clearTimeout(timer);
  }, [status]);

  async function share() {
    if (state === 'sharing') return;
    setState('sharing');
    try {
      const model = buildPublicDayShareModel({ title, subtitle, places, routeFor, colorFor });
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
      console.error('[Mis rutas] compartir día', error);
      setStatus(t(error?.code === 'day-share/auth-required' ? 'shareDayAuthRequired' : 'shareDayError'));
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
