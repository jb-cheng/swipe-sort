# File Sorter — Todo List

> Generated from full codebase analysis. Priority: High / Medium / Low.

---

## 🚀 Phase 1: Core Architecture & Reliability *(done)*

- [x] **IPC-first architecture (replace Express)** — Move all file operations from Express server into Electron main process via IPC (`contextBridge` + `ipcRenderer.handle/invoke`). Desktop mode talks directly to Node.js `fs` — no HTTP server needed. *(High)*
- [x] **Lightweight opt-in server for mobile** — Once IPC is the primary path, extract a minimal standalone server (no Express, just `http.createServer`) that can be toggled on in Settings or via CLI flag for Tailscale/mobile access. It reuses the same IPC handlers. *(High)*
- [x] **State persistence** — Add JSON file (or SQLite) storage so queue, history, and undo stack survive app restarts. Currently everything is in-memory only. *(High)*
- [x] **Undo last sort action** — Add IPC handler to reverse the last file move (move file back from action subfolder). Wire up a UI button in SortScreen. *(High)*
- [x] **Undo history (multi-step)** — Maintain a stack of sort operations with rollback support so you can undo more than just the last action. *(Medium)*
- [x] **Add test suite** — Set up Jest + React Native Testing Library; write tests for IPC handlers, API client, file helpers, storage helpers, and component rendering. *(High)*

## 🐞 Phase 2A: Bug Fixes

- [x] **Settings changes don't take effect** — SortScreen loads actions via `useEffect(() => { loadActions() }, [])` which runs once on mount. The tab navigator keeps SortScreen mounted, so returning from SettingsScreen never reloads custom actions. Fix: switch to `useFocusEffect` (like HistoryScreen already does). *(High)*
- [x] **Undo button doesn't appear after sorting** — `handleSortComplete` sets `undoAvailable` via a nested `fetchState()` call with a silent `catch {}`. If that call fails, `undoAvailable` stays `false` even though the undo record exists on the server. Fix: include undo-stack length in `sort-file` IPC response so the extra `fetchState` round-trip is eliminated. *(High)*
- [x] **Failed sort silently removes file from UI** — If `sortFile` IPC throws, `handleSortComplete` still runs the local state updates (`setQueue`, `addHistory`, `setSortedCount`, `setSorting`), making the file vanish from the UI even though it was never moved on disk. Fix: gate queue/history/UI updates on sort success. *(Medium)*

## 🐞 Phase 2B: More Bug Fixes

- [X] **Reset button in Settings doesn't work** — `SettingsScreen.resetDefaults` calls `setActions(DEFAULT_ACTIONS)` using the module-level constant. React may skip re-render when the reference matches the current state. Additionally, `Alert.alert` on `react-native-web` may not fire the `onPress` callback reliably with custom buttons. Fix: spread into a new array (`[...DEFAULT_ACTIONS]`) and consider an `Alert`-free fallback for web. *(High)*
- [X] **No warning when two actions share the same swipe direction** — The direction picker in SettingsScreen allows assigning any direction to any action. If two actions both have `direction: 'right'`, swiping right would only match the first. No UI feedback warns the user. Fix: detect and display a conflict warning in the SettingsScreen direction picker (e.g., grey out taken directions or show a warning icon). *(Medium)*
- [X] **Undo button stays enabled after clearing history** — The undo stack and history are decoupled: clearing history should also flush the undo stack, and the Undo button should be disabled when there's nothing to undo. Currently, if you clear history the undo stack may still contain entries, allowing "undone" moves that are no longer reflected in history. Fix: clear the undo stack when history is cleared, and derive `undoAvailable` directly from the stack length (so the button disables automatically). *(Medium)*

## 🎨 Phase 2C: Extra Button-Only Actions

- [X] **Allow more than 4 actions** — Currently hardcoded to 4 (one per swipe direction). Users want extra actions for rare file types that don't need a swipe gesture. These would be button-only (keyboard shortcut + colored button, no swipe direction). Changes needed: *(Medium)*
   - Add an "Add Action" button in SettingsScreen that creates a new action with `direction: 'none'`
   - Add a delete/remove control on each action card in SettingsScreen
   - Update the 4-column button bar in SortScreen to scroll horizontally or wrap when >4 actions
   - Remove the `DEFAULT_ACTIONS.length` guard in `storage.ts` that silently discards customizations
   - Cap the total number of actions (e.g., 8) to keep the UI usable

## 🎨 Phase 3: UX & Visual Polish

- [x] **File preview / thumbnails (3-Tier Fallback System)** — Replaced generic extension-based icons with a layered preview system. Every file shows something immediately (Tier 1), then upgrades to better previews as they become available (Tier 2 → Tier 3). *(High)*
   - **Tier 1 – Instant fallback (generic icons)** — Map every extension to a high-resolution icon from Ionicons/FontAwesome/MaterialIcons. Shown immediately, always works.
   - **Tier 2 – OS native icons (Electron only)** — Uses `electron.app.getFileIcon()` via IPC to show the exact OS icon.
   - **Tier 3 – Rich content previews** — Generated asynchronously with disk caching:
     - **Images (JPEG, PNG, GIF, HEIC, WebP)** — Resized to 320px via `sharp`, cached with MD5(filePath + mtime).
     - **Audio (MP3, FLAC, M4A, WAV, OGG)** — Embedded cover art extracted via `music-metadata`, optionally resized with sharp.
     - **PDFs** — Text extracted via `strings`-style parser (no external deps).
     - **Spreadsheets (CSV)** — First 5 rows parsed and formatted as a text table.
     - **Text files** — First 800 characters preview with monospace rendering.
   - **Lazy generation queue** — `p-queue` with concurrency 3, pre-generates for next 5 files after each sort.
   - **Disk cache** — Stored in `{userData}/preview-cache/`, keyed by MD5(absolutePath + mtime).
   - **Memory cleanup** — Dismissed file tracking via `dismissedRef`, periodic GC of tracked set.
   - **Tap vs swipe distinction** — 15px threshold separates taps from swipes, with scale-pulse feedback.
   - **Platform strategy** — Desktop (Electron): all 3 tiers. Mobile: Tier 2 skipped, Tier 3 via same server.
   - **New dependencies** — `sharp`, `music-metadata`, `p-queue`.
- [x] **React Error Boundary** — Wraps the app in a top-level error boundary (`ErrorBoundary.tsx`) that catches render crashes gracefully with a "Reload" button. *(Medium)*
- [x] **Empty-state polish** — Animated `EmptyIllustration` component with floating/bobbing emoji, used in SortScreen for error, no-folder, and all-sorted states. *(Low)*
- [x] **Stay on top** — Settings toggle (Switch) persists to a JSON file, applies to Electron window via `mainWindow.setAlwaysOnTop()`, loaded on app start. *(Medium)*
- [x] **Tap / double-click to open file** — Tap gesture on FileCard triggers `shell.openPath()` via IPC, opening the file in the OS default application. *(Medium)*

## 📱 Phase 4: Mobile & Cross-Platform

- [ ] **Native mobile folder picker** — Implement `expo-document-picker` or `expo-file-system` based folder selection for Android/iOS so mobile isn't limited to a `prompt()`. *(High)*
- [ ] **Expo Router migration (optional)** — Migrate from `@react-navigation/native` to Expo Router for file-based routing, deep linking, and better Expo ecosystem integration. *(Low)*
- [ ] **Mobile-optimized layout** — Adjust card sizing, button spacing, and font sizes for smaller phone screens vs desktop Electron window. *(Medium)*

## 🖥️ Phase 5: Desktop/Electron Enhancements

- [ ] **macOS + Linux Electron builds** — Add `mac.target` and `linux.target` to electron-builder config alongside the existing Windows portable exe. *(Medium)*

## ⚙️ Phase 6: Configuration & Customization

- [ ] **Server config UI** — Settings screen to toggle the opt-in mobile server, configure port, show Tailscale URL. *(Medium)*
- [ ] **Custom keyboard shortcuts** — Let users bind arbitrary key combos (not just 1-4) to sort actions — currently the key field is a single char stored in AsyncStorage but only 1-4 are handled. *(Medium)*
- [ ] **Actions migration system** — The `DEFAULT_ACTIONS.length` check in `storage.ts` silently discards customizations if action count changes. Add a proper migration system for future-proofing. *(Low)*

## 🧹 Phase 7: Code Quality & Housekeeping

- [ ] **Remove dead code** — Delete `lib/mockFile.ts` — it's no longer imported anywhere (legacy from before server integration). *(Medium)*
- [ ] **Branding consistency** — Fix `app.json` "Agon Preview" name mismatch vs "File Sorter" in electron-builder config. *(Low)*
- [ ] **Lazy-load screens** — Use `React.lazy()` or dynamic `import()` for the three tab screens so the initial bundle is smaller. *(Low)*
- [ ] **Paginate large folders** — Add optional file count limit / pagination to the folder scan to handle directories with thousands of files. *(Low)*

---

### Quick Reference

| Priority | Count | Key items |
|---|---|---|
| **High** | 1 | Mobile folder picker |
| **Medium** | 6 | Mobile layout, macOS/Linux builds, Config UI, Custom keys, Dead code, Pagination |
| **Low** | 7 | Expo Router, Tray mode, Notifications, Auto-start, Migration system, Branding, Lazy loading |


- allow for undoing of stuff in the history tab, which brings it to the top of the queue on the sort tab

- add a button/feature that allows users to re-select the folder as it currently does not look like there is one

- find example pictures/files for the tutorial

- add notes in the tutorial on how double clicking (on desktop) will open in file explorer, single click will open it, and holding on it will make preview larger if available (only for docs and pdfs)

- does not pass WCAG AAA

- dont let people sort files while the tutorial is teaching about double clicks, single clicks, or holding - find some other way to make it interactive without actually showing them because those are just test files anyways, maybe a video simulation/gif?