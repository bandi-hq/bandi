import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AppProvider } from './state'
import { EditorSessionProvider } from './editor-session'
import { router } from './router'
import './styles.css'

async function bootstrap() {
  if (import.meta.env.VITE_BANDI_E2E === '1') {
    await import('@wdio/tauri-plugin')
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppProvider><EditorSessionProvider><RouterProvider router={router}/></EditorSessionProvider></AppProvider></React.StrictMode>)
}

void bootstrap()
