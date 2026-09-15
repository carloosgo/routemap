import { useCallback, useState } from 'react';
import { IconShare } from '@tabler/icons-react';
import { createItineraryShare } from '../modules/share/itineraryShareRepository.js';
import './ItineraryShareButton.css';

async function copyText(value) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(value);
    return;
  }

  const documentRef = globalThis.document;
  if (!documentRef?.createElement) throw new Error('Clipboard unavailable');
  const textarea = documentRef.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  documentRef.body.appendChild(textarea);
  textarea.select();
  const copied = documentRef.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

function shareUrl(shareId) {
  return new URL(`/share/${encodeURIComponent(shareId)}`, globalThis.location.origin).toString();
}

export function ItineraryShareButton({
  model,
  intlLocale,
  onError,
  onStatus,
  t,
}) {
  const [sharing, setSharing] = useState(false);

  const shareItinerary = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const shareId = await createItineraryShare(model, { intlLocale });
      const url = shareUrl(shareId);
      const navigatorRef = globalThis.navigator;

      if (typeof navigatorRef?.share === 'function') {
        try {
          await navigatorRef.share({
            title: model.name || t('appName'),
            text: t('shareItinerary'),
            url,
          });
          onStatus?.(t('shareReady'));
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }

      await copyText(url);
      onStatus?.(t('shareLinkCopied'));
    } catch (error) {
      console.error('[Itinerary share] create failed', error);
      onError?.(error);
    } finally {
      setSharing(false);
    }
  }, [intlLocale, model, onError, onStatus, sharing, t]);

  return (
    <button
      type="button"
      className="itinerary-share__button"
      onClick={shareItinerary}
      aria-label={t('shareItinerary')}
      title={t('shareItinerary')}
      disabled={sharing}
    >
      <IconShare size={20} aria-hidden="true" />
    </button>
  );
}
