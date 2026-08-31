import type { NetworkProxySettings } from './state'

export type NetworkProxyErrors = Partial<Record<'httpProxy' | 'httpsProxy' | 'socksProxy' | 'noProxy', string>>

function validateProxyUrl(value: string, protocols: string[]): string | undefined {
  if (!value.trim()) return undefined
  if (/\p{Cc}/u.test(value)) return '代理地址不能包含控制字符。'
  try {
    const url = new URL(value)
    if (!protocols.includes(url.protocol)) return `协议必须是 ${protocols.join(' 或 ')}。`
    if (url.username || url.password) return '代理地址不能包含用户名或密码。'
    if (url.search || url.hash) return '代理地址不能包含查询参数或片段。'
  } catch {
    return '请输入完整有效的代理地址。'
  }
}

export function parseNoProxy(value: string): { values: string[]; error?: string } {
  const values = [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
  if (values.some((item) => /[\s/?#@]/.test(item) || /\p{Cc}/u.test(item))) return { values, error: '不走代理的地址只能填写域名、IP、通配符和可选端口。' }
  return { values }
}

export function validateNetworkProxy(settings: NetworkProxySettings): NetworkProxyErrors {
  if (settings.mode !== 'manual') return {}
  const errors: NetworkProxyErrors = {
    httpProxy: validateProxyUrl(settings.httpProxy, ['http:', 'https:']),
    httpsProxy: validateProxyUrl(settings.httpsProxy, ['http:', 'https:']),
    socksProxy: validateProxyUrl(settings.socksProxy, ['socks5:', 'socks5h:']),
    noProxy: parseNoProxy(settings.noProxy).error,
  }
  return Object.fromEntries(Object.entries(errors).filter(([, error]) => error))
}
