import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
  theme: ThemeMode
  soundEnabled: boolean
  soundVolume: number
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  setSoundEnabled: (enabled: boolean) => void
  setSoundVolume: (volume: number) => void
}

const getInitialTheme = (): ThemeMode => {
  const saved = localStorage.getItem('mellah_pos_theme')
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const getInitialSoundEnabled = (): boolean => {
  const saved = localStorage.getItem('mellah_pos_sound_enabled')
  return saved !== null ? saved === 'true' : true
}

const getInitialSoundVolume = (): number => {
  const saved = localStorage.getItem('mellah_pos_sound_volume')
  return saved !== null ? parseFloat(saved) : 0.2
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  soundEnabled: getInitialSoundEnabled(),
  soundVolume: getInitialSoundVolume(),

  setTheme: (theme) => {
    localStorage.setItem('mellah_pos_theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light'
    get().setTheme(next)
  },

  setSoundEnabled: (enabled) => {
    localStorage.setItem('mellah_pos_sound_enabled', String(enabled))
    set({ soundEnabled: enabled })
  },

  setSoundVolume: (volume) => {
    localStorage.setItem('mellah_pos_sound_volume', String(volume))
    set({ soundVolume: volume })
  },
}))

// Apply initial theme to html on module load
const initialTheme = getInitialTheme()
if (initialTheme === 'dark') {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}
