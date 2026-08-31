import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type EditorSession = {
  id: string
  dirty: boolean
  canSave: boolean
  save: () => void
  cancel: () => void
}

type EditorSessionContextValue = {
  activeSession?: EditorSession
  register: (session: EditorSession) => () => void
}

const EditorSessionContext = createContext<EditorSessionContextValue | null>(null)

export function EditorSessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<EditorSession[]>([])
  const register = useCallback((session: EditorSession) => {
    setSessions((current) => [...current.filter((item) => item.id !== session.id), session])
    return () => setSessions((current) => current.filter((item) => item.id !== session.id))
  }, [])
  const activeSession = sessions.at(-1)
  return <EditorSessionContext.Provider value={{ activeSession, register }}>{children}</EditorSessionContext.Provider>
}

export function useEditorSession(): EditorSession | undefined {
  const context = useContext(EditorSessionContext)
  if (!context) throw new Error('useEditorSession 必须在 EditorSessionProvider 内使用')
  return context.activeSession
}

export function useRegisterEditorSession(session: EditorSession | undefined) {
  const context = useContext(EditorSessionContext)
  if (!context) throw new Error('useRegisterEditorSession 必须在 EditorSessionProvider 内使用')
  const { register } = context
  const current = useRef(session)
  current.current = session
  const id = session?.id

  useEffect(() => {
    if (!id) return
    return register({
      id,
      get dirty() { return current.current?.dirty ?? false },
      get canSave() { return current.current?.canSave ?? false },
      save: () => current.current?.save(),
      cancel: () => current.current?.cancel(),
    })
  }, [id, register])
}
