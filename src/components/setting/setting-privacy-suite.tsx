import { Button } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'
import { TooltipIcon } from '@/components/base'
import { showNotice } from '@/services/notice-service'
import { SettingItem, SettingList } from './mods/setting-comp'

const SettingPrivacySuite = () => {
  const [selfTest, setSelfTest] = useState<string[]>([])

  const onRescueStep1 = async () => {
    const ok = window.confirm(
      '【断网急救 · 第①步：应用内急救】\n\n' +
        '用当前权限修复：清望仔规则 + 清系统代理 + 恢复 IPv6 + 清 DNS + 重启网卡 + 重置协议栈。\n' +
        '不弹管理员框，能修大部分断网。\n\n' +
        '若点完仍未恢复（多半是望仔非管理员启动、删不掉系统级规则），请接着点下方的『② 提权急救』。\n\n' +
        '确定继续？',
    )
    if (!ok) return
    try {
      await invoke('emergency_rescue')
      showNotice.success('已执行第①步；若仍未恢复，请点下方『② 提权急救』')
    } catch (err) {
      showNotice.error(typeof err === 'string' ? err : '第①步失败，请点下方『② 提权急救』，或用管理员跑 emergency.ps1')
    }
  }

  const onRestorePoint = async () => {
    try {
      await invoke('create_system_restore_point')
      showNotice.success('已尝试创建还原点“望仔-高危操作前”')
    } catch (err) {
      showNotice.error(typeof err === 'string' ? err : '创建还原点失败（家庭版可能24小时限一个，或需管理员）')
    }
  }

  const onSelfTest = async () => {
    setSelfTest(['检测中…'])
    try {
      const r = await fetch('http://ip-api.com/json?fields=proxy,query,country,timezone')
      const d = await r.json()
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const tzMatch =
        (d.timezone || '').replace(/_/g, ' ') === localTz.replace(/_/g, ' ') ||
        (d.timezone || '').endsWith(localTz.split('/').pop() || '##')
      setSelfTest([
        `出口 IP：${d.query ?? '未知'}`,
        `IP 归属：${d.country ?? '未知'}`,
        `被识别为代理：${d.proxy ? '是 ⚠（出口已被标记为代理）' : '否 ✅'}`,
        `出口时区：${d.timezone ?? '未知'} ｜ 本机时区：${localTz} ｜ ${tzMatch ? '一致 ✅' : '不一致 ⚠（易被关联真实地区）'}`,
      ])
    } catch {
      setSelfTest(['自检失败：无法连接检测服务（请确认代理可用，或稍后重试）'])
    }
  }

  return (
    <SettingList title="隐私套件 · 急救与还原">
      <SettingItem
        label="创建系统还原点（高危操作前必做）"
        extra={<TooltipIcon title="在做任何改系统/防火墙的操作前点一下，断网救不回时可回滚。" sx={{ opacity: '0.7' }} />}
        onClick={onRestorePoint}
      />
      <SettingItem
        label="🔄 去系统还原（选“望仔-高危操作前”那个点）"
        extra={<TooltipIcon title="打开 Windows 自带的系统还原向导，在里面选望仔建的还原点回滚。望仔不直接还原，只帮你打开系统向导——选点、确认、重启都在向导里完成。" sx={{ opacity: '0.7' }} />}
        onClick={() => {
          invoke('open_system_restore').catch((err) =>
            showNotice.error(typeof err === 'string' ? err : '打开系统还原向导失败，请去开始菜单搜“创建还原点”'),
          )
        }}
      />
      <SettingItem label="">
        <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'left', lineHeight: 1.6 }}>
          还原点存在 Windows「系统还原」里，不在望仔内。还原会重启并回滚系统/注册表/之后装的软件，个人文件不受影响。家庭版若未开“系统保护”或 24 小时内已建过，创建会失败。
        </div>
      </SettingItem>

      <SettingItem label="隐私自检（出口IP/代理标记/时区一致性）" onClick={onSelfTest} />
      {selfTest.length > 0 && (
        <SettingItem label="自检结果">
          <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.85, whiteSpace: 'pre-line', textAlign: 'left' }}>
            {selfTest.join('\n')}
          </div>
        </SettingItem>
      )}

      <SettingItem
        label="① 应用内急救（断网时先试这个 · 不弹管理员框）"
        extra={<TooltipIcon title="第①步：用当前权限修复，能修大部分断网、且不弹系统框。若没修好，再点下方卡片的『② 提权急救』。" sx={{ opacity: '0.7' }} />}
      >
        <Button variant="contained" color="error" size="small" onClick={onRescueStep1} sx={{ whiteSpace: 'nowrap', gap: 0.5 }}>
          🚨 立即急救
        </Button>
      </SettingItem>
      <SettingItem label="">
        <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'left', lineHeight: 1.6 }}>
          先点这个（不弹管理员框）。没修好 → 点下方『② 提权急救』；应用彻底打不开 → 去安装目录双击“望仔急救.bat”。
        </div>
      </SettingItem>
    </SettingList>
  )
}

export default SettingPrivacySuite
