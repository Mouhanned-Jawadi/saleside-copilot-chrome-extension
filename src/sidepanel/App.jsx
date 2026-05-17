import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  COPILOT_WELCOME_MESSAGE,
  DEFAULT_PROMPTS,
  STORAGE_KEYS,
} from '../shared/constants.js';
import {
  deleteCopilotConversation,
  fetchCopilotConversation,
  fetchCompanyConfig,
  getCurrentUser,
  loginWithPassword,
  sendCopilotMessage,
} from '../shared/api.js';
import {
  clearAuthSnapshot,
  readAccessToken,
  setAuthSnapshot,
  storageGet,
  storageSet,
} from '../shared/storage.js';

function formatList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function shortLabel(value) {
  if (!value) return 'Not configured';
  return String(value).trim();
}

function SourceChip({ label, value }) {
  return (
    <div className="source-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [user, setUser] = useState(null);
  const [companyConfig, setCompanyConfig] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([COPILOT_WELCOME_MESSAGE]);
  const [chatLoading, setChatLoading] = useState(false);
  const [copilotSources, setCopilotSources] = useState(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  const assistantName = companyConfig?.assistant_name || 'SaleSide Co-Pilot';
  const companyName = companyConfig?.company_name || user?.organization?.name || 'Your workspace';
  const hasConfig = Boolean(companyConfig);

  const configSummary = useMemo(() => ({
    companyName: shortLabel(companyConfig?.company_name),
    productName: shortLabel(companyConfig?.product_name),
    audience: shortLabel(companyConfig?.target_audience),
    valueProp: shortLabel(companyConfig?.value_proposition),
    pricing: shortLabel(companyConfig?.pricing_structure),
    assistantName: shortLabel(companyConfig?.assistant_name),
    keyFeatures: formatList(companyConfig?.key_features),
  }), [companyConfig]);

  const hydrateSession = async () => {
    const storedToken = await readAccessToken();
    const storedConversation = await storageGet([STORAGE_KEYS.copilotConversationId]);

    if (storedToken) {
      try {
        const currentUser = await getCurrentUser();
        const config = await fetchCompanyConfig();
        setUser(currentUser);
        setCompanyConfig(config);
        await setAuthSnapshot({ currentUser });
        await storageSet({
          [STORAGE_KEYS.companyConfig]: JSON.stringify(config),
        });
        const existingConversationId = storedConversation[STORAGE_KEYS.copilotConversationId];
        if (existingConversationId) {
          const parsed = Number(existingConversationId);
          if (Number.isFinite(parsed) && parsed > 0) {
            setConversationId(parsed);
          }
        }
      } catch (error) {
        if (error?.status === 401) {
          await clearAuthSnapshot();
          setUser(null);
          setCompanyConfig(null);
          setConversationId(null);
          setMessages([COPILOT_WELCOME_MESSAGE]);
        }
      }
    } else {
      setUser(null);
      setCompanyConfig(null);
      setConversationId(null);
      setMessages([COPILOT_WELCOME_MESSAGE]);
    }

    setBootstrapReady(true);
    setLoading(false);
  };

  useEffect(() => {
    hydrateSession();
  }, []);

  useEffect(() => {
    if (!conversationId) {
      storageSet({ [STORAGE_KEYS.copilotConversationId]: '' });
      return;
    }

    storageSet({ [STORAGE_KEYS.copilotConversationId]: String(conversationId) });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([COPILOT_WELCOME_MESSAGE]);
      return;
    }

    let cancelled = false;
    fetchCopilotConversation(conversationId)
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.history) && data.history.length) {
          setMessages(data.history);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.status === 404) {
          setConversationId(null);
          setMessages([COPILOT_WELCOME_MESSAGE]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chatLoading]);

  useEffect(() => {
    const listener = (msg) => {
      if (msg?.type === 'saleside:auth-updated') {
        hydrateSession();
      }
      if (msg?.type === 'saleside:auth-error') {
        setAuthError(msg.error || 'Google sign-in failed.');
      }
    };

    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
    }

    return () => {
      if (chrome?.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(listener);
      }
    };
  }, []);

  const handlePasswordLogin = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthMessage('');

    try {
      const loginResponse = await loginWithPassword(email, password);
      const currentUser = await getCurrentUser();
      const config = await fetchCompanyConfig();
      setUser(currentUser);
      setCompanyConfig(config);
      await setAuthSnapshot({ accessToken: loginResponse?.access_token, currentUser });
      await storageSet({
        [STORAGE_KEYS.companyConfig]: JSON.stringify(config),
      });
      setAuthMessage('Signed in successfully.');
      setPassword('');
    } catch (error) {
      setAuthError(error?.message || 'Login failed.');
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    setAuthMessage('');
    const response = await chrome.runtime.sendMessage({ type: 'saleside:start-google-login' });
    if (!response?.ok) {
      setAuthError(response?.error || 'Unable to start Google sign-in.');
    } else {
      setAuthMessage('Google auth opened in a new tab. Finish sign-in there.');
    }
  };

  const handleLogout = async () => {
    await clearAuthSnapshot();
    setUser(null);
    setCompanyConfig(null);
    setConversationId(null);
    setMessages([COPILOT_WELCOME_MESSAGE]);
    setAuthMessage('Signed out.');
  };

  const handleSend = async (event, promptOverride) => {
    event?.preventDefault?.();
    const prompt = (promptOverride ?? message).trim();
    if (!prompt || chatLoading || !bootstrapReady) {
      return;
    }

    setChatLoading(true);
    setAuthError('');
    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setMessage('');

    try {
      const response = await sendCopilotMessage(prompt, conversationId);
      if (response?.conversation_id) {
        setConversationId(response.conversation_id);
      }
      if (Array.isArray(response?.history) && response.history.length) {
        setMessages(response.history);
      } else if (response?.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
      }
      setCopilotSources(response?.sources || null);
    } catch (error) {
      setAuthError(error?.message || 'Failed to get a copilot response.');
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setChatLoading(false);
    }
  };

  const handleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAuthError('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      setAuthError('');
    };
    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };
    recognition.onerror = (e) => {
      setIsListening(false);
      setInterimText('');
      if (e.error === 'not-allowed') {
        setAuthError(
          'Microphone blocked. To fix: open a new Chrome tab, go to chrome://settings/content/microphone, find this extension under "Not allowed" and move it to "Allowed". Then reload the extension and try again.'
        );
      } else if (e.error !== 'no-speech') {
        setAuthError(`Voice error: ${e.error}`);
      }
    };
    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (const result of event.results) {
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (finalText) {
        setMessage((prev) => (prev ? `${prev} ${finalText.trim()}` : finalText.trim()));
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleClearConversation = async () => {
    if (!conversationId) {
      setMessages([COPILOT_WELCOME_MESSAGE]);
      setCopilotSources(null);
      return;
    }

    setChatLoading(true);
    try {
      await deleteCopilotConversation(conversationId);
      setConversationId(null);
      setMessages([COPILOT_WELCOME_MESSAGE]);
      setCopilotSources(null);
      setAuthMessage('Conversation cleared.');
    } catch (error) {
      setAuthError(error?.message || 'Failed to clear the conversation.');
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="panel-shell panel-shell--loading">
        <div className="brand-mark" />
        <div className="loading-copy">Preparing SaleSide Co-Pilot...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="panel-shell auth-shell">
        <div className="hero-banner">
          <img src="/logo-white-no-text.svg" alt="SaleSide" className="hero-logo" />
          <div>
            <div className="eyebrow">Chrome co-pilot</div>
            <h1>SaleSide Co-Pilot</h1>
            <p>Connected to your production SaleSide backend by default. Sign in to continue.</p>
          </div>
        </div>

        <form className="auth-card auth-card--dense" onSubmit={handlePasswordLogin}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary-button">Sign in</button>
            <button type="button" className="ghost-button" onClick={handleGoogleLogin}>Continue with Google</button>
          </div>
        </form>

        {authMessage ? <div className="notice notice--success">{authMessage}</div> : null}
        {authError ? <div className="notice notice--error">{authError}</div> : null}

        <div className="footer-note">
          You will use the same /api/auth, /api/config/company, and /api/assistant/copilot endpoints as the main app.
        </div>
      </div>
    );
  }

  return (
    <div className="panel-shell">
      <header className="panel-header">
        <div className="header-brand">
          <img src="/logo-white-no-text.svg" alt="SaleSide" className="header-logo" />
          <div>
            <div className="eyebrow">Live workspace</div>
            <h1>Co-Pilot</h1>
          </div>
        </div>
        <div className="header-actions">
          <span className="live-pill">Live</span>
          <button type="button" className="icon-button" onClick={handleClearConversation} title="Clear conversation">↺</button>
          <button type="button" className="icon-button" onClick={handleLogout} title="Sign out">⎋</button>
        </div>
      </header>

      <section className="workspace-card workspace-card--compact">
        <div className="workspace-summary">
          <div>
            <div className="summary-label">Workspace</div>
            <div className="summary-value">{companyName}</div>
          </div>
          <div>
            <div className="summary-label">Assistant</div>
            <div className="summary-value">{assistantName}</div>
          </div>
        </div>
        <div className="status-row">
          <span className="status-dot" />
          <span>{conversationId ? `Conversation ${conversationId}` : 'Fresh context'}</span>
        </div>
      </section>

      <section className="workspace-card config-card">
        <div className="section-title">Config snapshot</div>
        <div className="config-grid">
          <SourceChip label="Company" value={configSummary.companyName} />
          <SourceChip label="Product" value={configSummary.productName} />
          <SourceChip label="Audience" value={configSummary.audience} />
          <SourceChip label="Pricing" value={configSummary.pricing} />
        </div>
        <div className="config-note">{hasConfig ? 'This is pulled from /api/config/company and kept in sync with the web app.' : 'No live company config found yet. Add it in SaleSide to make the copilot sharper.'}</div>
      </section>

      <section className="chat-panel">
        <div className="chat-stream">
          {messages.map((item, index) => (
            <article key={`${item.role}-${index}`} className={`message message--${item.role}`}>
              <div className="message-badge">{item.role === 'user' ? 'You' : 'SaleSide'}</div>
              <div className="message-body">{item.content}</div>
            </article>
          ))}
          <div ref={scrollRef} />
        </div>

        <form className="composer" onSubmit={(event) => handleSend(event)}>
          <textarea
            rows="3"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about pricing, objections, positioning, or the next best move..."
          />
          <div className="voice-interim" aria-live="polite">
            {isListening ? interimText : ''}
          </div>
          <div className="prompt-row">
            {DEFAULT_PROMPTS.map((prompt) => (
              <button type="button" key={prompt} className="prompt-chip" onClick={(event) => handleSend(event, prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <div className="composer-actions">
            <button
              type="button"
              className={`icon-button mic-button${isListening ? ' mic-button--active' : ''}`}
              onClick={handleVoice}
              title={isListening ? 'Stop recording' : 'Start voice input'}
            >
              🎤
            </button>
            <button type="submit" className="primary-button" disabled={chatLoading}>Send</button>
          </div>
        </form>
      </section>

      <section className="sources-card">
        <div className="section-title">Sources and context</div>
        <div className="sources-grid">
          <SourceChip label="Company config" value={copilotSources?.config?.has_config ? 'Loaded' : 'Missing'} />
          <SourceChip label="Call intelligence" value={copilotSources?.intelligence?.has_call_data ? 'Loaded' : 'Missing'} />
          <SourceChip label="History" value={conversationId ? 'Restored' : 'New'} />
        </div>
        {configSummary.keyFeatures.length ? (
          <div className="feature-list">
            {configSummary.keyFeatures.slice(0, 4).map((item) => (
              <span key={item} className="feature-pill">{item}</span>
            ))}
          </div>
        ) : null}
      </section>

      {authMessage ? <div className="notice notice--success">{authMessage}</div> : null}
      {authError ? <div className="notice notice--error">{authError}</div> : null}
    </div>
  );
}

export default App;