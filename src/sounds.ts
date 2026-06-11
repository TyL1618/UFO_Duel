let _ctx: AudioContext | null = null

function ctx(): AudioContext {
  if (!_ctx) _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  return _ctx
}

export function playShoot() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.connect(g); g.connect(c.destination)
    osc.frequency.setValueAtTime(950, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1500, c.currentTime + 0.07)
    g.gain.setValueAtTime(0.22, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.07)
    osc.start(); osc.stop(c.currentTime + 0.07)
  } catch { /* ignore AudioContext errors */ }
}

export function playHit() {
  try {
    const c = ctx()
    const len = Math.floor(c.sampleRate * 0.13)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = c.createBufferSource(); src.buffer = buf
    const g = c.createGain()
    g.gain.setValueAtTime(0.55, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.13)
    src.connect(g); g.connect(c.destination); src.start()
  } catch { /* ignore */ }
}

export function playBounce() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(350, c.currentTime)
    g.gain.setValueAtTime(0.12, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.05)
  } catch { /* ignore */ }
}

export function playTurnChange() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(550, c.currentTime)
    osc.frequency.setValueAtTime(750, c.currentTime + 0.09)
    g.gain.setValueAtTime(0.18, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.2)
  } catch { /* ignore */ }
}

export function playExplosion() {
  try {
    const c = ctx()
    const len = Math.floor(c.sampleRate * 0.28)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.04))
    const src = c.createBufferSource(); src.buffer = buf
    const g = c.createGain()
    g.gain.setValueAtTime(0.85, c.currentTime)
    src.connect(g); g.connect(c.destination); src.start()
  } catch { /* ignore */ }
}

export function playSmoke() {
  try {
    const c = ctx()
    const len = Math.floor(c.sampleRate * 0.22)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len) * 0.45
    const src = c.createBufferSource(); src.buffer = buf
    const filt = c.createBiquadFilter()
    filt.type = 'lowpass'; filt.frequency.value = 500
    const g = c.createGain()
    g.gain.setValueAtTime(0.35, c.currentTime)
    src.connect(filt); filt.connect(g); g.connect(c.destination); src.start()
  } catch { /* ignore */ }
}

export function playGameEnd(won: boolean) {
  try {
    const c = ctx()
    const freqs = won ? [523, 659, 784, 1047] : [523, 466, 415, 370]
    freqs.forEach((f, i) => {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(f, c.currentTime + i * 0.12)
      g.gain.setValueAtTime(0, c.currentTime + i * 0.12)
      g.gain.linearRampToValueAtTime(0.2, c.currentTime + i * 0.12 + 0.04)
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.12 + 0.18)
      osc.connect(g); g.connect(c.destination)
      osc.start(c.currentTime + i * 0.12)
      osc.stop(c.currentTime + i * 0.12 + 0.18)
    })
  } catch { /* ignore */ }
}
