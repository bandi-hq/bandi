import { useEffect, useId, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'

const maxAvatarBytes = 5 * 1024 * 1024

export function AgentAvatarPicker({ name, file, onChange, disabled, help }: { name: string; file?: File; onChange: (file?: File) => void; disabled?: boolean; help?: string }) {
  const id = useId()
  const [preview, setPreview] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!file) { setPreview(undefined); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const choose = (next?: File) => {
    setError(undefined)
    if (!next) return
    if (next.type !== 'image/png') { setError('仅支持 PNG 图片。'); return }
    if (next.size > maxAvatarBytes) { setError('头像不能超过 5 MiB。'); return }
    onChange(next)
  }

  return <div className="rounded-lg border border-border p-4 sm:col-span-2">
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-xl font-semibold">{preview ? <img src={preview} alt="" className="size-full object-cover" /> : name.trim().slice(0, 1) || 'A'}</span>
      <div className="min-w-0 flex-1"><b className="text-sm">Agent 头像（可选）</b><p id={`${id}-help`} className="mt-1 text-xs leading-5 text-muted-foreground">{help ?? 'PNG，最大 5 MiB；显示时自动居中裁切。'}</p></div>
      <div className="flex gap-2"><Button asChild variant="outline" size="sm" aria-disabled={disabled}><label className={disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'} htmlFor={id}><ImagePlus size={14} aria-hidden="true" />选择图片<input id={id} type="file" accept="image/png" className="sr-only" disabled={disabled} aria-describedby={`${id}-help ${id}-error`} onChange={(event) => { choose(event.target.files?.[0]); event.currentTarget.value = '' }} /></label></Button>{file && <Button type="button" variant="ghost" size="icon" aria-label="移除已选头像" onClick={() => onChange(undefined)}><Trash2 size={15} aria-hidden="true" /></Button>}</div>
    </div>
    {error && <p id={`${id}-error`} role="alert" className="mt-3 text-xs text-danger">{error}</p>}
  </div>
}
