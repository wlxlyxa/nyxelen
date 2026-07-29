import { alpha, Box, Typography, useTheme } from '@mui/material'
import { Rule } from 'tauri-plugin-mihomo-api'

interface Props {
  value: Rule & { lineNo: number }
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

// 规则类型 → 语义色（hex）。前缀匹配，覆盖带参数后缀的类型。
const typeColor = (theme: any, type: string): string => {
  const p = theme.palette
  const t = (type || '').toUpperCase()
  if (t === 'REJECT' || t === 'REJECT-DROP') return p.error.main
  if (t.startsWith('DOMAIN') || t.startsWith('GEOSITE') || t === 'SUB-RULE') return p.primary.main
  if (t.startsWith('IP-') || t.startsWith('GEOIP') || t.startsWith('SRC-')) return p.success.main
  if (t.startsWith('PROCESS') || t.startsWith('SRC-PORT') || t.startsWith('DST-PORT')) return p.warning.main
  if (t === 'MATCH' || t === 'DIRECT') return p.text.secondary
  return p.info.main
}

// 动作目标 → 语义色（hex）。顺手修了原 parseColor 返回 'x.main' 导致 proxy 不着色的隐性 bug。
const proxyColor = (theme: any, text: string): string => {
  const p = theme.palette
  if (text === 'REJECT' || text === 'REJECT-DROP') return p.error.main
  if (text === 'DIRECT') return p.success.main
  const palette = [p.primary.main, p.secondary.main, p.info.main, p.warning.main, p.success.main]
  let sum = 0
  for (let i = 0; i < text.length; i++) sum += text.charCodeAt(i)
  return palette[sum % palette.length]
}

const RuleItem = (props: Props) => {
  const { value } = props
  const theme = useTheme()
  const c = typeColor(theme, value.type)
  const pc = proxyColor(theme, value.proxy)

  return (
    <Box
      title={value.payload || ''}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        padding: '7px 16px 7px 15px',
        borderBottom: '1px solid var(--divider-color)',
        background: alpha(c, 0.035),
        boxShadow: `inset 3px 0 0 0 ${alpha(c, 0.8)}`,
        transition: 'background-color .18s ease, box-shadow .18s ease',
        cursor: 'default',
        '&:hover': {
          background: alpha(c, 0.1),
          boxShadow: `inset 4px 0 0 0 ${c}`,
        },
      }}
    >
      <Typography
        sx={{
          fontFamily: MONO,
          fontSize: 11,
          fontWeight: 600,
          color: alpha(theme.palette.text.secondary, 0.45),
          minWidth: 26,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}
      >
        {value.lineNo}
      </Typography>

      <Box
        sx={{
          flexShrink: 0,
          px: 0.85,
          py: 0.3,
          borderRadius: 1,
          background: alpha(c, 0.13),
          border: `1px solid ${alpha(c, 0.4)}`,
          color: c,
          fontFamily: MONO,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}
      >
        {value.type}
      </Box>

      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontFamily: MONO,
          fontSize: 13,
          fontWeight: 600,
          color: 'text.primary',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          userSelect: 'text',
        }}
      >
        {value.payload || '-'}
      </Typography>

      <Typography
        sx={{
          flexShrink: 0,
          pl: 2,
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: 700,
          color: pc,
          whiteSpace: 'nowrap',
        }}
      >
        {value.proxy}
      </Typography>
    </Box>
  )
}

export default RuleItem
