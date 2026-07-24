import parseUri from '@/utils/uri-parser'
import { decodeBase64OrOriginal } from '@/utils/uri-parser/helpers'
import { showNotice } from '@/services/notice-service'
import { downloadSubscriptionText } from '@/services/cmds'

const U = String.fromCharCode(95)
const BS = String.fromCharCode(92)
const DQ = String.fromCharCode(34)
const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const TB = String.fromCharCode(9)
const K = {
  serverPort: 'server' + U + 'port',
  serverName: 'server' + U + 'name',
  publicKey: 'public' + U + 'key',
  shortId: 'short' + U + 'id',
  congestionControl: 'congestion' + U + 'control',
  privateKey: 'private' + U + 'key',
  localAddress: 'local' + U + 'address',
  serviceName: 'service' + U + 'name',
  alterId: 'alter' + U + 'id',
}

const quote = (s: any): string =>
  DQ +
  String(s)
    .split(BS)
    .join(BS + BS)
    .split(DQ)
    .join(BS + DQ)
    .split(LF)
    .join(BS + 'n')
    .split(CR)
    .join(BS + 'r')
    .split(TB)
    .join(BS + 't') +
  DQ

const toYaml = (v: any, ind: number): string => {
  const pad = '  '.repeat(ind)
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0'
  if (typeof v === 'string') return quote(v)
  if (Array.isArray(v)) {
    const it = v.filter((x: any) => x !== undefined && x !== null)
    if (it.length === 0) return '[]'
    return it
      .map((x: any) => {
        if (typeof x === 'object') {
          const ls = toYaml(x, ind + 1).split(LF)
          ls[0] = pad + '- ' + ls[0].trimStart()
          return ls.join(LF)
        }
        return pad + '- ' + toYaml(x, ind + 1)
      })
      .join(LF)
  }
  const ks = Object.keys(v).filter(
    (k) => v[k] !== undefined && v[k] !== null,
  )
  if (ks.length === 0) return '{}'
  return ks
    .map((k) => {
      const x = v[k]
      if (typeof x === 'object')
        return pad + quote(k) + ':' + LF + toYaml(x, ind + 1)
      return pad + quote(k) + ': ' + toYaml(x, ind)
    })
    .join(LF)
}

const isUriLine = (l: string): boolean => {
  if (!l.includes('://')) return false
  if (l.includes(' ')) return false
  const c = l.charAt(0)
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

const extractUris = (text: string): string[] => {
  const t = text.trim()
  if (!t) return []
  const dec = decodeBase64OrOriginal(t)
  const src = dec !== t && dec.includes('://') ? dec : t
  return src
    .split(LF)
    .map((l) => l.split(CR).join('').trim())
    .filter(isUriLine)
}

const normType = (t: string): string =>
  t === 'shadowsocks'
    ? 'ss'
    : t === 'hy2'
      ? 'hysteria2'
      : t === 'wg'
        ? 'wireguard'
        : t === 'https'
          ? 'http'
          : t === 'socks5'
            ? 'socks'
            : t

const applyTransport = (p: any, tr: any) => {
  if (!tr || typeof tr !== 'object') return
  const type = (tr.type || '').toLowerCase()
  const hostOf = (t: any) =>
    (t && t.headers && t.headers.Host) || (t && t.host)
  if (!type || type === 'tcp') {
    if (tr.host || tr.path) {
      p.network = 'ws'
      const w: any = {}
      if (tr.path) w.path = tr.path
      const h = hostOf(tr)
      if (h) w.headers = { Host: h }
      p['ws-opts'] = w
    }
    return
  }
  if (type === 'ws') {
    p.network = 'ws'
    const w: any = {}
    if (tr.path) w.path = tr.path
    const h = hostOf(tr)
    if (h) w.headers = { Host: h }
    if (Object.keys(w).length) p['ws-opts'] = w
  } else if (type === 'grpc') {
    p.network = 'grpc'
    if (tr[K.serviceName])
      p['grpc-opts'] = { 'grpc-service-name': tr[K.serviceName] }
  } else if (type === 'http' || type === 'h2') {
    p.network = 'h2'
    const h: any = {}
    if (tr.host) h.host = Array.isArray(tr.host) ? tr.host[0] : tr.host
    if (tr.path) h.path = tr.path
    if (Object.keys(h).length) p['h2-opts'] = h
  } else if (type === 'httpupgrade') {
    p.network = 'ws'
    const w: any = { 'v2ray-http-upgrade': true }
    if (tr.path) w.path = tr.path
    const h = hostOf(tr)
    if (h) w.headers = { Host: h }
    p['ws-opts'] = w
  }
}

const parseSingbox = (text: string): any[] => {
  let j: any
  try {
    j = JSON.parse(text)
  } catch (e) {
    return []
  }
  const outs = Array.isArray(j && j.outbounds) ? j.outbounds : []
  if (outs.length === 0) return []
  const NODES = new Set([
    'vless',
    'vmess',
    'trojan',
    'ss',
    'shadowsocks',
    'hysteria',
    'hysteria2',
    'hy2',
    'tuic',
    'anytls',
    'wireguard',
    'wg',
    'http',
    'https',
    'socks',
    'socks5',
  ])
  const proxies: any[] = []
  const seen = new Set<string>()
  for (const o of outs) {
    if (!o || typeof o !== 'object') continue
    const raw = (o.type || '').toLowerCase()
    if (!NODES.has(raw)) continue
    const server = o.server
    const port = o[K.serverPort]
    if (!server || !port) continue
    const t = normType(raw)
    const base =
      String(o.tag || o.name || t + '-' + port).trim() || t + '-' + port
    let n = base
    let i = 2
    while (seen.has(n)) n = base + ' (' + i++ + ')'
    seen.add(n)
    const tls = o.tls || {}
    const p: any = { type: t, name: n, server: server, port: port, udp: true }
    if (tls[K.serverName]) p.servername = tls[K.serverName]
    if (tls.insecure === true) p['skip-cert-verify'] = true
    const fp = (tls.utls && tls.utls.fingerprint) || tls.fingerprint
    if (fp) p['client-fingerprint'] = fp
    if (tls.enabled && (t === 'vless' || t === 'vmess')) p.tls = true
    if (t === 'vless') {
      if (o.uuid) p.uuid = o.uuid
      if (o.flow) p.flow = o.flow
      if (tls.reality && tls.reality.enabled) {
        const ro: any = {}
        if (tls.reality[K.publicKey]) ro['public-key'] = tls.reality[K.publicKey]
        if (tls.reality[K.shortId]) ro['short-id'] = tls.reality[K.shortId]
        if (Object.keys(ro).length) p['reality-opts'] = ro
        p.tls = true
      }
      applyTransport(p, o.transport)
    } else if (t === 'vmess') {
      if (o.uuid) p.uuid = o.uuid
      if (o[K.alterId] !== undefined) p.alterId = o[K.alterId]
      if (o.security) p.cipher = o.security
      applyTransport(p, o.transport)
    } else if (t === 'trojan') {
      if (o.password) p.password = o.password
      applyTransport(p, o.transport)
    } else if (t === 'hysteria2') {
      if (o.password) p.password = o.password
      if (tls.alpn) p.alpn = Array.isArray(tls.alpn) ? tls.alpn : [tls.alpn]
      if (o.obfs && o.obfs.password) p['obfs-password'] = o.obfs.password
    } else if (t === 'tuic') {
      if (o.uuid) p.uuid = o.uuid
      if (o.password) p.password = o.password
      if (o[K.congestionControl])
        p['congestion-controller'] = o[K.congestionControl]
      if (tls.alpn) p.alpn = Array.isArray(tls.alpn) ? tls.alpn : [tls.alpn]
    } else if (t === 'anytls') {
      if (o.password) p.password = o.password
    } else if (t === 'ss') {
      if (o.password) p.password = o.password
      if (o.method) p.cipher = o.method
    } else if (t === 'http' || t === 'socks') {
      if (o.username) p.username = o.username
      if (o.password) p.password = o.password
    } else if (t === 'wireguard') {
      if (o[K.privateKey]) p['private-key'] = o[K.privateKey]
      if (o[K.publicKey]) p['public-key'] = o[K.publicKey]
      if (o[K.localAddress]) {
        const addrs = Array.isArray(o[K.localAddress])
          ? o[K.localAddress]
          : [o[K.localAddress]]
        addrs.forEach((a: any) => {
          const sa = String(a)
          const slash = sa.indexOf('/')
          const ip = slash >= 0 ? sa.slice(0, slash) : sa
          if (ip.includes(':')) p.ipv6 = ip
          else p.ip = ip
        })
      }
    }
    proxies.push(p)
  }
  return proxies
}

const wrapYaml = (proxies: any[]): string => {
  const names = proxies.map((p) => p.name)
  return (
    toYaml(
      {
        proxies: proxies,
        'proxy-groups': [
          {
            name: '导入节点',
            type: 'select',
            proxies: names.concat(['DIRECT']),
          },
        ],
        rules: ['MATCH,导入节点'],
      },
      0,
    ) + LF
  )
}

export function importText(text: string): {
  yaml: string
  count: number
  name: string
  desc: string
} | null {
  const uris = extractUris(text)
  const proxies: any[] = []
  const seen = new Set<string>()
  if (uris.length > 0) {
    for (const u of uris) {
      try {
        const p = parseUri(u) as any
        let n = (p.name || 'node').trim() || 'node'
        let i = 2
        while (seen.has(n)) n = (p.name || 'node') + ' (' + i++ + ')'
        seen.add(n)
        p.name = n
        proxies.push(p)
      } catch (e) {
        console.warn('[uri-import] uri parse fail:', u, e)
      }
    }
  }
  if (proxies.length === 0) {
    const sb = parseSingbox(text)
    for (const p of sb) proxies.push(p)
  }
  if (proxies.length === 0) return null
  return {
    yaml: wrapYaml(proxies),
    count: proxies.length,
    name: '导入(' + proxies.length + ')',
    desc: '粘贴链接 / 通用订阅 / sing-box 导入',
  }
}

export async function importUrl(url: string): Promise<{
  yaml: string
  count: number
  name: string
  desc: string
} | null> {
  let text = ''
  try {
    text = await downloadSubscriptionText(url)
  } catch (e) {
    console.warn('[uri-import] download fail, fallback clash:', e)
    return null
  }
  return importText(text)
}

export function buildManualYaml(m: {
  proto: string
  host: string
  port: string
  user: string
  pass: string
  remark: string
}): { yaml: string; name: string } | null {
  const host = (m.host || '').trim()
  const port = (m.port || '').trim()
  if (!host || !port) {
    showNotice.error('请填写服务器和端口')
    return null
  }
  const allDigit =
    port.length > 0 && port.split('').every((c) => c >= '0' && c <= '9')
  if (!allDigit || +port < 1 || +port > 65535) {
    showNotice.error('端口需为 1-65535 的数字')
    return null
  }
  const user = (m.user || '').trim()
  const pass = (m.pass || '').trim()
  if ((user && !pass) || (!user && pass)) {
    showNotice.error('账号和密码请同时填写，或同时留空')
    return null
  }
  let h = host
  if (h.includes(':') && !h.startsWith('[')) h = '[' + h + ']'
  const auth = user
    ? encodeURIComponent(user) + ':' + encodeURIComponent(pass) + '@'
    : ''
  const remark = (m.remark || '').trim()
  const uri =
    m.proto +
    '://' +
    auth +
    h +
    ':' +
    port +
    (remark ? '#' + encodeURIComponent(remark) : '')
  let proxy: any
  try {
    proxy = parseUri(uri)
  } catch (e: any) {
    showNotice.error('解析失败：' + (e && e.message ? e.message : String(e)))
    return null
  }
  if (m.proto === 'https') proxy.tls = true
  const name = proxy.name || m.proto + '-' + port
  return {
    yaml:
      toYaml(
        {
          proxies: [proxy],
          'proxy-groups': [
            { name: '导入节点', type: 'select', proxies: [name, 'DIRECT'] },
          ],
          rules: ['MATCH,导入节点'],
        },
        0,
      ) + LF,
    name: name,
  }
}