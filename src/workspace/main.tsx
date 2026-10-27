import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from './App'
import { CoveBrain } from './brain'
import { CoveContext } from './context'
import { ChatStore } from './store'

// One brain and one store for the page lifetime (outside React, so StrictMode does not double them).
const chat = new ChatStore()
const brain = new CoveBrain()
void chat.start()
void brain.start()
addEventListener('pagehide', () => chat.flush())
;(window as unknown as { __cove: unknown }).__cove = { ...brain.hook(), chat: () => chat.getState(), resetAll: async () => { await chat.reset(); await brain.reset() } }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CoveContext.Provider value={{ chat, brain }}>
      <App />
    </CoveContext.Provider>
  </StrictMode>,
)
