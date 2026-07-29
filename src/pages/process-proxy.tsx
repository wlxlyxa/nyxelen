import { AccountTreeRounded, ClearAllRounded, DnsRounded, RefreshRounded } from '@mui/icons-material'
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
import { useEffect, useMemo, useState } from 'react'

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
    /* 隐私模式等写不进就放弃，不阻塞 */
  }
}

const ProcessProxyPage = () => {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 按进程名存策略（L1 语义=按名分流；名比 pid 稳定，可本地持久化）
  const [policies, setPolicies] = useState<Record<string, string>>(readStore)

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

  const loadProcesses = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await invoke<ProcessInfo[]>('get_running_processes')
      setProcesses(list)
    } catch (e) {
      setError(String(e))
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
            为每个程序单独指定走代理还是直连，规则按进程名生效。
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
            severity="warning"
            sx={{ mx: 2, mt: 1.5 }}
            action={
              <IconButton
                size="small"
                color="inherit"
                onClick={() => setPolicies((p) => {
                  writeStore({})
                  return {}
                })}
              >
                <ClearAllRounded fontSize="small" />
              </IconButton>
            }
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={`已设定 ${selectedCount} 个`} size="small" color="warning" />
              <span>规则注入引擎开发中，当前设定暂不生效——下一版接通后即刻生效。</span>
            </Box>
          </Alert>
        )}

        <Box sx={{ px: 1, py: 1.5, minHeight: 220 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mx: 1 }}>
              {error}
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
                          boxShadowColor: 'warning.main',
                          bgcolor: (t) => `${t.palette.warning.main}14`,
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
                            ...(chosen && { color: 'warning.main', fontWeight: 700 }),
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
