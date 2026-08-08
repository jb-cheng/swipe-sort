const { contextBridge, ipcRenderer } = require('electron');

// All app state (queue, history, undo) flows over HTTP to the embedded
// server, so desktop and paired phones share one source of truth.
// IPC is reserved for native capabilities HTTP cannot provide.
contextBridge.exposeInMainWorld('electronAPI', {
  // Native dialogs
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // Native OS file icon (Tier 2)
  getNativeIcon: (filePath) => ipcRenderer.invoke('get-native-icon', filePath),

  // Open file in OS default app
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // Reveal file in the OS file explorer
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath),

  // Window settings (stay-on-top)
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),

  // Mobile access (LAN remote control)
  getMobileAccess: () => ipcRenderer.invoke('get-mobile-access'),
  setMobileAccessEnabled: (enabled) => ipcRenderer.invoke('set-mobile-access-enabled', enabled),
  resetMobileToken: () => ipcRenderer.invoke('reset-mobile-token'),
  onMobileAccessChanged: (callback) => {
    ipcRenderer.on('mobile-access-changed', (_event, info) => callback(info));
  },
});
