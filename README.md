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

This builds the web app and launches Electron. No HTTP server is needed — the React UI talks directly to the Node.js backend via Electron IPC. All state is persisted to disk.

### Mobile access via Tailscale/network

Start Electron with the standalone server:

```bash
npm run electron:dev:serve
```

This starts a lightweight HTTP server on port 3456 alongside the Electron window. Connect from your phone browser at `http://<tailscale-ip>:3456` to sort files remotely. All file operations go through the same backend — **multiple devices can sort simultaneously and stay in sync**.

### Standalone server only (no Electron window)

```bash
npm run server
```

Or custom port:

```bash
node server/standalone.js --port 8080
```

---

## Commands

| Command | Description |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run build:web` | Build web app into `dist/` |
| `npm run electron:dev` | Build web + launch Electron |
| `npm run electron:dev:serve` | Build web + launch Electron with mobile server on port 3456 |
| `npm run electron:build` | Build web + package into Windows portable exe (`release/`) |
| `npm run server` | Start standalone HTTP server on port 3456 |
| `npm test` | Run Jest test suite |
| `npm run test:watch` | Run tests in watch mode |

---

## Architecture

```
                          ┌──────────────────────────────┐
                          │       Electron Window         │
                          │  (React UI via dist/index.html)│
                          │   talks to IPC bridge         │
                          └──────────┬───────────────────┘
                                     │ contextBridge / ipcRenderer
                          ┌──────────▼───────────────────┐
                          │    Electron Main Process      │
                          │  ┌────────────────────────┐   │
                          │  │   services/StateManager │   │
                          │  │   - JSON file persistence│   │
                          │  │   - Queue / History /   │   │
                          │  │     Undo stack          │   │
                          │  └────────┬───────────────┘   │
                          │  ┌────────▼───────────────┐   │
                          │  │   services/fileOps     │   │
                          │  │   - scanFolder         │   │
                          │  │   - sortFile / undoSort│   │
                          │  └────────────────────────┘   │
                          └──────────────────────────────┘

 MOBILE (Browser via Tailscale)
        │
        ▼
 ┌──────────────────────────────┐
 │   server/standalone.js       │
 │   (minimal http module,      │
 │    no Express dependency)     │
 │   ┌────────────────────────┐ │
 │   │   services/StateManager│ │
 │   │   services/fileOps     │ │
 │   └────────────────────────┘ │
 └──────────────────────────────┘
```

### Key modules

| Module | Role |
|---|---|
| `electron/main.js` | Main process — IPC handlers, native dialogs, optional server startup |
| `electron/preload.js` | Context bridge exposing all IPC methods to the renderer |
| `server/standalone.js` | Lightweight HTTP server for mobile access (Node `http` module) |
| `server/index.js` | Express server (legacy wrapper, delegates to shared services) |
| `services/StateManager.js` | Persisted state — queue, history, undo stack (JSON file) |
| `services/fileOps.js` | Core filesystem operations — scan, sort, undo |
| `lib/api.ts` | Unified API client — routes to IPC or HTTP based on environment |
| `screens/SortScreen.tsx` | Main sorting UI — swipeable cards, action buttons, undo |
| `screens/HistoryScreen.tsx` | List of past sort operations |
| `screens/SettingsScreen.tsx` | Customize action labels, keys, swipe directions, colors |

### Features

- **IPC-first**: Desktop mode uses Electron IPC directly (no HTTP overhead)
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
