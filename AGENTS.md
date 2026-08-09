# File Sorter (Name pending)

An Expo React Native + Electron app for sorting/triaging real files by swiping (Tinder-style) or clicking buttons. Targets Desktop exe (Electron) and mobile browser on the same local network (QR pairing, no third-party setup).

## Special Instructions
- When making architectural decisions, NEVER consider implementation time — do not leave technical debt for later, always implement the most production-grade level decision.
- Never use em-dashes (i.e. `—`)

## Project

- **Stack:** Expo (React Native, TypeScript), Electron, Express (Node.js), `react-native-reanimated` (gestures), `@react-navigation/native` (bottom tabs), `@react-native-async-storage/async-storage` (persistence for settings)
- **Entry point:** `./App.tsx` (React UI), `./electron/main.js` (Electron), `./server/index.js` (Express server)
- **App name:** "File Sorter", appId `com.arcadalabs.file-sorter`

## Commands

- `npm install` — install dependencies (run first)
- `npm start` — start the Expo dev server
- `npm run android` — start on Android emulator
- `npm run ios` — start on iOS simulator
- `npm run web` — start web preview (dev only)
- `npm run build:web` — build the web app into `dist/`
- `npm run electron:dev` — build web + launch Electron (desktop, with dev tools)
- `npm run electron:build` — build web + package into Windows portable exe in `release/`

## Architecture

### Runtime Model

```
DESKTOP (Electron)                     PHONE (Browser, same Wi-Fi)
|  electron/main.js                   |
|    - embeds HTTP server            |  scans QR in Settings > Mobile Access
|      (server/standalone.js)        |  opens http://<lan-ip>:<port>/?t=<token>
|    - opens BrowserWindow           |  loads same React UI via server
|    - native IPC only (folder       |  all file ops go through server API
|      dialog, shell, window)        |  with Bearer pairing token
|  HTTP Server (single source of truth)
|    /api/state, /api/folder, /api/sort, /api/undo,
|    /api/history, /api/reset, /api/preview/:id
|  dist/ - Expo web build (static)    |
```

The desktop embeds one HTTP server (`server/standalone.js`) that manages all state (file queue, history, undo). The React UI is the same for both the Electron window (loopback, always trusted) and the phone browser (LAN, must present the pairing token). All API calls use relative `fetch('/api/...')` URLs; the phone stores the token from the QR URL and sends it as an `Authorization: Bearer` header.

### Key Modules

| Directory / File | Role |
|---|---|
| `App.tsx` | Root — sets up `GestureHandlerRootView`, `SafeAreaProvider`, `NavigationContainer`, the 3-tab navigator (Sort / History / Settings), and renders `TutorialOverlay` when the tutorial is active |
| `electron/main.js` | Electron main process: embeds the HTTP server (single source of truth), opens BrowserWindow, native-only IPC (`pick-folder`, shell, window, mobile access) |
| `electron/preload.js` | Context bridge exposing native-only methods (`pickFolder()`, `getMobileAccess()`, etc.) |
| `electron/mobile-access.js` | Pairing token/enabled flag persistence, LAN IP discovery, pairing URL builder |
| `server/standalone.js` | HTTP server: REST API, static web build, pairing-token authorization for non-loopback clients |
| `server/index.js` | Express server (legacy wrapper, same REST API) |
| `screens/SortScreen.tsx` | Main sorting screen — fetches state from server, shows file queue, calls `/api/sort` on swipe, polls server every 3s for multi-device sync |
| `screens/HistoryScreen.tsx` | Lists past sorted files — fetches from server API, falls back to AsyncStorage |
| `screens/SettingsScreen.tsx` | Customizes the 4 sort actions (label, keyboard key, swipe direction, color); persists to AsyncStorage |
| `components/FileCard.tsx` | Animated swipeable card — uses `react-native-reanimated` + gesture handler |
| `components/ActionButtons.tsx` | 4-button bar below the card |
| `components/DirectionHint.tsx` | Animated overlay showing action label in swipe direction |
| `components/SwipeHint.tsx` | Static badge for direction hints |
| `components/FileIcon.tsx` | Renders icon for `FileType` using Ionicons / FontAwesome / MaterialIcons |
| `lib/types.ts` | Shared types: `FileItem` (with `uri`), `SortAction`, `SwipeDirection`, `FileType`, `HistoryRecord` |
| `lib/fileHelpers.ts` | `FILE_META` map and `getFileTypeFromExtension()` |
| `lib/api.ts` | HTTP API client (`fetchState`, `setFolder`, `sortFile`, ...), pairing-token capture/injection; native helpers via IPC |
| `lib/demoFiles.ts` | Tutorial demo queue: bundled example files (`assets/demo/`) with local preview assets, never sent to the server |
| `lib/storage.ts` | AsyncStorage helpers for actions, local history cache, theme, tutorial-seen flag, and pairing token |
| `lib/navigation.ts` | Root/Settings param lists, `navigationRef`, `getCurrentTabName()`, `navigateToTab()` |
| `lib/TutorialContext.tsx` | Tutorial state machine — step definitions (`TUTORIAL_STEPS`), spotlight target registry, step-completion events, confetti burst queue, finale phase |
| `components/TutorialTarget.tsx` | Wrapper View that registers its window rect (`measureInWindow`) under a target id so the tutorial overlay can spotlight it |
| `components/tutorial/TutorialOverlay.tsx` | In-app coach-mark overlay — dark scrim with an animated spotlight hole over the real UI, pulsing ring, coach tooltip with caret, progress dots, Skip, auto-navigation, finale fireworks |
| `components/tutorial/SwipeHandHint.tsx` | Looping ghost-hand animation that presses and drags toward an action's swipe direction, with a destination chip |
| `components/tutorial/KeyCapHint.tsx` | Looping keyboard-key press animation shown in tooltips on web |
| `components/tutorial/ConfettiBurst.tsx` | One-shot particle burst (single shared value drives all particles) fired when a tutorial step is completed |
| *(deleted — `lib/mockFile.ts` removed, no longer part of the project)* |  |
| *(deleted — `components/TutorialDemo.tsx` replaced by the in-app `components/tutorial/` overlay system)* |  |

### File Operations

When the user swipes a file, the client calls `POST /api/sort` with `{ fileId, action }`. The server:
1. Creates a subfolder named after the action label (e.g., `./Keep/`, `./Review/`)
2. Moves the file via `fs.renameSync()` into that subfolder
3. Removes it from the queue and adds a history record

Undo comes in two flavors:
- `POST /api/undo` undoes the last sort (LIFO, also bound to the `U` hotkey and the undo button on the Sort tab).
- `POST /api/history/undo` with `{ historyId }` undoes a specific History-tab entry: the file moves back to its original location and is re-queued at the top of the Sort tab. The server rejects it when the entry is unknown, its undo record was consumed, the active folder has changed, or the file no longer exists on disk.

## Conventions

- **Naming:** Components/screens PascalCase, lib files camelCase, server/electron files kebab-case.
- **Styling:** `StyleSheet.create` at bottom, dark mode via `useColorScheme()` with ternary.
- **Error handling:** API calls throw on non-ok responses; UI shows error state with retry button. AsyncStorage reads silently fall back to defaults.
- **Server state:** Persisted to a JSON file in userData (queue, folder, history, undo survive restarts). History is also cached client-side via AsyncStorage as a fallback.
- **Multi-device:** One embedded HTTP server is the single source of truth; SortScreen polls `/api/state` every 3s to sync desktop and phone. Mobile access is opt-in via Settings > Mobile Access (QR pairing with a rotatable token; loopback requests bypass the token).
- **Electron detection:** `typeof window.electronAPI !== 'undefined'` — controls whether folder picker button is shown.
- **Animations:** All gesture work uses `react-native-reanimated` worklets/shared values — no direct state mutations during gestures.
- **Platform checks:** `Platform.OS === 'web'` guards keyboard hotkeys. Server file ops use Node.js `fs` (not available on bare web).
- **Tutorial:** Runs in-app over the real UI (no separate demo screen). Steps are data-driven via `TUTORIAL_STEPS`; screens wrap spotlightable elements in `TutorialTarget` and report completions with `notify()` / tab focus via `notifyScreenFocus()`. While active, SortScreen swaps in a local demo queue (no server calls, no history writes, no file opens) whose example files and previews are bundled in `assets/demo/` via `lib/demoFiles.ts`.
- **Card taps:** Single click opens the file with the OS default application (`openFile`, Electron `shell.openPath`); double click reveals the file in the OS file explorer (`revealInFolder`, Electron `shell.showItemInFolder`); long press opens the in-app `FullscreenPreview`. Tap discrimination lives in `FileCard` (300ms window, JS-side timer).

## Notes

*(Add project-specific quick notes here as needed.)*
