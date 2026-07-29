import { useThemeStore } from '@/stores/themeStore'

class SoundService {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  private isEnabled(): { enabled: boolean; volume: number } {
    const { soundEnabled, soundVolume } = useThemeStore.getState()
    return { enabled: soundEnabled, volume: Math.max(0.01, Math.min(1, soundVolume)) }
  }

  /**
   * Short crisp beep for barcode scan / add-to-cart
   */
  playScan(): void {
    const { enabled, volume } = this.isEnabled()
    if (!enabled) return

    const ctx = this.getContext()
    if (!ctx) return

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime) // A5
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.07)

      gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.08)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[soundService]", err); // Audio playback fallback
    }
  }

  /**
   * Harmonious chord sequence for completed sale
   */
  playSuccess(): void {
    const { enabled, volume } = this.isEnabled()
    if (!enabled) return

    const ctx = this.getContext()
    if (!ctx) return

    try {
      const notes = [523.25, 659.25, 783.99] // C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        const startTime = ctx.currentTime + idx * 0.05
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, startTime)

        gain.gain.setValueAtTime(volume * 0.3, startTime)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(startTime)
        osc.stop(startTime + 0.26)
      })
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[soundService]", err); // Fallback
    }
  }

  /**
   * Low soft thud for errors / insufficient stock
   */
  playError(): void {
    const { enabled, volume } = this.isEnabled()
    if (!enabled) return

    const ctx = this.getContext()
    if (!ctx) return

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(180, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.18)

      gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.19)
    } catch (err) {// eslint-disable-next-line no-console
      console.error("[soundService]", err); // Fallback
    }
  }
}

export const soundService = new SoundService()
