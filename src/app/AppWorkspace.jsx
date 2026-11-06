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
  const dragRef = useRef(null);
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

  const handleSheetPointerDown = (event) => {
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
            className={'mobile-sheet' + (dragHeight != null ? ' is-dragging' : '')}
            style={{ height: `${sheetHeight}px` }}
          >
            {sectionHasMap && (
              <button
                type="button"
                className="mobile-sheet__handle"
                aria-label={t(sheetSnap === 'high' ? 'collapse' : 'expand')}
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