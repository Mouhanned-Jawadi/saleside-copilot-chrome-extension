import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { readBackendBaseUrl, readCurrentUser } from '../shared/storage.js';
import './styles.css';

function Popup() {
  const [user, setUser] = useState(null);
  const [backendUrl, setBackendUrl] = useState('');

  useEffect(() => {
    readCurrentUser().then(setUser);
    readBackendBaseUrl().then(setBackendUrl);
  }, []);

  const openSidePanel = async () => {
    await chrome.runtime.sendMessage({ type: 'saleside:open-sidepanel' });
    window.close();
  };

  const startGoogleLogin = async () => {
    await chrome.runtime.sendMessage({ type: 'saleside:start-google-login' });
    window.close();
  };

  return (
    <div className="popup-shell">
      <img src="/logo-black.svg" alt="SaleSide" className="popup-logo" />
      <h1>SaleSide Co-Pilot</h1>
      <p>{user ? `Signed in as ${user?.email || user?.name || 'workspace user'}` : 'Sign in and open the side panel to chat with your workspace copilot.'}</p>
      <div className="popup-actions">
        <button type="button" className="primary-button" onClick={openSidePanel}>Open side panel</button>
        {!user ? <button type="button" className="secondary-button" onClick={startGoogleLogin}>Google sign-in</button> : null}
      </div>
      <div className="popup-footer">API: {backendUrl || 'https://saleside-back-20-production.up.railway.app'}</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Popup />);