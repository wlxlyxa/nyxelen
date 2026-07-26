import { ChevronRightRounded } from '@mui/icons-material'
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListSubheader,
} from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import React, { ReactNode, useState } from 'react'

import isAsyncFunction from '@/utils/is-async-function'

interface ItemProps {
  label: ReactNode
  extra?: ReactNode
  children?: ReactNode
  secondary?: ReactNode
  onClick?: () => void | Promise<any>
}

export const SettingItem: React.FC<ItemProps> = ({
  label,
  extra,
  children,
  secondary,
  onClick,
}) => {
  const clickable = !!onClick

  // label 侧可收缩换行（minWidth:0 + wordBreak）；extra(ⓘ) 不收缩。
  // 注意：children 不加 flexShrink:0——按钮靠自身 min-width 不被压扁，
  // 而长说明文字需要能收缩换行，加 flexShrink:0 会让它整行溢出卡片。
  const primary = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        minWidth: 0,
      }}
    >
      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{label}</span>
      {extra ? (
        <Box component="span" sx={{ flexShrink: 0, display: 'inline-flex' }}>
          {extra}
        </Box>
      ) : null}
    </Box>
  )

  const [isLoading, setIsLoading] = useState(false)
  const handleClick = () => {
    if (onClick) {
      if (isAsyncFunction(onClick)) {
        setIsLoading(true)
        onClick()!.finally(() => setIsLoading(false))
      } else {
        onClick()
      }
    }
  }

  return clickable ? (
    <ListItem disablePadding>
      <ListItemButton onClick={handleClick} disabled={isLoading}>
        <ListItemText primary={primary} secondary={secondary} />
        {isLoading ? (
          <CircularProgress color="inherit" size={20} />
        ) : (
          <ChevronRightRounded />
        )}
      </ListItemButton>
    </ListItem>
  ) : (
    <ListItem sx={{ pt: '5px', pb: '5px' }}>
      <ListItemText
        primary={primary}
        secondary={secondary}
        sx={{ minWidth: 0 }}
      />
      <Box sx={{ ml: 1 }}>{children}</Box>
    </ListItem>
  )
}

export const SettingList: React.FC<{
  title: string
  children: ReactNode
}> = ({ title, children }) => (
  <List>
    <ListSubheader
      sx={[
        { background: 'transparent', fontSize: '16px', fontWeight: '700' },
        ({ palette }) => {
          return {
            color: palette.text.primary,
          }
        },
      ]}
      disableSticky
    >
      {title}
    </ListSubheader>

    {children}
  </List>
)
