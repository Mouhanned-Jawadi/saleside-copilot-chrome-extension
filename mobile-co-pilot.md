# SaleSide Co-Pilot — Mobile App Plan
**Target:** Native iOS + Android app, single codebase, publishable to App Store and Google Play  
**Stack:** React Native + Expo (Managed Workflow) + EAS Build  
**Source of truth:** This doc. Implementation follows phases in order.

---

## 1. Why React Native + Expo

| Criterion | React Native + Expo | Flutter | PWA / Capacitor |
|---|---|---|---|
| Code reuse from extension | High — same React patterns, same fetch/axios API layer | Low — Dart rewrite | Medium — web code runs, but still a wrapper |
| True native UI | Yes | Yes | No |
| iOS + Android from one codebase | Yes | Yes | Yes |
| App Store / Play Store submission | EAS Build handles it | Manual or Fastlane | Harder (PWA store policies) |
| Google OAuth native support | `expo-auth-session` — first class | Requires Firebase plugin | Via webview |
| Team ramp-up (you already know React) | Immediate | New language | Immediate |

**Decision: React Native + Expo Managed Workflow.**  
Expo Managed means no Xcode/Android Studio required until production build time. EAS Build handles compilation in the cloud.

---

## 2. What Gets Ported From the Extension

The extension is a **pure text-chat interface** with REST API calls. No audio, no WebRTC. Everything maps cleanly to mobile:

| Extension piece | Mobile equivalent |
|---|---|
| `shared/api.js` (fetch + Bearer token) | Reuse 1:1 — same endpoints, same headers |
| `shared/constants.js` (URLs, prompts) | Reuse 1:1 |
| `chrome.storage.local` | `expo-secure-store` (tokens) + `@react-native-async-storage/async-storage` (config/history) |
| Google OAuth tab flow | `expo-auth-session` + `expo-web-browser` (PKCE flow) |
| Password login form | Native TextInput components, same `POST /api/auth/login` |
| Chat UI (messages, scroll) | `FlatList` (performant, native scroll) |
| Config snapshot card | Native View + Text components |
| Suggested prompts | `TouchableOpacity` pill buttons |
| Side panel layout | Stack Navigator screen (React Navigation) |

---

## 3. Project Structure (Target)

```
SaleSide-Mobile-Co-Pilot/
├── app.json                     # Expo config (bundle ID, icons, splash)
├── eas.json                     # EAS Build profiles (development/preview/production)
├── App.tsx                      # Root: NavigationContainer + AuthProvider
├── src/
│   ├── shared/
│   │   ├── api.ts               # Ported from extension — same endpoints
│   │   ├── constants.ts         # Ported from extension — same defaults
│   │   └── storage.ts           # AsyncStorage + SecureStore wrappers
│   ├── context/
│   │   └── AuthContext.tsx      # Auth state, token management, login/logout
│   ├── screens/
│   │   ├── LoginScreen.tsx      # Email/password + Google OAuth button
│   │   └── CoPilotScreen.tsx    # Main chat screen (the full UI)
│   ├── components/
│   │   ├── ChatMessage.tsx      # Single message bubble (user/assistant)
│   │   ├── ChatComposer.tsx     # TextInput + Send button
│   │   ├── PromptPills.tsx      # Suggested prompt buttons
│   │   ├── ConfigCard.tsx       # Company config snapshot
│   │   └── SourceChips.tsx      # Context source indicators
│   └── hooks/
│       ├── useAuth.ts           # Auth token retrieval + refresh
│       └── useConversation.ts   # Chat state, send message, clear history
├── assets/
│   ├── icon.png                 # 1024x1024 app icon
│   ├── splash.png               # Splash screen
│   └── adaptive-icon.png        # Android adaptive icon
└── package.json
```

---

## 4. Tech Dependencies

```json
"dependencies": {
  "expo": "~52.0.0",
  "react": "18.3.2",
  "react-native": "0.76.x",
  "@react-navigation/native": "^7.x",
  "@react-navigation/stack": "^7.x",
  "expo-auth-session": "^6.x",
  "expo-web-browser": "^14.x",
  "expo-secure-store": "^14.x",
  "@react-native-async-storage/async-storage": "^2.x",
  "expo-constants": "^17.x",
  "expo-status-bar": "^2.x"
}
```

No extra UI library needed — the extension uses custom CSS which maps to StyleSheet in React Native. Keep it lean.

---

## 5. Implementation Phases

### Phase 1 — Project Bootstrap (Day 1)
**Goal:** Running shell on device/simulator with correct navigation structure.

- [ ] `npx create-expo-app SaleSide-Mobile-Co-Pilot --template blank-typescript`
- [ ] Install all dependencies from Section 4
- [ ] Set up React Navigation: `NavigationContainer` → `Stack.Navigator` with `LoginScreen` and `CoPilotScreen`
- [ ] Create `AuthContext.tsx` with `{ token, user, setToken, clearAuth }` state
- [ ] Wire `App.tsx` to show `LoginScreen` when no token, `CoPilotScreen` when authenticated
- [ ] Verify hot reload works on Android emulator and iOS simulator

**Deliverable:** App launches, shows login screen, navigates to blank co-pilot screen on dummy token.

---

### Phase 2 — Storage + API Layer (Day 1–2)
**Goal:** Token persistence and all backend calls working.

- [ ] Port `shared/constants.ts` — `BASE_URL`, default prompts, storage keys
- [ ] Port `shared/api.ts` — all fetch calls with Bearer token header; replace `chrome.storage` reads with `SecureStore.getItemAsync`
- [ ] Write `shared/storage.ts`:
  - `saveToken(token)` → `SecureStore.setItemAsync('access_token', token)`
  - `getToken()` → `SecureStore.getItemAsync('access_token')`
  - `clearToken()` → `SecureStore.deleteItemAsync('access_token')`
  - `saveCompanyConfig(config)` → `AsyncStorage.setItem`
  - `getCompanyConfig()` → `AsyncStorage.getItem` + JSON.parse
  - `saveConversationId(id)` / `getConversationId()` → `AsyncStorage`
- [ ] Test: hit `GET /api/auth/me` with a manually pasted token, verify JSON response

**Deliverable:** API layer verified against live backend.

---

### Phase 3 — Authentication Screens (Day 2–3)
**Goal:** Full login flow working on device, token persisted across app restarts.

#### 3a — Email/Password Login
- [ ] Build `LoginScreen.tsx` layout: logo, email `TextInput`, password `TextInput` (secureTextEntry), Login button, Google button
- [ ] On submit: call `POST /api/auth/login`, store token via `saveToken()`, navigate to `CoPilotScreen`
- [ ] Show inline error on failed login
- [ ] On app start: `getToken()` in `App.tsx` — if exists skip `LoginScreen`, go straight to `CoPilotScreen`

#### 3b — Google OAuth
- [ ] Register app scheme in `app.json`: `"scheme": "saleside-mobile"`
- [ ] On backend side: add `saleside-mobile://auth/callback` to Google OAuth allowed redirect URIs
- [ ] Implement `expo-auth-session` PKCE flow:
  ```typescript
  const discovery = { authorizationEndpoint: `${BASE_URL}/api/oauth2/google/login` }
  const [request, response, promptAsync] = useAuthRequest({ ... }, discovery)
  ```
- [ ] On successful redirect: extract token from URL params, store, navigate
- [ ] Test on physical device (deep links require real device for full test)

**Deliverable:** Both login methods work. Token survives app kill/restart.

---

### Phase 4 — Co-Pilot Chat Screen (Day 3–5)
**Goal:** Full working AI chat, identical feature set to extension.

#### 4a — Layout
- [ ] `CoPilotScreen.tsx` structure:
  ```
  SafeAreaView
  ├── Header (logo, "Co-Pilot" title, Live pill, Clear button, Logout button)
  ├── ConfigCard (company name, assistant name, conversation status)
  ├── SourceChips (config loaded/missing, call data loaded/missing)
  ├── FlatList (chat messages — inverted for natural scroll-to-bottom)
  ├── PromptPills (horizontal ScrollView, pre-built prompts)
  └── ChatComposer (TextInput + Send TouchableOpacity)
  ```

#### 4b — Chat State (`useConversation.ts` hook)
- [ ] State: `messages[]`, `conversationId`, `isLoading`, `inputText`
- [ ] On mount: load saved `conversationId` from storage; if exists fetch history via `GET /api/assistant/copilot/conversations/{id}`; restore messages
- [ ] `sendMessage(text)`:
  1. Append user message to `messages` immediately (optimistic)
  2. Set `isLoading = true`
  3. Call `POST /api/assistant/copilot/chat` with `{ message: text, conversation_id }`
  4. Append assistant reply, save new `conversationId`, set `isLoading = false`
- [ ] `clearConversation()`: delete conversation via API, clear storage, reset state
- [ ] Show typing indicator (three animated dots) while `isLoading`

#### 4c — Message Component (`ChatMessage.tsx`)
- [ ] User messages: right-aligned, teal-to-cyan gradient background, white text
- [ ] Assistant messages: left-aligned, dark blue gradient, white text
- [ ] Timestamp optional (skip for v1, add in v2)

#### 4d — Config Card (`ConfigCard.tsx`)
- [ ] On mount: call `GET /api/config/company`, display: company name, product name, assistant name
- [ ] Show skeleton placeholder while loading

#### 4e — Keyboard Handling
- [ ] Wrap in `KeyboardAvoidingView` (behavior: `padding` on iOS, `height` on Android)
- [ ] `FlatList` uses `inverted` prop so new messages appear at bottom without manual scroll
- [ ] Dismiss keyboard on send

**Deliverable:** Full chat working — send messages, receive AI replies, history persists across sessions.

---

### Phase 5 — Visual Polish (Day 5–6)
**Goal:** App feels native and matches the extension's dark-professional aesthetic.

- [ ] Color tokens (match extension): `#0b1020` background, `#44c1a8` teal, `#6c5ce7` purple, `#1a2035` card bg
- [ ] Custom font: load `Inter` via `expo-font` (matches extension's sans-serif feel)
- [ ] Splash screen: dark background, SaleSide logo centered
- [ ] App icon: 1024x1024 with SaleSide branding
- [ ] Android adaptive icon: foreground + background layers
- [ ] Status bar: dark content on light, light content on dark header
- [ ] Haptic feedback on Send button: `expo-haptics`
- [ ] Smooth message appear animation: `Animated.FadeIn` for new assistant messages

**Deliverable:** App looks and feels like a real product, not a prototype.

---

### Phase 6 — EAS Build + Store Prep (Day 6–8)
**Goal:** Signed builds ready for internal testing and store submission.

#### 6a — EAS Setup
- [ ] `npm install -g eas-cli` + `eas login`
- [ ] `eas build:configure` → generates `eas.json`
- [ ] Configure build profiles in `eas.json`:
  ```json
  {
    "build": {
      "development": { "developmentClient": true, "distribution": "internal" },
      "preview": { "distribution": "internal" },
      "production": { "autoIncrement": true }
    }
  }
  ```

#### 6b — Android
- [ ] Set `package` in `app.json`: `"com.saleside.copilot"`
- [ ] `eas build --platform android --profile preview` → generates APK for internal testing
- [ ] Install on physical Android device, test full flow
- [ ] `eas build --platform android --profile production` → generates AAB for Play Store
- [ ] Create Google Play Console account → create app → upload AAB to Internal Testing track

#### 6c — iOS
- [ ] Set `bundleIdentifier` in `app.json`: `"com.saleside.copilot"`
- [ ] Enroll in Apple Developer Program ($99/year) if not already
- [ ] `eas build --platform ios --profile production` → EAS handles provisioning profiles and signing automatically
- [ ] Download IPA → upload to App Store Connect via `eas submit --platform ios` or Transporter
- [ ] Create app listing in App Store Connect → submit for TestFlight first

#### 6d — Required Store Assets
| Asset | iOS | Android |
|---|---|---|
| App icon | 1024×1024 PNG | 512×512 PNG |
| Screenshots | 6.7" (required), 5.5" optional | Phone screenshots (min 2) |
| Short description | 30 chars | 80 chars |
| Full description | 4000 chars | 4000 chars |
| Privacy policy URL | Required | Required |
| Category | Business or Productivity | Business |

**Deliverable:** APK tested on physical Android device. iOS build uploaded to TestFlight.

---

### Phase 7 — OTA Updates Setup (Day 8)
**Goal:** Push UI/logic fixes without going through store review.

- [ ] Configure `expo-updates` in `app.json`
- [ ] `eas update --branch production --message "Fix X"` for any non-native change
- [ ] OTA updates cover: JS, styles, API logic, prompt text
- [ ] OTA updates do NOT cover: new native modules, app icon, permissions
- [ ] Document update policy in team notes: store submission only when native changes needed

---

## 6. Native UI — Not a Web Wrapper

React Native renders **actual OS-native components**, not HTML inside a webview. When you write a `<View>` it becomes a `UIView` on iOS and `android.view.View` on Android. The OS draws it — not a browser engine.

### React Native vs Web Wrapper — What's Different

| | React Native (this plan) | Capacitor / Ionic / PWA |
|---|---|---|
| How it renders | OS native components | Chrome/WebKit webview |
| Scroll feel | Platform inertia, rubber-band on iOS | Browser scroll — feels "off" |
| Keyboard behavior | Native input, correct autocorrect | Browser keyboard quirks |
| Gestures | Native swipe, pinch, long-press | JavaScript gesture library |
| Animations | Runs on UI thread (60/120fps) | JS thread → jank under load |
| App Store reviewers | Pass easily | Sometimes flagged as "web wrapper" |

### What Feels Native Out of the Box (No Extra Work)

- Tap feedback: ripple on Android, opacity fade on iOS
- Back gesture / swipe-to-go-back (React Navigation)
- Keyboard avoiding — input stays visible above keyboard
- Safe area insets — notch and home bar handled automatically
- Font rendering — San Francisco on iOS, Roboto on Android
- Status bar styling
- `FlatList` chat scroll — momentum, overscroll bounce (iOS), edge-glow (Android); identical to iMessage or WhatsApp

---

### UI Libraries — Options

#### Option A: NativeWind — Recommended for this project
Brings Tailwind CSS class names to React Native. Compiles to native `StyleSheet` — no webview involved.
```bash
npx expo install nativewind tailwindcss
```
You write: `className="bg-zinc-900 p-4 rounded-2xl text-white"` and it produces native code.  
Best choice here because the extension already uses utility-style CSS and the dark theme maps directly to Tailwind's zinc/slate palette.

#### Option B: React Native Paper
Material Design 3 component library. Dark theme built in. Good for Cards, TextInput, Chip, ActivityIndicator.
```bash
npx expo install react-native-paper react-native-safe-area-context
```
More opinionated than NativeWind — gives you complete components rather than styling primitives.

#### Option C: Gluestack UI v2
Accessible, themeable, good middle ground between Paper and NativeWind. More components than Paper, easier than Tamagui.

#### Option D: Tamagui
Best raw performance — components compile to minimum native code. Used by high-end production apps. Overkill for v1.

---

### Recommended Combination for Co-Pilot App

**NativeWind for layout + custom `StyleSheet` for chat bubbles.**

- NativeWind handles all spacing, padding, cards, and button layout quickly
- Chat bubbles are simple enough that a custom `StyleSheet` beats any library (15 lines of code, full control)
- `FlatList` with `inverted` prop handles scroll natively — no library needed

Add to `10. Key Decisions Log`:

| NativeWind over React Native Paper | Tailwind utility classes match the extension's CSS patterns; faster iteration on dark theme; no Material Design opinions imposed on the UI |

---

## 6. Backend Changes Required

The extension backend is already mobile-ready. Only two small additions needed:

### 6a — Google OAuth Redirect URI
Add `saleside-mobile://auth/callback` to the allowed redirect URIs in:
- Google Cloud Console → OAuth 2.0 Credentials → Authorized redirect URIs
- Backend `app/routers/oauth2.py` → wherever redirect URIs are validated

### 6b — CORS (if needed)
Mobile apps don't send `Origin` headers the same way browsers do. Test that `POST /api/auth/login` and all endpoints respond correctly to requests with no `Origin` header. FastAPI's CORS middleware typically allows this by default.

### 6c — Deep Link Handler (Optional but Recommended)
For Google OAuth callback on mobile, the backend currently redirects to `?success={token}` in the URL. For mobile PKCE flow this works but consider a dedicated mobile callback endpoint that returns JSON instead of a redirect, to make token extraction more reliable:
```
GET /api/oauth2/google/mobile-callback?code={code}
→ { access_token: "..." }
```

---

## 7. Timeline Summary

| Phase | Work | Days |
|---|---|---|
| 1 | Bootstrap + navigation shell | 1 |
| 2 | Storage + API layer | 1 |
| 3 | Auth screens (email + Google) | 2 |
| 4 | Co-pilot chat screen + state | 2 |
| 5 | Visual polish + assets | 1 |
| 6 | EAS Build + store submission | 2 |
| 7 | OTA updates | 0.5 |
| **Total** | | **~9–10 days** |

This is a solo developer estimate. With focused work, Phase 1–5 can be done in a long weekend if you already have the API working.

---

## 8. What This App Will NOT Have (v1 Scope)

Explicitly out of scope for v1 to keep timeline tight:

- Audio recording or live call integration (this is the Chrome extension's role for desktop calls)
- Push notifications (can be added via `expo-notifications` in v2)
- Offline mode
- Multi-account switching
- Dark/light theme toggle (ship dark-only, match extension)
- In-app purchase or subscription management

---

## 9. Future Mobile-Specific Features (v2+)

Once the base is shipped, these become high-value mobile additions:

- **Voice input**: Tap-to-speak using `expo-speech` or `@react-native-voice/voice` — dictate questions to the co-pilot hands-free during a call on your phone
- **Push notifications**: Alert rep when a meeting is about to start (`expo-notifications`)
- **Share sheet integration**: Share a call summary or pricing card from within the app
- **Widgets (iOS/Android)**: Quick prompt launcher from home screen
- **Apple Watch / WearOS companion**: Glanceable co-pilot responses on wrist during a call

---

## 10. Key Decisions Log

| Decision | Rationale |
|---|---|
| Expo Managed (not bare) | No native module needs in v1; Managed avoids Xcode/Android Studio setup; eject later if needed |
| `FlatList` inverted for chat | Standard React Native pattern — no manual scroll management, native performance |
| `expo-secure-store` for tokens | Tokens in Keychain (iOS) / Keystore (Android) — not AsyncStorage which is unencrypted |
| EAS Build (not local) | No Mac required for iOS build; EAS handles signing credentials |
| No state management library | Same as extension — React hooks are sufficient for this app's complexity |
| Port API layer from extension | Endpoints are identical; reuse prevents drift between platforms |
