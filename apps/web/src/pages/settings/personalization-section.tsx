import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Image, Trash2, Upload } from 'lucide-react'
import { EntityTabPanel, EntityTabs } from '../../components/app/page'
import { Button } from '../../components/ui/button'
import { AppDialog } from '../../components/ui/dialog'
import { deleteUiAsset, importUiAsset, isDesktopRuntime, readUiAsset, type UiAssetSlot } from '../../desktop-bridge'
import { useRegisterEditorSession } from '../../editor-session'
import { useUnsavedChangesGuard } from '../../hooks/use-unsaved-changes-guard'
import { useApp } from '../../state'
import {
  DEFAULT_UI_PREFERENCES,
  getAccessibleAccent,
  normalizeShellLabel,
  type UiPreferences,
} from '../../ui-preferences'
import type { MainMenuLayoutPreference } from '../../navigation-layout'

const accentPresets = [
  ['墨黑', '#20201f'], ['蓝色', '#2563eb'], ['紫色', '#7c3aed'], ['青绿', '#0f766e'], ['橙色', '#c2410c'],
] as const

const fieldClass = 'mt-2 h-11 w-full px-3'
const personalizationSections = [
  ['personalization-brand', '品牌与标识'],
  ['personalization-theme', '主题与颜色'],
  ['personalization-display', '字体与显示'],
  ['personalization-layout', '语言与布局'],
  ['personalization-background', '背景'],
] as const

type PersonalizationSectionId = typeof personalizationSections[number][0]

function getSectionFromHash(hash: string): PersonalizationSectionId | undefined {
  const section = hash.slice(hash.lastIndexOf('#') + 1)
  return personalizationSections.some(([id]) => id === section) ? section as PersonalizationSectionId : undefined
}

export function PersonalizationSection() {
  const { state, dispatch, setUiPreferencesPreview } = useApp()
  const canonicalRef = useRef(state.uiPreferences)
  const cleanupRef = useRef<() => void>(() => undefined)
  const [draft, setDraft] = useState(state.uiPreferences)
  const [logoFile, setLogoFile] = useState<File>()
  const [backgroundFile, setBackgroundFile] = useState<File>()
  const [removeLogo, setRemoveLogo] = useState(false)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string>()
  const [backgroundUrl, setBackgroundUrl] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [removeCandidate, setRemoveCandidate] = useState<UiAssetSlot>()
  const [customAccentOpen, setCustomAccentOpen] = useState(
    () => !accentPresets.some(([, color]) => color === state.uiPreferences.accentColor),
  )
  const [restoreDefaultsOpen, setRestoreDefaultsOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<PersonalizationSectionId>(() =>
    getSectionFromHash(window.location.hash) ?? personalizationSections[0][0],
  )
  const desktop = isDesktopRuntime()


  useEffect(() => {
    if (!desktop) return
    let disposed = false
    Promise.all([readUiAsset('logo'), readUiAsset('background')]).then(([logo, background]) => {
      if (disposed) { if (logo) URL.revokeObjectURL(logo); if (background) URL.revokeObjectURL(background); return }
      setLogoUrl(logo); setBackgroundUrl(background)
    }).catch(() => undefined)
    return () => { disposed = true }
  }, [desktop])

  useEffect(() => () => { if (logoUrl) URL.revokeObjectURL(logoUrl) }, [logoUrl])
  useEffect(() => () => { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl) }, [backgroundUrl])

  const accent = getAccessibleAccent(draft.accentColor)
  const labelInvalid = Boolean(draft.shellLabel?.trim()) && !normalizeShellLabel(draft.shellLabel)
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.uiPreferences) || Boolean(logoFile || backgroundFile || removeLogo || removeBackground)
  const canSave = dirty && !labelInvalid && Boolean(accent) && !saving
  const update = <K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const logoPreview = useMemo(
    () => logoFile ? URL.createObjectURL(logoFile) : removeLogo || !draft.logoAsset ? undefined : logoUrl,
    [draft.logoAsset, logoFile, logoUrl, removeLogo],
  )
  const backgroundPreview = useMemo(
    () => backgroundFile ? URL.createObjectURL(backgroundFile) : removeBackground || !draft.backgroundAsset ? undefined : backgroundUrl,
    [backgroundFile, backgroundUrl, draft.backgroundAsset, removeBackground],
  )
  useEffect(() => () => { if (logoFile && logoPreview) URL.revokeObjectURL(logoPreview) }, [logoFile, logoPreview])
  useEffect(() => () => { if (backgroundFile && backgroundPreview) URL.revokeObjectURL(backgroundPreview) }, [backgroundFile, backgroundPreview])

  const accentValid = Boolean(accent)
  const effectiveDraft = useMemo<UiPreferences>(() => ({
    ...draft,
    accentColor: accentValid ? draft.accentColor : state.uiPreferences.accentColor,
    shellLabel: labelInvalid ? state.uiPreferences.shellLabel : draft.shellLabel,
  }), [accentValid, draft, labelInvalid, state.uiPreferences.accentColor, state.uiPreferences.shellLabel])
  useEffect(() => {
    if (!dirty) {
      setUiPreferencesPreview(undefined)
      return
    }
    setUiPreferencesPreview(effectiveDraft, {
      logo: logoFile ? logoPreview : removeLogo || !effectiveDraft.logoAsset ? null : logoPreview,
      background: backgroundFile ? backgroundPreview : removeBackground || !effectiveDraft.backgroundAsset ? null : backgroundPreview,
    })
  }, [backgroundFile, backgroundPreview, dirty, effectiveDraft, logoFile, logoPreview, removeBackground, removeLogo, setUiPreferencesPreview])
  cleanupRef.current = () => setUiPreferencesPreview(undefined)
  useEffect(() => () => cleanupRef.current(), [])

  const chooseFile = (slot: UiAssetSlot, file?: File) => {
    if (!file) return
    const limit = slot === 'logo' ? 5 : 15
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > limit * 1024 * 1024) {
      setError(`${slot === 'logo' ? 'Logo' : '背景图'}仅支持 PNG/JPEG，且不能超过 ${limit} MiB。`)
      return
    }
    setError(undefined)
    if (slot === 'logo') { setLogoFile(file); setRemoveLogo(false) }
    else { setBackgroundFile(file); setRemoveBackground(false) }
  }

  const reset = () => {
    setDraft(canonicalRef.current); setLogoFile(undefined); setBackgroundFile(undefined); setRemoveLogo(false); setRemoveBackground(false); setError(undefined); setUiPreferencesPreview(undefined)
  }
  const confirmRemove = () => {
    if (removeCandidate === 'logo') { setLogoFile(undefined); setRemoveLogo(true) }
    if (removeCandidate === 'background') { setBackgroundFile(undefined); setRemoveBackground(true) }
    setRemoveCandidate(undefined)
  }
  const restoreDefaults = () => {
    setDraft({ ...DEFAULT_UI_PREFERENCES })
    setLogoFile(undefined)
    setBackgroundFile(undefined)
    setRemoveLogo(Boolean(state.uiPreferences.logoAsset))
    setRemoveBackground(Boolean(state.uiPreferences.backgroundAsset))
    setCustomAccentOpen(false)
    setRestoreDefaultsOpen(false)
    setError(undefined)
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError(undefined)
    try {
      if (logoFile) await importUiAsset('logo', logoFile)
      if (backgroundFile) await importUiAsset('background', backgroundFile)
      const preferences: UiPreferences = {
        ...draft,
        shellLabel: normalizeShellLabel(draft.shellLabel),
        logoAsset: logoFile ? { kind: 'local_asset', assetId: 'logo' } : removeLogo ? undefined : draft.logoAsset,
        backgroundAsset: backgroundFile ? { kind: 'local_asset', assetId: 'background' } : removeBackground ? undefined : draft.backgroundAsset,
      }
      canonicalRef.current = preferences
      dispatch({ type: 'UPDATE_UI_PREFERENCES', preferences })
      setDraft(preferences)
      setLogoFile(undefined)
      setBackgroundFile(undefined)

      const removals = [
        removeLogo && { slot: 'logo' as const, result: deleteUiAsset('logo') },
        removeBackground && { slot: 'background' as const, result: deleteUiAsset('background') },
      ].filter((item): item is { slot: UiAssetSlot; result: Promise<void> } => Boolean(item))
      const results = await Promise.allSettled(removals.map((item) => item.result))
      const failed = new Set(results.flatMap((result, index) => result.status === 'rejected' ? [removals[index].slot] : []))
      setRemoveLogo(failed.has('logo'))
      setRemoveBackground(failed.has('background'))
      if (failed.size) setError('个性化偏好已应用，但部分本机图片未能清理，请重试保存。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setSaving(false) }
  }

  const unsavedDialog = useUnsavedChangesGuard({ dirty, resetDraft: reset })
  useRegisterEditorSession(dirty ? { id: 'settings:personalization', dirty, canSave, save: () => void save(), cancel: reset } : undefined)

  return <div className="min-w-0 max-w-full space-y-5 pb-24 max-[959px]:pb-32">
    <nav aria-label="个性化设置分类" className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <EntityTabs tabs={personalizationSections.map(([id, label]) => ({ id, label }))} active={activeSection} onChange={(section) => setActiveSection(section as PersonalizationSectionId)} scope="personalization" ariaLabel="个性化设置分类" variant="segmented" className="w-full" tabListClassName="min-[720px]:w-full min-[720px]:min-w-0 [&>button]:min-[720px]:min-w-0 [&>button]:min-[720px]:flex-1" />
    </nav>

    <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">修改会临时应用到当前工作台；保存后保留，取消或离开后恢复。</p>

    <EntityTabPanel tabId="personalization-brand" activeTab={activeSection} scope="personalization" className="panel p-5">
      <div><b>品牌与工作台标识</b><p className="mt-1 text-sm text-muted-foreground">自定义这台设备上的工作台外观；Bandi 正式名称与 Rail Logo 保持固定。</p></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="text-sm font-medium">工作台名称<input className={fieldClass} value={draft.shellLabel ?? ''} maxLength={41} aria-invalid={labelInvalid} aria-describedby={labelInvalid ? 'shell-label-error' : 'shell-label-help'} onChange={(event) => update('shellLabel', event.target.value)} /><span id={labelInvalid ? 'shell-label-error' : 'shell-label-help'} className={`mt-2 block text-xs font-normal ${labelInvalid ? 'text-danger' : 'text-muted-foreground'}`}>{labelInvalid ? '显示名最多 40 个字符。' : '不修改 工作区名称、窗口标题、favicon 或桌面图标。'}</span></label>
        <AssetPicker label="工作台 Logo" slot="logo" preview={logoPreview} disabled={!desktop} onChoose={chooseFile} onRemove={() => setRemoveCandidate('logo')} />
      </div>
    </EntityTabPanel>

    <EntityTabPanel tabId="personalization-theme" activeTab={activeSection} scope="personalization" className="panel p-5"><b>主题与颜色</b>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><SegmentedField label="外观模式" value={draft.theme} onChange={(value) => update('theme', value as UiPreferences['theme'])} options={[['system', '跟随系统'], ['light', '亮色'], ['dark', '暗色']]} />
        <div><span className="text-sm font-medium">强调色</span><div className="mt-2 flex flex-wrap gap-2">{accentPresets.map(([name, color]) => <button type="button" key={color} aria-label={name} aria-pressed={draft.accentColor === color} onClick={() => { update('accentColor', color); setCustomAccentOpen(false) }} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ borderColor: draft.accentColor === color ? color : undefined }}><span className="size-4 rounded-full" style={{ background: color }} />{name}{draft.accentColor === color && <Check size={14} aria-hidden="true" />}</button>)}</div><Button className="mt-3" type="button" variant="outline" aria-expanded={customAccentOpen} aria-controls="custom-accent-field" onClick={() => setCustomAccentOpen((open) => !open)}>自定义颜色</Button>{customAccentOpen && <div id="custom-accent-field"><label className="mt-3 block text-sm">颜色值<input className={`${fieldClass} font-mono`} value={draft.accentColor} aria-invalid={!accent} aria-describedby="accent-help" onChange={(event) => update('accentColor', event.target.value)} /></label><p id="accent-help" className={`mt-2 text-xs ${accent ? 'text-muted-foreground' : 'text-danger'}`}>{accent ? `文字颜色已自动适配 · 对比度 ${accent.ratio.toFixed(2)}:1` : '请输入完整的 #RRGGBB 色值。'}</p></div>}</div>
      </div>
    </EntityTabPanel>

    <EntityTabPanel tabId="personalization-display" activeTab={activeSection} scope="personalization" className="panel p-5"><b>字体与显示</b><div className="mt-5 grid gap-4 sm:grid-cols-2">
      <SelectField label="界面字体" value={draft.interfaceFont} onChange={(value) => update('interfaceFont', value as UiPreferences['interfaceFont'])} options={[['bandi', 'Bandi 默认'], ['system', '系统界面字体']]} />
      <SelectField label="等宽字体" value={draft.monoFont} onChange={(value) => update('monoFont', value as UiPreferences['monoFont'])} options={[['system', '系统等宽字体'], ['classic', '经典等宽字体']]} />
      <SegmentedField label="文字大小" value={draft.fontScale} onChange={(value) => update('fontScale', value as UiPreferences['fontScale'])} options={[['small', '小'], ['default', '标准'], ['large', '大']]} />
      <SegmentedField label="界面密度" value={draft.density} onChange={(value) => update('density', value as UiPreferences['density'])} options={[['compact', '紧凑'], ['default', '标准'], ['comfortable', '宽松']]} />
    </div></EntityTabPanel>

    <EntityTabPanel tabId="personalization-layout" activeTab={activeSection} scope="personalization" className="panel p-5"><b>语言与布局</b><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-border bg-muted p-4"><span className="text-sm font-medium">界面语言</span><p className="mt-2 text-sm">简体中文</p><p className="mt-1 text-xs text-muted-foreground">当前版本仅提供简体中文，暂不支持切换。</p></div><MainMenuLayoutSelect value={draft.mainMenuLayout} onChange={(value) => update('mainMenuLayout', value)} /></div></EntityTabPanel>

    <EntityTabPanel tabId="personalization-background" activeTab={activeSection} scope="personalization" className="panel p-5"><b>背景</b><div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="grid content-start gap-4 sm:grid-cols-2"><SelectField label="背景风格" value={draft.backgroundStyle} onChange={(value) => update('backgroundStyle', value as UiPreferences['backgroundStyle'])} options={[['plain', '纯色'], ['soft', '柔和层次']]} />{backgroundPreview && <><SelectField label="图片填充" value={draft.backgroundFit} onChange={(value) => update('backgroundFit', value as UiPreferences['backgroundFit'])} options={[['cover', '覆盖'], ['contain', '完整显示']]} /><label className="sm:col-span-2 text-sm font-medium">遮罩强度：{draft.backgroundDim}%<input className="mt-3 w-full" type="range" min="0" max="80" step="5" value={draft.backgroundDim} onChange={(event) => update('backgroundDim', Number(event.target.value))} /></label></>}</div><AssetPicker label="工作台背景" slot="background" preview={backgroundPreview} disabled={!desktop} onChoose={chooseFile} onRemove={() => setRemoveCandidate('background')} /></div></EntityTabPanel>

    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</p>}
    <div data-testid="personalization-actions" className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur max-[959px]:static max-[959px]:flex-col max-[959px]:items-stretch"><p className="text-xs text-muted-foreground">仅保存在当前设备，不进入 Agent 配置、版本历史或备份。</p><div className="flex gap-2 max-[959px]:grid max-[959px]:grid-cols-2"><Button className="max-[959px]:w-full" variant="ghost" disabled={saving} onClick={() => setRestoreDefaultsOpen(true)}>恢复默认</Button><Button className="max-[959px]:w-full" variant="outline" disabled={!dirty || saving} onClick={reset}>取消</Button><Button className="max-[959px]:col-span-2 max-[959px]:w-full" disabled={!canSave} onClick={() => void save()}>{saving ? '保存中…' : '保存个性化设置'}</Button></div></div>
    <AppDialog open={Boolean(removeCandidate)} onOpenChange={(open) => { if (!open) setRemoveCandidate(undefined) }} title={`移除${removeCandidate === 'logo' ? '工作台 Logo' : '工作台背景'}？`} description="保存个性化设置后，当前设备上的图片会被删除。" size="sm" footer={<><Button variant="outline" onClick={() => setRemoveCandidate(undefined)}>保留图片</Button><Button variant="danger" onClick={confirmRemove}>确认移除</Button></>}><p className="text-sm text-muted-foreground">不会影响 Bandi 正式 Logo、工作区、Agent 配置、版本历史或备份。</p></AppDialog>
    <AppDialog open={restoreDefaultsOpen} onOpenChange={setRestoreDefaultsOpen} title="恢复个性化默认设置？" description="先把当前草稿恢复为默认值，仍需保存后才会应用。" size="sm" footer={<><Button variant="outline" onClick={() => setRestoreDefaultsOpen(false)}>保留当前设置</Button><Button onClick={restoreDefaults}>恢复默认</Button></>}><p className="text-sm text-muted-foreground">已保存的工作台 Logo 和背景会标记为待删除；不会影响 Bandi 正式品牌、Agent、工作区、版本历史或备份。</p></AppDialog>
    {unsavedDialog}
  </div>
}

function SegmentedField({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) { return <fieldset><legend className="text-sm font-medium">{label}</legend><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/50 p-1">{options.map(([id, name]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)} className={`min-h-11 rounded-md px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === id ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>{name}</button>)}</div></fieldset> }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) { return <label className="block text-sm font-medium">{label}<select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label> }
function MainMenuLayoutSelect({ value, onChange }: { value: MainMenuLayoutPreference; onChange: (value: MainMenuLayoutPreference) => void }) { return <div><SelectField label="Agent 上下文栏" value={value} onChange={(next) => onChange(next as MainMenuLayoutPreference)} options={[['follow-window', '跟随窗口（推荐）'], ['expanded', '固定展开'], ['compact', '紧凑显示'], ['hidden', '隐藏']]} /><p className="mt-2 text-xs text-muted-foreground">隐藏后可在此恢复；最近记录仅保留在当前会话。</p></div> }
function AssetPicker({ label, slot, preview, disabled, onChoose, onRemove }: { label: string; slot: UiAssetSlot; preview?: string; disabled: boolean; onChoose: (slot: UiAssetSlot, file?: File) => void; onRemove: () => void }) { return <div><span className="text-sm font-medium">{label}</span><div className="mt-2 grid min-h-32 place-items-center overflow-hidden rounded-xl border bg-muted">{preview ? <img src={preview} alt={`${label}预览`} className={`max-h-52 w-full ${slot === 'logo' ? 'object-contain p-5' : 'object-cover'}`} /> : <Image size={28} className="text-muted-foreground" aria-hidden="true" />}</div><div className="mt-2 flex gap-2"><label className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border px-3 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-muted'}`}><Upload size={15} aria-hidden="true" />选择图片<input type="file" className="sr-only" accept="image/png,image/jpeg" disabled={disabled} onChange={(event) => { onChoose(slot, event.target.files?.[0]); event.currentTarget.value = '' }} /></label><Button type="button" variant="outline" size="icon" aria-label={`移除${label}`} disabled={!preview} onClick={onRemove}><Trash2 size={15} /></Button></div>{disabled && <p className="mt-2 text-xs text-muted-foreground">图片导入仅在 Bandi Desktop 中可用。</p>}</div> }
