import { AccountTreeRounded, CheckCircleRounded, ClearAllRounded, DnsRounded, RefreshRounded } from '@mui/icons-material'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
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
import { useEffect, useMemo, useRef, useState } from 'react'

import { BasePage } from '@/components/base'
import { EnhancedCard } from '@/components/home/enhanced-card'

interface ProcessInfo {
  pid: number
  name: string
  path: string
  connections: number
}

const POLICY_OPTIONS = [
  { value: '__global__', label: '跟随全局' },
  { value: 'DIRECT', label: '直连' },
  { value: 'PROXY', label: '代理' },
  { value: 'REJECT', label: '拦截' },
]

// PROXY 映射到项目默认代理策略组（tmpl.rs 里的「节点选择」）；DIRECT/REJECT 是 mihomo 内置
const policyToTarget = (v: string) => (v === 'PROXY' ? '节点选择' : v)

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

const ProcessProxyPage = () => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [policies, setPolicies] = useState<Record<string, string>>(readStore)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState<number | null>(null)
  const firstRun = useRef(true)

  const setPolicy = (name: string, value: string) => {
    setPolicies((prev) => {
      const next = { ...prev }
      if (value === '__global__') delete next[name]
      else next[name] = value
      writeStore(next)
      return next
    })
  }

  const selectedCount = useMemo(
    () => Object.values(policies).filter((v) => v && v !== '__global__').length,
    [policies],
  )

  // policies 一变 → 防抖 → 存进 verge + 触发 enhance 让规则真生效
  useEffect(() => {
    const rules = Object.entries(policies)
      .filter(([_, v]) => v && v !== '__global__')
      .map(([name, v]) => `PROCESS-NAME,${name},${policyToTarget(v)}`)
    const timer = setTimeout(
      async () => {
        setApplying(true)
        setApplyError(null)
        try {
          await invoke('patch_verge_config', { payload: { process_rules: rules } })
          await invoke('enhance_profiles')
          setAppliedCount(rules.length)
        } catch (e) {
          setApplyError(String(e))
        } finally {
          setApplying(false)
        }
      },
      firstRun.current ? 0 : 400,
    )
    firstRun.current = false
    return () => clearTimeout(timer)
  }, [policies])

  const loadProcesses = async () => {
    setLoading(true)
    setListError(null)
    try {
      setProcesses(await invoke<ProcessInfo[]>('get_running_processes'))
    } catch (e) {
      setListError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProcesses()
  }, [])

  return (
    <BasePage title="进程代理" contentStyle={{ padding: 2 }}>
      <EnhancedCard title="进程代理 · 按程序分流" icon={<AccountTreeRounded />} iconColor="primary">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 2, gap: 1 }}>
          <Typography variant="body2" sx={{ opacity: 0.72 }}>
            为每个程序单独指定走代理还是直连，规则按进程名生效、优先于域名规则。
          </Typography>
          <Tooltip title="刷新进程列表">
            <IconButton size="small" onClick={loadProcesses} disabled={loading}>
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
              ) : appliedCount !== null && !applyError ? (
                <CheckCircleRounded />
              ) : undefined
            }
            sx={{ mx: 2, mt: 1.5 }}
            action={
              <IconButton
                size="small"
                color="inherit"
                onClick={() => {
                  setPolicies({})
                  writeStore({})
                }}
              >
                <ClearAllRounded fontSize="small" />
              </IconButton>
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={`已设定 ${selectedCount} 个`}
                size="small"
                color={applyError ? 'error' : applying ? 'info' : 'success'}
              />
              <span>
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
          ) : processes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, opacity: 0.5 }}>
              <DnsRounded sx={{ fontSize: 40, mb: 1 }} />
              <Typography variant="body2">当前没有程序在联网</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>程序</TableCell>
                  <TableCell align="center">PID</TableCell>
                  <TableCell align="center">连接数</TableCell>
                  <TableCell align="right">走哪条路</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {processes.map((p) => {
                  const chosen = policies[p.name] && policies[p.name] !== '__global__'
                  return (
                    <TableRow
                      key={p.pid}
                      hover
                      sx={{
                        transition: 'background .18s ease, box-shadow .18s ease',
                        ...(chosen && {
                          boxShadow: 'inset 3px 0 0 0',
                          boxShadowColor: 'success.main',
                          bgcolor: (t) => `${t.palette.success.main}12`,
                        }),
                      }}
                    >
                      <TableCell>
                        <Tooltip title={p.path} arrow>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {p.name}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>
                          {p.pid}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={p.connections}
                          size="small"
                          color={p.connections > 5 ? 'primary' : 'default'}
                          variant={p.connections > 5 ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Select
                          size="small"
                          value={policies[p.name] ?? '__global__'}
                          onChange={(e) => setPolicy(p.name, e.target.value)}
                          sx={{
                            minWidth: 110,
                            fontSize: 13,
                            transition: 'color .18s ease',
                            ...(chosen && { color: 'success.main', fontWeight: 700 }),
                          }}
                        >
                          {POLICY_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: 13 }}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
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
