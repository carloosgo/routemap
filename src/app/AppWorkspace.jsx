import { useEffect, useState } from 'react';
import {
  IconChevronLeft,
  IconChevronRight,
  IconListDetails,
  IconMap,
  IconNotebook,
  IconRoute,
} from '@tabler/icons-react';
import './DockedWorkspace.css';

const MOBILE_MEDIA_QUERY = '(max-width: 720px)';

// En móvil la navegación principal baja a una barra inferior tipo app:
// las tres secciones del editor más el mapa, al alcance del pulgar.
const MOBILE_TABS = [
  { id: 'segments', labelKey: 'itinerary', Icon: IconListDetails },
  { id: 'places', labelKey: 'myRoutes', Icon: IconRoute },
  { id: 'notes', labelKey: 'notes', Icon: IconNotebook },
  { id: 'map', labelKey: 'map', Icon: IconMap },
];

function currentMobileViewport() {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false;
}

export function AppWorkspace({
  editorModule,
  mapPane,
  mobileView,
  setMobileView,
  desktopPanelCollapsed,
  setDesktopPanelCollapsed,
  navigation = {},
  floatingPanelOpen = false,
  t,
}) {
  const { activeTab = 'segments', setActiveTab, checklistProgress = '' } = navigation;
  const activeMobileTab = mobileView === 'map' ? 'map' : activeTab;
  const selectMobileTab = (id) => {
    if (id === 'map') {
      setMobileView('map');
      return;
    }
    setActiveTab?.(id);
    setMobileView('form');
  };
  const [mobileViewport, setMobileViewport] = useState(currentMobileViewport);
  const [mobileMapMounted, setMobileMapMounted] = useState(
    () => !currentMobileViewport() || mobileView === 'map'
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
    if (!mobileViewport || mobileView === 'map' || floatingPanelOpen) setMobileMapMounted(true);
  }, [mobileViewport, mobileView, floatingPanelOpen]);

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
      <div className="workspace__mobile">
        <div className={'mobilepane' + (mobileView === 'form' ? ' is-active' : '')}>
          {editorModule}
        </div>
        <div className={'mobilepane' + (mobileView === 'map' ? ' is-active' : '')}>
          {mobileViewport && mobileMapMounted && mapPane}
        </div>
        <nav className="mobiletabs" aria-label={t('itinerary')}>
          {MOBILE_TABS.map(({ id, labelKey, Icon }) => {
            const isActive = activeMobileTab === id;
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