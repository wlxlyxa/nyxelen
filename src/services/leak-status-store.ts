import { invoke } from '@tauri-apps/api/core'

// 首页与设置页共享的 7 项防泄漏开关状态（webrtc/smhnr 本就共享 verge 配置，不在此列）。
// 单一可信源：开机 check 系统填充；拨开关乐观更新；两页都从这里读，故永不打架。
export type LeakKey =
  | 'wpad'
  | 'ocsp'
  | 'llmnr'
  | 'dns'
  | 'teredo'
  | 'bcast'
  | 'ipv6'

const SINGLE_CHECK: Partial<Record<LeakKey, string>> = {
  wpad: 'check_wpad_protection_status',
  ocsp: 'check_ocsp_protection_status',
  llmnr: 'check_llmnr_protection_status',
  dns: 'check_dns_cache_guard_status',
  ipv6: 'check_ipv6_block_status',
}

let state: Record<LeakKey, boolean> = {
  wpad: false,
  ocsp: false,
  llmnr: false,
  dns: false,
  teredo: false,
  bcast: false,
  ipv6: false,
}

// 被乐观更新过、后台 check 还没确认的 key。
// checkAll 不覆盖它们 —— 否则“刚在设置页拨完、回首页后台刷新读到旧值”会把界面又改回去。
let dirty = new Set<LeakKey>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const getLeakStatus = () => state
export const subscribeLeakStatus = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const setLeakOptimistic = (key: LeakKey, value: boolean) => {
  state = { ...state, [key]: value }
  dirty.add(key)
  emit()
}

let checking = false
export const checkAllLeakStatus = async () => {
  if (checking) return
  checking = true
  const dirtyAtStart = new Set(dirty)
  const next = { ...state }
  try {
    await Promise.allSettled(
      (Object.keys(SINGLE_CHECK) as LeakKey[]).map(async (k) => {
        const cmd = SINGLE_CHECK[k]!
        try {
          next[k] = await invoke<boolean>(cmd)
        } catch {
          /* 单项失败保留旧值 */
        }
      }),
    )
    try {
      const r = await invoke<{ teredo: boolean; bcast: boolean }>(
        'check_privacy_suite_status',
      )
      next.teredo = r.teredo
      next.bcast = r.bcast
    } catch {
      /* 保留旧值 */
    }
    // 合并：乐观改过的 key 保留用户意图，其余用系统真相校准
    const merged = { ...next }
    for (const k of Object.keys(merged) as LeakKey[]) {
      if (dirtyAtStart.has(k)) merged[k] = state[k]
    }
    state = merged
    dirtyAtStart.forEach((k) => dirty.delete(k))
    emit()
  } finally {
    checking = false
  }
}
