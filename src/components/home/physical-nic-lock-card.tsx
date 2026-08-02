import {
  CheckRounded,
  CloseRounded,
  LockOpenOutlined,
  LockOutlined,
  ShieldOutlined,
  WarningAmberRounded,
} from '@mui/icons-material'
import { Box, Button, Chip, Switch, Tooltip, Typography, alpha } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import { EnhancedCard } from '@/components/home/enhanced-card'
import { showNotice } from '@/services/notice-service'

interface PhysicalNic {
  name: string
  index: number
}

const VERIFY_SECONDS = 10

/**
 * 物理网卡出站锁卡片。
 * 后端走 WFP 动态 session：关 app 即清规则；紧急解除 = 关 session。
 * 启用后进入「验证期」倒计时：不点确认就自动解除，叠 GUI 紧急解除 + 关 app 自清 = 三重兜底。
 */
export const PhysicalNicLockCard = () => {
  const [nics, setNics] = useState<PhysicalNic[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [countdown, setCountdown] = useState(VERIFY_SECONDS)

  const refresh = useCallback(async () => {
    try {
      const [list, lk] = await Promise.all([
        invoke<PhysicalNic[]>('list_physical_nics_indexed_cmd'),
        invoke<boolean>('is_physical_nic_locked_cmd'),
      ])
      setNics(list)
      setLocked(lk)
      setSelected((prev) => (prev.length > 0 ? prev : lk ? list.map((n) => n.index) : []))
    } catch {
      /* 静默 */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 进入验证期时初始化倒计时
  useEffect(() => {
    if (verifying) setCountdown(VERIFY_SECONDS)
  }, [verifying])

  // 倒计时驱动：归零自动解除（安全网核心）
  useEffect(() => {
    if (!verifying) return
    if (countdown <= 0) {
      let alive = true
      ;(async () => {
        try {
          await invoke('disable_physical_nic_lock_cmd')
        } catch {
          /* 解除失败也继续复位 UI，动态 session 关 app 仍会清 */
        }
        if (!alive) return
        setLocked(false)
        setVerifying(false)
        showNotice.error('验证超时未确认，已自动解除物理网卡锁')
      })()
      return () => {
        alive = false
      }
    }
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [verifying, countdown])

  const toggleNic = (idx: number) =>
    setSelected((prev) => (prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]))

  const onEnable = async () => {
    if (selected.length === 0) {
      showNotice.error('请先点选要锁定的物理网卡')
      return
    }
    const ok = window.confirm(
      '启用「物理网卡出站锁」后，除代理与局域网回环外，所选物理网卡的直连出站将被全部拦截。\n\n' +
        '启用后有 10 秒验证期，未点「确认正常」将自动解除；也可随时点红色「紧急解除」，或直接关闭本应用（规则随应用退出自动清除）。\n\n' +
        '确认启用？',
    )
    if (!ok) return
    setBusy(true)
    try {
      await invoke('enable_physical_nic_lock_cmd', { proxyExe: null, nicIndices: selected })
      setLocked(true)
      setVerifying(true)
    } catch (e) {
      showNotice.error(typeof e === 'string' ? e : '启用失败')
    } finally {
      setBusy(false)
    }
  }

  const onDisable = async () => {
    setBusy(true)
    try {
      await invoke('disable_physical_nic_lock_cmd')
      setLocked(false)
      setVerifying(false)
      showNotice.success('物理网卡出站锁已解除')
    } catch (e) {
      showNotice.error(typeof e === 'string' ? e : '解除失败')
    } finally {
      setBusy(false)
    }
  }

  const confirmOk = () => {
    setVerifying(false)
    showNotice.success('已确认正常，物理网卡锁保持启用')
  }

  return (
    <EnhancedCard title="物理网卡出站锁" icon={<ShieldOutlined />} iconColor={locked ? 'error' : 'success'}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* 状态行 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={(theme) => ({
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: locked ? theme.palette.error.main : theme.palette.success.main,
                boxShadow: `0 0 0 3px ${alpha(locked ? theme.palette.error.main : theme.palette.success.main, 0.18)}`,
                ...(locked && {
                  '@keyframes lockPulse': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                    '50%': { transform: 'scale(1.35)', opacity: 0.65 },
                  },
                  animation: 'lockPulse 1.6s ease-in-out infinite',
                }),
              })}
            />
            <Box>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.1, color: locked ? 'error.main' : 'text.primary' }}>
                {locked ? '已锁定' : '未锁定'}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.6 }}>
                {locked ? '物理网卡直连已焊死，仅代理/回环可出站' : '物理网卡直连未受控'}
              </Typography>
            </Box>
          </Box>
          <Tooltip title={locked ? '点击解除锁定' : '点击启用锁定'}>
            <span>
              <Switch size="small" checked={locked} disabled={busy || verifying} color="error" onChange={(_, c) => (c ? onEnable() : onDisable())} />
            </span>
          </Tooltip>
        </Box>

        {/* 验证期倒计时横幅（安全网） */}
        {verifying && (
          <Box
            sx={(theme) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              p: 1.25,
              borderRadius: 1.5,
              border: `1px solid ${alpha(theme.palette.error.main, 0.5)}`,
              background: `linear-gradient(120deg, ${alpha(theme.palette.error.main, 0.16)}, ${alpha(theme.palette.warning.main, 0.08)})`,
            })}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Typography
                sx={(theme) => ({
                  fontSize: '2rem',
                  fontWeight: 900,
                  lineHeight: 1,
                  color: 'error.main',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 34,
                  textAlign: 'center',
                  '@keyframes cdPulse': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                    '50%': { transform: 'scale(1.12)', opacity: 0.7 },
                  },
                  animation: 'cdPulse 1s ease-in-out infinite',
                })}
              >
                {countdown}
              </Typography>
              <Box>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>验证中：代理/上网是否正常？</Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {countdown} 秒内未点「确认正常」将自动解除
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <Button size="small" variant="contained" color="success" startIcon={<CheckRounded />} onClick={confirmOk} sx={{ whiteSpace: 'nowrap' }}>
                确认正常
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<CloseRounded />} onClick={onDisable} sx={{ whiteSpace: 'nowrap' }}>
                立即解除
              </Button>
            </Box>
          </Box>
        )}

        <Typography variant="caption" sx={{ opacity: 0.7, lineHeight: 1.6 }}>
          把真实 IP 焊死在网卡层：除代理与回环外，所选物理网卡的一切直连出站一律拦截。点选下方要锁定的网卡（亮起=锁定）。
        </Typography>

        {/* 物理网卡 Chip 多选 */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {nics.length === 0 ? (
            <Typography variant="caption" sx={{ opacity: 0.5 }}>
              未检测到在线物理网卡
            </Typography>
          ) : (
            nics.map((n) => {
              const on = selected.includes(n.index)
              return (
                <Chip
                  key={n.index}
                  size="small"
                  label={`${n.name} · ${n.index}`}
                  color={on ? 'error' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  disabled={busy || locked || verifying}
                  onClick={() => toggleNic(n.index)}
                  sx={{ transition: 'transform .12s ease', '&:not(:disabled):hover': { transform: 'scale(1.05)' } }}
                />
              )
            })
          )}
        </Box>

        {/* 紧急解除安全网 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Button
            size="small"
            variant="contained"
            color="error"
            disabled={!locked || busy}
            startIcon={<WarningAmberRounded />}
            onClick={onDisable}
            sx={{ whiteSpace: 'nowrap', transition: 'transform .12s ease', '&:not(:disabled):hover': { transform: 'translateY(-1px)' } }}
          >
            紧急解除
          </Button>
          <Typography variant="caption" sx={{ opacity: 0.55, display: 'flex', alignItems: 'center', gap: 0.4 }}>
            {locked ? <LockOutlined sx={{ fontSize: 14 }} /> : <LockOpenOutlined sx={{ fontSize: 14 }} />}
            断网时点它；关 app 也会自动解除
          </Typography>
        </Box>
      </Box>
    </EnhancedCard>
  )
}