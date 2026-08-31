import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AppProvider } from './state'
import { EditorSessionProvider } from './editor-session'
import { router } from './router'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppProvider><EditorSessionProvider><RouterProvider router={router}/></EditorSessionProvider></AppProvider></React.StrictMode>)
