import { IconMap, IconRoute } from '@tabler/icons-react';

export function AppWorkspace({ editorModule, mapPane, mobileView, setMobileView, t }) {
  return (
    <main className="workspace">
      <div className="workspace__desktop workspace__desktop--floating">
        {mapPane}
        <div className="floating-editor">{editorModule}</div>
      </div>
      <div className="workspace__mobile">
        <div className={'mobilepane' + (mobileView === 'form' ? ' is-active' : '')}>
          {editorModule}
        </div>
        <div className={'mobilepane' + (mobileView === 'map' ? ' is-active' : '')}>
          {mapPane}
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
