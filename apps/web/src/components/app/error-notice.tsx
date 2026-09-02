import type { Diagnostic } from '../../contracts'

export type UserFacingError = {
  title: string
  description: string
  technicalDetails?: string
}

export function errorFromCause(
  cause: unknown,
  title: string,
  description: string,
): UserFacingError {
  return {
    title,
    description,
    technicalDetails: cause instanceof Error ? cause.message : String(cause),
  }
}

export function ErrorNotice({
  error,
  id,
  className = '',
}: {
  error: UserFacingError
  id?: string
  className?: string
}) {
  return (
    <div
      id={id}
      role="alert"
      className={`rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger ${className}`}
    >
      <b className="block">{error.title}</b>
      <p className="mt-1 leading-6">{error.description}</p>
      {error.technicalDetails && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            查看技术详情
          </summary>
          <p className="mt-1 break-words font-mono [overflow-wrap:anywhere]">
            {error.technicalDetails}
          </p>
        </details>
      )}
    </div>
  )
}

export function DiagnosticList({
  items,
  className = '',
}: {
  items?: Diagnostic[]
  className?: string
}) {
  if (!items?.length) return null

  return (
    <ul className={`space-y-2 ${className}`}>
      {items.map((item, index) => (
        <li key={`${item.code}-${item.path ?? ''}-${index}`}>
          <p>{item.message}</p>
          {item.remediation && (
            <p className="mt-1 text-muted-foreground">
              处理建议：{item.remediation}
            </p>
          )}
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              查看技术详情
            </summary>
            <p className="mt-1 break-words font-mono [overflow-wrap:anywhere]">
              {[`代码：${item.code}`, item.source && `来源：${item.source}`, item.path && `路径：${item.path}`].filter(Boolean).join(' · ')}
            </p>
          </details>
        </li>
      ))}
    </ul>
  )
}
