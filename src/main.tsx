import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SmartWebController } from './app/controller'

// One controller for the page lifetime (outside React so StrictMode double effects don't spawn two workers).
const controller = new SmartWebController()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App controller={controller} />
  </StrictMode>,
)
