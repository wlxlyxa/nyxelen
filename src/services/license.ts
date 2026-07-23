import { atom } from 'jotai'

// ===== License stub: 永远视为已激活，移除所有限制 =====

export type LicenseStatus = 'active' | 'expired' | 'none' | 'trial'

/** 许可证是否已激活：恒 true，让 LicenseGate 放行 */
export const licenseActivatedAtom = atom<boolean>(true)

/** 许可证状态：恒 active */
export const licenseStatusAtom = atom<LicenseStatus>('active')

/** 过期时间：null = 永不过期 */
export const licenseExpiresAtAtom = atom<number | null>(null)

/** 兜底导出：防止别处还引用了这些名字 */
export const licenseKeyAtom = atom<string>('')
export const isLicenseValidAtom = atom<boolean>(true)
export const checkLicense = async () => true
export const activateLicense = async (_key: string) => ({ success: true })
export const deactivateLicense = async () => ({ success: true })
