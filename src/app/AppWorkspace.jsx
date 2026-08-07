import { useEffect, useState } from 'react';
import { IconMap, IconRoute } from '@tabler/icons-react';

const MOBILE_MEDIA_QUERY = '(max-width: 720px)';

function currentMobileViewport() {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia(MOBILE_MEDIA_QUERY).matches
    : false;
}

export function AppWorkspace({ editorModule, mapPane, mobileView, setMobileView, t }) {
  const [mobileViewport, setMobileViewport] = useState(currentMobileViewport);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return undefined;
    const media = globalThis.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event) => setMobileViewport(event.matches);
    setMobileViewport(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  return (
    <main className="workspace">
      <div className="workspace__desktop workspace__desktop--floating">
        {!mobileViewport && mapPane}
        <div className="floating-editor">{editorModule}</div>
      </div>
      <div className="workspace__mobile">
        <div className={'mobilepane' + (mobileView === 'form' ? ' is-active' : '')}>
          {editorModule}
        </div>
        <div className={'mobilepane' + (mobileView === 'map' ? ' is-active' : '')}>
          {mobileViewport && mapPane}
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
