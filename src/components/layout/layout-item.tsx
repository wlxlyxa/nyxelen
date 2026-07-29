import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  Box,
  alpha,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { useCallback } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

import { useVerge } from '@/hooks/use-verge'

interface SortableProps {
  setNodeRef?: (element: HTMLElement | null) => void
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  style?: CSSProperties
  isDragging?: boolean
  disabled?: boolean
}

interface Props {
  to: string
  children: string
  icon: ReactNode[]
  sortable?: SortableProps
  onPreload?: () => Promise<unknown>
  badge?: string
}
export const LayoutItem = (props: Props) => {
  const { to, children, icon, sortable, onPreload, badge } = props
  const { verge } = useVerge()
  const { menu_icon } = verge ?? {}
  const navCollapsed = verge?.collapse_navbar ?? false
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()

  const effectiveMenuIcon =
    navCollapsed && menu_icon === 'disable' ? 'monochrome' : menu_icon

  const { setNodeRef, attributes, listeners, style, isDragging, disabled } =
    sortable ?? {}

  const draggable = Boolean(sortable) && !disabled
  const { onPointerDown, ...otherListeners } = draggable
    ? (listeners ?? {})
    : {}

  const handlePreload = useCallback(() => {
    void onPreload?.().catch(() => {})
  }, [onPreload])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      handlePreload()
      onPointerDown?.(event)
    },
    [handlePreload, onPointerDown],
  )

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={[
        { py: 0.5, maxWidth: 250, mx: 'auto', padding: '4px 0px' },
        isDragging ? { opacity: 0.78 } : {},
      ]}
    >
      <ListItemButton
        selected={!!match}
        {...(draggable ? (attributes ?? {}) : {})}
        {...(draggable ? otherListeners : {})}
        sx={[
          {
            borderRadius: 2,
            marginLeft: 1.25,
            paddingLeft: 1,
            paddingRight: 1,
            marginRight: 1.25,
            position: 'relative',
              cursor: draggable ? 'grab' : 'pointer',
            '&:active': draggable ? { cursor: 'grabbing' } : {},
              '&:hover .nav-badge': { filter: 'brightness(1.25)' },
            '& .MuiListItemText-primary': {
              color: 'text.primary',
              fontWeight: '700',
            },
          },
          ({ palette: { mode, primary } }) => {
            const bgcolor =
              mode === 'light'
                ? alpha(primary.main, 0.15)
                : alpha(primary.main, 0.35)
            const color = mode === 'light' ? '#1f1f1f' : '#ffffff'
            return {
              '&.Mui-selected': { bgcolor },
              '&.Mui-selected:hover': { bgcolor },
              '&.Mui-selected .MuiListItemText-primary': { color },
            }
          },
        ]}
        title={navCollapsed ? children : undefined}
        aria-label={navCollapsed ? children : undefined}
        onFocus={handlePreload}
        onMouseEnter={handlePreload}
        onPointerDown={handlePointerDown}
        onClick={() => navigate(to)}
      >
        {(effectiveMenuIcon === 'monochrome' || !effectiveMenuIcon) && (
          <ListItemIcon
            sx={{
              color: 'text.primary',
              marginLeft: '6px',
              cursor: draggable ? 'grab' : 'inherit',
            }}
          >
            {icon[0]}
          </ListItemIcon>
        )}
        {effectiveMenuIcon === 'colorful' && (
          <ListItemIcon sx={{ cursor: draggable ? 'grab' : 'inherit' }}>
            {icon[1]}
          </ListItemIcon>
        )}
        <ListItemText
          sx={{
            textAlign: 'center',
            marginLeft: effectiveMenuIcon === 'disable' ? '' : '-35px',
          }}
          primary={children}
        />
      {badge && (
              <Box
                className="nav-badge"
                aria-label={badge}
                sx={(theme) => ({
                  position: 'absolute',
                  top: -4,
                  right: navCollapsed ? 10 : 8,
                  zIndex: 3,
                  pointerEvents: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: navCollapsed ? 8 : 15,
                  minWidth: navCollapsed ? 8 : 0,
                  px: navCollapsed ? 0 : 0.7,
                  borderRadius: navCollapsed ? '50%' : 2,
                  background: navCollapsed
                    ? theme.palette.primary.main
                    : `linear-gradient(135deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.72)})`,
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  boxShadow: `0 0 0 2px ${theme.palette.background.paper}, 0 2px 7px ${alpha(theme.palette.primary.main, 0.55)}`,
                  '@keyframes navBadgePulse': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                    '50%': { transform: 'scale(1.14)', opacity: 0.8 },
                  },
                  animation: 'navBadgePulse 2.2s ease-in-out infinite',
                })}
              >
                {navCollapsed ? null : badge}
              </Box>
            )}
        </ListItemButton>
    </ListItem>
  )
}
