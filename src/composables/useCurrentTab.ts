import { ref, readonly, onMounted, onUnmounted } from 'vue'
import { normalizeUrl } from '@/lib/storage'

export function useCurrentTab() {
  const currentUrl = ref('')
  const pageTitle = ref('')

  async function updateFromActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.url) {
        currentUrl.value = normalizeUrl(tab.url)
        pageTitle.value = tab.title ?? ''
      }
    } catch {
      // Side panel may not have access yet
    }
  }

  function onTabActivated() {
    updateFromActiveTab()
  }

  function onTabUpdated(
    _tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    _tab: chrome.tabs.Tab,
  ) {
    if (changeInfo.url || changeInfo.status === 'complete') {
      updateFromActiveTab()
    }
  }

  onMounted(() => {
    updateFromActiveTab()
    chrome.tabs.onActivated.addListener(onTabActivated)
    chrome.tabs.onUpdated.addListener(onTabUpdated)
  })

  onUnmounted(() => {
    chrome.tabs.onActivated.removeListener(onTabActivated)
    chrome.tabs.onUpdated.removeListener(onTabUpdated)
  })

  return {
    currentUrl: readonly(currentUrl),
    pageTitle: readonly(pageTitle),
  }
}
