import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch, TooltipIcon } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { SettingItem, SettingList } from './mods/setting-comp'

// 深度防泄漏 6 项元数据：[state键, 显示名, tooltip, enable命令, disable命令, 配置字段, check命令]
const DEEP_LEAK_ITEMS = [
  [
    'ncsi',
    'NCSI 直连阻断',
    '阻止 Windows 联网探测直连微软，避免定期泄露真实公网 IP。副作用：任务栏网络图标可能偶显“无 Internet”。',
    'enable_ncsi_protection',
    'disable_ncsi_protection',
    'ncsi_protection',
    'check_ncsi_protection_status',
  ],
  [
    'quic',
    'QUIC / HTTP3 阻断',
    '禁止浏览器走 UDP 直连，堵住“TCP 走代理、UDP 偷偷直连”的 IP 泄漏。副作用：极少数纯 QUIC 站点可能变慢。',
    'enable_quic_protection',
    'disable_quic_protection',
    'quic_protection',
    'check_quic_protection_status',
  ],
  [
    'wpad',
    'WPAD 自动代理发现关闭',
    '关闭“自动检测代理设置”，避免向内网广播主机名、与手动代理冲突。一般无副作用。',
    'enable_wpad_protection',
    'disable_wpad_protection',
    'wpad_protection',
    'check_wpad_protection_status',
  ],
  [
    'ocsp',
    '在线证书检查关闭',
    '禁止系统在线校验证书吊销 / 自动更新根证书，避免直连 CA 泄露访问记录与真实 IP。副作用：个别企业 / 银行站点可能弹证书警告。',
    'enable_ocsp_protection',
    'disable_ocsp_protection',
    'ocsp_protection',
    'check_ocsp_protection_status',
  ],
  [
    'llmnr',
    '局域网名称解析防护',
    '关闭 LLMNR / mDNS 多播解析，避免向局域网广播主机名与查询内容。副作用：局域网设备名解析可能受影响。',
    'enable_llmnr_protection',
    'disable_llmnr_protection',
    'llmnr_protection',
    'check_llmnr_protection_status',
  ],
  [
    'dns',
    'DNS 缓存防护',
    '开启时立即清空系统 DNS 缓存，消除“切换节点后旧直连解析残留”造成的泄漏窗口。',
    'enable_dns_cache_guard',
    'disable_dns_cache_guard',
    'dns_cache_guard',
    'check_dns_cache_guard_status',
  ],
] as const

type LeakKey = (typeof DEEP_LEAK_ITEMS)[number][0]

// 右栏“专项防泄漏”：只放防泄漏开关，标题即“专项防泄漏”
const SettingVergeBasic = () => {
  const { t } = useTranslation()
  const { verge, patchVerge, mutateVerge } = useVerge()

  // IPv6 真实状态在注册表里，挂载时查一次
  const [ipv6Block, setIpv6Block] = useState(false)
  useEffect(() => {
    invoke<boolean>('check_ipv6_block_status')
      .then((status) => setIpv6Block(status))
      .catch(() => {})
  }, [])

  // 深度防泄漏 6 项状态，挂载时各自查真实系统/配置状态
  const [leak, setLeak] = useState<Record<LeakKey, boolean>>({
    ncsi: false,
    quic: false,
    wpad: false,
    ocsp: false,
    llmnr: false,
    dns: false,
  })
  useEffect(() => {
    DEEP_LEAK_ITEMS.forEach(([key, , , , , , checkCmd]) => {
      invoke<boolean>(checkCmd)
        .then((v) => setLeak((s) => ({ ...s, [key]: v })))
        .catch(() => {})
    })
  }, [])

  const onChangeData = (patch: any) => {
    mutateVerge({ ...verge, ...patch }, false)
  }

  // ⚡ WebRTC/DNS 主开关：即拨即生效，不联动 SMHNR
  const onWebrtc = (c: boolean) => {
    onChangeData({ webrtc_leak_protection: c })
    patchVerge({ webrtc_leak_protection: c })
    void Promise.allSettled([
      invoke(c ? 'enable_webrtc_control' : 'disable_webrtc_control'),
      invoke(c ? 'enable_doh_block' : 'disable_doh_block'),
    ]).then((results) => {
      results.forEach((r) => {
        if (r.status === 'rejected') {
          const err = (r as PromiseRejectedResult).reason
          showNotice.error(
            typeof err === 'string'
              ? err
              : '设置 WebRTC/DNS 防泄漏失败，可能需要以管理员身份运行',
          )
        }
      })
    })
  }

  // ⚡ SMHNR 独立开关：即拨即生效，不看 WebRTC 状态
  const onSmhnr = (c: boolean) => {
    onChangeData({ smhnr_enabled: c })
    patchVerge({ smhnr_enabled: c })
    void invoke(
      c ? 'enable_smhnr_protection' : 'disable_smhnr_protection',
    ).catch((err) => {
      showNotice.error(
        typeof err === 'string'
          ? err
          : '设置 SMHNR 防泄漏失败，可能需要以管理员身份运行',
      )
    })
  }

  // ⚡ IPv6 独立开关：即拨即生效，失败回滚
  const onIpv6 = (c: boolean) => {
    setIpv6Block(c)
    void invoke(c ? 'enable_ipv6_block' : 'disable_ipv6_block').catch((err) => {
      setIpv6Block(!c)
      showNotice.error(
        typeof err === 'string'
          ? err
          : '设置 IPv6 防泄漏失败，可能需要以管理员身份运行',
      )
    })
  }

  // ⚡ 深度防泄漏通用开关：即拨即生效，乐观更新 + 失败回滚 + 写配置
  const toggleLeak =
    (key: LeakKey, enableCmd: string, disableCmd: string, configKey: string) =>
    (c: boolean) => {
      setLeak((s) => ({ ...s, [key]: c }))
      onChangeData({ [configKey]: c })
      patchVerge({ [configKey]: c })
      void invoke(c ? enableCmd : disableCmd).catch((err) => {
        setLeak((s) => ({ ...s, [key]: !c }))
        showNotice.error(
          typeof err === 'string' ? err : '设置防泄漏失败，可能需要以管理员身份运行',
        )
      })
    }

  return (
    <SettingList title="专项防泄漏">
      {/* 基础防泄漏：互相独立、即拨即生效 */}
      <SettingItem
        label={t('settings.modals.misc.fields.webrtcLeakProtection')}
        extra={
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.webrtcLeakProtection')}
            sx={{ opacity: '0.7' }}
          />
        }
      >
        <Switch
          edge="end"
          checked={verge?.webrtc_leak_protection ?? false}
          onChange={(_, c) => onWebrtc(c)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.modals.misc.fields.smhnrEnabled')}
        extra={
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.smhnrEnabled')}
            sx={{ opacity: '0.7' }}
          />
        }
      >
        <Switch
          edge="end"
          checked={verge?.smhnr_enabled ?? false}
          onChange={(_, c) => onSmhnr(c)}
        />
      </SettingItem>

      <SettingItem
        label={t('settings.modals.misc.fields.ipv6Block')}
        extra={
          <TooltipIcon
            title={t('settings.modals.misc.tooltips.ipv6Block')}
            sx={{ opacity: '0.7' }}
          />
        }
      >
        <Switch
          edge="end"
          checked={ipv6Block}
          onChange={(_, c) => onIpv6(c)}
        />
      </SettingItem>

      {/* 深度防泄漏 6 项：独立、即拨即生效、默认关 */}
      {DEEP_LEAK_ITEMS.map(
        ([key, label, tip, enableCmd, disableCmd, configKey]) => (
          <SettingItem
            key={key}
            label={label}
            extra={<TooltipIcon title={tip} sx={{ opacity: '0.7' }} />}
          >
            <Switch
              edge="end"
              checked={leak[key]}
              onChange={(_, c) =>
                toggleLeak(key, enableCmd, disableCmd, configKey)(c)
              }
            />
          </SettingItem>
        ),
      )}
    </SettingList>
  )
}

export default SettingVergeBasic