import {
  ArrowForwardRounded,
  PauseCircleOutlineRounded,
  PlayCircleOutlineRounded,
  SubjectRounded,
  SwapVertRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Typography,
  alpha,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
  type VirtualListHandle,
} from '@/components/base'
import LogItem from '@/components/log/log-item'
import { useClashLog } from '@/hooks/use-clash-log'
import { useLogData } from '@/hooks/use-log-data'

const LogPage = () => {
  const { t } = useTranslation()
  const [clashLog, setClashLog] = useClashLog()
  const enableLog = clashLog.enable
  const logState = clashLog.logFilter
  const logOrder = clashLog.logOrder ?? 'asc'
  const isDescending = logOrder === 'desc'

  const [match, setMatch] = useState(() => (_: string) => true)
  const [searchState, setSearchState] = useState<SearchState>()
  const {
    response: { data: logData },
    refreshGetClashLog,
  } = useLogData()

  const filterLogs = useMemo(() => {
    if (!logData || logData.length === 0) {
      return []
    }

    // Server-side filtering handles level filtering via query parameters
    // We only need to apply search filtering here
    return logData.filter((data) => {
      // 构建完整的搜索文本，包含时间、类型和内容
      const searchText =
        `${data.time || ''} ${data.type} ${data.payload}`.toLowerCase()

      const matchesSearch = match(searchText)

      return (
        (logState == 'all' ? true : data.type.includes(logState)) &&
        matchesSearch
      )
    })
  }, [logData, logState, match])

  const filteredLogs = useMemo(
    () => (isDescending ? [...filterLogs].reverse() : filterLogs),
    [filterLogs, isDescending],
  )

  const scrollRef = useRef({ isNearBottom: true })
  const virtuosoRef = useRef<VirtualListHandle>(null)

  useEffect(() => {
    if (!isDescending && scrollRef.current.isNearBottom) {
      virtuosoRef.current?.scrollToIndex(filteredLogs.length - 1, {
        behavior: 'smooth',
      })
    }
  }, [isDescending, filteredLogs.length])

  const handleLogLevelChange = (newLevel: LogFilter) => {
    setClashLog((pre) => ({ ...pre!, logFilter: newLevel }))
  }

  const handleToggleLog = async () => {
    setClashLog((pre) => ({ ...pre!, enable: !enableLog }))
  }

  const handleToggleOrder = () => {
    setClashLog((pre) => ({
      ...pre!,
      logOrder: pre!.logOrder === 'desc' ? 'asc' : 'desc',
    }))
  }

  const levelCounts = useMemo(() => {
    const c = { err: 0, warn: 0, info: 0 }
    for (const item of filteredLogs) {
      const lt = (item.type || '').toLowerCase()
      if (lt === 'err' || lt === 'error') c.err += 1
      else if (lt === 'warn' || lt === 'warning') c.warn += 1
      else if (lt === 'info' || lt === 'inf') c.info += 1
    }
    return c
  }, [filteredLogs])

  return (
    <BasePage
      full
      title={t('logs.page.title')}
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            title={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
            aria-label={t(
              enableLog ? 'shared.actions.pause' : 'shared.actions.resume',
            )}
            size="small"
            color="inherit"
            onClick={handleToggleLog}
          >
            {enableLog ? (
              <PauseCircleOutlineRounded />
            ) : (
              <PlayCircleOutlineRounded />
            )}
          </IconButton>
          <IconButton
            title={t(
              isDescending
                ? 'logs.actions.showAscending'
                : 'logs.actions.showDescending',
            )}
            aria-label={t(
              isDescending
                ? 'logs.actions.showAscending'
                : 'logs.actions.showDescending',
            )}
            size="small"
            color="inherit"
            onClick={handleToggleOrder}
          >
            <SwapVertRounded
              sx={{
                transform: isDescending ? 'scaleY(-1)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            />
          </IconButton>

          <Button
            size="small"
            variant="contained"
            onClick={() => {
              refreshGetClashLog(true)
            }}
          >
            {t('shared.actions.clear')}
          </Button>
          <Box sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 1.25 }}>
            {levelCounts.err > 0 && (
              <Box sx={(theme) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.3, borderRadius: 1.5, background: alpha(theme.palette.error.main, 0.12), border: `1px solid ${alpha(theme.palette.error.main, 0.35)}`, transition: 'all .2s ease' })}>
                <Box sx={(theme) => ({ width: 6, height: 6, borderRadius: '50%', background: theme.palette.error.main })} />
                <Typography sx={(theme) => ({ fontSize: 11.5, fontWeight: 700, color: theme.palette.error.main, fontVariantNumeric: 'tabular-nums' })}>{levelCounts.err}</Typography>
              </Box>
            )}
            {levelCounts.warn > 0 && (
              <Box sx={(theme) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.3, borderRadius: 1.5, background: alpha(theme.palette.warning.main, 0.12), border: `1px solid ${alpha(theme.palette.warning.main, 0.35)}`, transition: 'all .2s ease' })}>
                <Box sx={(theme) => ({ width: 6, height: 6, borderRadius: '50%', background: theme.palette.warning.main })} />
                <Typography sx={(theme) => ({ fontSize: 11.5, fontWeight: 700, color: theme.palette.warning.main, fontVariantNumeric: 'tabular-nums' })}>{levelCounts.warn}</Typography>
              </Box>
            )}
            {levelCounts.info > 0 && (
              <Box sx={(theme) => ({ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.9, py: 0.3, borderRadius: 1.5, background: alpha(theme.palette.info.main, 0.1), border: `1px solid ${alpha(theme.palette.info.main, 0.3)}`, transition: 'all .2s ease' })}>
                <Box sx={(theme) => ({ width: 6, height: 6, borderRadius: '50%', background: theme.palette.info.main })} />
                <Typography sx={(theme) => ({ fontSize: 11.5, fontWeight: 700, color: theme.palette.info.main, fontVariantNumeric: 'tabular-nums' })}>{levelCounts.info}</Typography>
              </Box>
            )}
          </Box>
        </Box>
      }
    >
      <Box
        sx={{
          pt: 1,
          mb: 0.5,
          mx: '10px',
          height: '39px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <BaseStyledSelect
          value={logState}
          onChange={(e) => handleLogLevelChange(e.target.value as LogFilter)}
        >
          <MenuItem value="all">{t('shared.filters.logLevels.all')}</MenuItem>
          <MenuItem value="debug">
            {t('shared.filters.logLevels.debug')}
          </MenuItem>
          <MenuItem value="info">{t('shared.filters.logLevels.info')}</MenuItem>
          <MenuItem value="warn">{t('shared.filters.logLevels.warn')}</MenuItem>
          <MenuItem value="err">{t('shared.filters.logLevels.error')}</MenuItem>
        </BaseStyledSelect>
        <BaseSearchBox
          onSearch={(matcher, state) => {
            setMatch(() => matcher)
            setSearchState(state)
          }}
        />
      </Box>

      {filteredLogs.length > 0 ? (
        <VirtualList
          ref={virtuosoRef}
          count={filteredLogs.length}
          estimateSize={50}
          renderItem={(i) => (
            <LogItem value={filteredLogs[i]} searchState={searchState} />
          )}
          onScroll={(event) => {
            const element = event.currentTarget as HTMLDivElement
            scrollRef.current.isNearBottom =
              element.scrollHeight - element.scrollTop - element.clientHeight <=
              20
          }}
          style={{ flex: 1 }}
        />
      ) : (
        <Box sx={(theme) => ({ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2.5, py: 8, px: 2, overflow: 'hidden' })}>
  <Box sx={(theme) => ({ position: 'absolute', inset: 0, background: `radial-gradient(62% 50% at 50% 36%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 72%)`, pointerEvents: 'none' })} />
  <Box sx={(theme) => ({ position: 'relative', width: 92, height: 92, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: alpha(theme.palette.primary.main, 0.08), border: `1px solid ${alpha(theme.palette.primary.main, 0.28)}`, boxShadow: `0 0 0 10px ${alpha(theme.palette.primary.main, 0.04)}`, color: theme.palette.primary.main, '@keyframes logsPulse': { '0%, 100%': { transform: 'scale(1)', opacity: 1 }, '50%': { transform: 'scale(1.05)', opacity: 0.8 } }, animation: 'logsPulse 2.6s ease-in-out infinite', transition: 'transform .2s ease', '&:hover': { transform: 'scale(1.07)' } })}>
    <SubjectRounded sx={{ fontSize: 42 }} />
  </Box>
  <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
    <Typography sx={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: -0.5, color: 'text.primary' }}>还没有日志</Typography>
    <Typography variant="body2" sx={(theme) => ({ maxWidth: 400, lineHeight: 1.85, color: alpha(theme.palette.text.secondary, 0.85) })}>开启代理后，日志会在这里实时滚动——每条请求的去向与状态都会在此留痕。</Typography>
  </Box>
  <Button component={Link} to="/" variant="contained" color="primary" size="small" endIcon={<ArrowForwardRounded />} sx={(theme) => ({ position: 'relative', zIndex: 1, mt: 0.5, borderRadius: 2, px: 2.5, fontWeight: 700, textTransform: 'none', transition: 'transform .15s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.4)}` }, '& .MuiButton-endIcon': { transition: 'transform .2s ease' }, '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' } })}>去开启代理</Button>
</Box>
      )}
    </BasePage>
  )
}

export default LogPage
