import { useEffect } from 'react';

const DESKTOP_BREAKPOINT = 721;
const BASE_SEARCH_WIDTH = 440;
const MIN_SEARCH_WIDTH = 320;

function finiteRectLeft(element) {
  const left = element?.getBoundingClientRect?.().left;
  return Number.isFinite(left) ? left : null;
}

export function useWorkspacePanelGeometry() {
  useEffect(() => {
    const app = globalThis.document?.querySelector('.app');
    if (!app) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const viewportWidth = app.getBoundingClientRect().width || globalThis.innerWidth || 0;
      if (viewportWidth < DESKTOP_BREAKPOINT) {
        app.style.removeProperty('--workspace-panel-width');
        app.style.removeProperty('--geo-search-max-width');
        return;
      }

      const metrics = app.querySelector('.trip-summary__metrics');
      const dateIcon = app.querySelector(
        '.trip-summary__metric--dates .trip-summary__metric-icon'
      );
      const separatorX = finiteRectLeft(metrics);
      const dateIconX = finiteRectLeft(dateIcon);
      if (
        separatorX == null
        || dateIconX == null
        || dateIconX <= separatorX
      ) return;

      // The requested panel edge is the exact midpoint between the Notes/Dates
      // separator and the leading edge of the Dates icon. The header split is
      // deliberately independent from this variable, so measuring it cannot
      // feed back into the geometry being measured.
      const panelEdge = separatorX + (dateIconX - separatorX) / 2;
      app.style.setProperty('--workspace-panel-width', `${panelEdge.toFixed(2)}px`);

      // Keep the search field proportional to the remaining map space, but
      // deliberately shorter than the previous 550px surface so it no longer
      // dominates the map after the routes panel is widened.
      const baselineMapWidth = Math.max(1, viewportWidth - separatorX);
      const currentMapWidth = Math.max(1, viewportWidth - panelEdge);
      const proportionalWidth = BASE_SEARCH_WIDTH * (currentMapWidth / baselineMapWidth);
      const searchWidth = Math.min(
        BASE_SEARCH_WIDTH,
        Math.max(MIN_SEARCH_WIDTH, proportionalWidth)
      );
      app.style.setProperty('--geo-search-max-width', `${searchWidth.toFixed(2)}px`);
    };

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    schedule();
    const header = app.querySelector('.trip-summary');
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedule)
      : null;
    if (header) observer?.observe(header);
    observer?.observe(app);
    globalThis.addEventListener?.('resize', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      globalThis.removeEventListener?.('resize', schedule);
      app.style.removeProperty('--workspace-panel-width');
      app.style.removeProperty('--geo-search-max-width');
    };
  }, []);
}
