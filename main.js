const { app, BrowserWindow, ipcMain, clipboard } = require('electron')
const { spawn, exec } = require('child_process')
const http   = require('http')
const path   = require('path')
const fs     = require('fs')

// ─── Paths ────────────────────────────────────────────────────────────────

function vendorDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'vendor')
    : path.join(__dirname, 'vendor')
}
function wetraceExe() { return path.join(vendorDir(), 'wetrace.exe') }

const WETRACE_PORT = 5200

// ─── Window ───────────────────────────────────────────────────────────────

let mainWindow    = null
let wetraceProcess = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  760,
    height: 560,
    minWidth:  680,
    minHeight: 480,
    title: 'WeTrace Key Extractor',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.setMenuBarVisibility(false)

  mainWindow.on('closed', () => {
    stopWetrace()
    mainWindow = null
  })
}

function sendToWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.setAppUserModelId('com.tyolab.wetrace-wrapper')
  createWindow()
})

app.on('window-all-closed', () => {
  stopWetrace()
  app.quit()
})

app.on('before-quit', () => stopWetrace())

// ─── Wetrace process ──────────────────────────────────────────────────────

function stopWetrace() {
  if (wetraceProcess) {
    try { wetraceProcess.kill() } catch (_) {}
    wetraceProcess = null
  }
}

async function startWetrace() {
  const exe = wetraceExe()
  if (!fs.existsSync(exe)) {
    return { ok: false, error: `wetrace.exe not found at ${exe}` }
  }

  // Already running?
  try { await apiCall('GET', '/', null, 1000); return { ok: true } } catch (_) {}

  stopWetrace()

  return new Promise((resolve) => {
    wetraceProcess = spawn(exe, [], {
      cwd: vendorDir(),
      windowsHide: true,
      env: { ...process.env, NO_BROWSER: '1' },
    })

    wetraceProcess.stdout?.on('data', (data) => {
      data.toString().split('\n').forEach(line => {
        if (line.trim()) sendToWindow('wetrace-log', line.trim())
      })
    })
    wetraceProcess.stderr?.on('data', (data) => {
      data.toString().split('\n').forEach(line => {
        if (line.trim()) sendToWindow('wetrace-log', '[ERR] ' + line.trim())
      })
    })
    wetraceProcess.on('exit', (code) => {
      sendToWindow('wetrace-log', `[wetrace exited: ${code}]`)
      wetraceProcess = null
    })

    let attempts = 0
    const poll = setInterval(async () => {
      attempts++
      try {
        await apiCall('GET', '/')
        clearInterval(poll)
        resolve({ ok: true })
      } catch (_) {
        if (attempts >= 20) {
          clearInterval(poll)
          resolve({ ok: false, error: 'wetrace did not start in time' })
        }
      }
    }, 500)
  })
}

// ─── WeChat detection ─────────────────────────────────────────────────────

async function findWechatExe() {
  const { promisify } = require('util')
  const execAsync = promisify(exec)
  const os = require('os')

  const regKeys = [
    'HKCU\\Software\\Tencent\\WeChat',
    'HKLM\\SOFTWARE\\WOW6432Node\\Tencent\\WeChat',
    'HKLM\\SOFTWARE\\Tencent\\WeChat',
    'HKCU\\Software\\Tencent\\Weixin',
    'HKLM\\SOFTWARE\\WOW6432Node\\Tencent\\Weixin',
    'HKLM\\SOFTWARE\\Tencent\\Weixin',
  ]
  for (const key of regKeys) {
    try {
      const { stdout } = await execAsync(`reg query "${key}" /v InstallPath`)
      const m = stdout.match(/InstallPath\s+REG_SZ\s+(.+)/)
      if (m) {
        const dir = m[1].trim()
        for (const exe of [path.join(dir, 'Weixin.exe'), path.join(dir, 'WeChat.exe')]) {
          if (fs.existsSync(exe)) return exe
        }
      }
    } catch (_) {}
  }

  const candidates = [
    'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe',
    'C:\\Program Files (x86)\\Tencent\\Weixin\\Weixin.exe',
    path.join(require('os').homedir(), 'AppData', 'Local', 'Tencent', 'Weixin', 'Weixin.exe'),
    'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe',
    'C:\\Program Files (x86)\\Tencent\\WeChat\\WeChat.exe',
    path.join(require('os').homedir(), 'AppData', 'Local', 'Tencent', 'WeChat', 'WeChat.exe'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function findWechatDbPathLocally() {
  const os = require('os')
  const home = os.homedir()
  const roots = [
    path.join(home, 'Documents', 'WeChat Files'),
    path.join(home, 'Documents', 'xwechat_files'),
    path.join(home, 'Documents', 'WeChatFiles'),
  ]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    try {
      for (const entry of fs.readdirSync(root)) {
        const dbStorage = path.join(root, entry, 'db_storage')
        if (fs.existsSync(dbStorage) && fs.statSync(dbStorage).isDirectory()) {
          return dbStorage
        }
      }
    } catch (_) {}
  }
  return null
}

// ─── IPC handlers ─────────────────────────────────────────────────────────

ipcMain.handle('launch-wechat', async () => {
  const exe = await findWechatExe()
  if (!exe) return { ok: false, error: 'WeChat installation not found. Please start WeChat manually.' }
  try {
    spawn(exe, [], { detached: true, windowsHide: false, stdio: 'ignore' }).unref()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('check-wechat', () => new Promise((resolve) => {
  exec('tasklist.exe /NH', (err, stdout) => {
    if (err) return resolve(false)
    const lower = stdout.toLowerCase()
    resolve(lower.includes('weixin.exe') || lower.includes('wechat.exe'))
  })
}))

ipcMain.handle('start-wetrace', () => startWetrace())
ipcMain.handle('stop-wetrace',  () => { stopWetrace(); return { ok: true } })

ipcMain.handle('trigger-key-extraction', async () => {
  try {
    const result = await apiCall('GET', '/api/v1/system/wxkey/db', null, 70000)
    sendToWindow('wetrace-log', `[wxkey] ${JSON.stringify(result).slice(0, 300)}`)

    if (result.success && result.data?.key) {
      const key = result.data.key

      // Try to detect db_path while wetrace is still fresh
      let dbPath = null
      try {
        const pr = await apiCall('GET', '/api/v1/system/detect/db_path', null, 10000)
        if (pr.success && pr.data?.path) {
          dbPath = pr.data.path
          sendToWindow('wetrace-log', `[dbpath] ${dbPath}`)
        }
      } catch (_) {}

      // Fallback: scan local filesystem
      if (!dbPath) dbPath = findWechatDbPathLocally()

      return { ok: true, key, dbPath }
    }
    return { ok: false, error: result.message || result.error?.message || 'Key extraction failed' }
  } catch (e) {
    sendToWindow('wetrace-log', `[wxkey error] ${e.message}`)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('copy-to-clipboard', (_, text) => {
  clipboard.writeText(text)
  return true
})

// ─── HTTP helper ──────────────────────────────────────────────────────────

function apiCall(method, apiPath, body = null, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null
    const opts = {
      hostname: '127.0.0.1', port: WETRACE_PORT, path: apiPath, method,
      headers: {
        ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: timeoutMs,
    }
    const req = http.request(opts, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve({ success: false, _raw: data }) }
      })
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
    req.on('error', reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}
