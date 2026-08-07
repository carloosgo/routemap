import { useEffect, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconMap, IconRoute } from '@tabler/icons-react';
import './DockedWorkspace.css';

const MOBILE_MEDIA_QUERY = '(max-width: 720px)';
const DEFAULT_DESKTOP_PANEL_WIDTH = 420;
const MIN_DESKTOP_PANEL_WIDTH = 360;
const MAX_DESKTOP_PANEL_WIDTH = 700;
const MIN_DESKTOP_MAP_WIDTH = 360;

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
  const [desktopPanelWidth, setDesktopPanelWidth] = useState(DEFAULT_DESKTOP_PANEL_WIDTH);
  const [desktopPanelResizing, setDesktopPanelResizing] = useState(false);
  const desktopWorkspaceRef = useRef(null);
  const resizePointerRef = useRef(null);

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

  function panelWidthForPointer(clientX) {
    const bounds = desktopWorkspaceRef.current?.getBoundingClientRect();
    if (!bounds) return desktopPanelWidth;
    const maxWidth = Math.min(
      MAX_DESKTOP_PANEL_WIDTH,
      Math.max(MIN_DESKTOP_PANEL_WIDTH, bounds.width - MIN_DESKTOP_MAP_WIDTH)
    );
    return Math.min(
      maxWidth,
      Math.max(MIN_DESKTOP_PANEL_WIDTH, clientX - bounds.left)
    );
  }

  function handleResizeStart(event) {
    if (desktopPanelCollapsed || event.button !== 0) return;
    resizePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDesktopPanelResizing(true);
    event.preventDefault();
  }

  function handleResizeMove(event) {
    if (resizePointerRef.current !== event.pointerId) return;
    setDesktopPanelWidth(panelWidthForPointer(event.clientX));
  }

  function handleResizeEnd(event) {
    if (resizePointerRef.current !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    resizePointerRef.current = null;
    setDesktopPanelResizing(false);
  }

  return (
    <main className="workspace">
      <div
        ref={desktopWorkspaceRef}
        className={
          'workspace__desktop workspace__desktop--column'
          + (desktopPanelCollapsed ? ' is-panel-collapsed' : '')
          + (desktopPanelResizing ? ' is-panel-resizing' : '')
        }
        style={{ '--workspace-panel-width': `${desktopPanelWidth}px` }}
      >
        <aside className="workspace-panel">
          <div className="workspace-panel__content floating-editor">{editorModule}</div>
        </aside>
        <div
          className="workspace-divider"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        >
          <button
            type="button"
            className="workspace-panel__toggle"
            aria-label={t(desktopPanelCollapsed ? 'expand' : 'collapse')}
            aria-expanded={!desktopPanelCollapsed}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setDesktopPanelCollapsed((current) => !current)}
          >
            {desktopPanelCollapsed
              ? <IconChevronRight size={16} aria-hidden="true" />
              : <IconChevronLeft size={16} aria-hidden="true" />}
          </button>
        </div>
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
