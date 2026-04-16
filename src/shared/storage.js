import { DEFAULT_BACKEND_BASE_URL, STORAGE_KEYS } from './constants.js';

function isChromeStorageAvailable() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

export function storageGet(keys) {
  if (!isChromeStorageAvailable()) {
    return Promise.resolve({});
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items || {}));
  });
}

export function storageSet(values) {
  if (!isChromeStorageAvailable()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

export function storageRemove(keys) {
  if (!isChromeStorageAvailable()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

export function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

export async function readBackendBaseUrl() {
  return normalizeBaseUrl(DEFAULT_BACKEND_BASE_URL);
}

export async function readAccessToken() {
  const stored = await storageGet([STORAGE_KEYS.accessToken]);
  return stored[STORAGE_KEYS.accessToken] || '';
}

export async function readCurrentUser() {
  const stored = await storageGet([STORAGE_KEYS.currentUser]);
  try {
    return stored[STORAGE_KEYS.currentUser] ? JSON.parse(stored[STORAGE_KEYS.currentUser]) : null;
  } catch {
    return null;
  }
}

export async function readCompanyConfig() {
  const stored = await storageGet([STORAGE_KEYS.companyConfig]);
  try {
    return stored[STORAGE_KEYS.companyConfig] ? JSON.parse(stored[STORAGE_KEYS.companyConfig]) : null;
  } catch {
    return null;
  }
}

export async function setAuthSnapshot({ accessToken, currentUser }) {
  const payload = {};

  if (typeof accessToken !== 'undefined') {
    payload[STORAGE_KEYS.accessToken] = accessToken || '';
  }

  if (typeof currentUser !== 'undefined') {
    payload[STORAGE_KEYS.currentUser] = currentUser ? JSON.stringify(currentUser) : '';
  }

  await storageSet(payload);
}

export async function clearAuthSnapshot() {
  await storageRemove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.currentUser,
    STORAGE_KEYS.companyConfig,
    STORAGE_KEYS.copilotConversationId,
    STORAGE_KEYS.copilotMessages,
  ]);
}