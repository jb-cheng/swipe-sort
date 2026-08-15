# File Sorter

A Tinder-style file sorting/triaging app. Swipe or press a key to move files into action-named subfolders. Runs as a **desktop Electron app** (primary) or **mobile browser app** via a lightweight server.

## How It Works

1. **Pick a folder** full of unsorted files.
2. The app **shuffles** them into a random queue.
3. For each file, **swipe** (or press a keyboard key) to assign it to an action — Keep, Archive, Review, Delete.
4. The file is **moved** into a subfolder named after that action (e.g., `./Keep/`, `./Review/`).
5. **Undo** immediately if you change your mind. Everything persists across restarts.

---

## Quick Start

```bash
npm install
npm run build:web
npm run electron:dev       # Launch desktop app
```

### Desktop (Electron) — primary mode

```bash
npm run electron:dev
```

This builds the web app and launches Electron. The React UI talks to an embedded HTTP server (single source of truth for all state); IPC is used only for native capabilities such as the folder picker dialog and opening files. All state is persisted to disk.

### Mobile access (sort from your phone)

1. Open **Settings > Mobile Access** in the desktop app and turn it on.
2. Scan the QR code with your phone camera and open the link.

The desktop serves the same web UI on your local network (default port 3456). The QR code carries a pairing key; devices without it are rejected, and you can rotate the key any time. Both devices share one state and stay in sync. No Tailscale or other setup needed.

`npm run electron:dev:serve` is still supported as a port override (`--serve <port>`).

### Standalone server only (no Electron window)

```bash
npm run server
```

Or custom port:

```bash
node server/standalone.js --port 8080
```

The server generates a pairing token on startup and prints the mobile access URL (including the token) to the console. Pass `--token <value>` to reuse a fixed token.

---

## Commands

| Command | Description |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run build:web` | Build web app into `dist/` |
| `npm run electron:dev` | Build web + launch Electron |
| `npm run electron:dev:serve` | Build web + launch Electron with server port override |
| `npm run electron:build` | Build web + package into Windows portable exe (`release/`) |
| `npm run server` | Start standalone HTTP server on port 3456 |
| `npm test` | Run Jest test suite |
| `npm run test:watch` | Run tests in watch mode |

---

## Architecture

```
 DESKTOP (Electron)                    PHONE (Browser, same Wi-Fi)
 ┌────────────────────────────┐        ┌──────────────────────────┐
 │ Electron window (React UI) │        │ Same React UI served by  │
 └─────────────┬──────────────┘        │ the desktop's server     │
               │ HTTP (loopback)       └────────────┬─────────────┘
 ┌─────────────▼────────────────────────────────────▼─────────────┐
 │ server/standalone.js (embedded in Electron, Node http module)  │
 │  - REST API: state, folder, sort, undo, history, previews      │
 │  - Serves dist/ static build                                   │
 │  - Pairing-token auth for non-loopback clients                 │
 │  ┌────────────────────────────────────────────────────────┐    │
 │  │ services/StateManager  services/fileOps                │    │
 │  │ services/previewService                                │    │
 │  └────────────────────────────────────────────────────────┘    │
 └─────────────────────────────────────────────────────────────────┘
 IPC (contextBridge) is reserved for native-only features:
 folder picker dialog, native file icons, open/reveal in explorer,
 window controls, mobile access settings.
```

### Key modules

| Module | Role |
|---|---|
| `electron/main.js` | Main process: embeds the HTTP server (single source of truth), native IPC handlers, mobile access lifecycle |
| `electron/preload.js` | Context bridge exposing native-only IPC methods to the renderer |
| `electron/mobile-access.js` | Pairing token + enabled flag persistence, LAN IP discovery, pairing URL builder |
| `server/standalone.js` | Lightweight HTTP server: REST API, static UI, token authorization |
| `services/StateManager.js` | Persisted state: queue, history, undo stack (JSON file) |
| `services/fileOps.js` | Core filesystem operations: scan, sort, undo |
| `lib/api.ts` | HTTP API client with pairing-token injection; native helpers via IPC |
| `screens/SortScreen.tsx` | Main sorting UI: swipeable cards, action buttons, undo |
| `screens/HistoryScreen.tsx` | List of past sort operations |
| `screens/SettingsScreen.tsx` | Customize action labels, keys, swipe directions, colors |

### Features

- **Single HTTP source of truth**: Desktop and phones both talk to the embedded HTTP server; IPC is reserved for native capabilities
- **Persistent state**: Queue, history, and undo stack survive app restarts
- **Undo**: Undo the last sort (or multiple sorts) to restore files to their original location
- **Multi-device sync**: Polling (every 3s) keeps phone and desktop in sync when using the standalone server
- **Keyboard shortcuts**: Keys 1-4 for actions, `U` for undo
- **Dark mode**: Follows system preference

---

## Actions

Four default actions — customize them in the Actions tab:

| Action | Key | Swipe | Color |
|---|---|---|---|
| Keep | 1 | Right | Green |
| Archive | 2 | Up | Blue |
| Review | 3 | Down | Amber |
| Delete | 4 | Left | Red |

---

## Building

```bash
npm run electron:build     # Windows portable exe
```

The output goes to `release/`. The build includes `services/` and `server/` so both IPC and standalone server mode work in the packaged app.

---

## Development

```bash
npm start                  # Expo dev server (for UI development)
npm run build:web          # Build web app before launching Electron
npm test                   # Run tests
```

### Project structure

```
├── electron/              # Electron main + preload
├── server/                # Express server + standalone HTTP server
├── services/              # Shared Node.js modules (state, file ops)
├── lib/                   # Shared TypeScript modules (API client, types, helpers)
├── screens/               # React Native screens (Sort, History, Settings)
├── components/            # Reusable UI components
├── __tests__/             # Jest test suites
└── dist/                  # Built web app (generated)
```

---

## Configuration

Settings are persisted to `@react-native-async-storage/async-storage` (for UI preferences) and a JSON file on disk (for server state — queue, history, undo stack).

The state file is stored at:
- **Electron**: `app.getPath('userData')/file-sorter-state.json`
- **Standalone server**: `./file-sorter-state.json` (or `$FILE_SORTER_DATA_DIR`)
