import { AccountTreeRounded } from '@mui/icons-material'
import { Box, Chip, Typography, keyframes } from '@mui/material'

import { BasePage } from '@/components/base'
import { EnhancedCard } from '@/components/home/enhanced-card'

const pulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.97); }
`

const ProcessProxyPage = () => {
  return (
    <BasePage title="进程代理" contentStyle={{ padding: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', pt: 6 }}>
        <Box sx={{ maxWidth: 560, width: '100%' }}>
          <EnhancedCard title="进程代理 · 按程序分流" icon={<AccountTreeRounded />} iconColor="primary">
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5, py: 4, px: 2, textAlign: 'center' }}>
              <Chip
                label="即将上线"
                color="primary"
                sx={{ fontWeight: 700, animation: `${pulse} 2s ease-in-out infinite` }}
              />
              <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                让每个程序，走自己想走的路
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.72, lineHeight: 1.9, maxWidth: 460 }}>
                游戏走代理、浏览器直连、下载器 bypass——进程代理能让你为每个程序单独指定走代理还是直连，
                不再"开了代理全走、关了代理全断"。这是 Nyxelen 正在认真做的下一块拼图。
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center', mt: 1 }}>
                <Chip label="按程序分流" size="small" variant="outlined" />
                <Chip label="规则化代理" size="small" variant="outlined" />
                <Chip label="告别全局开关" size="small" variant="outlined" />
              </Box>
              <Typography variant="caption" sx={{ opacity: 0.5, mt: 1 }}>
                敬请期待 · 我们正在把它做扎实，而不是赶一个半成品
              </Typography>
            </Box>
          </EnhancedCard>
        </Box>
      </Box>
    </BasePage>
  )
}

export default ProcessProxyPage
