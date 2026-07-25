import { useEffect, useState } from 'react'
import { Box, Button, LinearProgress, Typography } from '@mui/material'
import { getVersion } from '@tauri-apps/api/app'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

const gateUrl = '/gate.json'
const checkTimeoutMs = 5000

type GateResp = {
  minVersion: string
  latestVersion: string
  forceUpdate: boolean
  downloadUrl: string
  notice: string
}

type Phase = 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'done' | 'error'

function parseNum(s: string): number {
  const n = Number(s)
  if (Number.isFinite(n)) return n
  return 0
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = pa.length > pb.length ? pa.length : pb.length
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ? pa[i] : '0'
    const sb = pb[i] ? pb[i] : '0'
    const xa = parseNum(sa)
    const xb = parseNum(sb)
    if (xa < xb) return -1
    if (xa > xb) return 1
  }
  return 0
}

const phaseText: Record<Phase, string> = {
  idle: '发现新版本',
  checking: '正在连接更新服务器…',
  downloading: '正在下载更新包…',
  verifying: '正在校验签名…',
  installing: '正在安装，请稍候…',
  done: '安装完成，即将重启',
  error: '在线更新失败',
}

const UpdateGate = () => {
  const [gate, setGate] = useState<GateResp | null>(null)
  const [current, setCurrent] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [percent, setPercent] = useState<number>(-1)
  const [errMsg, setErrMsg] = useState<string>('')
  const [copyTip, setCopyTip] = useState<string>('')

  useEffect(() => {
    let alive = true
    const run = async function () {
      let ver = ''
      try {
        ver = await getVersion()
      } catch (e) {
        return
      }
      if (alive) setCurrent(ver)
      let resp: GateResp | null = null
      try {
        const controller = new AbortController()
        const timer = setTimeout(function () {
          controller.abort()
        }, checkTimeoutMs)
        const r = await fetch(gateUrl + '?current=' + encodeURIComponent(ver), {
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (r.ok) resp = (await r.json()) as GateResp
      } catch (e) {
        return
      }
      if (!resp) return
      if (!resp.minVersion) return
      if (compareSemver(ver, resp.minVersion) < 0) {
        if (alive) setGate(resp)
      }
    }
    run()
    return function () {
      alive = false
    }
  }, [])

  const startOnlineUpdate = async function () {
    setErrMsg('')
    setCopyTip('')
    setPercent(-1)
    setPhase('checking')
    let check: any = null
    let relaunch: any = null
    try {
      const upMod = await import('@tauri-apps/plugin-updater')
      check = upMod.check
      const prMod = await import('@tauri-apps/plugin-process')
      relaunch = prMod.relaunch
    } catch (e) {
      setPhase('error')
      setErrMsg('更新模块未就绪，请使用下方下载链接手动更新')
      return
    }
    let update: any = null
    try {
      update = await check()
    } catch (e) {
      setPhase('error')
      setErrMsg('检查更新失败：' + String(e))
      return
    }
    if (!update) {
      setPhase('error')
      setErrMsg('服务器暂无可用安装包，请使用下方下载链接手动更新')
      return
    }
    if (update.available === false) {
      setPhase('error')
      setErrMsg('服务器暂无可用安装包，请使用下方下载链接手动更新')
      return
    }
    let total = 0
    let got = 0
    setPhase('downloading')
    try {
      await update.downloadAndInstall(function (ev: any) {
        if (!ev) return
        if (ev.event === 'Started') {
          const cl = ev.data && ev.data.contentLength
          if (cl && cl > 0) total = cl
        } else if (ev.event === 'Progress') {
          const chunk = ev.data && ev.data.chunkLength
          if (chunk) got = got + chunk
          if (total > 0) {
            setPercent(Math.floor((got / total) * 100))
          } else {
            setPercent(-1)
          }
        } else if (ev.event === 'Finished') {
          setPhase('verifying')
        }
      })
    } catch (e) {
      setPhase('error')
      setErrMsg('下载或安装失败：' + String(e))
      return
    }
    setPhase('installing')
    try {
      await relaunch()
    } catch (e) {
      setPhase('done')
      setErrMsg('安装完成，请手动关闭并重新打开应用')
    }
  }

  const handleCopy = async function () {
    if (!gate) return
    try {
      await writeText(gate.downloadUrl)
      setCopyTip('下载链接已复制，请粘贴到浏览器打开安装')
    } catch (e) {
      setCopyTip('复制失败，请手动选中下方链接复制')
    }
  }

  if (!gate) return null

  const busy =
    phase === 'checking' ||
    phase === 'downloading' ||
    phase === 'verifying' ||
    phase === 'installing' ||
    phase === 'done'
  const showProgress = phase === 'downloading'

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        bgcolor: 'rgba(8,10,14,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Box
        sx={{
          maxWidth: 440,
          width: '100%',
          bgcolor: 'background.paper',
          borderRadius: 3,
          p: 3.5,
          boxShadow: 24,
        }}
      >
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>
          {phase === 'error' ? '在线更新未完成' : '需要更新到最新版本'}
        </Typography>
        <Typography sx={{ fontSize: 12.5, opacity: 0.6, mb: 1.5, fontWeight: 600 }}>
          当前 v{current}　·　最低要求 v{gate.minVersion}
        </Typography>
        <Typography sx={{ fontSize: 14, mb: 2, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {gate.notice ? gate.notice : '为继续使用，请更新到最新版本。'}
        </Typography>

        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: phase === 'error' ? 'error.main' : 'primary.main',
              flex: 1,
            }}
          >
            {phaseText[phase]}
          </Typography>
          {percent >= 0 ? (
            <Typography sx={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {percent + '%'}
            </Typography>
          ) : null}
        </Box>

        {showProgress ? (
          <LinearProgress
            variant={percent >= 0 ? 'determinate' : 'indeterminate'}
            value={percent >= 0 ? percent : 0}
            sx={{ height: 8, borderRadius: 4, mb: 2 }}
          />
        ) : (
          <Box sx={{ height: 8, mb: 2 }} />
        )}

        {phase === 'error' ? (
          <Typography sx={{ fontSize: 12.5, color: 'error.main', mb: 2, wordBreak: 'break-all' }}>
            {errMsg}
          </Typography>
        ) : null}

        {phase !== 'error' ? (
          <Button
            variant="contained"
            fullWidth
            disabled={busy}
            onClick={startOnlineUpdate}
            sx={{ mb: 1, py: 1.1, fontWeight: 700, borderRadius: 2 }}
          >
            {busy ? '更新中…' : '立即在线更新'}
          </Button>
        ) : (
          <Button
            variant="contained"
            fullWidth
            onClick={startOnlineUpdate}
            sx={{ mb: 1, py: 1.1, fontWeight: 700, borderRadius: 2 }}
          >
            重试在线更新
          </Button>
        )}

        <Button
          fullWidth
          variant="text"
          onClick={handleCopy}
          sx={{ fontWeight: 600, textTransform: 'none' }}
        >
          或复制下载链接，手动安装
        </Button>
        <Typography
          sx={{
            fontSize: 11.5,
            opacity: 0.5,
            wordBreak: 'break-all',
            mt: 0.5,
            userSelect: 'text',
          }}
        >
          {gate.downloadUrl}
        </Typography>
        {copyTip ? (
          <Typography sx={{ fontSize: 12, color: 'success.main', mt: 1, fontWeight: 600 }}>
            {copyTip}
          </Typography>
        ) : null}
      </Box>
    </Box>
  )
}

export default UpdateGate