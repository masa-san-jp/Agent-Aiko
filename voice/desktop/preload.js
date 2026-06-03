const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aikoAPI', {
  onSpeak: (callback) => {
    ipcRenderer.on('speak', (_event, msg) => callback(msg))
  },
  config: {
    irodoriUrl: process.env.AIKO_IRODORI_URL || 'http://localhost:8000',
    voice: process.env.AIKO_IRODORI_VOICE || 'aiko',
  },
})
