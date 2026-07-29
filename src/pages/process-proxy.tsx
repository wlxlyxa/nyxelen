import {
  AccountTreeRounded,
  CheckCircleRounded,
  ClearAllRounded,
  DnsRounded,
  KeyboardArrowRightRounded,
  RefreshRounded,
} from '@mui/icons-material'
import {
  Alert,
  Box,
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
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BasePage } from '@/components/base'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { useProxiesData } from '@/providers/app-data-context'

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
const GROUP_TYPES = ['Selector', 'URLTest', 'Fallback', 'LoadBalance']
const BUILTIN_GROUPS = ['GLOBAL', 'DIRECT', 'REJECT', 'PASS', 'COMPATIBLE']

const STORE_KEY = 'nyxelen_process_policies'
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
// 由 policies 构造 mihomo 规则（PROXY 旧值不参与，等迁移修正）
const buildRules = (pols: Record<string, string>) =>
  Object.entries(pols)
    .filter(([_, v]) => v && v !== '__global__' && v !== 'PROXY')
    .map(([n, v]) => `PROCESS-NAME,${n},${v}`)

const REFRESH_MS = 12000

const ProcessProxyPage = () => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [policies, setPolicies] = useState<Record<string, string>>(readStore)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // 注入只由 setPolicy 触发；policiesRef 存最新值供事件回调读取，debounceRef 防抖
  const policiesRef = useRef<Record<string, string>>(policies)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { proxies, isProxiesPending } = useProxiesData()

  const proxyGroups = useMemo(() => {
    if (!proxies) return [] as string[]
    return Object.entries(proxies as Record<string, { type?: string }>)
      .filter(([name, item]) => GROUP_TYPES.includes(item?.type ?? '') && !BUILTIN_GROUPS.includes(name))
      .map(([name]) => name)
  }, [proxies])

  // 注入 mihomo；silent=true 时不显示"正在注入"（迁移用）
  const applyRules = useCallback(async (rules: string[], silent: boolean) => {
    if (!silent) setApplying(true)
    setApplyError(null)
    try {
      await invoke('patch_verge_config', { payload: { process_rules: rules } })
      await invoke('enhance_profiles')
      if (!silent) setAppliedCount(rules.length)
    } catch (e) {
      console.error('[process-proxy] apply failed', e)
      if (!silent) setApplyError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setApplying(false)
    }
  }, [])

  // PROXY 旧值迁移：静默修正，不惊动用户（不显示"正在注入"）
  useEffect(() => {
    if (proxyGroups.length === 0) return
    if (!Object.values(policiesRef.current).includes('PROXY')) return
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(policiesRef.current)) next[k] = v === 'PROXY' ? proxyGroups[0] : v
    policiesRef.current = next
    writeStore(next)
    setPolicies(next)
    const rules = buildRules(next)
    console.log('[process-proxy] MIGRATE PROXY ->', proxyGroups[0], '(silent)')
    applyRules(rules, true)
  }, [proxyGroups, applyRules])

  // 用户改选择 → 唯一会显示"正在注入"的注入触发点
  const setPolicy = (name: string, value: string) => {
    const next = { ...policiesRef.current }
    if (value === '__global__') delete next[name]
    else next[name] = value
    policiesRef.current = next
    writeStore(next)
    setPolicies(next)
    const rules = buildRules(next)
    console.log('[process-proxy] setPolicy INJECT', name, '->', value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => applyRules(rules, false), 400)
  }

  const selectedCount = useMemo(
    () => Object.values(policies).filter((v) => v && v !== '__global__').length,
    [policies],
  )

  const groups = useMemo(() => {
    const map = new Map<string, ProcessInfo[]>()
    for (const p of processes) {
      const arr = map.get(p.name)
      if (arr) arr.push(p)
      else map.set(p.name, [p])
    }
    return Array.from(map.entries())
      .map(([name, instances]) => ({
        name,
        instances,
        totalConn: instances.reduce((s, x) => s + x.connections, 0),
      }))
      .sort((a, b) => b.totalConn - a.totalConn)
  }, [processes])

  const loadProcesses = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setListError(null)
    try {
      setProcesses(await invoke<ProcessInfo[]>('get_running_processes'))
    } catch (e) {
      console.error('[process-proxy] load failed', e)
      if (!silent) setListError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProcesses(false)
  }, [loadProcesses])

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) loadProcesses(true)
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [loadProcesses])

  const toggleExpand = (name: string) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

  return (
    <BasePage title="进程代理" contentStyle={{ padding: 2 }}>
      <EnhancedCard title="进程代理 · 按程序分流" icon={<AccountTreeRounded />} iconColor="primary">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 2, gap: 1 }}>
          <Typography variant="body2" sx={{ opacity: 0.72 }}>
            为每个程序单独指定走直连、拦截或某个代理组，规则按进程名生效、优先于域名规则。同名多实例已合并，点开可看每个进程。
          </Typography>
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
                          <Tooltip title={g.instances[0]?.path} arrow>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {g.name}
                            </Typography>
                          </Tooltip>
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
                            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13 }}>
                              {opt.label}
                            </MenuItem>
                          ))}
                          {isProxiesPending ? (
                            <MenuItem disabled sx={{ fontSize: 12, opacity: 0.5 }}>
                              加载代理组…
                            </MenuItem>
                          ) : (
                            proxyGroups.length > 0 && [
                              <ListSubheader key="__hdr" sx={{ fontSize: 11, lineHeight: '26px' }}>
                                代理组
                              </ListSubheader>,
                              ...proxyGroups.map((grp) => (
                                <MenuItem key={grp} value={grp} sx={{ fontSize: 13 }}>
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
  )
}

export default ProcessProxyPage
