import {
  IconArrowRight,
  IconChevronDown,
  IconChevronUp,
  IconGripVertical,
  IconNote,
  IconX,
} from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';

export function SegmentHeader({
  segment,
  index,
  formattedDates,
  formattedAmount,
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

  return (
    <header className="segment__header">
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
        <IconGripVertical size={14} stroke={1.8} />
      </span>

      <div className="segment__route">
        <CityAutocomplete
          value={segment.origin}
          onSelect={(city) => onUpdate({ origin: city })}
          placeholder={t('origin')}
        />
        <IconArrowRight size={12} className="segment__arrow" aria-hidden="true" />
        <CityAutocomplete
          value={segment.destination}
          onSelect={(city) => onUpdate({ destination: city })}
          placeholder={t('destination')}
        />
        {formattedDates && <span className="segment__dates">{formattedDates}</span>}
      </div>

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
        className="btn btn--icon"
        aria-label={t('removeSegment')}
        onClick={onRemoveRequest}
      >
        <IconX size={14} aria-hidden="true" />
      </button>
    </header>
  );
}
