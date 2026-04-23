import { clearAuthSnapshot, normalizeBaseUrl, readBackendBaseUrl, storageGet, storageSet } from './shared/storage.js';
import { DEFAULT_BACKEND_BASE_URL, STORAGE_KEYS } from './shared/constants.js';

let pendingGoogleAuthTabId = null;
let macPopupWindowId = null;

async function openGoogleAuthTab() {
  const baseUrl = await readBackendBaseUrl();

  if (!baseUrl) {
    throw new Error('SaleSide backend URL is not available for Google login.');
  }

  const authUrl = `${baseUrl}/api/oauth2/google/login`;
  const tab = await chrome.tabs.create({ url: authUrl, active: true });
  pendingGoogleAuthTabId = tab.id;
  return tab;
}

function extractSuccessToken(url) {
  try {
    const parsed = new URL(url);
    const token = parsed.searchParams.get('success');
    const error = parsed.searchParams.get('error');

    if (token) {
      return { token, error: null };
    }

    if (error) {
      return { token: null, error };
    }
  } catch {
    // Ignore malformed URLs.
  }

  return { token: null, error: null };
}

async function handleGoogleAuthRedirect(url, tabId) {
  if (pendingGoogleAuthTabId !== tabId) {
    return;
  }

  const { token, error } = extractSuccessToken(url);
  if (!token && !error) {
    return;
  }

  if (token) {
    await storageSet({ [STORAGE_KEYS.accessToken]: token });
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // ignore
    }
    chrome.runtime.sendMessage({ type: 'saleside:auth-updated' }).catch(() => {});
  }

  if (error) {
    chrome.runtime.sendMessage({ type: 'saleside:auth-error', error }).catch(() => {});
  }

  pendingGoogleAuthTabId = null;
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storageGet([STORAGE_KEYS.apiBaseUrl]);
  if (!normalizeBaseUrl(existing[STORAGE_KEYS.apiBaseUrl])) {
    await storageSet({ [STORAGE_KEYS.apiBaseUrl]: DEFAULT_BACKEND_BASE_URL });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'saleside:start-google-login') {
    openGoogleAuthTab()
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'saleside:clear-auth') {
    clearAuthSnapshot().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'saleside:open-popup-window') {
    (async () => {
      // If the window is still open, just focus it.
      if (macPopupWindowId !== null) {
        try {
          await chrome.windows.update(macPopupWindowId, { focused: true });
          sendResponse({ ok: true });
          return;
        } catch {
          macPopupWindowId = null;
        }
      }
      try {
        const win = await chrome.windows.create({
          url: chrome.runtime.getURL('sidepanel.html'),
          type: 'popup',
          width: 460,
          height: 780,
          focused: true,
        });
        macPopupWindowId = win.id;
        // Clear the tracked ID when the user closes the window.
        chrome.windows.onRemoved.addListener(function onRemoved(removedId) {
          if (removedId === macPopupWindowId) {
            macPopupWindowId = null;
            chrome.windows.onRemoved.removeListener(onRemoved);
          }
        });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'saleside:open-sidepanel') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (typeof tabId === 'number') {
        try {
          await chrome.sidePanel.open({ tabId });
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: error.message });
        }
      } else {
        sendResponse({ ok: false, error: 'No active tab found.' });
      }
    });
    return true;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    handleGoogleAuthRedirect(changeInfo.url, tabId);
    return;
  }

  if (tab?.url) {
    handleGoogleAuthRedirect(tab.url, tabId);
  }
});