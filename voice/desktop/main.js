const { app, BrowserWindow, screen } = require('electron')
const path = require('path')
const { WebSocketServer } = require('ws')

const PORT = parseInt(process.env.AIKO_AVATAR_PORT || '7749', 10)

let win = null
let wss = null

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  win = new BrowserWindow({
    width: 220,
    height: 320,
    x: width - 240,
    y: height - 350,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.setIgnoreMouseEvents(true, { forward: true })

  win.on('close', () => { win = null })
}

function startWebSocketServer() {
  wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }

      if (msg.type !== 'speak' || !win) return
      if (typeof msg.text !== 'string' || msg.text.length === 0 || msg.text.length > 2000) return

      const feat = msg.features && typeof msg.features === 'object' ? msg.features : {}
      const alwaysOnTop = feat.always_on_top !== false
      win.setAlwaysOnTop(alwaysOnTop)

      const safeMsg = {
        type: 'speak',
        text: msg.text,
        emotion: typeof msg.emotion === 'string' ? msg.emotion : 'neutral',
        features: {
          lipsync: feat.lipsync !== false,
          bubble:  feat.bubble  !== false,
        },
      }
      win.webContents.send('speak', safeMsg)
      ws.send(JSON.stringify({ type: 'ack', status: 'ok' }))
    })
  })

  wss.on('error', (err) => {
    console.error(`[voice-desktop] WebSocket サーバーエラー: ${err.message}`)
  })

  console.log(`[voice-desktop] WebSocket サーバー起動: ws://127.0.0.1:${PORT}`)
}

app.whenReady().then(() => {
  createWindow()
  startWebSocketServer()
})

app.on('window-all-closed', () => {
  if (wss) wss.close()
  app.quit()
})
