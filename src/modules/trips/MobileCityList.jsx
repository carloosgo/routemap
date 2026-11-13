import { useEffect, useRef, useState } from 'react';
import { IconNote, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { CityAutocomplete } from '../../components/CityAutocomplete.jsx';
import { useTranslation } from '../../i18n/index.jsx';
import { flagImageUrl } from '../flags/flags.js';
import { ItineraryCityVisual } from './ItineraryCityVisual.jsx';
import { SegmentDeleteDialog } from './SegmentDeleteDialog.jsx';
import {
  formatSegmentAmount,
  formatSegmentDates,
  formatSegmentNights,
} from './segmentFormModel.js';
import { segmentTotal } from './tripModel.js';
import { shiftForIndex, targetIndexFor } from './mobileCityListModel.js';
import './MobileCityList.css';

// Lista de ciudades de la app (≤720 px), rediseño del 13/11/2026:
// tarjetas a todo el ancho, sin números ni línea; tocar abre los gastos,
// mantener presionado levanta la tarjeta para moverla y deslizar a la
// izquierda descubre Borrar.

const MOBILE_MEDIA_QUERY = '(max-width: 720px)';
const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 8;
const DELETE_WIDTH = 84;

function matchesMobile() {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

export function useIsMobileViewport() {
  const [mobile, setMobile] = useState(matchesMobile);
  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const media = globalThis.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = (event) => setMobile(event.matches);
    setMobile(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return mobile;
}

function segmentDateLine(segment, locale) {
  const dates = formatSegmentDates(segment, locale);
  const nights = formatSegmentNights(segment, locale);
  return [dates, nights].filter(Boolean).join(' · ');
}

function MobileCityCard({
  segment,
  accent,
  locale,
  currency,
  blocked,
  lifted,
  shiftY,
  liftOffsetY,
  onOpenDetails,
  onOpenNote,
  onRemove,
  onLiftStart,
  onLiftMove,
  onLiftEnd,
}) {
  const { t } = useTranslation();
  const rootRef = useRef(null);
  const gestureRef = useRef(null);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const destination = segment.destination;
  const total = segmentTotal(segment);
  const hasNote = Boolean(String(segment.note || '').trim());
  const dateLine = segmentDateLine(segment, locale);
  const flagUrl = destination?.countryCode ? flagImageUrl(destination.countryCode, 40) : null;

  // iOS: mientras la tarjeta está levantada o deslizándose, la lista no debe desplazarse.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return undefined;
    const onTouchMove = (event) => {
      const mode = gestureRef.current?.mode;
      if (mode === 'lift' || mode === 'swipe') event.preventDefault();
    };
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => node.removeEventListener('touchmove', onTouchMove);
  }, []);

  useEffect(() => () => clearTimeout(gestureRef.current?.timer), []);

  const finishGesture = () => {
    const gesture = gestureRef.current;
    if (gesture) clearTimeout(gesture.timer);
    gestureRef.current = null;
    rootRef.current?.removeAttribute('data-city-gesture');
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest?.('button')) return;
    finishGesture();
    const gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      baseX: offsetX,
      mode: 'pending',
      mouse: event.pointerType === 'mouse',
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Sin captura el gesto sigue funcionando mientras el dedo esté encima.
    }
    // Con mouse (web) no hay pulsación larga: arrastrar en vertical ya mueve la ciudad.
    gesture.timer = gesture.mouse ? null : setTimeout(() => {
      if (gestureRef.current !== gesture || gesture.mode !== 'pending') return;
      gesture.mode = 'lift';
      rootRef.current?.setAttribute('data-city-gesture', 'lift');
      setOffsetX(0);
      try {
        globalThis.navigator?.vibrate?.(12);
      } catch {
        // Vibración opcional.
      }
      onLiftStart(segment.id, gesture.lastY, rootRef.current);
    }, LONG_PRESS_MS);
    gestureRef.current = gesture;
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.lastY = event.clientY;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (gesture.mode === 'pending' && gesture.mouse) {
      if (Math.abs(dy) > MOVE_TOLERANCE && Math.abs(dy) >= Math.abs(dx)) {
        gesture.mode = 'lift';
        rootRef.current?.setAttribute('data-city-gesture', 'lift');
        onLiftStart(segment.id, gesture.startY, rootRef.current);
      } else if (Math.abs(dx) > MOVE_TOLERANCE) {
        gesture.mode = 'none';
      }
    } else if (gesture.mode === 'pending') {
      if (Math.abs(dx) > MOVE_TOLERANCE && Math.abs(dx) > Math.abs(dy)) {
        clearTimeout(gesture.timer);
        gesture.mode = 'swipe';
        rootRef.current?.setAttribute('data-city-gesture', 'swipe');
        setSwiping(true);
      } else if (Math.abs(dy) > MOVE_TOLERANCE) {
        // Desplazamiento vertical: es scroll de la lista, no un gesto de tarjeta.
        clearTimeout(gesture.timer);
        gesture.mode = 'none';
      }
    }

    if (gesture.mode === 'swipe') {
      setOffsetX(Math.max(-DELETE_WIDTH, Math.min(0, gesture.baseX + dx)));
    } else if (gesture.mode === 'lift') {
      onLiftMove(event.clientY);
    }
  };

  const handlePointerUp = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const { mode } = gesture;
    finishGesture();
    if (mode === 'pending') {
      if (offsetX < 0) {
        setOffsetX(0);
        return;
      }
      onOpenDetails(segment.id);
    } else if (mode === 'swipe') {
      setSwiping(false);
      setOffsetX((current) => (current < -DELETE_WIDTH / 2 ? -DELETE_WIDTH : 0));
    } else if (mode === 'lift') {
      onLiftEnd(true);
    }
  };

  const handlePointerCancel = () => {
    const mode = gestureRef.current?.mode;
    finishGesture();
    setSwiping(false);
    if (mode === 'lift') onLiftEnd(false);
    if (mode === 'swipe') setOffsetX(0);
  };

  const wrapperStyle = lifted
    ? { transform: `translateY(${liftOffsetY}px) scale(1.03)` }
    : shiftY
      ? { transform: `translateY(${shiftY}px)` }
      : undefined;

  return (
    <div
      ref={rootRef}
      className={'mcity' + (lifted ? ' is-lifted' : '') + (offsetX < 0 ? ' is-swiped' : '')}
      data-segment-id={segment.id}
      style={wrapperStyle}
    >
      <button
        type="button"
        className="mcity__delete"
        aria-label={t('removeSegment')}
        tabIndex={offsetX < 0 ? 0 : -1}
        onClick={() => {
          setOffsetX(0);
          setConfirmOpen(true);
        }}
      >
        <IconTrash size={20} stroke={1.9} aria-hidden="true" />
        <span>{t('delete')}</span>
      </button>

      <div
        className={'mcity__card' + (swiping ? ' is-swiping' : '')}
        style={offsetX ? { transform: `translateX(${offsetX}px)` } : undefined}
        role="button"
        tabIndex={0}
        aria-label={`${destination?.name || t('destination')}: ${t('openSegmentDetails')}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenDetails(segment.id);
          }
        }}
      >
        <div className="mcity__body">
          <div className="mcity__visual">
            <ItineraryCityVisual city={destination} accent={accent} />
          </div>
          <div className="mcity__identity">
            <div className="mcity__name">
              {flagUrl && (
                <img className="mcity__flag" src={flagUrl} alt="" width={20} height={14} loading="lazy" />
              )}
              <strong className={destination ? undefined : 'is-empty'}>
                {destination?.name || t('destination')}
              </strong>
            </div>
            {dateLine && <span className="mcity__dates">{dateLine}</span>}
          </div>
        </div>

        <div className="mcity__side">
          <strong className={'mcity__amount' + (total > 0 ? '' : ' is-zero')}>
            {formatSegmentAmount(total, locale, currency)}
          </strong>
          <div className="mcity__tools">
            <button
              type="button"
              className="mcity__hover-delete"
              aria-label={t('removeSegment')}
              title={t('removeSegment')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setConfirmOpen(true);
              }}
            >
              <IconTrash size={17} stroke={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={'mcity__note' + (hasNote ? ' has-note' : '')}
              aria-label={t('segmentNote')}
              title={t('segmentNote')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpenNote(segment.id);
              }}
            >
              <IconNote size={19} stroke={1.8} aria-hidden="true" />
              {hasNote && <span className="mcity__note-dot" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      <SegmentDeleteDialog
        open={confirmOpen}
        blocked={blocked}
        onConfirm={() => {
          setConfirmOpen(false);
          onRemove(segment.id);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export function MobileCityList({
  trip,
  entries,
  stopSequence,
  locale,
  onUpdateOrigin,
  onRemoveSegment,
  onReorderSegment,
  onOpenNote,
  onOpenDetails,
  onAddCity,
}) {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [lift, setLift] = useState(null);
  const liftRef = useRef(null);
  const ids = entries.map(({ segment }) => segment.id);
  const fromIndex = lift ? ids.indexOf(lift.id) : null;
  const targetIndex = lift ? targetIndexFor(fromIndex, lift.offsetY, lift.slot, ids.length) : null;

  const updateLift = (next) => {
    liftRef.current = next;
    setLift(next);
  };

  const handleLiftStart = (id, clientY, element) => {
    const parent = element?.parentElement;
    const gap = parent ? parseFloat(globalThis.getComputedStyle?.(parent)?.rowGap) || 0 : 0;
    const slot = (element?.offsetHeight || 0) + gap;
    updateLift({ id, startY: clientY, offsetY: 0, slot });
  };

  const handleLiftMove = (clientY) => {
    const current = liftRef.current;
    if (!current) return;
    updateLift({ ...current, offsetY: clientY - current.startY });
  };

  const handleLiftEnd = (commit) => {
    const current = liftRef.current;
    updateLift(null);
    if (!commit || !current) return;
    const from = ids.indexOf(current.id);
    const to = targetIndexFor(from, current.offsetY, current.slot, ids.length);
    if (from < 0 || to === from) return;
    onReorderSegment(current.id, ids[to], to > from ? 'after' : 'before');
  };

  const handleAdd = (city) => {
    if (!city) return;
    onAddCity(city);
    setAddOpen(false);
  };

  return (
    <div className={'mcity-list' + (lift ? ' is-reordering' : '')}>
      <div className="mcity-origin" aria-label={t('origin')}>
        <span className="mcity-origin__label">{t('departFrom')}</span>
        <div className="mcity-origin__city">
          <CityAutocomplete
            value={trip.origin}
            onSelect={onUpdateOrigin}
            placeholder={t('originPlaceholder')}
            selectedDisplay="timeline"
          />
        </div>
      </div>

      <div className="mcity-list__cards">
        {entries.map(({ segment, index }, position) => (
          <MobileCityCard
            key={segment.id}
            segment={segment}
            accent={stopSequence[index]?.color || null}
            locale={locale}
            currency={trip.currency}
            blocked={(trip.places || []).some((place) => place.segmentId === segment.id)}
            lifted={lift?.id === segment.id}
            liftOffsetY={lift?.id === segment.id ? lift.offsetY : 0}
            shiftY={lift ? shiftForIndex(position, fromIndex, targetIndex, lift.slot) : 0}
            onOpenDetails={onOpenDetails}
            onOpenNote={onOpenNote}
            onRemove={onRemoveSegment}
            onLiftStart={handleLiftStart}
            onLiftMove={handleLiftMove}
            onLiftEnd={handleLiftEnd}
          />
        ))}
      </div>

      <div className={'mcity-add' + (addOpen ? ' is-open' : '')}>
        {addOpen ? (
          <>
            <div className="mcity-add__picker">
              <CityAutocomplete value={null} onSelect={handleAdd} placeholder={t('addCity')} />
            </div>
            <button
              type="button"
              className="btn btn--icon mcity-add__cancel"
              aria-label={t('cancel')}
              title={t('cancel')}
              onClick={() => setAddOpen(false)}
            >
              <IconX size={16} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" className="mcity-add__trigger" onClick={() => setAddOpen(true)}>
            <IconPlus size={17} stroke={2.2} aria-hidden="true" />
            <span>{entries.length > 0 ? t('addNextCity') : t('addCity')}</span>
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <>
          <p className="mcity-list__hint mcity-list__hint--touch">{t('cityListHint')}</p>
          <p className="mcity-list__hint mcity-list__hint--mouse">{t('cityListHintWeb')}</p>
        </>
      )}
    </div>
  );
}
