import React from 'react';
import { createRoot } from 'react-dom/client';
const App = React.lazy(() => import('./App.jsx'));
const PublicPortal = React.lazy(() => import('./components/CustomerPortal.jsx'));
import './styles.css';
import './operations.css';
import './theme.css';
import './mobile-records.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <React.Suspense fallback={<div className="loading">Cargando FarmaCali…</div>}>
      {window.location.pathname === '/portal' || window.location.pathname.startsWith('/portal/') ? (
        <PublicPortal />
      ) : (
        <App />
      )}
    </React.Suspense>
  </React.StrictMode>,
);
