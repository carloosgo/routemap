import { useEffect, useState } from 'react';
import { IconArrowRight, IconX } from '@tabler/icons-react';
import { colorForIndex } from '../../config.js';
import { OriginBody } from './OriginBody.jsx';
import { SegmentBody } from './SegmentBody.jsx';
import {
  validateOriginDepartureDateChange,
  validateSegmentDatePatch,
} from './tripDateRules.js';
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
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    setDateError('');
  }, [target]);

  if (!target) return null;

  if (target === ORIGIN_NOTE_TARGET) {
    const firstSegment = trip.segments?.[0];
    if (!firstSegment) return null;
    const originName = firstSegment.origin?.name || t('origin');

    const handleOriginUpdate = (patch) => {
      if (Object.hasOwn(patch, 'departureDate')) {
        const validation = validateOriginDepartureDateChange(trip, patch.departureDate);
        if (!validation.valid) {
          setDateError(t(validation.errorKey));
          return;
        }
        setDateError('');
      }
      updateOriginDetails(patch);
    };

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
            dateError={dateError}
            onUpdate={handleOriginUpdate}
            onUpdateExpenses={updateOriginExpenses}
          />
        </div>
      </div>
    );
  }

  const segment = trip.segments.find((item) => item.id === target);
  if (!segment) return null;
  const index = trip.segments.findIndex((item) => item.id === target);
  const previousSegment = index > 0 ? trip.segments[index - 1] : null;
  const calendarReferenceDate = previousSegment?.endDate
    || previousSegment?.startDate
    || trip.originDetails?.departureDate
    || '';
  const originName = segment.origin?.name || t('origin');
  const destinationName = segment.destination?.name || t('destination');

  const handleSegmentUpdate = (patch) => {
    if (Object.hasOwn(patch, 'startDate') || Object.hasOwn(patch, 'endDate')) {
      const validation = validateSegmentDatePatch(trip, segment.id, patch);
      if (!validation.valid) {
        setDateError(t(validation.errorKey));
        return;
      }
      setDateError('');
    }
    updateSegment(segment.id, patch);
  };

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
          dateError={dateError}
          calendarReferenceDate={calendarReferenceDate}
          onUpdate={handleSegmentUpdate}
          onUpdateExpenses={(expenses) => updateExpenses(segment.id, expenses)}
        />
      </div>
    </div>
  );
}
