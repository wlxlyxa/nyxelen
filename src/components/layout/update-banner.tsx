import { CloseRounded, SystemUpdateAltRounded } from '@mui/icons-material'
import { Box, Button, IconButton, alpha } from '@mui/material'
import { useRef, useState } from 'react'

import { DialogRef } from '@/components/base'
import { useUpdate } from '@/hooks/use-update'

import { UpdateViewer } from '../setting/mods/update-viewer'

export const UpdateBanner = () => {
  const { updateInfo } = useUpdate()
  const viewerRef = useRef<DialogRef>(null)
  const [dismissed, setDismissed] = useState(false)

  // 无新版本 / 检查失败(离线) / 用户已关闭 → 不渲染。离线退路天然成立。
  if (!updateInfo?.available || dismissed) return null

  return (
    <>
      <UpdateViewer ref={viewerRef} />
      <Box
        sx={({ palette }) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 0.75,
          bgcolor: alpha(palette.info.main, 0.1),
          borderBottom: '1px solid',
          borderColor: alpha(palette.info.main, 0.25),
          animation: 'bannerIn 0.3s ease',
          '@keyframes bannerIn': {
            from: { opacity: 0, transform: 'translateY(-8px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
        })}
      >
        <SystemUpdateAltRounded sx={{ fontSize: 18, color: 'info.main' }} />
        <Box sx={{ flex: 1, fontSize: 13, color: 'text.primary' }}>
          有可用更新{updateInfo.version ? ` · v${updateInfo.version}` : ''}
        </Box>
        <Button
          size="small"
          variant="contained"
          color="info"
          onClick={() => viewerRef.current?.open()}
        >
          立即更新
        </Button>
        <IconButton size="small" onClick={() => setDismissed(true)} aria-label="稍后">
          <CloseRounded sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </>
  )
}
