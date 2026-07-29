import { useState } from 'react'
import { SettingItem, SettingList } from './mods/setting-comp'

interface SelfTestLine {
  text: string
  status: 'ok' | 'warn' | 'info' | 'loading' | 'error'
}

const STATUS_STYLE: Record<string, { color: string; icon: string }> = {
  ok: { color: '#4caf50', icon: '✅' },
  warn: { color: '#ff5252', icon: '⚠️' },
  info: { color: 'inherit', icon: 'ℹ️' },
  loading: { color: 'inherit', icon: '🔄' },
  error: { color: '#ff5252', icon: '❌' },
}

const SettingPrivacySuite = () => {
  const [selfTest, setSelfTest] = useState<SelfTestLine[]>([])

  const onSelfTest = async () => {
    setSelfTest([{ text: '检测中…', status: 'loading' }])
    try {
      const r = await fetch('http://ip-api.com/json?fields=proxy,query,country,timezone')
      const d = await r.json()
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const tzMatch =
        (d.timezone || '').replace(/_/g, ' ') === localTz.replace(/_/g, ' ') ||
        (d.timezone || '').endsWith(localTz.split('/').pop() || '##')
      setSelfTest([
        { text: `出口 IP：${d.query ?? '未知'}`, status: 'info' },
        { text: `IP 归属：${d.country ?? '未知'}`, status: 'info' },
        { text: `被识别为代理：${d.proxy ? '是（出口已被标记为代理）' : '否'}`, status: d.proxy ? 'warn' : 'ok' },
        { text: `出口时区：${d.timezone ?? '未知'} ｜ 本机时区：${localTz} ｜ ${tzMatch ? '一致' : '不一致（易被关联真实地区）'}`, status: tzMatch ? 'ok' : 'warn' },
      ])
    } catch {
      setSelfTest([{ text: '自检失败：无法连接检测服务（请确认代理可用，或稍后重试）', status: 'error' }])
    }
  }

  return (
    <SettingList title="隐私自检">
      <SettingItem
        label="隐私自检（出口IP / 代理标记 / 时区一致性）"
        onClick={onSelfTest}
      />
      {selfTest.length > 0 && (
        <SettingItem label="自检结果">
          <div style={{ fontSize: 12, lineHeight: 1.8, textAlign: 'left' }}>
            {selfTest.map((line, i) => {
              const st = STATUS_STYLE[line.status] || STATUS_STYLE.info
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, opacity: line.status === 'info' ? 0.85 : 1 }}>
                  <span style={{ flexShrink: 0 }}>{st.icon}</span>
                  <span style={{ color: st.color, fontWeight: line.status === 'warn' ? 600 : 400 }}>
                    {line.text}
                  </span>
                </div>
              )
            })}
          </div>
        </SettingItem>
      )}
    </SettingList>
  )
}

export default SettingPrivacySuite
