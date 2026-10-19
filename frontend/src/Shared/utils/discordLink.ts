import type { MouseEvent } from 'react'

export function discordProfileUrl(id: string) {
  return `https://discord.com/users/${id}`
}

/**
 * Opens the profile straight in the Discord app via its `discord://` protocol. If the app doesn't
 * take focus shortly after (not installed), falls back to the web profile in a new tab.
 */
export function openInDiscordApp(event: MouseEvent<HTMLAnchorElement>, id: string) {
  // Ctrl/middle click etc. keep the normal "open link in new tab" behaviour.
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()

  let appOpened = false
  const markOpened = () => {
    appOpened = true
  }
  window.addEventListener('blur', markOpened, { once: true })
  document.addEventListener('visibilitychange', markOpened, { once: true })

  window.location.href = `discord://-/users/${id}`

  window.setTimeout(() => {
    window.removeEventListener('blur', markOpened)
    document.removeEventListener('visibilitychange', markOpened)
    if (!appOpened) window.open(discordProfileUrl(id), '_blank', 'noopener,noreferrer')
  }, 1500)
}
