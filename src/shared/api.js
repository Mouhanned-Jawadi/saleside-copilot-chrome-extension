import { readAccessToken, readBackendBaseUrl, storageSet } from './storage.js';
import { STORAGE_KEYS } from './constants.js';

export async function getApiBaseUrl() {
  return readBackendBaseUrl();
}

async function getAuthHeaders({ includeJson = true } = {}) {
  const headers = {};
  const token = await readAccessToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export async function request(path, options = {}) {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) {
    throw new Error('SaleSide backend URL is not available.');
  }

  const shouldSendJson = !options.formBody && typeof options.body !== 'undefined' && !(options.body instanceof FormData) && typeof options.rawBody === 'undefined';
  const headers = options.auth === false
    ? {}
    : await getAuthHeaders({ includeJson: shouldSendJson });
  const finalHeaders = { ...headers, ...(options.headers || {}) };
  const init = {
    method: options.method || 'GET',
    headers: finalHeaders,
    credentials: 'include',
  };

  if (options.formBody) {
    init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(options.formBody).toString();
  } else if (options.body instanceof FormData) {
    delete init.headers['Content-Type'];
    init.body = options.body;
  } else if (typeof options.rawBody !== 'undefined') {
    init.body = options.rawBody;
  } else if (typeof options.body !== 'undefined') {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${baseUrl}${path}`, init);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error((data && data.detail) || response.statusText || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return { data, response };
}

export async function loginWithPassword(email, password) {
  const { data } = await request('/api/auth/login', {
    method: 'POST',
    auth: false,
    formBody: {
      username: email,
      password,
    },
  });

  if (data?.access_token) {
    await storageSet({ [STORAGE_KEYS.accessToken]: data.access_token });
  }

  return data;
}

export async function getCurrentUser() {
  const { data } = await request('/api/auth/me', { method: 'GET' });
  return data?.user || null;
}

export async function fetchCompanyConfig() {
  const { data } = await request('/api/config/company', { method: 'GET' });
  return data?.company_config || null;
}

export async function sendCopilotMessage(message, conversationId) {
  const { data } = await request('/api/assistant/copilot/chat', {
    method: 'POST',
    body: {
      message,
      conversation_id: conversationId || null,
    },
  });

  return data;
}

export async function fetchCopilotConversation(conversationId) {
  const { data } = await request(`/api/assistant/copilot/conversations/${conversationId}`, { method: 'GET' });
  return data;
}

export async function deleteCopilotConversation(conversationId) {
  return request(`/api/assistant/copilot/conversations/${conversationId}`, { method: 'DELETE' });
}

export async function saveBackendBaseUrl(url) {
  await storageSet({ [STORAGE_KEYS.apiBaseUrl]: url });
}