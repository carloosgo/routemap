import React from 'react';
import ReactDOM from 'react-dom/client';
import './modules/map/landmarkLayerPatch.js';
import App from './App.jsx';
import { I18nProvider } from './i18n/index.jsx';
import './index.css';
import './app/FloatingEditorPlacement.css';
import './app/FloatingEditorPolish.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
