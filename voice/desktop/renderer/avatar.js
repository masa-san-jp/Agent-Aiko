const avatarImg = document.getElementById('avatar-img')
const speechBubble = document.getElementById('speech-bubble')
const canvas = document.getElementById('mouth-canvas')
const ctx = canvas.getContext('2d')

canvas.width = 40
canvas.height = 20

const EMOTION_ASSETS = {
  neutral:    '../assets/aiko/neutral.png',
  happy:      '../assets/aiko/happy.png',
  thinking:   '../assets/aiko/thinking.png',
  apologetic: '../assets/aiko/apologetic.png',
  excited:    '../assets/aiko/excited.png',
}

const { irodoriUrl: IRODORI_URL, voice: VOICE } = window.aikoAPI.config

let audioCtx = null
let mouthAnimId = null
let bubbleTimer = null
let speakGeneration = 0

function getAudioContext() {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function setEmotion(emotion) {
  const src = EMOTION_ASSETS[emotion] || EMOTION_ASSETS.neutral
  const img = new Image()
  img.onload = () => {
    avatarImg.src = src
    avatarImg.className = emotion
  }
  img.onerror = () => {
    avatarImg.src = EMOTION_ASSETS.neutral
    avatarImg.className = emotion
  }
  img.src = src
}

function showBubble(text) {
  speechBubble.textContent = text.slice(0, 80) + (text.length > 80 ? '…' : '')
  speechBubble.classList.remove('hidden')
  clearTimeout(bubbleTimer)
}

function hideBubble() {
  speechBubble.classList.add('hidden')
}

function drawMouth(openRatio) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const w = 18
  const h = Math.max(2, openRatio * 12)

  ctx.fillStyle = '#c0524a'
  ctx.beginPath()
  ctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2)
  ctx.fill()

  if (openRatio > 0.2) {
    ctx.fillStyle = '#6b1e1a'
    ctx.beginPath()
    ctx.ellipse(cx, cy + h * 0.3, w * 0.7, h * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function startMouthAnim(analyserNode) {
  const dataArray = new Uint8Array(analyserNode.frequencyBinCount)

  function animate() {
    analyserNode.getByteFrequencyData(dataArray)
    let sum = 0
    for (let i = 0; i < 16; i++) sum += dataArray[i]
    const avg = sum / 16 / 255
    drawMouth(Math.min(avg * 2.5, 1.0))
    mouthAnimId = requestAnimationFrame(animate)
  }
  animate()
}

function stopMouthAnim() {
  if (mouthAnimId) cancelAnimationFrame(mouthAnimId)
  mouthAnimId = null
  drawMouth(0)
}

async function fetchAndPlayTTS(text, emotion, useLipsync = true) {
  const myGen = ++speakGeneration
  stopMouthAnim()

  try {
    const res = await fetch(`${IRODORI_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: VOICE }),
    })
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)

    const arrayBuffer = await res.arrayBuffer()
    if (myGen !== speakGeneration) return

    const ac = getAudioContext()
    const audioBuffer = await ac.decodeAudioData(arrayBuffer)
    if (myGen !== speakGeneration) return

    const localAnalyser = ac.createAnalyser()
    localAnalyser.fftSize = 64
    localAnalyser.connect(ac.destination)

    const source = ac.createBufferSource()
    source.buffer = audioBuffer
    source.connect(localAnalyser)

    if (useLipsync) startMouthAnim(localAnalyser)
    source.start()

    source.onended = () => {
      if (myGen !== speakGeneration) return
      stopMouthAnim()
      localAnalyser.disconnect()
      setEmotion('neutral')
      bubbleTimer = setTimeout(hideBubble, 2000)
    }
  } catch (err) {
    if (myGen !== speakGeneration) return
    console.error('[voice-desktop] TTS エラー:', err.message)
    stopMouthAnim()
    setEmotion('neutral')
    bubbleTimer = setTimeout(hideBubble, 3000)
  }
}

window.aikoAPI.onSpeak((msg) => {
  const { text, emotion = 'neutral', features = {} } = msg
  const useLipsync = features.lipsync !== false
  const useBubble  = features.bubble  !== false

  setEmotion(emotion)
  if (useBubble) {
    showBubble(text)
  } else {
    clearTimeout(bubbleTimer)
    hideBubble()
  }
  fetchAndPlayTTS(text, emotion, useLipsync)
})

drawMouth(0)
