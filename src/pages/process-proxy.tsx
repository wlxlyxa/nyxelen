import {
  AccountTreeRounded,
  AddRounded,
  CheckCircleRounded,
  ClearAllRounded,
  DnsRounded,
  KeyboardArrowRightRounded,
  RefreshRounded,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  ListSubheader,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import { Snackbar } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BasePage } from '@/components/base'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { useProxiesData } from '@/providers/app-data-context'
import { Menu, ListItemText } from '@mui/material'

interface ProcessInfo {
  pid: number
  name: string
  path: string
  connections: number
}

const FIXED_OPTIONS = [
  { value: '__global__', label: '跟随全局' },
  { value: 'DIRECT', label: '直连' },
  { value: 'REJECT', label: '拦截' },
]
const optionColor = (value: string): string => {
  if (value === 'DIRECT') return '#fbc02d'
  if (value === '__global__') return 'inherit'
  if (value === 'REJECT') return '#ef5350'
  if (value.includes('全局直连')) return 'inherit'
  if (value.includes('全局拦截')) return '#ef5350'
  if (value.includes('广告')) return '#ef5350'
  return '#66bb6a'
}
const GROUP_HEADER_LABEL = '节点切换'
const GROUP_TYPES = ['Selector', 'URLTest', 'Fallback', 'LoadBalance']
const BUILTIN_GROUPS = ['global', 'direct', 'reject', 'pass', 'compatible']
const NOT_TARGET = new Set(['global', 'pass', 'compatible'])

const STORE_KEY = 'nyxelen_process_policies'
let processCache: ProcessInfo[] | null = null
const readStore = (): Record<string, string> => {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
const writeStore = (v: Record<string, string>) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v))
  } catch {
    /* 隐私模式写不进就放弃，不阻塞 */
  }
}
const buildRules = (pols: Record<string, string>) =>
  Object.entries(pols)
    .filter(
      ([_, v]) =>
        v && v !== '__global__' && v !== 'PROXY' && !NOT_TARGET.has(v.toLowerCase()),
    )
    .map(([n, v]) =>
      n.startsWith('__path__:')
        ? `PROCESS-PATH,*${n.slice('__path__:'.length)}\\*,${v}`
        : `PROCESS-NAME,${n},${v}`,
    )

const REFRESH_MS = 12000

const stripExt = (name: string) => name.replace(/\.(exe|app)$/i, '').toLowerCase()
const avatarHue = (name: string) => {
  const key = stripExt(name)
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360
  return h
}
const avatarStyle = (name: string) => {
  const h = avatarHue(name)
  return { background: `linear-gradient(135deg, hsl(${h} 64% 57%), hsl(${h} 56% 44%))` }
}
const initial = (name: string) => {
  const key = stripExt(name)
  const ch = (key.match(/[a-z0-9]/) || [key[0] || '?'])[0]
  return ch.toUpperCase()
}

const ProcessProxyPage = () => {
  const [processes, setProcesses] = useState<ProcessInfo[]>(() => processCache ?? [])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [policies, setPolicies] = useState<Record<string, string>>(readStore)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)
  const showToast = useCallback((msg: string) => {
  setToast(null)
  window.setTimeout(() => setToast(msg), 0)
  }, [])
  const policiesRef = useRef<Record<string, string>>(policies)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addingRef = useRef(false)
  const [adding, setAdding] = useState(false)

  // 官方取组方式：useProxiesData().proxies 是 { groups, proxies, global }，组在 .groups 数组
  const { proxies: proxiesData, isProxiesPending } = useProxiesData()

  const proxyGroups = useMemo(() => {
    const groups = (proxiesData as any)?.groups
    if (!Array.isArray(groups)) return [] as string[]
    const names = groups
      .filter((g: any) => GROUP_TYPES.includes(g?.type ?? ''))
      .map((g: any) => g.name as string)
      .filter((n: string) => n && !BUILTIN_GROUPS.includes(n.toLowerCase()))
    if (names.length === 0 && groups.length > 0) {
      console.log(
        '[process-proxy] groups 非空但筛出 0 个，sample types:',
        groups.slice(0, 4).map((g: any) => g?.type),
      )
    }
    return names
  }, [proxiesData])

  const applyRules = useCallback(async (rules: string[], silent: boolean) => {
    if (!silent) setApplying(true)
    setApplyError(null)
    try {
      await invoke('patch_verge_config', { payload: { process_rules: rules } })
      await invoke('apply_process_rules_fast')
      if (!silent) setAppliedCount(rules.length)
    } catch (e) {
      console.error('[process-proxy] apply failed', e)
      if (!silent) setApplyError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setApplying(false)
    }
  }, [])

  // 等代理组加载完再清洗：合法集合含 DIRECT/REJECT/真实组名，不会误清你选的组；顺手治愈 global/PROXY 毒数据
  useEffect(() => {
    if (isProxiesPending) return
    const valid = new Set<string>(['DIRECT', 'REJECT', ...proxyGroups])
    const cur = policiesRef.current
    const next: Record<string, string> = {}
    let changed = false
    for (const [k, v] of Object.entries(cur)) {
      if (!v || v === '__global__') {
        changed = true
        continue
      }
      if (v === 'PROXY') {
        changed = true
        if (proxyGroups.length) next[k] = proxyGroups[0]
        continue
      }
      if (valid.has(v)) next[k] = v
      else changed = true
    }
    if (!changed) return
    policiesRef.current = next
    writeStore(next)
    setPolicies(next)
    applyRules(buildRules(next), true)
  }, [isProxiesPending, proxyGroups, applyRules])

  const [addAnchor, setAddAnchor] = useState<null | HTMLElement>(null)
  // 块B：手动添加程序——选 exe，写进 policies（默认直连），注入 mihomo。
  // 不依赖自动列表：任何程序，哪怕此刻没连接 / 只用 UDP，手动指定后即生效。
    const addPrograms = useCallback(async () => {
    if (addingRef.current) return
    addingRef.current = true
    setAdding(true)
    try {
      const picked = await openDialog({
        filters: [{ name: '可执行文件', extensions: ['exe'] }],
        multiple: true,
      })
      if (!picked) return
      const paths = Array.isArray(picked) ? picked : [picked]
      const next = { ...policiesRef.current }
      let added = 0
      for (const p of paths) {
        const name = String(p).split(/[\\/]/).pop() || ''
        if (name && !next[name]) {
          next[name] = 'DIRECT'
          added++
        }
      }
      if (added === 0) return
      policiesRef.current = next
      writeStore(next)
      setPolicies(next)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => applyRules(buildRules(next), false), 400)
      showToast(`已添加 ${added} 个程序`)
    } catch (e) {
      console.error('[process-proxy] add programs failed', e)
    } finally {
      addingRef.current = false
      setAdding(false)
    }
  }, [applyRules, showToast])

    // 关联导入：选 exe 或快捷方式 → 快捷方式穿透到真实 exe → 记它的目录 →
  // 用 __path__: 前缀存进 policies，buildRules 会生成 PROCESS-PATH 目录通配，一锅罩住整窝进程。
const importApp = useCallback(async () => {
    if (addingRef.current) return
    addingRef.current = true
    setAdding(true)
    try {
      const picked = await openDialog({
        filters: [{ name: '应用 / 快捷方式', extensions: ['exe', 'lnk'] }],
        multiple: true,
      })
      if (!picked) return
      const paths = Array.isArray(picked) ? picked : [picked]
      const next = { ...policiesRef.current }
      let added = 0
      for (const p of paths) {
        const exe = await invoke<string>('resolve_shortcut', { path: String(p) })
        const dir = exe.split(/[\\/]/).slice(0, -1).join('\\').toLowerCase().replace(/[\\/]+$/, '')
        if (!dir) continue
        const key = `__path__:${dir}`
        if (!next[key]) {
          next[key] = 'DIRECT'
          added++
        }
      }
      if (added === 0) return
      policiesRef.current = next
      writeStore(next)
      setPolicies(next)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => applyRules(buildRules(next), false), 400)
      showToast(`已导入 ${added} 个应用`)
    } catch (e) {
      console.error('[process-proxy] import app failed', e)
    } finally {
      addingRef.current = false
      setAdding(false)
    }
  }, [applyRules, showToast])

  const setPolicy = (name: string, value: string) => {
    const next = { ...policiesRef.current }
    if (value === '__global__') delete next[name]
    else next[name] = value
    policiesRef.current = next
    writeStore(next)
    setPolicies(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => applyRules(buildRules(next), false), 400)
  }

    const selectedCount = useMemo(
    () => Object.values(policies).filter((v) => v && v !== '__global__').length,
    [policies],
  )

// 收拢：被某个 __path__ 应用目录罩住的进程 pid，下面列表不再重复显示它们。
  const consumedPids = useMemo(() => {
    const consumed = new Set<number>()
    for (const [k] of Object.entries(policies)) {
      if (!k.startsWith('__path__:')) continue
      const prefix = (k.slice('__path__:'.length) + '\\').toLowerCase()
      for (const p of processes) {
        if (p.path && p.path.toLowerCase().startsWith(prefix)) consumed.add(p.pid)
      }
    }
    return consumed
  }, [policies, processes])

const groups = useMemo(() => {
    const map = new Map<string, ProcessInfo[]>()
    for (const p of processes) {
      if (consumedPids.has(p.pid)) continue // 收拢：被应用罩住的，下面不重复列
      const arr = map.get(p.name)
      if (arr) arr.push(p)
      else map.set(p.name, [p])
    }
    // 块B：policies 里有、但当前没连接（不在 processes）的程序也列出来——
    // 这是手动添加的后台程序，让它显示在列表里、能设策略。
    for (const name of Object.keys(policies)) {
      if (!name.startsWith('__path__:') && !map.has(name)) map.set(name, [])
    }
    const rank = (value: string): number => {
      if (value === "DIRECT") return 1
      if (value === "__global__") return 3
      if (value === "REJECT") return 6
      const lower = value.toLowerCase()
      if (lower.includes("广告") || lower.includes("adblock") || lower.includes("ads")) return 5
      if (lower.includes("全局拦截")) return 6
      if (proxyGroups.includes(value)) return 2
      return 4
    }
    return Array.from(map.entries())
      .map(([name, instances]) => ({
        name,
        instances,
        totalConn: instances.reduce((s, x) => s + x.connections, 0),
      }))
      .sort((a, b) => {
        const ra = rank(policies[a.name] ?? "__global__")
        const rb = rank(policies[b.name] ?? "__global__")
        if (ra !== rb) return ra - rb
        return b.totalConn - a.totalConn
      })
  }, [processes, policies, consumedPids, proxyGroups])

  const sortedProxyGroups = useMemo(() => {
    const arr = [...proxyGroups]
    const idx = arr.findIndex((g) => g === '节点选择')
    if (idx > 0) {
      const [t] = arr.splice(idx, 1)
      arr.unshift(t)
    }
    return arr
  }, [proxyGroups])

  const loadProcesses = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setListError(null)
    try {
      const list = await invoke<ProcessInfo[]>('get_running_processes')
      processCache = list
      setProcesses(list)
    } catch (e) {
      console.error('[process-proxy] load failed', e)
      if (!silent) setListError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProcesses(processCache !== null)
  }, [loadProcesses])

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadProcesses(true)
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadProcesses])

  const toggleExpand = (name: string) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <>
    <BasePage title="进程代理" contentStyle={{ padding: 2 }}>
      <EnhancedCard title="进程代理 · 按程序分流" icon={<AccountTreeRounded />} iconColor="primary">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 2, gap: 1 }}>
          <Typography variant="body2" sx={{ opacity: 0.72 }}>
            为每个程序单独指定走直连、拦截，或为它选一个节点；规则按进程名生效、优先于域名规则。同名多实例已合并，点开可看每个进程。
          </Typography>
                          <Tooltip title="添加程序或导入应用 · 按住 Ctrl 可一次多选">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  disabled={adding}
                  startIcon={adding ? <CircularProgress size={14} /> : <AddRounded />}
                  onClick={(e) => setAddAnchor(e.currentTarget)}
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  手动添加应用
                </Button>
              </span>
            </Tooltip>
            <Menu
              anchorEl={addAnchor}
              open={Boolean(addAnchor)}
              onClose={() => setAddAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={() => { setAddAnchor(null); importApp() }}>
                <ListItemText primary="导入应用" secondary="选 exe / 快捷方式，按目录罩住整窝进程" />
              </MenuItem>
              <MenuItem onClick={() => { setAddAnchor(null); addPrograms() }}>
                <ListItemText primary="添加单个程序" secondary="按进程名添加，即使当前没联网" />
              </MenuItem>
            </Menu>
          <Tooltip title="刷新进程列表（每 12 秒自动静默刷新）">
            <IconButton size="small" onClick={() => loadProcesses(false)} disabled={loading}>
              <RefreshRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Alert severity="info" sx={{ mx: 2, mt: 1.5 }}>
          开启「虚拟网卡模式」可获取更完整的进程网络信息。
        </Alert>

        {selectedCount > 0 && (
          <Alert
            severity={applyError ? 'error' : applying ? 'info' : 'success'}
            icon={
              applying ? (
                <CircularProgress size={16} sx={{ mt: 0.25 }} />
              ) : applyError ? undefined : (
                <CheckCircleRounded />
              )
            }
            sx={{ mx: 2, mt: 1.5 }}
            action={
              <Tooltip title="移除所有应用">
                <IconButton
                size="small"
                color="inherit"
                onClick={() => {
                  policiesRef.current = {}
                  setPolicies({})
                  writeStore({})
                  applyRules([], false)
                }}
              >
                <ClearAllRounded fontSize="small" />
              </IconButton>
              </Tooltip>
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`已设定 ${selectedCount} 个`}
                size="small"
                color={applyError ? 'error' : applying ? 'info' : 'success'}
              />
              <span style={{ wordBreak: 'break-all' }}>
                {applyError
                  ? `生效失败：${applyError}`
                  : applying
                    ? '正在注入规则到 mihomo…'
                    : '规则已注入 mihomo 并生效（重启不丢）'}
              </span>
            </Box>
          </Alert>
        )}

{Object.keys(policies).some((k) => k.startsWith('__path__:')) && (
          <Box sx={{ px: 2, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5, borderBottom: (t: any) => `1px solid ${t.palette.divider}` }}>
            <Typography variant="caption" sx={{ opacity: 0.6, mb: 0.5 }}>
              已导入应用 · 按目录罩住整窝进程
            </Typography>
            {Object.entries(policies)
              .filter(([k]) => k.startsWith('__path__:'))
              .map(([k, v]) => {
                const dir = k.slice('__path__:'.length)
                const prefix = (dir + '\\').toLowerCase()
                const appName = dir.split(/[\\/]/).filter(Boolean).pop() || dir
                const instances = processes.filter((p) => p.path && p.path.toLowerCase().startsWith(prefix))
                const live = instances.length
                const totalConn = instances.reduce((s, x) => s + x.connections, 0)
                const open = !!expanded[k]
                return (
                  <Box key={k}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.4,
                        borderRadius: 1,
                        transition: 'background .18s ease',
                        '&:hover': { bgcolor: (t: any) => `${t.palette.primary.main}0a` },
                      }}
                    >
                      <IconButton
                        size="small"
                        disabled={live === 0}
                        onClick={() => toggleExpand(k)}
                        sx={{ opacity: live ? 1 : 0.25, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }}
                      >
                        <KeyboardArrowRightRounded sx={{ fontSize: 18 }} />
                      </IconButton>
                      <Chip label="应用" size="small" color="primary" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                      <Box sx={{ flex: 1, overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {appName}
                          </Typography>
                          {live > 0 ? (
                            <Chip label={`${live} 个进程在联网 · ${totalConn} 连接`} size="small" color="success" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                          ) : (
                            <Chip label="当前未运行" size="small" variant="outlined" sx={{ fontSize: 10, height: 18, opacity: 0.6 }} />
                          )}
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{ opacity: 0.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={dir}
                        >
                          {dir}\*
                        </Typography>
                      </Box>
                      <Select size="small" value={v} onChange={(e) => setPolicy(k, e.target.value)} sx={{ minWidth: 110, fontSize: 12 }}>
                        {FIXED_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value} sx={{ color: optionColor(opt.value) }}>
                            {opt.label}
                          </MenuItem>
                        ))}
                        {sortedProxyGroups.map((grp) => (
                          <MenuItem key={grp} value={grp} sx={{ color: optionColor(grp) }}>
                            {grp}
                          </MenuItem>
                        ))}
                      </Select>
                      <Tooltip title="移除该应用">
                        <IconButton size="small" onClick={() => setPolicy(k, '__global__')}>
                          <ClearAllRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Collapse in={open} timeout={200} unmountOnExit>
                      <Box sx={{ pl: 6, pr: 2, py: 0.5 }}>
                        {instances.map((inst) => (
                          <Box key={inst.pid} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.4, fontSize: 12, opacity: 0.7 }}>
                            <Typography variant="caption" sx={{ minWidth: 56, opacity: 0.6 }}>
                              PID {inst.pid}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={inst.path}
                            >
                              {inst.name}
                            </Typography>
                            <Chip label={`${inst.connections} 连接`} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                )
              })}
          </Box>
        )}

        <Box sx={{ px: 1, py: 1.5, minHeight: 220 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : listError ? (
            <Alert severity="error" sx={{ mx: 1 }}>
              {listError}
            </Alert>
          ) : groups.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, opacity: 0.5 }}>
              <DnsRounded sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="body2">当前没有程序在联网</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>程序</TableCell>
                  <TableCell align="center">实例</TableCell>
                  <TableCell align="center">连接数</TableCell>
                  <TableCell align="right">走哪条路</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.flatMap((g) => {
                  const chosen = policies[g.name] && policies[g.name] !== '__global__'
                  const multi = g.instances.length > 1
                  const open = !!expanded[g.name]
                  const rawValue = policies[g.name] ?? '__global__'
                  const displayValue = rawValue === 'PROXY' ? (proxyGroups[0] ?? '__global__') : rawValue
                  const chosenSx = chosen
                    ? {
                        boxShadow: (t: any) => `inset 3px 0 0 0 ${t.palette.success.main}`,
                        bgcolor: (t: any) => `${t.palette.success.main}12`,
                      }
                    : {}
                  const mainRow = (
                    <TableRow key={g.name} hover sx={{ transition: 'background .18s ease, box-shadow .18s ease', ...chosenSx }}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <IconButton
                            size="small"
                            disabled={!multi}
                            onClick={() => toggleExpand(g.name)}
                            sx={{
                              opacity: multi ? 1 : 0.25,
                              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform .2s ease',
                            }}
                          >
                            <KeyboardArrowRightRounded sx={{ fontSize: 18 }} />
                          </IconButton>
                          <Box
                            sx={{
                              width: 26,
                              height: 26,
                              minWidth: 26,
                              borderRadius: '7px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: 13,
                              fontWeight: 800,
                              letterSpacing: 0.3,
                              userSelect: 'none',
                              ...avatarStyle(g.name),
                              boxShadow: chosen
                                ? (t: any) => `0 0 0 2px ${t.palette.success.main}, 0 1px 3px rgba(0,0,0,.4)`
                                : '0 1px 3px rgba(0,0,0,.4)',
                              transition: 'transform .15s ease, box-shadow .15s ease',
                              'tr:hover &': { transform: 'scale(1.08)' },
                            }}
                          >
                            {initial(g.name)}
                          </Box>
                          <Tooltip title={g.instances[0]?.path} arrow>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {g.name}
                            </Typography>
                          </Tooltip>
                          {g.instances.length === 0 && (
                            <Tooltip title="你手动添加的程序 · 当前未联网，规则待它启动即生效" arrow>
                              <Chip
                                label="手动"
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{
                                  fontSize: 10,
                                  height: 18,
                                  '@keyframes nyxManualBreathe': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.55 },
                                  },
                                  animation: 'nyxManualBreathe 2.8s ease-in-out infinite',
                                }}
                              />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        {multi ? (
                          <Chip label={`×${g.instances.length}`} size="small" variant="outlined" sx={{ fontSize: 11, height: 20 }} />
                        ) : (
                          <Typography variant="caption" sx={{ opacity: 0.4 }}>
                            1
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={g.totalConn}
                          size="small"
                          color={g.totalConn > 5 ? 'primary' : 'default'}
                          variant={g.totalConn > 5 ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Select
                          size="small"
                          value={displayValue}
                          onChange={(e) => setPolicy(g.name, e.target.value)}
                          sx={{
                            minWidth: 130,
                            fontSize: 13,
                            transition: 'color .18s ease',
                            ...(chosen && { color: 'success.main', fontWeight: 700 }),
                          }}
                        >
                          {FIXED_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13, color: optionColor(opt.value) }}>
                              {opt.label}
                            </MenuItem>
                          ))}
                          {isProxiesPending ? (
                            <MenuItem disabled sx={{ fontSize: 12, opacity: 0.5 }}>
                              加载节点…
                            </MenuItem>
                          ) : (
                            proxyGroups.length > 0 && [
                              <ListSubheader
                                key="__hdr"
                                sx={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: 1.4,
                                  lineHeight: '22px',
                                  mt: 0.5,
                                  pt: 0.75,
                                  borderTop: '1px solid',
                                  borderColor: 'divider',
                                  color: 'text.disabled',
                                }}
                              >
                                {GROUP_HEADER_LABEL}
                              </ListSubheader>,
                              ...sortedProxyGroups.map((grp) => (
                                <MenuItem key={grp} value={grp} sx={{ fontSize: 13, color: optionColor(grp) }}>
                                  {grp}
                                </MenuItem>
                              )),
                            ]
                          )}
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                  const detailRows = multi ? (
                    <TableRow key={`${g.name}__detail`}>
                      <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                        <Collapse in={open} timeout={200} unmountOnExit>
                          <Box sx={{ pl: 6, pr: 2, py: 0.5, bgcolor: (t: any) => `${t.palette.background.default}80` }}>
                            {g.instances.map((inst) => (
                              <Box
                                key={inst.pid}
                                sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.4, fontSize: 12, opacity: 0.7 }}
                              >
                                <Typography variant="caption" sx={{ minWidth: 56, opacity: 0.6 }}>
                                  PID {inst.pid}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={inst.path}
                                >
                                  {inst.path}
                                </Typography>
                                <Chip label={`${inst.connections} 连接`} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                              </Box>
                            ))}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  ) : null
                  return detailRows ? [mainRow, detailRows] : [mainRow]
                })}
              </TableBody>
            </Table>
          )}
        </Box>
      </EnhancedCard>
     </BasePage>
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast(null)}
          severity="success"
          variant="filled"
          sx={{ width: '100%', boxShadow: 6 }}
        >
          {toast}
        </Alert>
      </Snackbar>
    </>
  )
}

export default ProcessProxyPage
