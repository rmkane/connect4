import { render } from 'lit'

import { type GameSessionHandle, mountGameSession } from '@/gameSession.js'
import { landingView } from '@/landing.js'
import '@/main.css'
import { initRouter, navigateToGame, parseRoute } from '@/router.js'

let session: GameSessionHandle | null = null

function destroySession() {
  session?.destroy()
  session = null
}

function renderRoute() {
  destroySession()
  const app = document.getElementById('app')
  if (!app) return

  const route = parseRoute()
  if (route.type === 'home') {
    render(
      landingView({
        onCreate: () => navigateToGame(crypto.randomUUID()),
      }),
      app
    )
  } else {
    session = mountGameSession({ host: app, gameId: route.gameId })
  }
}

initRouter(renderRoute)
window.addEventListener('popstate', renderRoute)
renderRoute()
