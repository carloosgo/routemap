import { useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconMap, IconRoute } from '@tabler/icons-react';
import './DockedWorkspace.css';

const MOBILE_MEDIA_QUERY = '(max-width: 720px)';

function currentMobileViewport() {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false;
}

export function AppWorkspace({ editorModule, mapPane, mobileView, setMobileView, t }) {
  const [mobileViewport, setMobileViewport] = useState(currentMobileViewport);
  const [mobileMapMounted, setMobileMapMounted] = useState(
    () => !currentMobileViewport() || mobileView === 'map'
  );
  const [desktopPanelCollapsed, setDesktopPanelCollapsed] = useState(false);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const media = globalThis.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event) => setMobileViewport(event.matches);
    setMobileViewport(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (!mobileViewport || mobileView === 'map') setMobileMapMounted(true);
  }, [mobileViewport, mobileView]);

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
        <nav className="mobiletabs">
          <button
            type="button"
            className={'mobiletabs__btn' + (mobileView === 'form' ? ' is-active' : '')}
            onClick={() => setMobileView('form')}
          >
            <IconRoute size={16} aria-hidden="true" /> {t('itinerary')}
          </button>
          <button
            type="button"
            className={'mobiletabs__btn' + (mobileView === 'map' ? ' is-active' : '')}
            onClick={() => setMobileView('map')}
          >
            <IconMap size={16} aria-hidden="true" /> {t('map')}
          </button>
        </nav>
      </div>
    </main>
  );
}
