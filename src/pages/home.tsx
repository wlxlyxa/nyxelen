import {
  BoltOutlined,
  HealingOutlined,
  HistoryEduOutlined,
  HistoryOutlined,
  RefreshOutlined,
  ShieldOutlined,
} from '@mui/icons-material'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  LinearProgress,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import { BasePage } from '@/components/base'
import { CurrentProxyCard } from '@/components/home/current-proxy-card'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { IpInfoCard } from '@/components/home/ip-info-card'
import { ProxyTunCard } from '@/components/home/proxy-tun-card'
import { TestCard } from '@/components/home/test-card'
import { useVerge } from '@/hooks/use-verge'
import { entry_lightweight_mode } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'

const SAFE_LEAK_ITEMS = [
  { key: 'wpad', label: 'WPAD 自动代理发现', en: 'enable_wpad_protection', dis: 'disable_wpad_protection', ck: 'wpad_protection', check: 'check_wpad_protection_status' },
  { key: 'ocsp', label: '在线证书检查', en: 'enable_ocsp_protection', dis: 'disable_ocsp_protection', ck: 'ocsp_protection', check: 'check_ocsp_protection_status' },
  { key: 'llmnr', label: '局域网名称解析', en: 'enable_llmnr_protection', dis: 'disable_llmnr_protection', ck: 'llmnr_protection', check: 'check_llmnr_protection_status' },
  { key: 'dns', label: 'DNS 缓存', en: 'enable_dns_cache_guard', dis: 'disable_dns_cache_guard', ck: 'dns_cache_guard', check: 'check_dns_cache_guard_status' },
] as const
const SUITE_ITEMS = [
  { key: 'teredo', label: 'IPv6 隧道封装', en: 'enable_teredo_protection', dis: 'disable_teredo_protection' },
  { key: 'bcast', label: '局域网广播族', en: 'enable_broadcast_protection', dis: 'disable_broadcast_protection' },
] as const
const TOTAL = SAFE_LEAK_ITEMS.length + SUITE_ITEMS.length + 3
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const HomePage = () => {
  const { verge, patchVerge } = useVerge()
  const [leak, setLeak] = useState<Record<string, boolean>>({ wpad: false, ocsp: false, llmnr: false, dns: false })
  const [suite, setSuite] = useState<{ teredo: boolean; bcast: boolean }>({ teredo: false, bcast: false })
  const [ipv6Block, setIpv6Block] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const refreshAll = useCallback(async () => {
    const leakResults = await Promise.all(
      SAFE_LEAK_ITEMS.map(({ check }) => invoke<boolean>(check).catch(() => false)),
    )
    const leakNext: Record<string, boolean> = {}
    SAFE_LEAK_ITEMS.forEach(({ key }, i) => {
      leakNext[key] = leakResults[i]
    })
    setLeak(leakNext)
    const [suiteR, ipv6R] = await Promise.all([
      invoke<{ teredo: boolean; bcast: boolean }>('check_privacy_suite_status').catch(() => ({ teredo: false, bcast: false })),
      invoke<boolean>('check_ipv6_block_status').catch(() => false),
    ])
    setSuite(suiteR)
    setIpv6Block(ipv6R)
  }, [])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const onRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    await refreshAll()
    setRefreshing(false)
  }

  const openedCount =
    SAFE_LEAK_ITEMS.filter(({ key }) => leak[key]).length +
    SUITE_ITEMS.filter(({ key }) => suite[key]).length +
    (verge?.webrtc_leak_protection ? 1 : 0) +
    (verge?.smhnr_enabled ? 1 : 0) +
    (ipv6Block ? 1 : 0)
  const allOn = openedCount === TOTAL
  const missing: string[] = []
  SAFE_LEAK_ITEMS.forEach(({ key, label }) => { if (!leak[key]) missing.push(label) })
  SUITE_ITEMS.forEach(({ key, label }) => { if (!suite[key]) missing.push(label) })
  if (!verge?.webrtc_leak_protection) missing.push('WebRTC / DNS')
  if (!verge?.smhnr_enabled) missing.push('SMHNR 名称解析')
  if (!ipv6Block) missing.push('IPv6 防泄漏')
  const level: 'safe' | 'partial' | 'risk' = allOn ? 'safe' : openedCount === 0 ? 'risk' : 'partial'
  const levelColor: 'success' | 'error' | 'warning' = level === 'safe' ? 'success' : level === 'risk' ? 'error' : 'warning'
  const levelText =
    level === 'safe' ? '防护中 · 真实 IP 已守住' : level === 'risk' ? '未防护 · 真实 IP 正在暴露' : '部分防护 · 仍有泄漏通道'

  const onToggleAll = async () => {
    if (busy) return
    const targetOn = !allOn
    setBusy(true)
    setProgress(0)
    let done = 0
    const step = async (fn: () => Promise<void>) => {
      try {
        await fn()
      } catch {
        /* 单项失败不中断整体 */
      }
      done += 1
      setProgress(done)
      await delay(350)
    }
    for (const { key, en, dis, ck } of SAFE_LEAK_ITEMS) {
      await step(async () => {
        setLeak((s) => ({ ...s, [key]: targetOn }))
        patchVerge({ [ck]: targetOn })
        await invoke(targetOn ? en : dis)
      })
    }
    for (const { key, en, dis } of SUITE_ITEMS) {
      await step(async () => {
        setSuite((s) => ({ ...s, [key]: targetOn }))
        await invoke(targetOn ? en : dis)
      })
    }
    await step(async () => {
      patchVerge({ webrtc_leak_protection: targetOn })
      await Promise.allSettled([
        invoke(targetOn ? 'enable_webrtc_control' : 'disable_webrtc_control'),
        invoke(targetOn ? 'enable_doh_block' : 'disable_doh_block'),
      ])
    })
    await step(async () => {
      patchVerge({ smhnr_enabled: targetOn })
      await invoke(targetOn ? 'enable_smhnr_protection' : 'disable_smhnr_protection')
    })
    await step(async () => {
      setIpv6Block(targetOn)
      await invoke(targetOn ? 'enable_ipv6_block' : 'disable_ipv6_block')
    })
    setBusy(false)
    showNotice.success(targetOn ? `已一键开启 ${TOTAL} 项常规防护` : `已一键关闭 ${TOTAL} 项常规防护`)
  }

  const onRescueStep1 = async () => {
    const ok = window.confirm(
      '【断网急救 · 第①步：应用内急救】\n用当前权限修复：清望仔规则 + 清系统代理 + 恢复 IPv6 + 清 DNS + 重启网卡 + 重置协议栈，不弹管理员框。\n若仍未恢复，请接着点『② 提权急救』。\n确定继续？',
    )
    if (!ok) return
    try {
      await invoke('emergency_rescue')
      showNotice.success('已执行第①步；若仍未恢复，请点『② 提权急救』')
    } catch (err) {
      showNotice.error(typeof err === 'string' ? err : '第①步失败，请点『② 提权急救』')
    }
  }
  const onRescueStep2 = async () => {
    try {
      await invoke('launch_rescue')
      showNotice.success('已启动第②步提权急救，请在管理员确认框点"是"')
    } catch (err) {
      showNotice.error(typeof err === 'string' ? err : '第②步失败（可能未打包急救脚本），请回『① 应用内急救』')
    }
  }
  const onRestorePoint = async () => {
    try {
      await invoke('create_system_restore_point')
      showNotice.success('已尝试创建还原点"望仔-高危操作前"')
    } catch (err) {
      showNotice.error(typeof err === 'string' ? err : '创建还原点失败（家庭版可能 24 小时限一个，或需管理员）')
    }
  }
  const onOpenRestore = () => {
    invoke('open_system_restore').catch((err) =>
      showNotice.error(typeof err === 'string' ? err : '打开系统还原向导失败'),
    )
  }

  const liftSx = (theme: any) => ({
    transition: 'transform .15s ease, box-shadow .2s ease',
    '&:not(:disabled):hover': { transform: 'translateY(-1px)', boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.4)}` },
    '&:not(:disabled):active': { transform: 'translateY(0)' },
  })

  return (
    <BasePage
      title="防护态势"
      contentStyle={{ padding: 2 }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="重新检测防护状态" arrow>
            <IconButton
              onClick={onRefresh}
              disabled={refreshing}
              size="small"
              color="inherit"
              sx={{
                '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                animation: refreshing ? 'spin 0.9s linear infinite' : 'none',
              }}
            >
              <RefreshOutlined />
            </IconButton>
          </Tooltip>
          <Tooltip title="轻量模式" arrow>
            <IconButton onClick={async () => await entry_lightweight_mode()} size="small" color="inherit">
              <HistoryEduOutlined />
            </IconButton>
          </Tooltip>
        </Box>
      }
    >
      <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
        <Grid size={12}>
          <EnhancedCard title="真实 IP 防护态势" icon={<ShieldOutlined />} iconColor={levelColor} noContentPadding>
            <Box
              sx={(theme) => ({
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 2.5,
                borderRadius: 2,
                background: `radial-gradient(130% 90% at 100% 0%, ${alpha(theme.palette[levelColor].main, 0.22)}, transparent 55%), ${alpha(theme.palette[levelColor].main, 0.07)}`,
                transition: 'background .5s ease',
              })}
            >
              <Box
                sx={(theme) => ({
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, transparent, ${theme.palette[levelColor].main}, transparent)`,
                  transition: 'background .5s ease',
                })}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Typography
                    variant="h2"
                    sx={(theme) => ({
                      fontWeight: 800,
                      lineHeight: 1,
                      letterSpacing: -1.5,
                      color: theme.palette[levelColor].main,
                      transition: 'color .5s ease',
                    })}
                  >
                    {openedCount}
                    <Typography component="span" variant="h5" sx={{ opacity: 0.45, fontWeight: 700, letterSpacing: 0 }}>
                      {' '}/{TOTAL}
                    </Typography>
                  </Typography>
                  <Typography
                    variant="subtitle2"
                    sx={(theme) => ({
                      color: theme.palette[levelColor].main,
                      fontWeight: 700,
                      mt: 0.75,
                      transition: 'color .5s ease',
                    })}
                  >
                    {levelText}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={busy}
                  onClick={onToggleAll}
                  startIcon={busy ? undefined : <BoltOutlined />}
                  sx={(theme) => ({
                    whiteSpace: 'nowrap',
                    minWidth: 156,
                    cursor: busy ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    ...liftSx(theme),
                  })}
                >
                  {busy && <CircularProgress size={16} thickness={5} color="inherit" />}
                  {busy ? `处理中 ${progress}/${TOTAL}` : allOn ? '一键关闭全部' : '一键开启全部'}
                </Button>
              </Box>
              {busy && <LinearProgress variant="determinate" value={(progress / TOTAL) * 100} color={levelColor} sx={{ borderRadius: 1, height: 8 }} />}
              {!busy && missing.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
                  <Typography variant="caption" sx={{ opacity: 0.6 }}>未防护通道：</Typography>
                  {missing.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={(theme) => ({
                        transition: 'background-color .2s ease, transform .15s ease',
                        '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.12), transform: 'translateY(-1px)' },
                      })}
                    />
                  ))}
                </Box>
              )}
              {!busy && missing.length === 0 && (
                <Typography variant="caption" sx={(theme) => ({ color: theme.palette.success.main, fontWeight: 600 })}>
                  所有常规防护已开启 · DNS / WebRTC / IPv6 / 系统暗管均已堵死
                </Typography>
              )}
              <Box sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  基础：TUN {verge?.enable_tun_mode ? '开' : '关'} ｜ 系统代理 {verge?.enable_system_proxy ? '开' : '关'}
                </Typography>
              </Box>
            </Box>
          </EnhancedCard>
        </Grid>
        <Grid size={6}>
          <EnhancedCard title="断网急救" icon={<HealingOutlined />} iconColor="error">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
              <Typography variant="body2" sx={{ opacity: 0.7 }}>断网时先试①，不行再②（需管理员）。</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                <Button variant="contained" color="error" onClick={onRescueStep1} startIcon={<HealingOutlined />} sx={(theme) => ({ whiteSpace: 'nowrap', ...liftSx(theme) })}>
                  ① 应用内急救
                </Button>
                <Button variant="outlined" color="error" onClick={onRescueStep2} sx={(theme) => ({ whiteSpace: 'nowrap', ...liftSx(theme) })}>
                  ② 提权急救
                </Button>
              </Box>
            </Box>
          </EnhancedCard>
        </Grid>
        <Grid size={6}>
          <EnhancedCard title="系统还原点" icon={<HistoryOutlined />} iconColor="warning">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
              <Typography variant="caption" sx={{ opacity: 0.6 }}>高危操作前创建还原点，断网救不回时可回滚。还原点存在 Windows「系统还原」里。</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 'auto' }}>
                <Button variant="contained" onClick={onRestorePoint} sx={(theme) => ({ whiteSpace: 'nowrap', ...liftSx(theme) })}>创建还原点</Button>
                <Button variant="outlined" onClick={onOpenRestore} sx={(theme) => ({ whiteSpace: 'nowrap', ...liftSx(theme) })}>去系统还原</Button>
              </Box>
            </Box>
          </EnhancedCard>
        </Grid>
        <Grid size={6}>
          <CurrentProxyCard />
        </Grid>
        <Grid size={6}>
          <IpInfoCard />
        </Grid>
        <Grid size={6}>
          <EnhancedCard title="代理与 TUN" icon={<ShieldOutlined />} iconColor="info">
            <ProxyTunCard />
          </EnhancedCard>
        </Grid>
        <Grid size={6}>
          <TestCard />
        </Grid>
      </Grid>
    </BasePage>
  )
}

export default HomePage
