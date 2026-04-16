import { type ChatSidebarHandle, mountChatSidebar } from '@/chatSidebar.js'
import { type GameSessionHandle, mountGameSession } from '@/gameSession.js'
import { type LandingHandle, mountLanding } from '@/landing.js'
import '@/main.css'
import { initRouter, navigateToRoom, parseRoute } from '@/router.js'
import { clearSessionContext } from '@/sessionContext.js'

let session: GameSessionHandle | null = null
let landing: LandingHandle | null = null
let chatSidebar: ChatSidebarHandle | null = null

function destroySession() {
  session?.destroy()
  session = null
}

function destroyLanding() {
  landing?.destroy()
  landing = null
}

function destroyChatSidebar() {
  chatSidebar?.destroy()
  chatSidebar = null
}

function renderRoute() {
  destroySession()
  destroyLanding()
  destroyChatSidebar()

  const app = document.getElementById('app')
  if (!app) return

  app.replaceChildren()

  const row = document.createElement('div')
  row.className =
    'mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col gap-0 overflow-hidden lg:flex-row lg:items-stretch'

  const mainHost = document.createElement('div')
  mainHost.className =
    'flex h-full min-h-0 min-w-0 flex-1 flex-col items-center overflow-y-auto break-words'

  const aside = document.createElement('aside')
  aside.setAttribute('aria-label', 'Chat')
  aside.className =
    'flex min-h-0 w-full shrink-0 flex-col border-t border-zinc-200 bg-zinc-50/95 lg:w-80 lg:border-t-0 lg:border-l lg:border-zinc-200'

  row.append(mainHost, aside)
  app.append(row)

  const route = parseRoute()
  if (route.type === 'home') {
    clearSessionContext()
    chatSidebar = mountChatSidebar({ aside, mode: 'home' })
    landing = mountLanding({
      host: mainHost,
      onCreate: () => navigateToRoom(crypto.randomUUID()),
    })
  } else {
    chatSidebar = mountChatSidebar({ aside, mode: 'room' })
    session = mountGameSession({
      host: mainHost,
      roomId: route.roomId,
      roomChatMount: chatSidebar.roomChatMount!,
    })
  }
}

initRouter(renderRoute)
window.addEventListener('popstate', renderRoute)
renderRoute()
