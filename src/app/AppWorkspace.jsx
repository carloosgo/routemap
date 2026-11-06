import { useEffect, useRef, useState } from 'react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconListDetails,
  IconNotebook,
  IconRoute,
} from '@tabler/icons-react';
import { nextSheetSnap, sheetSnapHeights } from './mobileSheetModel.js';
import './DockedWorkspace.css';

const MOBILE_MEDIA_QUERY = '(max-width: 720px)';

// En móvil la navegación principal baja a una barra inferior tipo app. No hay
// pestaña Mapa: Itinerario y Mis Rutas muestran su propio mapa de fondo y la
// lista va en una hoja deslizable encima (abajo / media / arriba).
const MOBILE_TABS = [
  { id: 'segments', labelKey: 'itinerary', Icon: IconListDetails },
  { id: 'places', labelKey: 'myRoutes', Icon: IconRoute },
  { id: 'notes', labelKey: 'notes', Icon: IconNotebook },
];

const MAP_SECTIONS = new Set(['segments', 'places']);

function currentMobileViewport() {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false;
}

export function AppWorkspace({
  editorModule,
  mapPane,
  desktopPanelCollapsed,
  setDesktopPanelCollapsed,
  navigation = {},
  floatingPanelOpen = false,
  t,
}) {
  const { activeTab = 'segments', setActiveTab, checklistProgress = '' } = navigation;
  const sectionHasMap = MAP_SECTIONS.has(activeTab);
  const selectMobileTab = (id) => {
    setActiveTab?.(id);
  };
  const stageRef = useRef(null);
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  const pointerTypeRef = useRef('');
  const [stageHeight, setStageHeight] = useState(0);
  const [sheetSnap, setSheetSnap] = useState('mid');
  const [dragHeight, setDragHeight] = useState(null);
  const snapHeights = sheetSnapHeights(stageHeight);
  const sheetHeight = sectionHasMap
    ? (dragHeight ?? snapHeights[sheetSnap])
    : stageHeight;
  // El mapa ocupa solo la zona visible sobre la hoja (con un pequeño solape
  // bajo sus esquinas redondeadas) para que encuadre lo que se ve.
  const mapHeight = Math.max(0, stageHeight - snapHeights[sheetSnap] + 18);
  const [mobileViewport, setMobileViewport] = useState(currentMobileViewport);
  const [mobileMapMounted, setMobileMapMounted] = useState(
    () => !currentMobileViewport() || sectionHasMap
  );

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const media = globalThis.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event) => setMobileViewport(event.matches);
    setMobileViewport(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    // Nota y datos del trayecto viven en el panel del mapa; en móvil se
    // muestran como hoja fija sobre la vista activa, así que el panel debe
    // existir aunque el mapa no se haya visitado.
    if (!mobileViewport || sectionHasMap || floatingPanelOpen) setMobileMapMounted(true);
  }, [mobileViewport, sectionHasMap, floatingPanelOpen]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!mobileViewport || !stage) return undefined;
    const measure = () => setStageHeight(stage.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      globalThis.addEventListener?.('resize', measure);
      return () => globalThis.removeEventListener?.('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mobileViewport]);

  // Arrastre táctil desde cualquier punto de la hoja (no solo el asa), como en
  // las apps de mapas: hacia arriba mueve la hoja hasta su altura máxima y
  // después desplaza la lista; hacia abajo baja la hoja cuando la lista ya está
  // arriba del todo. Necesita un listener no pasivo para poder evitar el scroll.
  const sheetStateRef = useRef({});
  sheetStateRef.current = { sectionHasMap, sheetSnap, snapHeights };
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!mobileViewport || !sheet) return undefined;
    let touch = null;
    const scrollerFor = (target) => {
      for (let node = target; node && node !== sheet; node = node.parentElement) {
        const style = globalThis.getComputedStyle?.(node);
        if (/(auto|scroll)/.test(style?.overflowY || '') && node.scrollHeight > node.clientHeight) return node;
      }
      return null;
    };
    const onStart = (event) => {
      const state = sheetStateRef.current;
      if (!state.sectionHasMap || event.touches.length !== 1) return;
      // Campos de texto y asas de reordenar (ciudades / lugares) conservan su gesto.
      if (event.target.closest?.('input, textarea, select, [contenteditable="true"], .segment__drag-handle, .mr-place__drag')) return;
      const point = event.touches[0];
      touch = {
        startX: point.clientX,
        startY: point.clientY,
        startHeight: state.snapHeights[state.sheetSnap],
        scroller: scrollerFor(event.target),
        dragging: false,
        decided: false,
      };
    };
    const onMove = (event) => {
      if (!touch) return;
      const state = sheetStateRef.current;
      const point = event.touches[0];
      const dx = point.clientX - touch.startX;
      const dy = point.clientY - touch.startY;
      if (!touch.decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        touch.decided = true;
        const vertical = Math.abs(dy) > Math.abs(dx);
        const listAtTop = !touch.scroller || touch.scroller.scrollTop <= 0;
        const canGrow = dy < 0 && state.sheetSnap !== 'high';
        const canShrink = dy > 0 && listAtTop;
        touch.dragging = vertical && (canGrow || canShrink);
        if (!touch.dragging) {
          touch = null;
          return;
        }
        touch.startY = point.clientY;
      }
      event.preventDefault();
      const next = touch.startHeight - (point.clientY - touch.startY);
      setDragHeight(Math.min(state.snapHeights.high, Math.max(state.snapHeights.low, next)));
    };
    const onEnd = (event) => {
      if (!touch?.dragging) {
        touch = null;
        return;
      }
      const state = sheetStateRef.current;
      const point = event.changedTouches[0];
      const endHeight = touch.startHeight - (point.clientY - touch.startY);
      setSheetSnap(nextSheetSnap(state.sheetSnap, touch.startHeight, endHeight, state.snapHeights, { tapToggles: false }));
      setDragHeight(null);
      touch = null;
    };
    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [mobileViewport]);

  const handleSheetPointerDown = (event) => {
    // Los dedos usan el arrastre táctil de toda la hoja; el puntero queda
    // para ratón / lápiz sobre el asa.
    pointerTypeRef.current = event.pointerType;
    if (!sectionHasMap || event.pointerType === 'touch') return;
    if (!sectionHasMap) return;
    dragRef.current = { startY: event.clientY, startHeight: snapHeights[sheetSnap] };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleSheetPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = drag.startHeight - (event.clientY - drag.startY);
    setDragHeight(Math.min(snapHeights.high, Math.max(snapHeights.low, next)));
  };
  const handleSheetPointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const endHeight = drag.startHeight - (event.clientY - drag.startY);
    setSheetSnap(nextSheetSnap(sheetSnap, drag.startHeight, endHeight, snapHeights));
    setDragHeight(null);
  };

  return (
    <main className="workspace">
      <div
        className={
          'workspace__desktop workspace__desktop--column'
          + (desktopPanelCollapsed ? ' is-panel-collapsed' : '')
        }
      >
        <aside className="workspace-panel">
          <div className="workspace-panel__content floating-editor">{editorModule}</div>
        </aside>
        <button
          type="button"
          className="workspace-panel__toggle"
          aria-label={t(desktopPanelCollapsed ? 'expand' : 'collapse')}
          aria-expanded={!desktopPanelCollapsed}
          onClick={() => setDesktopPanelCollapsed((current) => !current)}
        >
          {desktopPanelCollapsed
            ? <IconChevronRight size={16} aria-hidden="true" />
            : <IconChevronLeft size={16} aria-hidden="true" />}
        </button>
        {!mobileViewport && mapPane}
      </div>
      <div
        className={'workspace__mobile' + (sectionHasMap ? ' has-map' : ' is-sheet-only')}
        data-sheet-snap={sectionHasMap ? sheetSnap : 'full'}
      >
        <div className="mobile-stage" ref={stageRef}>
          <div
            className="mobilepane is-active mobile-mapstage"
            aria-hidden={sectionHasMap ? undefined : 'true'}
            style={{ height: `${mapHeight}px` }}
          >
            {mobileViewport && mobileMapMounted && mapPane}
          </div>
          <section
            ref={sheetRef}
            className={'mobile-sheet' + (dragHeight != null ? ' is-dragging' : '')}
            style={{ height: `${sheetHeight}px` }}
          >
            {sectionHasMap && (
              <button
                type="button"
                className="mobile-sheet__handle"
                aria-label={t(sheetSnap === 'high' ? 'collapse' : 'expand')}
                onClick={() => {
                  // Toque con el dedo en el asa: alterna media ↔ arriba (el
                  // ratón lo resuelve en onPointerUp).
                  if (pointerTypeRef.current === 'touch') {
                    setSheetSnap((current) => nextSheetSnap(current, 0, 0, snapHeights));
                  }
                }}
                onPointerDown={handleSheetPointerDown}
                onPointerMove={handleSheetPointerMove}
                onPointerUp={handleSheetPointerUp}
                onPointerCancel={handleSheetPointerUp}
              >
                <span aria-hidden="true" />
              </button>
            )}
            <div className="mobilepane is-active mobile-sheet__body">
              {editorModule}
            </div>
          </section>
        </div>
        <nav className="mobiletabs" aria-label={t('itinerary')}>
          {MOBILE_TABS.map(({ id, labelKey, Icon }) => {
            const isActive = activeTab === id;
            const badge = id === 'notes' ? checklistProgress : '';
            return (
              <button
                key={id}
                type="button"
                className={'mobiletabs__btn' + (isActive ? ' is-active' : '')}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => selectMobileTab(id)}
              >
                <span className="mobiletabs__icon" aria-hidden="true">
                  <Icon size={22} stroke={1.8} />
                  {badge !== '' && badge !== 0 && (
                    <span className="mobiletabs__badge">{badge}</span>
                  )}
                </span>
                <span className="mobiletabs__label">{t(labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
}