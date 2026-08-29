import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { AppProvider } from './state'
import { router } from './router'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AppProvider><RouterProvider router={router}/></AppProvider></React.StrictMode>)
