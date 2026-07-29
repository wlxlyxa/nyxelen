import { alpha, Box, Grid } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { BasePage } from '@/components/base'
import SettingClash from '@/components/setting/setting-clash'
import SettingSystem from '@/components/setting/setting-system'
import SettingVergeUi from '@/components/setting/setting-verge-ui'
import { showNotice } from '@/services/notice-service'
import { useThemeMode } from '@/services/states'

const SettingPage = () => {
  const { t } = useTranslation()
  const onError = (err: any) => {
    showNotice.error(err)
  }
  const mode = useThemeMode()
  const isDark = mode === 'light' ? false : true
  const cardSx = (mb = true) => (theme: any) => ({
    borderRadius: 2,
    marginBottom: mb ? 1.5 : 0,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.palette.mode === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
    transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.palette.mode === 'dark' ? '0 8px 24px rgba(0,0,0,0.45)' : '0 8px 24px rgba(0,0,0,0.12)',
      borderColor: alpha(theme.palette.primary.main, 0.4),
    },
    '@keyframes settingsCardIn': {
      '0%': { opacity: 0, transform: 'translateY(10px)' },
      '100%': { opacity: 1, transform: 'translateY(0)' },
    },
    animation: 'settingsCardIn .45s ease both',
  })
  return (
    <BasePage title={t('settings.page.title')}>
      <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
        {/* 左栏：系统 + Clash */}
        <Grid size={6}>
          <Box sx={cardSx()}>
            <SettingSystem onError={onError} />
          </Box>
          <Box sx={cardSx(false)}>
            <SettingClash onError={onError} />
          </Box>
        </Grid>
        {/* 右栏：隐私自检 + 常规设置 */}
        <Grid size={6}>
          <Box sx={cardSx(false)}>
            <SettingVergeUi onError={onError} />
          </Box>
        </Grid>
      </Grid>
    </BasePage>
  )
}

export default SettingPage
