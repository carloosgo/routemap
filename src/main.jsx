import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { I18nProvider } from './i18n/index.jsx';
import './modules/map/placeSavePopupDismiss.js';
import './index.css';
import './app/FloatingEditorPlacement.css';
import './app/FloatingEditorPolish.css';
import './app/EditorNavigationIcons.css';
import './app/SegmentInteractionColors.css';
import './app/WorkspaceMenuMapPolish.css';
import './app/ItinerarySidebar.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
