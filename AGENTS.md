# File Sorter (Name pending)

An Expo React Native + Electron app for sorting/triaging real files by swiping (Tinder-style) or clicking buttons. Targets Desktop exe (Electron) and mobile browser via Tailscale.

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
DESKTOP (Electron)                     PHONE (Browser via Tailscale)
|  electron/main.js                   |
|    - starts Express server          |
|    - opens BrowserWindow            |  connects to http://<tailscale-ip>:<port>
|    - handles native folder dialog   |  loads same React UI via server
|                                     |  all file ops go through server API
|  Express Server (server/index.js)   |
|    /api/state   - GET  state        |
|    /api/folder  - POST set folder   |
|    /api/sort    - POST move file    |
|    /api/history - GET  history      |
|    /api/reset   - POST clear state  |
|  dist/ - Expo web build (static)    |
```

The desktop runs an Express server that manages all state (file queue, history). The React UI (served by Express) is the same for both the Electron window and the phone browser. All API calls use relative `fetch('/api/...')` URLs.

### Key Modules

| Directory / File | Role |
|---|---|
| `App.tsx` | Root — sets up `GestureHandlerRootView`, `SafeAreaProvider`, `NavigationContainer`, the 3-tab navigator (Sort / History / Settings), and renders `TutorialOverlay` when the tutorial is active |
| `electron/main.js` | Electron main process — starts Express server on dynamic port, opens BrowserWindow, handles `pick-folder` IPC |
| `electron/preload.js` | Context bridge exposing `window.electronAPI.pickFolder()` and `onServerPort()` |
| `server/index.js` | Express server — file system operations (read dir, move files), REST API, serves static web build |
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
| `lib/api.ts` | Fetch-based API client (`fetchState`, `setFolder`, `sortFile`, `fetchHistory`, `resetServer`) |
| `lib/storage.ts` | AsyncStorage helpers for actions, local history cache, theme, and tutorial-seen flag |
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

## Conventions

- **Naming:** Components/screens PascalCase, lib files camelCase, server/electron files kebab-case.
- **Styling:** `StyleSheet.create` at bottom, dark mode via `useColorScheme()` with ternary.
- **Error handling:** API calls throw on non-ok responses; UI shows error state with retry button. AsyncStorage reads silently fall back to defaults.
- **Server state:** In-memory only (no persistence across restarts). History is also stored client-side via AsyncStorage as a fallback.
- **Multi-device:** SortScreen polls `/api/state` every 3s to sync when phone (via Tailscale) sorts files.
- **Electron detection:** `typeof window.electronAPI !== 'undefined'` — controls whether folder picker button is shown.
- **Animations:** All gesture work uses `react-native-reanimated` worklets/shared values — no direct state mutations during gestures.
- **Platform checks:** `Platform.OS === 'web'` guards keyboard hotkeys. Server file ops use Node.js `fs` (not available on bare web).
- **Tutorial:** Runs in-app over the real UI (no separate demo screen). Steps are data-driven via `TUTORIAL_STEPS`; screens wrap spotlightable elements in `TutorialTarget` and report completions with `notify()` / tab focus via `notifyScreenFocus()`. While active, SortScreen swaps in a local demo queue (no server calls, no history writes, no file opens).
- **Card taps:** Single click opens the file with the OS default application (`openFile`, Electron `shell.openPath`); double click reveals the file in the OS file explorer (`revealInFolder`, Electron `shell.showItemInFolder`); long press opens the in-app `FullscreenPreview`. Tap discrimination lives in `FileCard` (300ms window, JS-side timer).

## Notes

*(Add project-specific quick notes here as needed.)*
