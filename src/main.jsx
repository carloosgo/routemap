import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SharedItineraryPage from './app/SharedItineraryPage.jsx';
import { I18nProvider } from './i18n/index.jsx';
import './modules/map/placeSavePopupDismiss.js';
import './index.css';
import './app/FloatingEditorPlacement.css';
import './app/FloatingEditorPolish.css';
import './app/EditorNavigationIcons.css';
import './app/SegmentInteractionColors.css';
import './app/WorkspaceMenuMapPolish.css';
import './app/ItinerarySidebar.css';
import './app/ItineraryTripHeader.css';
import './app/TripSummaryHeader.css';
import './app/TripSummaryHeaderTypography.css';
import './app/TripHeaderNavigation.css';
import './app/TripWorkspaceHeaderLayout.css';
import './app/HeaderRequestedPolish.css';
import './app/NotePanelPlacement.css';
import './app/FloatingItineraryPanel.css';
import './modules/trips/ItineraryCompactTen.css';

const sharedRoute = globalThis.location?.pathname?.match(/^\/share\/([^/]+)\/?$/);
const content = sharedRoute
  ? <SharedItineraryPage shareId={decodeURIComponent(sharedRoute[1])} />
  : <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    {content}
  </I18nProvider>
);
