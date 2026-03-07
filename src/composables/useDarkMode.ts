import { onMounted, onUnmounted } from 'vue'

export function useDarkMode() {
  const query = window.matchMedia('(prefers-color-scheme: dark)')

  function apply(dark: boolean) {
    document.documentElement.classList.toggle('dark', dark)
  }

  function onChange(e: MediaQueryListEvent) {
    apply(e.matches)
  }

  onMounted(() => {
    apply(query.matches)
    query.addEventListener('change', onChange)
  })

  onUnmounted(() => {
    query.removeEventListener('change', onChange)
  })
}
