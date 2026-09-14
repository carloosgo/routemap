import { useCallback, useState } from 'react';
import { IconFileTypePdf } from '@tabler/icons-react';
import { buildImagePdf, downloadPdf } from '../modules/export/pdfImageDocument.js';
import { renderItineraryPdfPages } from '../modules/export/itineraryPdfCanvas.js';
import { captureVisibleItineraryMap } from '../modules/export/itineraryMapSnapshot.js';
import './ItineraryPdfExport.css';

function safeFileName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
      const mapSnapshot = await captureVisibleItineraryMap();
      const pages = await renderItineraryPdfPages({
        model,
        mapSnapshot,
        intlLocale,
        t,
      });
      const bytes = buildImagePdf(pages);
      const baseName = safeFileName(model.name || t('appName')) || t('appName');
      downloadPdf(bytes, `${baseName}.pdf`);
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
