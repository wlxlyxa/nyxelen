// 跨页面共享的防护开关状态缓存（内存级）。
// 各页 useState 初始值读它、并用 useEffect 把 state 单向同步回它，
// 使切换页面时开关第一帧即为上次真值，消除"挂载先全关再跳真值"的闪烁与跨页不同步。
// 用对象而非 export let，是因为 ES module 的 export let 在导入方只读、无法回写。
export const leakStatusCache = {
  leak: { wpad: false, ocsp: false, llmnr: false, dns: false, ncsi: false, quic: false } as Record<string, boolean>,
  suite: { teredo: false, bcast: false } as Record<string, boolean>,
  ipv6: false,
}
