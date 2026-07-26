import { Box, Grid } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { BasePage } from '@/components/base'
import SettingClash from '@/components/setting/setting-clash'
import SettingPrivacySuite from '@/components/setting/setting-privacy-suite'
import SettingSystem from '@/components/setting/setting-system'
import SettingVergeBasic from '@/components/setting/setting-verge-basic'
import SettingRescue from '@/components/setting/setting-rescue'
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
  const cardSx = (mb = true) => ({
    borderRadius: 2,
    marginBottom: mb ? 1.5 : 0,
    backgroundColor: isDark ? '#282a36' : '#ffffff',
  })
  return (
    <BasePage title={t('settings.page.title')}>
      <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
        {/* 左栏：系统 + Clash + 常规设置 */}
        <Grid size={6}>
          <Box sx={cardSx()}>
            <SettingSystem onError={onError} />
          </Box>
          <Box sx={cardSx()}>
            <SettingClash onError={onError} />
          </Box>
          <Box sx={cardSx(false)}>
            <SettingVergeUi onError={onError} />
          </Box>
        </Grid>
        {/* 右栏：专项防泄漏 + 隐私套件 + 提权急救（①②之间要有缝，故 privacy-suite 用 cardSx()） */}
        <Grid size={6}>
          <Box sx={cardSx()}>
            <SettingVergeBasic />
          </Box>
          <Box sx={cardSx()}>
            <SettingPrivacySuite />
          </Box>
          <Box
            sx={{
              borderRadius: 2,
              backgroundColor: isDark ? '#282a36' : '#ffffff',
            }}
          >
            <SettingRescue />
          </Box>
        </Grid>
      </Grid>
    </BasePage>
  )
}

export default SettingPage
