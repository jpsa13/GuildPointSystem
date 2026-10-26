let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!sharedCtx) sharedCtx = new Ctx()
  return sharedCtx
}

/** Navegadores só liberam áudio após interação: destrava o contexto no primeiro clique/tecla. */
function unlockAudioOnInteraction() {
  const unlock = () => {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx.resume()
    } else {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

if (typeof window !== 'undefined') unlockAudioOnInteraction()

/** Dois bipes curtos para alerta de evento. */
export function playScheduleAlertSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  const run = () => {
    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    }
    const t = ctx.currentTime
    beep(880, t, 0.14)
    beep(1175, t + 0.2, 0.18)
  }

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run)
  } else {
    run()
  }
}

/** Alarme de aviso de 10 minutos: dois bipes em onda quadrada, um pouco mais alto que o padrão. */
export function playTenMinuteWarningSound() {
  const ctx = getAudioContext()
  if (!ctx) return

  const run = () => {
    const master = ctx.createGain()
    master.gain.value = 0.4
    master.connect(ctx.destination)

    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      osc.connect(gain)
      gain.connect(master)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.01)
      gain.gain.setValueAtTime(0.35, start + duration - 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    }

    const t = ctx.currentTime
    tone(988, t, 0.18)
    tone(1319, t + 0.22, 0.22)
  }

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run)
  } else {
    run()
  }
}
