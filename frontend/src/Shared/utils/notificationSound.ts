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

/** Agenda os dois bipes de aviso (onda quadrada) a partir de `start`. */
function scheduleWarningBeeps(ctx: AudioContext, start: number) {
  const master = ctx.createGain()
  master.gain.value = 0.4
  master.connect(ctx.destination)

  const tone = (freq: number, at: number, duration: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(master)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01)
    gain.gain.setValueAtTime(0.35, at + duration - 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.start(at)
    osc.stop(at + duration + 0.02)
  }

  tone(988, start, 0.18)
  tone(1319, start + 0.22, 0.22)
}

function withRunningContext(run: (ctx: AudioContext) => void) {
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => run(ctx))
  } else {
    run(ctx)
  }
}

/** Alarme de aviso de 10 minutos: dois bipes em onda quadrada, um pouco mais alto que o padrão. */
export function playTenMinuteWarningSound() {
  withRunningContext((ctx) => scheduleWarningBeeps(ctx, ctx.currentTime))
}

const PB_HQ_VOICE_URL = '/sounds/pb-hq.mp3'
let pbHqVoice: Promise<AudioBuffer> | null = null

function loadPbHqVoice(ctx: AudioContext): Promise<AudioBuffer> {
  if (!pbHqVoice) {
    pbHqVoice = fetch(PB_HQ_VOICE_URL)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch((err: unknown) => {
        pbHqVoice = null
        throw err
      })
  }
  return pbHqVoice
}

/** Volume da voz da PB HQ (1 = original). */
const PB_HQ_VOICE_VOLUME = 0.6

/** Aviso de 10 min da PB HQ: voz → 1s → voz, sem bipes. */
export function playPbHqWarningSound() {
  withRunningContext((ctx) => {
    loadPbHqVoice(ctx)
      .then((voice) => {
        const volume = ctx.createGain()
        volume.gain.value = PB_HQ_VOICE_VOLUME
        volume.connect(ctx.destination)
        const playVoice = (at: number) => {
          const src = ctx.createBufferSource()
          src.buffer = voice
          src.connect(volume)
          src.start(at)
        }
        const t = ctx.currentTime + 0.05
        playVoice(t)
        playVoice(t + voice.duration + 1)
      })
      .catch(() => scheduleWarningBeeps(ctx, ctx.currentTime))
  })
}

const PARTY_INVITE_URL = '/sounds/aceita-pt-meo.mp3'
let partyInvite: Promise<AudioBuffer> | null = null

/** "Aceita a PT": tocado para quem o líder convidou pelo jogo. */
export function playPartyInviteSound() {
  withRunningContext((ctx) => {
    if (!partyInvite) {
      partyInvite = fetch(PARTY_INVITE_URL)
        .then((res) => res.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .catch((err: unknown) => {
          partyInvite = null
          throw err
        })
    }
    partyInvite
      .then((buffer) => {
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.connect(ctx.destination)
        src.start()
      })
      .catch(() => scheduleWarningBeeps(ctx, ctx.currentTime))
  })
}
