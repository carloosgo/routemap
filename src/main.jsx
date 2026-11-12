import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthGate from './app/AuthGate.jsx';
import SharedDayPage from './app/SharedDayPage.jsx';
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
import './app/MobileAppShell.css';
import './app/MapCapsules.css';
import './app/MobileNoHeader.css';

const sharedDayRoute = globalThis.location?.pathname?.match(/^\/share\/dia\/([^/]+)\/?$/);
const sharedRoute = globalThis.location?.pathname?.match(/^\/share\/([^/]+)\/?$/);
let content = <AuthGate />;
if (sharedDayRoute) content = <SharedDayPage shareId={decodeURIComponent(sharedDayRoute[1])} />;
else if (sharedRoute) content = <SharedItineraryPage shareId={decodeURIComponent(sharedRoute[1])} />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    {content}
  </I18nProvider>
);
