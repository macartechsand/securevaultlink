import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import App from './App.tsx'
import { applyTheme, initialTheme } from './components/ui/ThemeToggle'
import { installErrorReporter } from './lib/errorReporter'

applyTheme(initialTheme())
installErrorReporter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
