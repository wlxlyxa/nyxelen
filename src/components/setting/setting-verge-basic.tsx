import { Button } from '@mui/material'
import CircularProgress from '@mui/material/CircularProgress'
import { invoke } from '@tauri-apps/api/core'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Switch, TooltipIcon } from '@/components/base'
import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { SettingItem, SettingList } from './mods/setting-comp'

const DEEP_LEAK_ITEMS = [
  ['ncsi', 'NCSI 直连阻断', '阻止 Windows 联网探测直连微软，避免定期泄露真实公网 IP。副作用：任务栏网络图标可能偶显“无 Internet”。', 'enable_ncsi_protection', 'disable_ncsi_protection', 'ncsi_protection', 'check_ncsi_protection_status'],
  ['quic', 'QUIC / HTTP3 阻断', '禁止浏览器走 UDP 直连，堵住“TCP 走代理、UDP 偷偷直连”的 IP 泄漏。副作用：极少数纯 QUIC 站点可能变慢。', 'enable_quic_protection', 'disable_quic_protection', 'quic_protection', 'check_quic_protection_status'],
  ['wpad', 'WPAD 自动代理发现关闭', '关闭“自动检测代理设置”，避免向内网广播主机名、与手动代理冲突。一般无副作用。', 'enable_wpad_protection', 'disable_wpad_protection', 'wpad_protection', 'check_wpad_protection_status'],
  ['ocsp', '在线证书检查关闭', '禁止系统在线校验证书吊销 / 自动更新根证书，避免直连 CA 泄露访问记录与真实 IP。副作用：个别企业 / 银行站点可能弹证书警告。', 'enable_ocsp_protection', 'disable_ocsp_protection', 'ocsp_protection', 'check_ocsp_protection_status'],
  ['llmnr', '局域网名称解析防护', '关闭 LLMNR / mDNS 多播解析，避免向局域网广播主机名与查询内容。副作用：局域网设备名解析可能受影响。', 'enable_llmnr_protection', 'disable_llmnr_protection', 'llmnr_protection', 'check_llmnr_protection_status'],
  ['dns', 'DNS 缓存防护', '开启时立即清空系统 DNS 缓存，消除“切换节点后旧直连解析残留”造成的泄漏窗口。', 'enable_dns_cache_guard', 'disable_dns_cache_guard', 'dns_cache_guard', 'check_dns_cache_guard_status'],
] as const

type LeakKey = (typeof DEEP_LEAK_ITEMS)[number][0]
const SAFE_LEAK_KEYS: LeakKey[] = ['wpad', 'ocsp', 'llmnr', 'dns']
const RISKY_LEAK_KEYS: LeakKey[] = ['ncsi', 'quic']

type SuiteKey = 'teredo' | 'bcast'
const SUITE_ITEMS: ReadonlyArray<readonly [SuiteKey, string, string, string, string]> = [
  ['teredo', 'IPv6 隧道封装禁用', '关闭 Teredo/6to4/ISATAP 隧道，补全 IPv6 防泄漏的“漏中漏”。一般无副作用。', 'enable_teredo_protection', 'disable_teredo_protection'],
  ['bcast', '局域网广播族全关', '关闭 LLMNR/mDNS/SSDP/UPnP/WS-Discovery 广播，防主机名+本地IP被嗅探。副作用：局域网设备自动发现可能受影响。', 'enable_broadcast_protection', 'disable_broadcast_protection'],
]

const TOTAL = SAFE_LEAK_KEYS.length + SUITE_ITEMS.length + 3
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const SettingVergeBasic = () => {
  const { t } = useTranslation()
  const { verge, patchVerge, mutateVerge } = useVerge()

  const [ipv6Block, setIpv6Block] = useState(false)
  useEffect(() => {
    invoke<boolean>('check_ipv6_block_status').then(setIpv6Block).catch(() => {})
  }, [])

  const [leak, setLeak] = useState<Record<LeakKey, boolean>>({
    ncsi: false, quic: false, wpad: false, ocsp: false, llmnr: false, dns: false,
  })
  useEffect(() => {
    DEEP_LEAK_ITEMS.forEach(([key, , , , , , checkCmd]) => {
      invoke<boolean>(checkCmd).then((v) => setLeak((s) => ({ ...s, [key]: v }))).catch(() => {})
    })
  }, [])

  const [suite, setSuite] = useState<Record<SuiteKey, boolean>>({ teredo: false, bcast: false })
  useEffect(() => {
    invoke<{ teredo: boolean; bcast: boolean }>('check_privacy_suite_status')
      .then((r) => setSuite({ teredo: r.teredo, bcast: r.bcast }))
      .catch(() => {})
  }, [])

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  const allOn = useMemo(
    () =>
      SAFE_LEAK_KEYS.every((k) => leak[k]) &&
      SUITE_ITEMS.every(([k]) => suite[k]) &&
      (verge?.webrtc_leak_protection ?? false) &&
      (verge?.smhnr_enabled ?? false) &&
      ipv6Block,
    [leak, suite, verge?.webrtc_leak_protection, verge?.smhnr_enabled, ipv6Block],
  )

  const onChangeData = (patch: any) => {
    mutateVerge({ ...verge, ...patch }, false)
  }

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
          showNotice.error(typeof err === 'string' ? err : '设置 WebRTC/DNS 防泄漏失败，可能需要以管理员身份运行')
        }
      })
    })
  }

  const onSmhnr = (c: boolean) => {
    onChangeData({ smhnr_enabled: c })
    patchVerge({ smhnr_enabled: c })
    void invoke(c ? 'enable_smhnr_protection' : 'disable_smhnr_protection').catch((err) => {
      showNotice.error(typeof err === 'string' ? err : '设置 SMHNR 防泄漏失败，可能需要以管理员身份运行')
    })
  }

  const onIpv6 = (c: boolean) => {
    setIpv6Block(c)
    void invoke(c ? 'enable_ipv6_block' : 'disable_ipv6_block').catch((err) => {
      setIpv6Block(!c)
      showNotice.error(typeof err === 'string' ? err : '设置 IPv6 防泄漏失败，可能需要以管理员身份运行')
    })
  }

  const toggleLeak =
    (key: LeakKey, enableCmd: string, disableCmd: string, configKey: string) =>
    (c: boolean) => {
      setLeak((s) => ({ ...s, [key]: c }))
      onChangeData({ [configKey]: c })
      patchVerge({ [configKey]: c })
      void invoke(c ? enableCmd : disableCmd).catch((err) => {
        setLeak((s) => ({ ...s, [key]: !c }))
        showNotice.error(typeof err === 'string' ? err : '设置防泄漏失败，可能需要以管理员身份运行')
      })
    }

  const toggleSuite = (key: SuiteKey, en: string, dis: string) => (c: boolean) => {
    setSuite((s) => ({ ...s, [key]: c }))
    void invoke(c ? en : dis).catch((err) => {
      setSuite((s) => ({ ...s, [key]: !c }))
      showNotice.error(typeof err === 'string' ? err : '设置失败，可能需要管理员身份')
    })
  }

  // 串行 + 间隔，避免并发风暴与网络栈瞬时抖动；async 让 UI 不假死
  const onToggleAll = async () => {
    if (busy) return
    const targetOn = !allOn
    setBusy(true)
    setProgress(0)
    let done = 0
    const step = async (fn: () => Promise<void>) => {
      try {
        await fn()
      } catch {
        /* 单项失败不中断整体 */
      }
      done += 1
      setProgress(done)
      await delay(350)
    }

    for (const [key, , , en, dis, ck] of DEEP_LEAK_ITEMS) {
      if (!SAFE_LEAK_KEYS.includes(key)) continue
      await step(async () => {
        setLeak((s) => ({ ...s, [key]: targetOn }))
        onChangeData({ [ck]: targetOn })
        patchVerge({ [ck]: targetOn })
        await invoke(targetOn ? en : dis)
      })
    }
    for (const [key, , , en, dis] of SUITE_ITEMS) {
      await step(async () => {
        setSuite((s) => ({ ...s, [key]: targetOn }))
        await invoke(targetOn ? en : dis)
      })
    }
    await step(async () => {
      onChangeData({ webrtc_leak_protection: targetOn })
      patchVerge({ webrtc_leak_protection: targetOn })
      await Promise.allSettled([
        invoke(targetOn ? 'enable_webrtc_control' : 'disable_webrtc_control'),
        invoke(targetOn ? 'enable_doh_block' : 'disable_doh_block'),
      ])
    })
    await step(async () => {
      onChangeData({ smhnr_enabled: targetOn })
      patchVerge({ smhnr_enabled: targetOn })
      await invoke(targetOn ? 'enable_smhnr_protection' : 'disable_smhnr_protection')
    })
    await step(async () => {
      setIpv6Block(targetOn)
      await invoke(targetOn ? 'enable_ipv6_block' : 'disable_ipv6_block')
    })

    setBusy(false)
    showNotice.success(targetOn ? `已一键开启 ${TOTAL} 项常规防护` : `已一键关闭 ${TOTAL} 项常规防护`)
  }

  return (
    <>
      <SettingList title="专项防泄漏 · 不影响正常上网">
        <SettingItem
          label="一键开启 / 关闭常规防护"
          extra={
            <TooltipIcon
              title={`一键${allOn ? '关闭' : '开启'}这 ${TOTAL} 项——它们只动局域网发现 / 证书校验 / 解析路径 / 浏览器策略，不会让你上不了外网；再次点击可全部${allOn ? '开启' : '关闭'}。可能让系统误判断网或站点变慢的 NCSI / QUIC 在下方单独控制。`}
              sx={{ opacity: '0.7' }}
            />
          }
        >
          <Button
            variant="contained"
            size="small"
            onClick={onToggleAll}
            sx={{
              whiteSpace: 'nowrap',
              minWidth: 112,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            {busy && <CircularProgress size={14} thickness={5} color="inherit" />}
            {busy ? `处理中 ${progress}/${TOTAL}` : allOn ? '一键关闭' : '一键开启'}
          </Button>
        </SettingItem>

        {DEEP_LEAK_ITEMS.filter(([key]) => SAFE_LEAK_KEYS.includes(key)).map(
          ([key, label, tip, enableCmd, disableCmd, configKey]) => (
            <SettingItem key={key} label={label} extra={<TooltipIcon title={tip} sx={{ opacity: '0.7' }} />}>
              <Switch edge="end" checked={leak[key]} onChange={(_, c) => toggleLeak(key, enableCmd, disableCmd, configKey)(c)} />
            </SettingItem>
          ),
        )}

        {SUITE_ITEMS.map(([key, label, tip, en, dis]) => (
          <SettingItem key={key} label={label} extra={<TooltipIcon title={tip} sx={{ opacity: '0.7' }} />}>
            <Switch edge="end" checked={suite[key]} onChange={(_, c) => toggleSuite(key, en, dis)(c)} />
          </SettingItem>
        ))}

        <SettingItem
          label={t('settings.modals.misc.fields.webrtcLeakProtection')}
          extra={<TooltipIcon title={t('settings.modals.misc.tooltips.webrtcLeakProtection')} sx={{ opacity: '0.7' }} />}
        >
          <Switch edge="end" checked={verge?.webrtc_leak_protection ?? false} onChange={(_, c) => onWebrtc(c)} />
        </SettingItem>
        <SettingItem
          label={t('settings.modals.misc.fields.smhnrEnabled')}
          extra={<TooltipIcon title={t('settings.modals.misc.tooltips.smhnrEnabled')} sx={{ opacity: '0.7' }} />}
        >
          <Switch edge="end" checked={verge?.smhnr_enabled ?? false} onChange={(_, c) => onSmhnr(c)} />
        </SettingItem>
        <SettingItem
          label={t('settings.modals.misc.fields.ipv6Block')}
          extra={<TooltipIcon title={t('settings.modals.misc.tooltips.ipv6Block')} sx={{ opacity: '0.7' }} />}
        >
          <Switch edge="end" checked={ipv6Block} onChange={(_, c) => onIpv6(c)} />
        </SettingItem>
      </SettingList>

      <SettingList title="可能影响联网 · 请单独权衡">
        {DEEP_LEAK_ITEMS.filter(([key]) => RISKY_LEAK_KEYS.includes(key)).map(
          ([key, label, tip, enableCmd, disableCmd, configKey]) => (
            <SettingItem key={key} label={label} extra={<TooltipIcon title={tip} sx={{ opacity: '0.7' }} />}>
              <Switch edge="end" checked={leak[key]} onChange={(_, c) => toggleLeak(key, enableCmd, disableCmd, configKey)(c)} />
            </SettingItem>
          ),
        )}
      </SettingList>
    </>
  )
}

export default SettingVergeBasic
