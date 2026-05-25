import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppMovil from './AppMovil.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppMovil />
  </StrictMode>,
)
