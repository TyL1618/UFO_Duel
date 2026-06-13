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

export function playShieldActivate() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(320, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(920, c.currentTime + 0.22)
    g.gain.setValueAtTime(0.22, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.22)
  } catch { /* ignore */ }
}

export function playShieldHit() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1100, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(550, c.currentTime + 0.09)
    g.gain.setValueAtTime(0.28, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.09)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.09)
  } catch { /* ignore */ }
}

export function playShieldBreak() {
  try {
    const c = ctx()
    const len = Math.floor(c.sampleRate * 0.2)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.03)) * 0.8
    const src = c.createBufferSource(); src.buffer = buf
    const filt = c.createBiquadFilter()
    filt.type = 'highpass'; filt.frequency.value = 1800
    const g = c.createGain()
    g.gain.setValueAtTime(0.55, c.currentTime)
    src.connect(filt); filt.connect(g); g.connect(c.destination); src.start()
  } catch { /* ignore */ }
}

export function playTeleport() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(220, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1800, c.currentTime + 0.12)
    osc.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.24)
    g.gain.setValueAtTime(0.28, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.24)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.24)
  } catch { /* ignore */ }
}

export function playKill() {
  try {
    const c = ctx()
    const len = Math.floor(c.sampleRate * 0.35)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.05))
    const src = c.createBufferSource(); src.buffer = buf
    const g = c.createGain()
    g.gain.setValueAtTime(0.85, c.currentTime); src.connect(g); g.connect(c.destination); src.start()
    const osc = c.createOscillator(); const og = c.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(300, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, c.currentTime + 0.35)
    og.gain.setValueAtTime(0.38, c.currentTime)
    og.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35)
    osc.connect(og); og.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.35)
  } catch { /* ignore */ }
}

export function playRatchet() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(90, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(45, c.currentTime + 0.025)
    g.gain.setValueAtTime(0.14, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.025)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.025)
  } catch { /* ignore */ }
}

// Low heartbeat thump for the final seconds of the turn timer (pressure cue)
export function playHeartbeat() {
  try {
    const c = ctx()
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, c.currentTime)
    osc.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.14)
    g.gain.setValueAtTime(0.0001, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.4, c.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16)
    osc.connect(g); g.connect(c.destination)
    osc.start(); osc.stop(c.currentTime + 0.16)
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
