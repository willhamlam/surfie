import { ref, readonly } from 'vue'
import type { Settings } from '@/types/settings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { loadSettings, saveSettings } from '@/lib/storage'

const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
const loaded = ref(false)

export function useSettings() {
  async function load() {
    settings.value = await loadSettings()
    loaded.value = true
  }

  async function update(patch: Partial<Settings>) {
    const next = { ...settings.value, ...patch }
    settings.value = next
    await saveSettings(next)
  }

  async function reset() {
    settings.value = { ...DEFAULT_SETTINGS }
    await saveSettings(settings.value)
  }

  return {
    settings: readonly(settings),
    loaded: readonly(loaded),
    load,
    update,
    reset,
  }
}
