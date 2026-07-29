import {
  LocationOnOutlined,
  RefreshOutlined,
  VisibilityOffOutlined,
  VisibilityOutlined,
  CheckCircleRounded,
  WarningAmberRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  Skeleton,
  Typography,
  alpha,
  useTheme,
} from '@mui/material'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useEffect } from 'foxact/use-abortable-effect'
import { useIntersection } from 'foxact/use-intersection'
import type { XOR } from 'foxts/ts-xor'
import {
  forwardRef,
  memo,
  useCallback,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
  type PropsWithChildren,
} from 'react'
import { useTranslation } from 'react-i18next'

import { getIpInfo } from '@/services/api'
import { useQuery } from '@/services/query-client'

import { EnhancedCard } from './enhanced-card'

const IP_REFRESH_SECONDS = 300
const COUNTDOWN_TICK_INTERVAL = 5_000
const IP_INFO_CACHE_KEY = 'cv_ip_info_cache'

// 统一字段行：label 右对齐定宽，value 自适应；hover 整行微亮浮起，让数据卡"能感"
const InfoItem = memo(
  ({
    label,
    value,
    fullText,
  }: {
    label: string
    value?: ReactNode
    fullText?: string
  }) => (
    <Box
      sx={(theme) => ({
        mb: 0.5,
        px: 1,
        py: 0.45,
        borderRadius: 1.25,
        display: 'flex',
        alignItems: 'flex-start',
        transition: 'background-color .18s ease, transform .15s ease',
        '&:hover': {
          backgroundColor: alpha(theme.palette.text.primary, 0.05),
          transform: 'translateX(2px)',
        },
      })}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 64, mr: 0.5, flexShrink: 0, textAlign: 'right' }}
      >
        {label}：
      </Typography>
      <Box
        title={fullText}
        sx={{
          ml: 0.5,
          minWidth: 0,
          flexGrow: 1,
          overflow: 'hidden',
        }}
      >
        <Typography
          variant="body2"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value === undefined || value === null || value === ''
            ? 'Unknown'
            : value}
        </Typography>
      </Box>
    </Box>
  ),
)
const getCountryFlag = (countryCode: string | undefined) => {
  if (!countryCode) return ''
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

type CountDownState = XOR<
  {
    type: 'countdown'
    remainingSeconds: number
  },
  {
    type: 'revalidating'
  }
>

// 自检结果：代理标记 + 时区一致性，随卡片挂载与刷新而更新
type SelfCheck = {
  loading: boolean
  proxy: boolean | null
  tzMatch: boolean | null
  exitTz: string | null
}

const IPInfoCardContainer = forwardRef<
  HTMLElement,
  PropsWithChildren<{ onRefresh?: () => void }>
>(({ children, onRefresh }, ref) => {
  const { refetch: mutate } = useIPInfo()

  return (
    <EnhancedCard
      title="隐私自检"
      icon={<LocationOnOutlined />}
      iconColor="info"
      ref={ref}
      action={
        <IconButton
          size="small"
          onClick={() => {
            mutate()
            onRefresh?.()
          }}
        >
          <RefreshOutlined />
        </IconButton>
      }
    >
      {children}
    </EnhancedCard>
  )
})

export const IpInfoCard = () => {
  const { t } = useTranslation()
  const theme = useTheme()
  const [showIp, setShowIp] = useState(false)
  const appWindow = useMemo(() => getCurrentWebviewWindow(), [])

  const [containerRef, hasIntersected, _resetIntersected] = useIntersection({
    rootMargin: '0px',
  })

  const [countdown, setCountdown] = useState<CountDownState>({
    type: 'countdown',
    remainingSeconds: IP_REFRESH_SECONDS,
  })

  const { data: ipInfo, error, isLoading, refetch: mutate } = useIPInfo()

  // 自检：代理标记 + 出口时区 vs 本机时区。挂载跑一次，刷新按钮一并触发。
  const [selfCheck, setSelfCheck] = useState<SelfCheck>({
    loading: false,
    proxy: null,
    tzMatch: null,
    exitTz: null,
  })
  const runSelfCheck = useCallback(async () => {
    setSelfCheck((s) => ({ ...s, loading: true }))
    try {
      const r = await fetch(
        'http://ip-api.com/json?fields=proxy,timezone',
      )
      const d = await r.json()
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const exitTz: string = d.timezone || ''
      const norm = (z: string) => z.replace(/_/g, ' ')
      const tail = localTz.split('/').pop() || '##'
      const tzMatch =
        norm(exitTz) === norm(localTz) || exitTz.endsWith(tail)
      setSelfCheck({
        loading: false,
        proxy: !!d.proxy,
        tzMatch,
        exitTz,
      })
    } catch {
      setSelfCheck((s) => ({ ...s, loading: false }))
    }
  }, [])
  useEffect(() => {
    void runSelfCheck()
  }, [runSelfCheck])

  const onCountdownTick = useEffectEvent(async () => {
    const now = Date.now()
    const ts = ipInfo?.lastFetchTs
    if (!ts) {
      return
    }

    const elapsed = Math.floor((now - ts) / 1000)
    const remaining = IP_REFRESH_SECONDS - elapsed

    if (remaining <= 0) {
      if (
        hasIntersected &&
        navigator.onLine &&
        countdown.type !== 'revalidating' &&
        (await appWindow.isVisible())
      ) {
        setCountdown({ type: 'revalidating' })
        try {
          await mutate()
        } finally {
          setCountdown({
            type: 'countdown',
            remainingSeconds: IP_REFRESH_SECONDS,
          })
        }
      }
    } else {
      setCountdown({
        type: 'countdown',
        remainingSeconds: remaining,
      })
    }
  })

  useEffect(() => {
    let timer: number | null = null

    if (hasIntersected) {
      timer = window.setInterval(onCountdownTick, COUNTDOWN_TICK_INTERVAL)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    function onVisibilityChange() {
      if (document.hidden) {
        if (timer != null) {
          clearInterval(timer)
          timer = null
        }
      } else if (hasIntersected) {
        if (timer == null) {
          timer = window.setInterval(
            onCountdownTick,
            COUNTDOWN_TICK_INTERVAL,
          )
        }
      }
    }

    return () => {
      if (timer != null) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [hasIntersected])

  const toggleShowIp = useCallback(() => {
    setShowIp((prev) => !prev)
  }, [])

  // 防护状态决定 ambient 与色带颜色：守住=绿，有风险=琥珀，加载中=中性
  const risk = selfCheck.proxy === true || selfCheck.tzMatch === false
  const guarded = selfCheck.proxy === false && selfCheck.tzMatch === true
  const accent = selfCheck.loading
    ? theme.palette.text.secondary
    : risk
      ? theme.palette.warning.main
      : guarded
        ? theme.palette.success.main
        : theme.palette.info.main

  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone

  let mainElement: React.ReactElement

  switch (true) {
    case isLoading:
      mainElement = (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Skeleton variant="text" width="60%" height={30} />
          <Skeleton variant="text" width="80%" height={24} />
          <Skeleton variant="text" width="70%" height={24} />
          <Skeleton variant="text" width="50%" height={24} />
        </Box>
      )
      break
    case !!error:
      mainElement = (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'error.main',
          }}
        >
          <Typography variant="body1" color="error">
            {error instanceof Error
              ? error.message
              : t('home.components.ipInfo.errors.load')}
          </Typography>
          <Button onClick={() => mutate()} sx={{ mt: 2 }}>
            {t('shared.actions.retry')}
          </Button>
        </Box>
      )
      break
    default:
        mainElement = (
          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 2,
              background: `radial-gradient(125% 85% at 100% 0%, ${alpha(accent, 0.12)}, transparent 62%)`,
              transition: 'background .5s ease',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
                transition: 'background .5s ease',
              }}
            />
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                overflow: 'hidden',
                pt: 0.5,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  mb: 1,
                  px: 1,
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontSize: '1.5rem',
                      mr: 1,
                      display: 'inline-block',
                      width: 28,
                      textAlign: 'center',
                      flexShrink: 0,
                      fontFamily: '"twemoji mozilla", sans-serif',
                    }}
                  >
                    {getCountryFlag(ipInfo?.country_code)}
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ipInfo?.country ||
                      t('home.components.ipInfo.labels.unknown')}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25,
                    flexShrink: 0,
                  }}
                >
                  <Typography

                    sx={{

                      fontSize: '0.8rem',

                      fontWeight: 600,

                      color: 'text.secondary',

                      mr: 0.5,

                      flexShrink: 0,

                    }}

                  >

                    IP：

                  </Typography>

                  <Typography

                    sx={{

                      fontFamily: 'monospace',

                      fontSize: '0.8rem',

                      fontWeight: 600,

                      color: 'text.secondary',

                    }}

                  >

                    {showIp ? ipInfo?.ip : '••••••••••'}

                  </Typography>
                  <IconButton size="small" onClick={toggleShowIp}>
                    {showIp ? (
                      <VisibilityOffOutlined fontSize="small" />
                    ) : (
                      <VisibilityOutlined fontSize="small" />
                    )}
                  </IconButton>
                </Box>
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 0.25,
                }}
              >
                <InfoItem
                  label={t('home.components.ipInfo.labels.asn')}
                  value={ipInfo?.asn ? `AS${ipInfo.asn}` : 'N/A'}
                />
                <InfoItem
                  label={t('home.components.ipInfo.labels.isp')}
                  value={ipInfo?.organization}
                  fullText={ipInfo?.organization}
                />
                <InfoItem
                  label="代理标记"
                  fullText={
                    selfCheck.proxy ? '是 ⚠ 出口已被标记为代理' : '否 ✅'
                  }
                  value={
                    selfCheck.loading ? (
                      <Skeleton
                        variant="text"
                        width={96}
                        height={16}
                        sx={{ display: 'inline-block', m: 0 }}
                      />
                    ) : (
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: selfCheck.proxy
                            ? theme.palette.error.main
                            : theme.palette.success.main,
                          transition: 'color .4s ease',
                        }}
                      >
                        {selfCheck.proxy
                          ? '是 ⚠ 出口已被标记为代理'
                          : '否 ✅'}
                      </Typography>
                    )
                  }
                />
                <InfoItem
                  label={t('home.components.ipInfo.labels.location')}
                  value={[ipInfo?.city, ipInfo?.region]
                    .filter(Boolean)
                    .join(', ')}
                  fullText={[ipInfo?.city, ipInfo?.region]
                    .filter(Boolean)
                    .join(', ')}
                />
              </Box>

              <Box
                sx={(theme) => ({
                  mt: 0.75,
                  mx: 0.5,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  background: selfCheck.loading
                    ? alpha(theme.palette.text.secondary, 0.06)
                    : selfCheck.tzMatch
                      ? alpha(theme.palette.success.main, 0.1)
                      : alpha(theme.palette.error.main, 0.1),
                  border: `1px solid ${
                    selfCheck.loading
                      ? theme.palette.divider
                      : selfCheck.tzMatch
                        ? alpha(theme.palette.success.main, 0.35)
                        : alpha(theme.palette.error.main, 0.4)
                  }`,
                  transition: 'all .35s ease',
                  '&:hover': {
                    borderColor: selfCheck.loading
                      ? theme.palette.divider
                      : selfCheck.tzMatch
                        ? alpha(theme.palette.success.main, 0.6)
                        : alpha(theme.palette.error.main, 0.7),
                  },
                })}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: 'text.secondary',
                    flexShrink: 0,
                  }}
                >
                  时区：
                </Typography>
                <Typography
                  variant="body2"
                  sx={(theme) => ({
                    fontWeight: 600,
                    wordBreak: 'break-word',
                    color: selfCheck.loading
                      ? theme.palette.text.secondary
                      : selfCheck.tzMatch
                        ? theme.palette.success.main
                        : theme.palette.error.main,
                    transition: 'color .4s ease',
                  })}
                >
                  {selfCheck.loading ? (
                    <Skeleton
                      variant="text"
                      width={140}
                      height={16}
                      sx={{ display: 'inline-block', m: 0 }}
                    />
                  ) : (
                    <>
                      {selfCheck.exitTz || '未知'} ｜ 本机 {localTz} ｜{' '}
                      {selfCheck.tzMatch
                        ? <><CheckCircleRounded sx={{ fontSize: '1.05rem', color: 'success.main', verticalAlign: 'text-bottom', mr: 0.4 }} />一致</>
                        : <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, flexWrap: 'wrap' }}><WarningAmberRounded sx={{ fontSize: '1.05rem', color: 'error.main' }} /><Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>不一致</Box><Box component="span" sx={{ opacity: 0.55, fontWeight: 400, fontSize: '0.72rem', ml: 0.3 }}>易被关联真实地区</Box></Box>}
                    </>
                  )}
                </Typography>
              </Box>
            </Box>

            <Box
              sx={{
                mt: 'auto',
                pt: 0.5,
                borderTop: 1,
                borderColor: 'divider',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: 0.7,
                fontSize: '0.7rem',
              }}
            >
              <Typography variant="caption">
                {t('home.components.ipInfo.labels.autoRefresh')}
                {countdown.type === 'countdown'
                  ? `: ${countdown.remainingSeconds}s`
                  : '...'}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${ipInfo?.country_code ?? 'N/A'}, ${ipInfo?.longitude?.toFixed(2) ?? 'N/A'}, ${ipInfo?.latitude?.toFixed(2) ?? 'N/A'}`}
              </Typography>
            </Box>
          </Box>
        )
  }

  return (
    <IPInfoCardContainer ref={containerRef} onRefresh={runSelfCheck}>
      {mainElement}
    </IPInfoCardContainer>
  )
}

function useIPInfo() {
  return useQuery({
    queryKey: [IP_INFO_CACHE_KEY],
    queryFn: getIpInfo,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 30_000,
  })
}
