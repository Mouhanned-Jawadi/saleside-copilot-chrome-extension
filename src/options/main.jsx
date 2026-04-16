import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readBackendBaseUrl } from '../shared/storage.js';
import './styles.css';

function Options() {
  const [backendUrl, setBackendUrl] = useState('');

  useEffect(() => {
    readBackendBaseUrl().then(setBackendUrl);
  }, []);

  return (
    <div className="options-shell">
      <img src="/logo-black.svg" alt="SaleSide" className="options-logo" />
      <h1>SaleSide Co-Pilot Settings</h1>
      <p>The extension is locked to your production SaleSide backend.</p>
      <div className="options-card">
        <label>
          Backend URL
          <input value={backendUrl} readOnly />
        </label>
      </div>
      <div className="hint">After saving, open the popup or side panel and sign in with your SaleSide credentials or Google auth.</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Options />);