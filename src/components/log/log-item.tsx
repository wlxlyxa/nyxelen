import { alpha, Box, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

import type { SearchState } from '@/components/base'

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

interface Props {
  value: ILogItem
  searchState?: SearchState
}

const levelColor = (theme: any, type: string): string => {
  const p = theme.palette
  const t = (type || '').toLowerCase()
  if (t === 'err' || t === 'error') return p.error.main
  if (t === 'warn' || t === 'warning') return p.warning.main
  if (t === 'info' || t === 'inf') return p.info.main
  return p.text.secondary
}

const LogItem = ({ value, searchState }: Props) => {
  const theme = useTheme()
  const c = levelColor(theme, value.type)

  const renderHighlightText = (text: string) => {
    if (!searchState?.text.trim()) return text

    try {
      const searchText = searchState.text
      let pattern: string

      if (searchState.useRegularExpression) {
        try {
          new RegExp(searchText)
          pattern = searchText
        } catch {
          pattern = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
      } else {
        const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        pattern = searchState.matchWholeWord ? `\\b${escaped}\\b` : escaped
      }

      const flags = searchState.matchCase ? 'g' : 'gi'
      const regex = new RegExp(pattern, flags)
      const elements: ReactNode[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        const start = match.index
        const matchText = match[0]

        if (matchText === '') {
          regex.lastIndex += 1
          continue
        }

        if (start > lastIndex) {
          elements.push(text.slice(lastIndex, start))
        }

        elements.push(
          <span key={`highlight-${start}`} className="highlight">
            {matchText}
          </span>,
        )

        lastIndex = start + matchText.length
      }

      if (lastIndex < text.length) {
        elements.push(text.slice(lastIndex))
      }

      return elements.length ? elements : text
    } catch {
      return text
    }
  }

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        margin: '0 12px',
        padding: '7px 12px 7px 11px',
        lineHeight: 1.4,
        borderBottom: `1px solid ${theme.palette.divider}`,
        background: alpha(c, 0.03),
        boxShadow: `inset 3px 0 0 0 ${alpha(c, 0.75)}`,
        transition: 'background-color .18s ease, box-shadow .18s ease',
        cursor: 'default',
        '&:hover': {
          background: alpha(c, 0.09),
          boxShadow: `inset 4px 0 0 0 ${c}`,
        },
        '& .highlight': {
          backgroundColor: theme.palette.mode === 'dark' ? '#ffeb3b40' : '#ffeb3b90',
          borderRadius: '2px',
          padding: '0 2px',
        },
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.4 }}>
        <Box sx={(theme) => ({ fontFamily: MONO, fontSize: 11, color: alpha(theme.palette.text.secondary, 0.6), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' })}>
          {renderHighlightText(value.time || '')}
        </Box>
        <Box sx={(theme) => ({ flexShrink: 0, px: 0.8, py: 0.25, borderRadius: 1, background: alpha(c, 0.14), border: `1px solid ${alpha(c, 0.4)}`, color: c, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.4 })}>
          {renderHighlightText(value.type)}
        </Box>
      </Box>
      <Box sx={(theme) => ({ fontFamily: MONO, fontSize: 12.5, color: theme.palette.text.primary, overflowWrap: 'anywhere', userSelect: 'text' })}>
        {renderHighlightText(value.payload)}
      </Box>
    </Box>
  )
}

export default LogItem
