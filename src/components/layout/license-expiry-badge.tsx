// src/components/layout/license-expiry-badge.tsx
// license 功能已移除：保留组件签名以兼容外部引用，但永不渲染。

interface LicenseExpiryBadgeProps {
  /** 侧边栏是否处于折叠态（保留 prop 形状，避免调用方报错） */
  collapsed?: boolean
}

export const LicenseExpiryBadge = ({
  collapsed = false,
}: LicenseExpiryBadgeProps) => {
  // 显式标记参数"故意不用"，防止 noUnusedParameters 报 TS6133
  void collapsed
  return null
}