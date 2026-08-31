import { describe, expect, it } from 'vitest'
import { parseNoProxy, validateNetworkProxy } from '../network-proxy-model'
import type { NetworkProxySettings } from '../state'

const settings: NetworkProxySettings = { mode: 'manual', httpProxy: 'http://127.0.0.1:7890', httpsProxy: 'https://proxy.example.com', socksProxy: 'socks5h://127.0.0.1:7891', noProxy: 'localhost\n127.0.0.1\nlocalhost' }

describe('网络代理模型', () => {
  it('校验手动代理并去重不走代理地址', () => {
    expect(validateNetworkProxy(settings)).toEqual({})
    expect(parseNoProxy(settings.noProxy).values).toEqual(['localhost', '127.0.0.1'])
  })

  it('拒绝凭据和错误协议，非手动模式忽略隐藏值', () => {
    expect(validateNetworkProxy({ ...settings, httpProxy: 'http://user:pass@localhost:7890' }).httpProxy).toBeDefined()
    expect(validateNetworkProxy({ ...settings, socksProxy: 'http://localhost:7891' }).socksProxy).toBeDefined()
    expect(validateNetworkProxy({ ...settings, mode: 'system', httpProxy: 'bad' })).toEqual({})
  })
})
