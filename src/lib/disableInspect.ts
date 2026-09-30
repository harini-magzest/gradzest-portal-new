// Deterrent only — does not prevent viewing source (see security-headers work).
// Bypassable via browser menu, disabling JS, or curl. Production builds only,
// so it never gets in the way during local development.
export function disableInspect() {
  if (!import.meta.env.PROD) return

  document.addEventListener('contextmenu', (event) => event.preventDefault())

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase()
    const blocked =
      event.key === 'F12' ||
      (event.ctrlKey && !event.shiftKey && key === 'u') || // view-source
      (event.ctrlKey && event.shiftKey && (key === 'i' || key === 'j' || key === 'c')) || // devtools (Win/Linux)
      (event.metaKey && event.altKey && (key === 'i' || key === 'j' || key === 'c')) // devtools (Mac)

    if (blocked) event.preventDefault()
  })
}
