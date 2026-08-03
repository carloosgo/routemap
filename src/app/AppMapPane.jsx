import { IconArrowRight, IconCheck, IconX } from '@tabler/icons-react';
import { RouteMap } from '../modules/map/RouteMap.jsx';
import { colorForIndex } from '../config.js';

export function AppMapPane({ trip, openNoteSegmentId, setOpenNoteSegmentId, updateSegment, addPlace, toast, t }) {
  return (
    <section className="mappane" aria-label={t('mapRegion')}>
      <RouteMap segments={trip.segments} places={trip.places || []} addPlace={addPlace} />
      {openNoteSegmentId && (
        <div aria-hidden="true" style={{ position:'absolute',inset:0,zIndex:10,background:'transparent' }}
          onPointerDown={(event)=>{event.preventDefault();event.stopPropagation();}}
          onPointerUp={(event)=>{event.preventDefault();event.stopPropagation();setOpenNoteSegmentId(null);}} />
      )}
      {openNoteSegmentId && (()=>{
        const segment=trip.segments.find(item=>item.id===openNoteSegmentId);if(!segment)return null;
        const index=trip.segments.findIndex(item=>item.id===openNoteSegmentId);
        const originName=segment.origin?.name||t('origin');const destinationName=segment.destination?.name||t('destination');
        return <div className="segnote" data-segment-id={segment.id} role="dialog" aria-label={t('segmentNote')} style={{zIndex:720}}>
          <div className="segnote__head"><span className="segnote__badge" style={{background:colorForIndex(index)}}>{index+1}</span><span className="segnote__title">{originName}<IconArrowRight size={11} aria-hidden="true" />{destinationName}</span><button type="button" className="segnote__x" aria-label={t('closeNote')} onClick={()=>setOpenNoteSegmentId(null)}><IconX size={16} aria-hidden="true" /></button></div>
          <textarea className="segnote__textarea" maxLength={500} aria-label={t('segmentNote')} placeholder={t('segmentNotePlaceholder')} value={segment.note||''} onChange={event=>updateSegment(segment.id,{note:event.target.value})} autoFocus />
          <div className="segnote__foot"><span className="segnote__saved"><IconCheck size={12} aria-hidden="true" /> {t('savedShort')}</span><span className="segnote__count">{(segment.note||'').length} / 500</span></div>
        </div>;
      })()}
      {toast&&<div className="toast" role="status" aria-live="polite">{toast}</div>}
    </section>
  );
}
