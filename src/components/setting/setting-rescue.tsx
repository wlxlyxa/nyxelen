import { Button, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import { TooltipIcon } from '@/components/base'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'
import { SettingItem, SettingList } from './mods/setting-comp'

const OS = getSystem()

// ② 提权急救（强版·第①步没修好时点）：RunAs 提权跑 emergency.ps1，总是全权限，修复最全。
const SettingRescue = () => {
  const { t } = useTranslation()
  const onRescueStep2 = async () => {
    try {
      await invoke('launch_rescue')
      showNotice.success('已启动第②步提权急救，请在弹出的管理员确认框点“是”')
    } catch (err) {
      // ② 失败（多为 emergency.ps1 未打包进资源目录）→ 指回 ① 兜底，形成闭环引导
      showNotice.error(
        typeof err === 'string'
          ? err
          : '第②步失败（可能未打包急救脚本），请回上方点『① 应用内急救』兜底',
      )
    }
  }
  // 急救脚本是 Windows 专用，其它平台不显示这个面板
  if (OS !== 'windows') return null
  return (
    <SettingList title="断网急救 · 提权重锤（第②步）">
      <SettingItem
        label="② 提权急救（第①步没修好再点 · 会弹管理员框 · 修复最全）"
        extra={
          <TooltipIcon
            title="第②步：弹管理员确认框后以全权限修复，能删掉系统级规则，修复最全。第①步没修好时点它。"
            sx={{ opacity: '0.7' }}
          />
        }
      >
        <Button variant="contained" color="error" size="small" onClick={onRescueStep2}>
          🛡️ 提权急救
        </Button>
      </SettingItem>
      <SettingItem label="">
        <Typography sx={{ fontSize: 12, opacity: 0.6, textAlign: 'right' }}>
          接上一步：①没修好时点这个（会弹管理员框，权限最全）。若望仔彻底打不开，去安装目录双击“望仔急救.bat”。
        </Typography>
      </SettingItem>
    </SettingList>
  )
}

export default SettingRescue