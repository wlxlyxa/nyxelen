import { useLockFn } from 'ahooks'
import { useCallback, useEffect, useMemo, useReducer } from 'react'

import { useVerge } from '@/hooks/use-verge'
import delayManager, { type DelayUpdate } from '@/services/delay'

const PRESET_PROXY_NAMES = [
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
]

const identity = (_: DelayUpdate, next: DelayUpdate): DelayUpdate => next

const INITIAL_DELAY: DelayUpdate = { delay: -1, updatedAt: 0 }

export interface UseProxyDelayState {
  delayState: DelayUpdate
  delayValue: number
  isPreset: boolean
  timeout: number
  consecutiveTimeouts: number
  onDelay: () => Promise<void>
}

export function useProxyDelayState(
  proxy: IProxyItem,
  groupName: string,
): UseProxyDelayState {
  const isPreset = PRESET_PROXY_NAMES.includes(proxy.name)
  const [delayState, setDelayState] = useReducer(identity, INITIAL_DELAY)
  const { verge } = useVerge()
  const timeout = verge?.default_latency_timeout || 10000

  useEffect(() => {
    if (isPreset) return
    delayManager.setListener(proxy.name, groupName, setDelayState)
    return () => {
      delayManager.removeListener(proxy.name, groupName)
    }
  }, [proxy.name, groupName, isPreset])

  const updateDelay = useCallback(() => {
    if (!proxy) return
    const cachedUpdate = delayManager.getDelayUpdate(proxy.name, groupName)
    if (cachedUpdate) {
      setDelayState({ ...cachedUpdate })
      return
    }

    const fallbackDelay = delayManager.getDelayFix(proxy, groupName)
    if (fallbackDelay === -1) {
      setDelayState({ delay: -1, updatedAt: 0 })
      return
    }

    let updatedAt = 0
    const history = proxy.history
    if (history && history.length > 0) {
      const lastRecord = history[history.length - 1]
      const parsed = Date.parse(lastRecord.time)
      if (!Number.isNaN(parsed)) {
        updatedAt = parsed
      }
    }

    setDelayState({ delay: fallbackDelay, updatedAt })
  }, [proxy, groupName])

  useEffect(() => {
    updateDelay()
  }, [updateDelay])

  const onDelay = useLockFn(async () => {
    setDelayState({ delay: -2, updatedAt: Date.now() })
    setDelayState(await delayManager.checkDelay(proxy.name, groupName, timeout))
  })

    // 块1：从 history 末尾数连续 timeout（delay===0 或 >=timeout）的条数。
  // 单次 timeout 可能只是代理模式下测速受干扰，不冤枉好线路；连续多次才判不可用。
  const consecutiveTimeouts = useMemo(() => {
    const history = proxy.history
    if (!history || history.length === 0) return 0
    let count = 0
    for (let i = history.length - 1; i >= 0; i--) {
      const d = history[i].delay
      if (d === 0 || d >= timeout) count++
      else break
    }
    return count
  }, [proxy.history, timeout])

  return {
    delayState,
    delayValue: delayState.delay,
    isPreset,
    timeout,
    consecutiveTimeouts,
    onDelay,
  }
}
