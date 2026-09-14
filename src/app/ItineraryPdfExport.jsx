import { useCallback, useState } from 'react';
import { IconFileTypePdf } from '@tabler/icons-react';
import { renderItineraryHybridPdf } from '../modules/export/itineraryPdfHybrid.js';
import { composeItineraryStaticMap } from '../modules/export/itineraryStaticMapComposer.js';
import { loadItineraryStaticMap } from '../modules/export/itineraryStaticMapClient.js';
import { downloadVectorPdf } from '../modules/export/pdfVectorDocument.js';
import './ItineraryPdfExport.css';

const EXPORT_TIMEOUT_MS = 25_000;

function safeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function withTimeout(promise, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error('Itinerary PDF export timed out')),
      milliseconds
    );
    Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function ItineraryPdfExportButton({
  model,
  intlLocale,
  onError,
  t,
}) {
  const [exporting, setExporting] = useState(false);
  const exportLabel = `${t('itinerary')} · PDF`;

  const exportPdf = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await withTimeout((async () => {
        const language = String(intlLocale || '').toLowerCase().startsWith('en') ? 'en' : 'es';
        const baseMap = await loadItineraryStaticMap(model, { language });
        const mapImage = await composeItineraryStaticMap(model, baseMap);
        const bytes = renderItineraryHybridPdf({
          model,
          mapImage,
          intlLocale,
          t,
        });
        const baseName = safeFileName(model.name || t('appName')) || t('appName');
        downloadVectorPdf(bytes, `${baseName}.pdf`);
      })(), EXPORT_TIMEOUT_MS);
    } catch (error) {
      console.error('[Itinerary PDF] export failed', error);
      onError?.(error);
    } finally {
      setExporting(false);
    }
  }, [exporting, intlLocale, model, onError, t]);

  return (
    <button
      type="button"
      className="itinerary-pdf-export__button"
      onClick={exportPdf}
      aria-label={exportLabel}
      title={exportLabel}
      disabled={exporting}
    >
      <IconFileTypePdf size={21} aria-hidden="true" />
    </button>
  );
}