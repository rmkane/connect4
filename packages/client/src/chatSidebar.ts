import { mountGlobalChatWidget } from '@/globalChatWidget.js'

export type ChatSidebarHandle = {
  destroy: () => void
  /** Room-route only: mount point for room chat Lit UI. */
  roomChatMount: HTMLElement | null
}

function tabButtonClasses(active: boolean): string {
  const base =
    'flex-1 px-3 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2'
  return active
    ? `${base} border-b-2 border-red-700 bg-white text-red-900`
    : `${base} border-b-2 border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900`
}

export function mountChatSidebar(opts: {
  aside: HTMLElement
  mode: 'home' | 'room'
}): ChatSidebarHandle {
  const { aside, mode } = opts
  aside.replaceChildren()

  if (mode === 'home') {
    aside.classList.add(
      'min-h-0',
      'max-h-[min(42dvh,22rem)]',
      'shrink-0',
      'overflow-hidden',
      'gap-3',
      'p-4',
      'lg:h-full',
      'lg:max-h-full',
      'lg:min-h-0',
      'lg:overflow-hidden',
      'lg:sticky',
      'lg:top-6',
      'lg:self-start'
    )
    const heading = document.createElement('h2')
    heading.className = 'shrink-0 text-xs font-semibold tracking-wide text-zinc-500 uppercase'
    heading.textContent = 'Chat'
    const globalHost = document.createElement('div')
    globalHost.className = 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
    aside.append(heading, globalHost)
    const global = mountGlobalChatWidget(globalHost, { variant: 'sidebar' })

    return {
      roomChatMount: null,
      destroy() {
        global.destroy()
        aside.replaceChildren()
      },
    }
  }

  aside.classList.add(
    'min-h-0',
    'max-h-[min(42dvh,22rem)]',
    'shrink-0',
    'overflow-hidden',
    'lg:h-full',
    'lg:max-h-full',
    'lg:min-h-0',
    'lg:overflow-hidden',
    'lg:sticky',
    'lg:top-6',
    'lg:self-start'
  )

  const tabRow = document.createElement('div')
  tabRow.className = 'flex shrink-0 border-b border-zinc-200 bg-white'
  tabRow.setAttribute('role', 'tablist')
  tabRow.setAttribute('aria-label', 'Chat')

  const btnRoom = document.createElement('button')
  btnRoom.type = 'button'
  btnRoom.role = 'tab'
  btnRoom.textContent = 'Room'

  const btnGlobal = document.createElement('button')
  btnGlobal.type = 'button'
  btnGlobal.role = 'tab'
  btnGlobal.textContent = 'Global'

  tabRow.append(btnRoom, btnGlobal)

  const panels = document.createElement('div')
  panels.className = 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50/80'

  const roomPanel = document.createElement('div')
  roomPanel.className = 'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3'
  roomPanel.setAttribute('role', 'tabpanel')
  roomPanel.setAttribute('aria-label', 'Room chat')

  const globalPanel = document.createElement('div')
  globalPanel.className =
    'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 [scrollbar-gutter:stable]'
  globalPanel.setAttribute('role', 'tabpanel')
  globalPanel.setAttribute('aria-label', 'Global chat')

  panels.append(roomPanel, globalPanel)
  aside.append(tabRow, panels)

  let globalWidget: ReturnType<typeof mountGlobalChatWidget> | null = null
  let active: 'room' | 'global' = 'room'

  function mountGlobalIfNeeded() {
    if (globalWidget) return
    globalWidget = mountGlobalChatWidget(globalPanel, { variant: 'tabPanel' })
  }

  function updateTabUi() {
    const roomOn = active === 'room'
    btnRoom.className = tabButtonClasses(roomOn)
    btnGlobal.className = tabButtonClasses(!roomOn)
    btnRoom.setAttribute('aria-selected', roomOn ? 'true' : 'false')
    btnGlobal.setAttribute('aria-selected', roomOn ? 'false' : 'true')
    if (roomOn) {
      roomPanel.removeAttribute('hidden')
      globalPanel.setAttribute('hidden', '')
    } else {
      roomPanel.setAttribute('hidden', '')
      globalPanel.removeAttribute('hidden')
    }
    if (!roomOn) mountGlobalIfNeeded()
  }

  btnRoom.addEventListener('click', () => {
    active = 'room'
    updateTabUi()
  })
  btnGlobal.addEventListener('click', () => {
    active = 'global'
    updateTabUi()
  })

  updateTabUi()

  return {
    roomChatMount: roomPanel,
    destroy() {
      globalWidget?.destroy()
      globalWidget = null
      aside.replaceChildren()
    },
  }
}
