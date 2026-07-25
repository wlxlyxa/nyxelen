import { useEffect, useState } from 'react'
import { Box, Button, Dialog, DialogContent, DialogTitle, LinearProgress, Typography } from '@mui/material'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'

// 发版前换成你服务器真实地址；仅用于“自动更新失败时”的手动降级链接
const gateUrl = 'https://你的服务器/gate.json'
const releasesFallback = 'https://github.com/wlxlyxa/wangzai/releases'
const checkTimeoutMs = 6000

// 给 check 加超时：服务器/网络卡住时不至于让用户每次启动干等
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
return Promise.race([
p,
new Promise<T>(function (_, reject) {
setTimeout(function () { reject(new Error('check timeout')) }, ms)
}),
])
}

const AutoUpdater = () => {
const [update, setUpdate] = useState<any>(null)
const [open, setOpen] = useState(false)
const [busy, setBusy] = useState(false)
const [status, setStatus] = useState('')
const [manualUrl, setManualUrl] = useState(releasesFallback)
const [current, setCurrent] = useState('')

useEffect(() => {
let alive = true
const run = async function () {
try { setCurrent(await getVersion()) } catch (e) { /* ignore */ }
// 顺手拿手动降级链接（失败就用 releases 页兜底，绝不阻塞）
try {
const controller = new AbortController()
const t = setTimeout(function () { controller.abort() }, checkTimeoutMs)
const r = await fetch(gateUrl, { signal: controller.signal })
clearTimeout(t)
if (r.ok) {
const j = await r.json()
if (j && j.downloadUrl) setManualUrl(j.downloadUrl)
}
} catch (e) { /* ignore，降级链接保持 releases 页 */ }
// 后台查更新：失败/超时/无新版 = 静默，不弹、不打扰
try {
const u = await withTimeout(check(), checkTimeoutMs)
if (alive && u && u.available) {
setUpdate(u)
setOpen(true)
}
} catch (e) {
console.warn('[auto-updater] check skipped:', e)
}
}
run()
return function () { alive = false }
}, [])

const handleUpdate = async function () {
if (!update) return
setBusy(true)
setStatus('正在下载更新…')
try {
await update.downloadAndInstall(function (ev: any) {
if (ev.event === 'Progress') setStatus('正在下载更新…')
if (ev.event === 'Finished') setStatus('下载完成，正在安装并重启…')
})
await relaunch()
} catch (e: any) {
setBusy(false)
setStatus('自动更新失败：' + (typeof e === 'string' ? e : (e && e.message ? e.message : '未知错误')) + '。请改用下方手动链接。')
}
}

return (
<Dialog open={open} onClose={function () { if (!busy) setOpen(false) }} maxWidth="xs" fullWidth>
<DialogTitle>发现新版本{update && update.version ? ' v' + update.version : ''}</DialogTitle>
<DialogContent>
<Typography sx={{ fontSize: 13, opacity: 0.7, mb: 1 }}>
当前版本 {current}
</Typography>
<Typography sx={{ fontSize: 14, mb: 2, whiteSpace: 'pre-wrap', minHeight: 40 }}>
{update && update.body ? update.body : '有新版本可用，可一键自动更新并重启。'}
</Typography>
{busy ? (
<Box>
<LinearProgress sx={{ mb: 1 }} />
<Typography sx={{ fontSize: 12, opacity: 0.7 }}>{status}</Typography>
</Box>
) : status ? (
<Box sx={{ mb: 1 }}>
<Typography sx={{ fontSize: 12, color: 'error.main', mb: 1 }}>{status}</Typography>
<Typography sx={{ fontSize: 12, wordBreak: 'break-all', userSelect: 'text', opacity: 0.7 }}>
手动下载：{manualUrl}
</Typography>
</Box>
) : null}
<Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
{!busy ? (
<Button onClick={function () { setOpen(false) }} disabled={busy}>稍后</Button>
) : null}
<Button variant="contained" onClick={handleUpdate} disabled={busy}>
{busy ? '更新中…' : '立即自动更新'}
</Button>
</Box>
</DialogContent>
</Dialog>
)
}

export default AutoUpdater