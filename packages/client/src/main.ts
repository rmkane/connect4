import { type GameSessionHandle, mountGameSession } from '@/gameSession.js'
import { type LandingHandle, mountLanding } from '@/landing.js'
import '@/main.css'
import { initRouter, navigateToRoom, parseRoute } from '@/router.js'
import { setUserContext } from '@/userContext.js'

let session: GameSessionHandle | null = null
let landing: LandingHandle | null = null

function destroySession() {
  session?.destroy()
  session = null
}

function destroyLanding() {
  landing?.destroy()
  landing = null
}

function renderRoute() {
  destroySession()
  destroyLanding()
  const app = document.getElementById('app')
  if (!app) return

  const route = parseRoute()
  if (route.type === 'home') {
    setUserContext(null)
    landing = mountLanding({
      host: app,
      onCreate: () => navigateToRoom(crypto.randomUUID()),
    })
  } else {
    session = mountGameSession({ host: app, roomId: route.roomId })
  }
}

initRouter(renderRoute)
window.addEventListener('popstate', renderRoute)
renderRoute()
