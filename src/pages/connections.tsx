import {
  ArrowForwardRounded,
  CableRounded,
  DeleteForeverRounded,
  DownloadRounded,
  TableChartRounded,
  TableRowsRounded,
  UploadRounded,
  ViewColumnRounded,
} from '@mui/icons-material'
import {
  Box,
  Button,
  ButtonGroup,
  Fab,
  IconButton,
  MenuItem,
  Tooltip,
  Typography,
  Zoom,
  alpha,
} from '@mui/material'
import { useLockFn } from 'ahooks'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { closeAllConnections } from 'tauri-plugin-mihomo-api'

import {
  BaseEmpty,
  BasePage,
  BaseSearchBox,
  BaseStyledSelect,
  type SearchState,
  VirtualList,
} from '@/components/base'
import {
  ConnectionDetail,
  ConnectionDetailRef,
} from '@/components/connection/connection-detail'
import { ConnectionRowItem } from '@/components/connection/connection-row-item'
import {
  getConnectionStartTime,
  useConnectionRowViews,
} from '@/components/connection/connection-row-view'
import { ConnectionTable } from '@/components/connection/connection-table'
import { useConnectionData } from '@/hooks/use-connection-data'
import { useConnectionSetting } from '@/hooks/use-connection-setting'
import { useTrafficData } from '@/hooks/use-traffic-data'
import parseTraffic from '@/utils/parse-traffic'

type OrderFunc = (list: IConnectionsItem[]) => IConnectionsItem[]

const ORDER_OPTIONS = [
  {
    id: 'default',
    labelKey: 'connections.components.order.default',
    fn: (list: IConnectionsItem[]) =>
      list.sort(
        (a, b) => getConnectionStartTime(b) - getConnectionStartTime(a),
      ),
  },
  {
    id: 'uploadSpeed',
    labelKey: 'connections.components.order.uploadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curUpload ?? 0) - (a.curUpload ?? 0)),
  },
  {
    id: 'downloadSpeed',
    labelKey: 'connections.components.order.downloadSpeed',
    fn: (list: IConnectionsItem[]) =>
      list.sort((a, b) => (b.curDownload ?? 0) - (a.curDownload ?? 0)),
  },
] as const

type OrderKey = (typeof ORDER_OPTIONS)[number]['id']

const orderFunctionMap = ORDER_OPTIONS.reduce<Record<OrderKey, OrderFunc>>(
  (acc, option) => {
    acc[option.id] = option.fn
    return acc
  },
  {} as Record<OrderKey, OrderFunc>,
)

const EMPTY_CONNECTIONS: IConnectionsItem[] = []
const ConnectionsPage = () => {
  const { t } = useTranslation()
  const [match, setMatch] = useState<(input: string) => boolean>(
    () => () => true,
  )
  const [hasSearch, setHasSearch] = useState(false)
  const [curOrderOpt, setCurOrderOpt] = useState<OrderKey>('default')
  const [connectionsType, setConnectionsType] = useState<'active' | 'closed'>(
    'active',
  )

  const {
    response: { data: connections },
    clearClosedConnections,
  } = useConnectionData()
  const {
    response: { data: traffic },
  } = useTrafficData()

  const [setting, setSetting] = useConnectionSetting()

  const isTableLayout = setting.layout === 'table'

  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false)

  const selectedConnections =
    connectionsType === 'active'
      ? (connections?.activeConnections ?? EMPTY_CONNECTIONS)
      : (connections?.closedConnections ?? EMPTY_CONNECTIONS)

  const filterConn = useMemo(() => {
    const orderFunc = orderFunctionMap[curOrderOpt]

    if (isTableLayout && !hasSearch) return selectedConnections
    if (!hasSearch) return orderFunc([...selectedConnections])

    const matchConns = selectedConnections.filter((conn) => {
      const { host, destinationIP, process } = conn.metadata
      return (
        match(host || '') || match(destinationIP || '') || match(process || '')
      )
    })

    return orderFunc ? orderFunc(matchConns) : matchConns
  }, [selectedConnections, isTableLayout, hasSearch, match, curOrderOpt])

  const displayRows = useConnectionRowViews(
    isTableLayout ? EMPTY_CONNECTIONS : filterConn,
  )

  const detailRef = useRef<ConnectionDetailRef>(null!)

  const selectConnectionsType = useCallback(
    (type: 'active' | 'closed') => {
      if (type === connectionsType) return
      detailRef.current?.close()
      setIsColumnManagerOpen(false)
      setConnectionsType(type)
    },
    [connectionsType],
  )

  const showDetailById = useCallback(
    (id: string) => {
      const connection = filterConn.find((item) => item.id === id)
      if (connection) {
        detailRef.current?.open(connection, connectionsType === 'closed')
      }
    },
    [connectionsType, filterConn],
  )

  const onCloseAll = useLockFn(closeAllConnections)

  const handleSearch = useCallback(
    (match: (content: string) => boolean, state: SearchState) => {
      setMatch(() => match)
      setHasSearch(state.text.length > 0)
    },
    [],
  )
  const hasTableData = filterConn.length > 0

  return (
    <BasePage
      full
      title={
        <span style={{ whiteSpace: 'nowrap' }}>
          {t('connections.page.title')}
        </span>
      }
      contentStyle={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '8px',
        minHeight: 0,
      }}
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={(theme) => { const on = (traffic?.downTotal || 0) > 0; return { display: 'inline-flex', alignItems: 'center', gap: 0.75, mx: 0.5, px: 1.25, py: 0.5, borderRadius: 2, border: `1px solid ${alpha(on ? theme.palette.success.main : theme.palette.divider, on ? 0.45 : 1)}`, background: alpha(on ? theme.palette.success.main : theme.palette.text.secondary, on ? 0.1 : 0.04), transition: 'all .3s ease', cursor: 'default', '&:hover': { transform: 'translateY(-1px)' } }; }}>
  <DownloadRounded sx={(theme) => { const on = (traffic?.downTotal || 0) > 0; return { fontSize: 16, color: on ? theme.palette.success.main : alpha(theme.palette.text.secondary, 0.6), transition: 'color .3s ease' } }} />
  <Typography variant="caption" sx={(theme) => ({ color: alpha(theme.palette.text.secondary, 0.7) })}>{t('shared.labels.downloaded')}</Typography>
  <Typography sx={(theme) => { const on = (traffic?.downTotal || 0) > 0; return { fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: on ? theme.palette.success.main : theme.palette.text.primary, transition: 'color .3s ease' } }}>{parseTraffic(traffic?.downTotal || 0)}</Typography>
</Box>
<Box sx={(theme) => { const on = (traffic?.upTotal || 0) > 0; return { display: 'inline-flex', alignItems: 'center', gap: 0.75, mx: 0.5, px: 1.25, py: 0.5, borderRadius: 2, border: `1px solid ${alpha(on ? theme.palette.primary.main : theme.palette.divider, on ? 0.45 : 1)}`, background: alpha(on ? theme.palette.primary.main : theme.palette.text.secondary, on ? 0.1 : 0.04), transition: 'all .3s ease', cursor: 'default', '&:hover': { transform: 'translateY(-1px)' } }; }}>
  <UploadRounded sx={(theme) => { const on = (traffic?.upTotal || 0) > 0; return { fontSize: 16, color: on ? theme.palette.primary.main : alpha(theme.palette.text.secondary, 0.6), transition: 'color .3s ease' } }} />
  <Typography variant="caption" sx={(theme) => ({ color: alpha(theme.palette.text.secondary, 0.7) })}>{t('shared.labels.uploaded')}</Typography>
  <Typography sx={(theme) => { const on = (traffic?.upTotal || 0) > 0; return { fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: on ? theme.palette.primary.main : theme.palette.text.primary, transition: 'color .3s ease' } }}>{parseTraffic(traffic?.upTotal || 0)}</Typography>
</Box>
          <IconButton
            color="inherit"
            size="small"
            onClick={() =>
              setSetting((o) =>
                o?.layout !== 'table'
                  ? { ...o, layout: 'table' }
                  : { ...o, layout: 'list' },
              )
            }
          >
            {isTableLayout ? (
              <TableRowsRounded titleAccess={t('shared.actions.listView')} />
            ) : (
              <TableChartRounded titleAccess={t('shared.actions.tableView')} />
            )}
          </IconButton>
          <Button size="small" variant="contained" onClick={onCloseAll}>
            <span style={{ whiteSpace: 'nowrap' }}>
              {t('shared.actions.closeAll')}
            </span>
          </Button>
        </Box>
      }
    >
      <Box
        sx={{
          pt: 1,
          mb: 0.5,
          mx: '10px',
          minHeight: '36px',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          userSelect: 'text',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        <ButtonGroup sx={{ mr: 1, flexBasis: 'content' }}>
          <Button
            size="small"
            variant={connectionsType === 'active' ? 'contained' : 'outlined'}
            onClick={() => selectConnectionsType('active')}
          >
            {t('connections.components.actions.active')}{' '}
            {connections?.activeConnections.length}
          </Button>
          <Button
            size="small"
            variant={connectionsType === 'closed' ? 'contained' : 'outlined'}
            onClick={() => selectConnectionsType('closed')}
          >
            {t('connections.components.actions.closed')}{' '}
            {connections?.closedConnections.length}
          </Button>
        </ButtonGroup>
        {!isTableLayout && (
          <BaseStyledSelect
            value={curOrderOpt}
            onChange={(e) => setCurOrderOpt(e.target.value as OrderKey)}
          >
            {ORDER_OPTIONS.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <span style={{ fontSize: 14 }}>{t(option.labelKey)}</span>
              </MenuItem>
            ))}
          </BaseStyledSelect>
        )}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            '& > *': {
              flex: 1,
            },
          }}
        >
          <BaseSearchBox onSearch={handleSearch} />
        </Box>
        {isTableLayout && hasTableData && (
          <Tooltip title={t('connections.components.columnManager.title')}>
            <IconButton
              size="small"
              aria-label={t('connections.components.columnManager.title')}
              onClick={() => setIsColumnManagerOpen(true)}
              sx={{ flex: '0 0 auto' }}
            >
              <ViewColumnRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!hasTableData ? (
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2.5, py: 8, px: 2, overflow: 'hidden' }}>
  <Box sx={(theme) => ({ position: 'absolute', inset: 0, background: `radial-gradient(62% 50% at 50% 36%, ${alpha(theme.palette.primary.main, 0.12)}, transparent 72%)`, pointerEvents: 'none' })} />
  <Box sx={(theme) => ({ position: 'relative', width: 92, height: 92, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: alpha(theme.palette.primary.main, 0.08), border: `1px solid ${alpha(theme.palette.primary.main, 0.28)}`, boxShadow: `0 0 0 10px ${alpha(theme.palette.primary.main, 0.04)}`, color: theme.palette.primary.main, '@keyframes connPulse': { '0%, 100%': { transform: 'scale(1)', opacity: 1 }, '50%': { transform: 'scale(1.05)', opacity: 0.8 } }, animation: 'connPulse 2.6s ease-in-out infinite', transition: 'transform .2s ease', '&:hover': { transform: 'scale(1.07)' } })}>
    <CableRounded sx={{ fontSize: 42 }} />
  </Box>
  <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
    <Typography sx={(theme) => ({ fontSize: '1.45rem', fontWeight: 800, letterSpacing: -0.5, color: theme.palette.text.primary })}>当前没有活动连接</Typography>
    <Typography variant="body2" sx={(theme) => ({ maxWidth: 400, lineHeight: 1.85, color: alpha(theme.palette.text.secondary, 0.85) })}>开启系统代理或虚拟网卡后，这里会实时列出每条连接的去向、延迟与流量，帮你看清流量究竟去了哪里。</Typography>
  </Box>
  <Button component={Link} to="/" variant="contained" color="primary" size="small" endIcon={<ArrowForwardRounded />} sx={(theme) => ({ position: 'relative', zIndex: 1, mt: 0.5, borderRadius: 2, px: 2.5, fontWeight: 700, transition: 'transform .15s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-1px)', boxShadow: `0 6px 18px ${alpha(theme.palette.primary.main, 0.4)}` }, '& .MuiButton-endIcon': { transition: 'transform .2s ease' }, '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' } })}>去防护态势开启代理</Button>
</Box>
      ) : isTableLayout ? (
        <ConnectionTable
          connections={filterConn}
          onShowDetail={showDetailById}
          columnManagerOpen={isColumnManagerOpen}
          onCloseColumnManager={() => setIsColumnManagerOpen(false)}
        />
      ) : (
        <VirtualList
          key={connectionsType}
          count={displayRows.length}
          estimateSize={56}
          renderItem={(i) => (
            <ConnectionRowItem
              row={displayRows[i]}
              closed={connectionsType === 'closed'}
              onShowDetail={showDetailById}
            />
          )}
          style={{
            flex: 1,
            borderRadius: '8px',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        />
      )}
      <ConnectionDetail ref={detailRef} />
      <Zoom
        in={connectionsType === 'closed' && filterConn.length > 0}
        unmountOnExit
      >
        <Fab
          size="medium"
          variant="extended"
          sx={{
            position: 'absolute',
            right: 16,
            bottom: isTableLayout ? 70 : 16,
          }}
          color="primary"
          onClick={() => clearClosedConnections()}
        >
          <DeleteForeverRounded sx={{ mr: 1 }} fontSize="small" />
          {t('shared.actions.clear')}
        </Fab>
      </Zoom>
    </BasePage>
  )
}

export default ConnectionsPage
