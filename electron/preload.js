const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // State
  getState: () => ipcRenderer.invoke('get-state'),
  setFolder: (folderPath) => ipcRenderer.invoke('set-folder', folderPath),
  sortFile: (fileId, action) => ipcRenderer.invoke('sort-file', fileId, action),
  undoSort: () => ipcRenderer.invoke('undo-sort'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getUndoStack: () => ipcRenderer.invoke('get-undo-stack'),
  resetState: () => ipcRenderer.invoke('reset-state'),

  // Native dialogs
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // File preview
  getFilePreview: (fileId) => ipcRenderer.invoke('get-file-preview', fileId),

  // Pre-generate previews for next N files
  pregeneratePreviews: (count) => ipcRenderer.invoke('pregenerate-previews', count),

  // Native OS file icon (Tier 2)
  getNativeIcon: (filePath) => ipcRenderer.invoke('get-native-icon', filePath),

  // Open file in OS default app
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // Reveal file in the OS file explorer
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath),

  // Window settings (stay-on-top)
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', enabled),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),

  // Events from main
  onServerPort: (callback) => {
    ipcRenderer.on('server-port', (_event, port) => callback(port));
  },
});
