import {
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { flagImageUrl } from '../flags/flags.js';
import { useTranslation } from '../../i18n/index.jsx';
import './SegmentHeader.css';

function DestinationMarker({ city, t }) {
  if (!city?.countryCode) {
    return <span className="timeline-marker__empty" aria-hidden="true" />;
  }

  return (
    <img
      className="timeline-marker__flag"
      src={flagImageUrl(city.countryCode, 32)}
      alt={t('flagOf').replace('{country}', city.country || city.countryCode)}
      width={28}
      height={20}
      loading="lazy"
    />
  );
}

export function SegmentHeader({
  segment,
  formattedDates,
  formattedAmount,
  nights,
  expanded,
  dragging,
  bodyId,
  onToggle,
  onUpdateDestination,
  onOpenNote,
  onRemoveRequest,
  onReorderPointerStart,
}) {
  const { t } = useTranslation();
  const nightsLabel = nights == null
    ? null
    : `${nights} ${t(nights === 1 ? 'night' : 'nights')}`;

  return (
    <header className="segment__header segment__header--timeline">
      <span className="timeline-marker" aria-hidden={!segment.destination}>
        <DestinationMarker city={segment.destination} t={t} />
      </span>

      <div className="segment__timeline-city">
        <CityAutocomplete
          value={segment.destination}
          onSelect={onUpdateDestination}
          placeholder={t('destination')}
          variant="timeline"
        />
      </div>

      <div className="segment__timeline-dates" aria-label={`${t('startDate')} / ${t('endDate')}`}>
        <span>{formattedDates.start}</span>
        <span>{formattedDates.end}</span>
      </div>

      <span className={'segment__nights' + (nightsLabel ? '' : ' is-empty')}>
        {nightsLabel || '—'}
      </span>

      <span className="segment__pill segment__pill--timeline">{formattedAmount}</span>

      <button
        type="button"
        className={'btn btn--icon segment__note-btn' + (segment.note ? ' has-note' : '')}
        aria-label={t('segmentNote')}
        title={t('segmentNote')}
        onClick={onOpenNote}
      >
        <IconNote size={14} aria-hidden="true" />
      </button>

      <button
        type="button"
        className="btn btn--icon segment__toggle"
        aria-label={expanded ? t('collapse') : t('expand')}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        {expanded ? (
          <IconChevronUp size={14} aria-hidden="true" />
        ) : (
          <IconChevronDown size={14} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className="btn btn--icon segment__remove-btn"
        aria-label={t('removeSegment')}
        onClick={onRemoveRequest}
      >
        <IconX size={14} aria-hidden="true" />
      </button>

      <span
        className="segment__drag-handle segment__drag-handle--timeline"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={onReorderPointerStart}
        aria-hidden="true"
      >
        <IconGripVertical size={15} stroke={1.7} />
      </span>
    </header>
  );
}
