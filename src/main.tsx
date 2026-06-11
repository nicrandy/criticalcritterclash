import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { CritterPage } from './CritterPage';
import { AdminPage } from './AdminPage';
import './index.css';

// GitHub Pages 404 redirect: /?p=/ABCD1234 → /ABCD1234
const params = new URLSearchParams(window.location.search);
const redirectPath = params.get('p');
if (redirectPath) {
  window.history.replaceState(null, '', redirectPath);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/:id"   element={<CritterPage />} />
        <Route path="/*"     element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
