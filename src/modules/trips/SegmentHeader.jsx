import {
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { flagImageUrl } from '../flags/flags.js';
import { useTranslation } from '../../i18n/index.jsx';
import { TimelineCityPicker } from './TimelineCityPicker.jsx';
import './SegmentHeader.css';

export function SegmentHeader({
  segment,
  formattedDateLines,
  formattedAmount,
  nightCount,
  expanded,
  dragging,
  bodyId,
  onToggle,
  onUpdate,
  onOpenNote,
  onRemoveRequest,
  onReorderPointerStart,
}) {
  const { t } = useTranslation();
  const nightLabel = nightCount === 1 ? t('night') : t('nights');

  return (
    <header className="segment__header segment__header--timeline">
      <span className="itinerary-timeline__marker-cell" aria-hidden="true">
        {segment.destination?.countryCode ? (
          <img
            className="itinerary-timeline__flag"
            src={flagImageUrl(segment.destination.countryCode, 40)}
            alt=""
            width={28}
            height={19}
            loading="lazy"
          />
        ) : (
          <span className="itinerary-timeline__empty-marker" />
        )}
      </span>

      <div className="segment__timeline-city">
        <TimelineCityPicker
          city={segment.destination}
          onSelect={(city) => onUpdate({ destination: city })}
          placeholder={t('destination')}
        />
      </div>

      <span className={'segment__date-stack' + (formattedDateLines.length ? '' : ' is-empty')}>
        {formattedDateLines.length ? (
          formattedDateLines.map((date, index) => (
            <span key={`${date}-${index}`}>{date}</span>
          ))
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </span>

      <span className={'segment__nights' + (nightCount == null ? ' is-empty' : '')}>
        {nightCount == null ? '—' : `${nightCount} ${nightLabel}`}
      </span>

      <span className="segment__pill">{formattedAmount}</span>

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
        className="btn btn--icon segment__remove"
        aria-label={t('removeSegment')}
        onClick={onRemoveRequest}
      >
        <IconX size={14} aria-hidden="true" />
      </button>

      <span
        className="segment__drag-handle"
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
