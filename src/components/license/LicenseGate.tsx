// src/components/license/LicenseGate.tsx
import { useAtomValue } from 'jotai'
import React, { useEffect, useState } from 'react'

import { licenseActivatedAtom } from '@/services/license'

export const LicenseGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const activated = useAtomValue(licenseActivatedAtom)
  const [inputKey, setInputKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 已激活则直接透传子组件
  if (activated) return <>{children}</>

  const handleActivate = async () => {
    if (!inputKey.trim()) return
    setLoading(true)
    setError(null)
    try {
      // TODO: 替换为你的实际 Tauri Command 或 API
      // const result = await invoke('verify_license', { key: inputKey })
      // if (!result.valid) throw new Error(result.message || 'Invalid key')
      
      // 模拟验证成功（开发阶段临时用）
      console.warn('[LicenseGate] 请替换为真实验证逻辑')
    } catch (e: any) {
      setError(e?.message || 'Activation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow-2xl">
        <h2 className="text-center text-2xl font-bold">Software Activation</h2>
        <p className="text-center text-muted-foreground">
          Please enter your license key to continue.
        </p>

        <div className="space-y-2">
          <input
            type="text"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            disabled={loading}
            className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <button
          onClick={handleActivate}
          disabled={loading || !inputKey.trim()}
          className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Activate'}
        </button>
      </div>
    </div>
  )
}