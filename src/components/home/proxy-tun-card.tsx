import {
  ComputerRounded,
  TroubleshootRounded,
  LinkOffRounded,
  HelpOutlineRounded,
  SvgIconComponent,
} from '@mui/icons-material'
import {
  Box,
  Typography,
  Stack,
  Paper,
  Tooltip,
  alpha,
  useTheme,
  Fade,
  Collapse,
  Button,
} from '@mui/material'
import { useState, useMemo, useEffect, useRef, memo, FC } from 'react'
import { useTranslation } from 'react-i18next'

import ProxyControlSwitches from '@/components/shared/proxy-control-switches'
import { useSystemProxyState } from '@/hooks/use-system-proxy-state'
import { useSystemState } from '@/hooks/use-system-state'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { invoke } from '@tauri-apps/api/core'

const LOCAL_STORAGE_TAB_KEY = 'clash-verge-proxy-active-tab'

interface TabButtonProps {
  isActive: boolean
  onClick: () => void
  icon: SvgIconComponent
  label: string
  hasIndicator?: boolean
}

// Tab组件
const TabButton: FC<TabButtonProps> = memo(
  ({ isActive, onClick, icon: Icon, label, hasIndicator = false }) => (
    <Paper
      elevation={isActive ? 2 : 0}
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        bgcolor: isActive ? 'primary.main' : 'background.paper',
        color: isActive ? 'primary.contrastText' : 'text.primary',
        borderRadius: 1.5,
        flex: 1,
        maxWidth: 160,
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: 1,
        },
        '&:after': isActive
          ? {
              content: '""',
              position: 'absolute',
              bottom: -9,
              left: '50%',
              width: 2,
              height: 9,
              bgcolor: 'primary.main',
              transform: 'translateX(-50%)',
            }
          : {},
      }}
    >
      <Icon fontSize="small" />
      <Typography variant="body2" sx={{ fontWeight: isActive ? 600 : 400 }}>
        {label}
      </Typography>
      {hasIndicator && (
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: isActive ? '#fff' : 'success.main',
            position: 'absolute',
            top: 8,
            right: 8,
          }}
        />
      )}
    </Paper>
  ),
)

interface TabDescriptionProps {
  description: string
  tooltipTitle: string
}

// 描述文本组件
const TabDescription: FC<TabDescriptionProps> = memo(
  ({ description, tooltipTitle }) => (
    <Fade in={true} timeout={200}>
      <Typography
        variant="caption"
        component="div"
        sx={{
          width: '95%',
          textAlign: 'center',
          color: 'text.secondary',
          p: 0.8,
          borderRadius: 1,
          borderColor: 'primary.main',
          borderWidth: 1,
          borderStyle: 'solid',
          backgroundColor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          wordBreak: 'break-word',
          hyphens: 'auto',
        }}
      >
        {description}
        <Tooltip title={tooltipTitle}>
          <HelpOutlineRounded
            sx={{ fontSize: 14, opacity: 0.7, flexShrink: 0 }}
          />
        </Tooltip>
      </Typography>
    </Fade>
  ),
)

export const ProxyTunCard: FC = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem(LOCAL_STORAGE_TAB_KEY) || 'system',
  )

  const { verge } = useVerge()
  const { isTunModeAvailable } = useSystemState()
  const { configState: systemProxyConfigState } = useSystemProxyState()

  const { enable_tun_mode } = verge ?? {}

  // ===== 层3：TUN 关闭后 Meta 残留检测 + 强制释放 =====
  const [residual, setResidual] = useState<boolean | null>(null)
  const [releasing, setReleasing] = useState(false)
  const [releaseResult, setReleaseResult] = useState<'ok' | 'fail' | null>(null)
  const prevTunRef = useRef<boolean | undefined>(enable_tun_mode)

  // 监听 TUN 开关：从开→关的那一刻，延迟 5 秒查一次 Meta 是否残留。
  // 等 5 秒是让后端 toggle_tun_mode 的自动兜底（等 Meta 消失 + 超时强制禁用）先跑完——
  // 后端擦干净了就不打扰用户；擦不干净（残留）才亮提示，把强制释放交给用户。
  useEffect(() => {
    const wasOn = prevTunRef.current
    prevTunRef.current = enable_tun_mode
    if (wasOn && !enable_tun_mode) {
      let cancelled = false
      const timer = setTimeout(async () => {
        try {
          const present = await invoke<boolean>('check_tun_adapter_present_cmd')
          if (!cancelled) {
            setResidual(present)
            setReleaseResult(null)
          }
        } catch {
          // 查询失败就当没残留，不打扰用户
        }
      }, 5000)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }
    if (enable_tun_mode) {
      // 又开回 TUN：残留语义不成立，隐去提示
      setResidual(null)
      setReleaseResult(null)
    }
  }, [enable_tun_mode])

  const forceRelease = async () => {
    setReleasing(true)
    setReleaseResult(null)
    try {
      await invoke('force_release_tun_adapter_cmd')
      const stillPresent = await invoke<boolean>('check_tun_adapter_present_cmd')
      if (!stillPresent) {
        setReleaseResult('ok')
        setTimeout(() => setResidual(false), 1400)
      } else {
        setReleaseResult('fail')
      }
    } catch {
      setReleaseResult('fail')
    } finally {
      setReleasing(false)
    }
  }

  const showResidual = residual === true && !enable_tun_mode

  const handleError = (err: unknown) => {
    showNotice.error(err)
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    localStorage.setItem(LOCAL_STORAGE_TAB_KEY, tab)
  }

  const tabDescription = useMemo(() => {
    if (activeTab === 'system') {
      return {
        text: systemProxyConfigState
          ? t('home.components.proxyTun.status.systemProxyEnabled')
          : t('home.components.proxyTun.status.systemProxyDisabled'),
        tooltip: t('home.components.proxyTun.tooltips.systemProxy'),
      }
    } else {
      return {
        text: !isTunModeAvailable
          ? t('home.components.proxyTun.status.tunModeServiceRequired')
          : enable_tun_mode
            ? t('home.components.proxyTun.status.tunModeEnabled')
            : t('home.components.proxyTun.status.tunModeDisabled'),
        tooltip: t('home.components.proxyTun.tooltips.tunMode'),
      }
    }
  }, [
    activeTab,
    systemProxyConfigState,
    enable_tun_mode,
    isTunModeAvailable,
    t,
  ])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <TabButton
          isActive={activeTab === 'system'}
          onClick={() => handleTabChange('system')}
          icon={ComputerRounded}
          label={t('settings.sections.system.toggles.systemProxy')}
          hasIndicator={systemProxyConfigState}
        />
        <TabButton
          isActive={activeTab === 'tun'}
          onClick={() => handleTabChange('tun')}
          icon={TroubleshootRounded}
          label={t('settings.sections.system.toggles.tunMode')}
          hasIndicator={enable_tun_mode && isTunModeAvailable}
        />
      </Stack>

      <Box
        sx={{
          width: '100%',
          my: 1,
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        <TabDescription
          description={tabDescription.text}
          tooltipTitle={tabDescription.tooltip}
        />
      </Box>

      <Box
        sx={{
          mt: 0,
          p: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderRadius: 2,
        }}
      >
        <ProxyControlSwitches
          onError={handleError}
          label={
            activeTab === 'system'
              ? t('settings.sections.system.toggles.systemProxy')
              : t('settings.sections.system.toggles.tunMode')
          }
          noRightPadding={true}
        />
      </Box>
      <Collapse in={showResidual} timeout={280} unmountOnExit>
        <Box
          sx={{
            mt: 1,
            px: 1.5,
            py: 1,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.2,
            position: 'relative',
            overflow: 'hidden',
            border: '1px solid',
            borderColor:
              releaseResult === 'fail'
                ? alpha(theme.palette.error.main, 0.5)
                : releaseResult === 'ok'
                  ? alpha(theme.palette.success.main, 0.5)
                  : alpha(theme.palette.warning.main, 0.5),
            bgcolor:
              releaseResult === 'ok'
                ? alpha(theme.palette.success.main, 0.1)
                : alpha(theme.palette.warning.main, 0.08),
            transition: 'background-color 0.4s ease, border-color 0.4s ease',
            backgroundImage:
              releaseResult === 'ok'
                ? 'none'
                : `linear-gradient(115deg, transparent 0%, ${alpha(theme.palette.warning.main, 0.06)} 45%, transparent 90%)`,
            backgroundSize: '220% 100%',
            ...(releaseResult !== 'ok' &&
              releaseResult !== 'fail' && {
                '@keyframes nyxResidualDrift': {
                  '0%': { backgroundPosition: '120% 0' },
                  '100%': { backgroundPosition: '-20% 0' },
                },
                animation: 'nyxResidualDrift 4.5s linear infinite',
              }),
            ...(releaseResult === 'fail' && {
              '@keyframes nyxResidualShake': {
                '0%,100%': { transform: 'translateX(0)' },
                '20%': { transform: 'translateX(-4px)' },
                '40%': { transform: 'translateX(4px)' },
                '60%': { transform: 'translateX(-3px)' },
                '80%': { transform: 'translateX(3px)' },
              },
              animation: 'nyxResidualShake 0.4s ease-in-out',
            }),
          }}
        >
          {releaseResult !== 'ok' && (
            <Box
              sx={{
                position: 'relative',
                width: 10,
                height: 10,
                flexShrink: 0,
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  bgcolor: releaseResult === 'fail' ? 'error.main' : 'warning.main',
                },
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '1px solid',
                  borderColor: releaseResult === 'fail' ? 'error.main' : 'warning.main',
                  '@keyframes nyxResidualRipple': {
                    '0%': { transform: 'scale(1)', opacity: 0.7 },
                    '100%': { transform: 'scale(2.6)', opacity: 0 },
                  },
                  animation: 'nyxResidualRipple 1.6s ease-out infinite',
                },
              }}
            />
          )}
          {releaseResult === 'ok' && (
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0 }} />
          )}
          <Typography variant="caption" sx={{ flex: 1, color: 'text.primary', lineHeight: 1.5 }}>
            {releaseResult === 'ok'
              ? '已释放 · 虚拟网卡已干净，流量不再被它接管'
              : releaseResult === 'fail'
                ? '释放失败 · 禁用虚拟网卡需要管理员权限，请以管理员身份运行 Nyxelen 后重试'
                : '虚拟网卡残留 · 它可能仍在接管流量，点右侧强制释放'}
          </Typography>
          {releaseResult !== 'ok' && (
            <Button
              size="small"
              variant="outlined"
              color={releaseResult === 'fail' ? 'error' : 'warning'}
              startIcon={<LinkOffRounded />}
              disabled={releasing}
              onClick={forceRelease}
              sx={{
                flexShrink: 0,
                fontSize: 11,
                py: 0.2,
                transition: 'all 0.18s ease',
                '&:hover': { transform: 'translateY(-1px)', boxShadow: 2 },
                '&:active': { transform: 'translateY(0)', boxShadow: 0 },
              }}
            >
              {releasing ? '释放中…' : '强制释放'}
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}
