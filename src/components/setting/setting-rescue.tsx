import { Button } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { TooltipIcon } from '@/components/base'
import { showNotice } from '@/services/notice-service'
import getSystem from '@/utils/get-system'
import { SettingItem, SettingList } from './mods/setting-comp'

const OS = getSystem()

const SettingRescue = () => {
  const onRescueStep2 = async () => {
    try {
      await invoke('launch_rescue')
      showNotice.success('已启动第②步提权急救，请在弹出的管理员确认框点“是”')
    } catch (err) {
      showNotice.error(typeof err === 'string' ? err : '第②步失败（可能未打包急救脚本），请回上方点『① 应用内急救』兜底')
    }
  }
  if (OS !== 'windows') return null
  return (
    <SettingList title="断网急救 · 提权重锤（第②步）">
      <SettingItem
        label="② 提权急救（第①步没修好再点 · 会弹管理员框 · 修复最全）"
        extra={<TooltipIcon title="第②步：弹管理员确认框后以全权限修复，能删掉系统级规则，修复最全。第①步没修好时点它。" sx={{ opacity: '0.7' }} />}
      >
        <Button variant="contained" color="error" size="small" onClick={onRescueStep2} sx={{ whiteSpace: 'nowrap', gap: 0.5 }}>
          🛡️ 提权急救
        </Button>
      </SettingItem>
      <SettingItem label="">
        <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'left', lineHeight: 1.6 }}>
          接上一步：①没修好时点这个（会弹管理员框，权限最全）。若 Nyxelen 彻底打不开，去安装目录双击“Nyxelen急救.bat”。
        </div>
      </SettingItem>
    </SettingList>
  )
}

export default SettingRescue
