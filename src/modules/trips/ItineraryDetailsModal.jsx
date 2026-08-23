import { IconArrowRight, IconX } from '@tabler/icons-react';
import { colorForIndex } from '../../config.js';
import { OriginBody } from './OriginBody.jsx';
import { SegmentBody } from './SegmentBody.jsx';
import { ORIGIN_NOTE_TARGET } from './tripNoteTargets.js';
import './ItineraryDetailsModal.css';

export function ItineraryDetailsModal({
  target,
  trip,
  locale,
  onClose,
  updateSegment,
  updateExpenses,
  updateOriginDetails,
  updateOriginExpenses,
  t,
}) {
  if (!target) return null;

  if (target === ORIGIN_NOTE_TARGET) {
    const firstSegment = trip.segments?.[0];
    if (!firstSegment) return null;
    const originName = firstSegment.origin?.name || t('origin');

    return (
      <div
        className="segnote segment-details-modal"
        data-details-target="origin"
        role="dialog"
        aria-label={t('segmentDetails')}
        style={{ zIndex: 720 }}
      >
        <div className="segnote__head">
          <span className="segnote__badge" style={{ background: colorForIndex(0) }} aria-hidden="true" />
          <span className="segnote__title">{t('origin')}: {originName}</span>
          <button
            type="button"
            className="segnote__x"
            aria-label={t('closeSegmentDetails')}
            onClick={onClose}
          >
            <IconX size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="segment-details-modal__content">
          <OriginBody
            details={trip.originDetails}
            currency={trip.currency}
            locale={locale}
            bodyId="origin-details-modal-body"
            onUpdate={updateOriginDetails}
            onUpdateExpenses={updateOriginExpenses}
          />
        </div>
      </div>
    );
  }

  const segment = trip.segments.find((item) => item.id === target);
  if (!segment) return null;
  const index = trip.segments.findIndex((item) => item.id === target);
  const originName = segment.origin?.name || t('origin');
  const destinationName = segment.destination?.name || t('destination');

  return (
    <div
      className="segnote segment-details-modal"
      data-details-target={segment.id}
      role="dialog"
      aria-label={t('segmentDetails')}
      style={{ zIndex: 720 }}
    >
      <div className="segnote__head">
        <span className="segnote__badge" style={{ background: colorForIndex(index) }}>{index + 1}</span>
        <span className="segnote__title">
          {originName}<IconArrowRight size={11} aria-hidden="true" />{destinationName}
        </span>
        <button
          type="button"
          className="segnote__x"
          aria-label={t('closeSegmentDetails')}
          onClick={onClose}
        >
          <IconX size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="segment-details-modal__content">
        <SegmentBody
          segment={segment}
          currency={trip.currency}
          locale={locale}
          bodyId={`segment-details-modal-${segment.id}`}
          onUpdate={(patch) => updateSegment(segment.id, patch)}
          onUpdateExpenses={(expenses) => updateExpenses(segment.id, expenses)}
        />
      </div>
    </div>
  );
}
