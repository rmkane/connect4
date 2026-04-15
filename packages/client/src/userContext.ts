/** Site-wide strip under the header — outside `#app` / board. */
export function setUserContext(displayName: string | null) {
  const bar = document.getElementById('user-context')
  const nameEl = document.getElementById('user-context-name')
  if (!bar || !nameEl) return

  if (displayName) {
    nameEl.textContent = displayName
    bar.classList.remove('hidden')
  } else {
    nameEl.textContent = ''
    bar.classList.add('hidden')
  }
}
