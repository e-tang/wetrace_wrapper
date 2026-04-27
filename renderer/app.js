// ─── State ────────────────────────────────────────────────────────────────

const state = {
  currentStep: 0,
  steps: [
    { id: 'wechat',  title: 'Start WeChat',          subtitle: 'Waiting for WeChat…',  status: 'active' },
    { id: 'logout',  title: 'Log out of WeChat',      subtitle: 'Confirm when done',     status: 'pending' },
    { id: 'extract', title: 'Extract encryption key', subtitle: 'Log in within 1 min',  status: 'pending' },
    { id: 'done',    title: 'Copy your key',          subtitle: 'Key ready to use',      status: 'pending' },
  ],
  extractedKey:     null,
  dbPath:           null,
  extractionError:  null,   // set on API error (distinct from timer running out)
  wetraceReady:     false,  // true once wetrace health check passes
  logLines:         [],
  logVisible:       false,
  timerInterval:    null,
  timerSeconds:     60,
  wechatPollInterval: null,
}

// ─── Step management ──────────────────────────────────────────────────────

function setStepStatus(index, status) {
  state.steps[index].status = status
  renderSidebar()
}

function advanceTo(index) {
  for (let i = 0; i < index; i++) {
    if (state.steps[i].status !== 'error') state.steps[i].status = 'complete'
  }
  state.steps[index].status = 'active'
  state.currentStep = index
  renderSidebar()
  renderContent()
}

// ─── Sidebar ──────────────────────────────────────────────────────────────

function renderSidebar() {
  const sidebar = document.getElementById('stepsSidebar')
  const icons = { pending: '○', active: '▶', complete: '✓', error: '✕' }
  sidebar.innerHTML = state.steps.map((step, i) => `
    <div class="step-item ${step.status}">
      <div class="step-bullet">${icons[step.status]}</div>
      <div class="step-info">
        <div class="step-title">${step.title}</div>
        <div class="step-subtitle">${step.subtitle}</div>
      </div>
    </div>
  `).join('')
}

// ─── Content ──────────────────────────────────────────────────────────────

function renderContent() {
  const panel = document.getElementById('stepContent')
  const renderers = [renderStep0, renderStep1, renderStep2, renderStep3]
  panel.innerHTML = renderers[state.currentStep]()
  attachHandlers()
}

// Step 0 — Wait for WeChat
function renderStep0() {
  return `
    <h2>Start WeChat</h2>
    <p class="desc">Launch WeChat on this computer. We'll detect it automatically and move to the next step.</p>
    <button class="btn btn-primary" id="btnLaunchWechat">Launch WeChat</button>
    <div class="status-pill detecting" id="wechatPill" style="margin-top:16px">
      <span class="dot"></span> Waiting for WeChat to start…
    </div>
    <div id="launchError" class="error-box" style="display:none;margin-top:12px"></div>
    <p class="desc" style="font-size:12px;margin-top:12px;">Or start WeChat manually — we'll detect it automatically.</p>
  `
}

// Step 1 — Logout
function renderStep1() {
  return `
    <h2>Log out of WeChat</h2>
    <p class="desc">
      We need WeChat to be at the login screen so we can capture the encryption key the moment you sign in.
      If WeChat is already showing a <strong>QR code</strong> or a <strong>"Log in" button</strong>, you're all set.
    </p>
    <div class="instruction-card">
      <strong>If you are currently logged in to WeChat:</strong><br><br>
      <span class="step-num">1</span> Click the <strong>profile / avatar icon</strong> in the bottom-left corner<br>
      <span class="step-num">2</span> Go to <strong>Settings → My Account → Log out</strong><br>
      <span class="step-num">3</span> Confirm the log out<br><br>
      ✅ &nbsp;You should now see a <strong>QR code</strong> or your account avatar with a <strong>"Log in" button</strong>.
    </div>
    <button class="btn btn-primary" id="btnLoggedOut">I can see the login screen — Continue ✓</button>
  `
}

// Step 2 — Key extraction
function renderStep2() {
  const timerClass = state.timerSeconds <= 30 ? 'urgent' : ''
  const mm = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0')
  const ss = String(state.timerSeconds % 60).padStart(2, '0')

  const keyFoundHtml = state.extractedKey ? `
    <div class="key-found">
      <span class="icon">🔑</span>
      <div>
        <div class="label">Key Found!</div>
        <div class="key-value">${state.extractedKey}</div>
      </div>
    </div>
  ` : ''

  const timerHtml = !state.extractedKey ? `
    <div class="timer-wrap">
      <div class="timer ${timerClass}" id="countdown">${mm}:${ss}</div>
      <div class="timer-hint">WeChat will restart — log in before the timer runs out</div>
    </div>
  ` : ''

  const buttonHtml = !state.extractedKey && state.timerSeconds > 0 && !state.extractionError
    ? state.wetraceReady
      ? `<button class="btn btn-primary" id="btnStartExtract">▶ Start — I'm ready to log in</button>`
      : `<button class="btn btn-primary" disabled>Starting background service…</button>`
    : ''

  // Timer ran out naturally (no API error)
  const retryHtml = (!state.extractedKey && state.timerSeconds <= 0 && !state.extractionError) ? `
    <div class="error-box">Time ran out. Log in to WeChat faster next time, or click Retry.</div>
    <button class="btn btn-secondary" style="margin-top:12px" id="btnRetryExtract">↺ Retry</button>
  ` : ''

  // API returned an error (connection refused, wetrace not running, etc.)
  const errorHtml = (state.extractionError && !state.extractedKey) ? `
    <div class="error-box">${escHtml(state.extractionError)}</div>
    <button class="btn btn-secondary" style="margin-top:12px" id="btnRetryExtract">↺ Retry</button>
  ` : ''

  const readyNote = !state.extractedKey && state.timerSeconds > 0 && !state.extractionError ? `
    <div class="instruction-card" style="margin-top:14px;font-size:13px;">
      <strong>What happens when you click Start:</strong><br><br>
      WeChat may open a login window — <strong>that is expected</strong>. Sign in as normal
      and the key will be captured automatically.
    </div>
  ` : ''

  return `
    <h2>Extract Encryption Key</h2>
    <p class="desc">Click the button below, then log in to WeChat. We'll capture the key the moment you sign in.</p>
    ${keyFoundHtml}
    ${timerHtml}
    ${buttonHtml}
    ${readyNote}
    ${retryHtml}
    ${errorHtml}
    <div class="log-section">
      <button class="log-toggle ${state.logVisible ? 'open' : ''}" id="btnLogToggle">
        <span class="chevron">▶</span> Show background log
      </button>
      <div class="log-box ${state.logVisible ? 'visible' : ''}" id="logBox">
        ${state.logLines.map(formatLogLine).join('\n')}
      </div>
    </div>
  `
}

// Step 3 — Copy Key
function renderStep3() {
  if (state.steps[3].status === 'error') {
    return `
      <h2>Extraction Failed</h2>
      <div class="error-box">${escHtml(state.stepError || 'Key extraction failed.')}</div>
      <button class="btn btn-secondary" style="margin-top:16px" id="btnBackToExtract">← Try Again</button>
      <div class="log-section" style="margin-top:16px">
        <button class="log-toggle open" id="btnLogToggle">
          <span class="chevron">▶</span> Debug log
        </button>
        <div class="log-box visible" id="logBox">
          ${state.logLines.map(formatLogLine).join('\n')}
        </div>
      </div>
    `
  }

  const dbPathHtml = state.dbPath ? `
    <div class="field-label">Database path</div>
    <div class="copy-row">
      <div class="value-box">${escHtml(state.dbPath)}</div>
      <button class="btn btn-secondary btn-copy" id="btnCopyPath" data-value="${escHtml(state.dbPath)}">Copy</button>
    </div>
  ` : `<p class="desc" style="margin-top:8px;font-size:12px">Database path not detected automatically.</p>`

  return `
    <h2>✓ Key Extracted</h2>
    <p class="desc">Your WeChat encryption key has been captured. Copy it to use with other tools.</p>

    <div class="field-label">Encryption key</div>
    <div class="copy-row">
      <div class="value-box mono">${escHtml(state.extractedKey)}</div>
      <button class="btn btn-primary btn-copy" id="btnCopyKey" data-value="${escHtml(state.extractedKey)}">
        Copy Key
      </button>
    </div>
    <div id="copyFeedback" class="copy-feedback" style="display:none"></div>

    <div style="margin-top:24px">
      ${dbPathHtml}
    </div>

    <p class="desc" style="margin-top:28px;font-size:12px">You can close this window when done.</p>
  `
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatLogLine(line) {
  let cls = 'log-line'
  if (line.includes('SUCCESS') || line.includes('成功')) cls += ' success'
  else if (line.includes('[ERR]') || line.includes('error') || line.includes('失败')) cls += ' error'
  try {
    const obj = JSON.parse(line)
    const msg = obj.message || line
    if (obj.level === 'error') cls += ' error'
    return `<div class="${cls}">${escHtml(msg)}</div>`
  } catch (_) {
    return `<div class="${cls}">${escHtml(line)}</div>`
  }
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function appendLog(line) {
  state.logLines.push(line)
  const box = document.getElementById('logBox')
  if (box) {
    box.innerHTML = state.logLines.map(formatLogLine).join('\n')
    box.scrollTop = box.scrollHeight
  }
}

// ─── Event handlers ────────────────────────────────────────────────────────

function attachHandlers() {
  const $ = id => document.getElementById(id)

  // Step 0
  const btnLaunch = $('btnLaunchWechat')
  if (btnLaunch) {
    btnLaunch.onclick = async () => {
      btnLaunch.disabled = true
      btnLaunch.textContent = 'Launching…'
      const res = await window.api.launchWechat()
      if (!res.ok) {
        const errEl = $('launchError')
        if (errEl) { errEl.textContent = res.error; errEl.style.display = '' }
        btnLaunch.disabled = false
        btnLaunch.textContent = 'Launch WeChat'
      }
    }
  }

  // Step 1
  const btnLoggedOut = $('btnLoggedOut')
  if (btnLoggedOut) btnLoggedOut.onclick = () => beginExtraction()

  // Step 2
  const btnStart = $('btnStartExtract')
  if (btnStart) btnStart.onclick = () => runExtraction()

  const btnRetry = $('btnRetryExtract')
  if (btnRetry) btnRetry.onclick = () => {
    state.timerSeconds    = 60
    state.extractedKey    = null
    state.extractionError = null
    renderContent()
    runExtraction()
  }

  const btnLogToggle = $('btnLogToggle')
  if (btnLogToggle) btnLogToggle.onclick = () => {
    state.logVisible = !state.logVisible
    btnLogToggle.classList.toggle('open', state.logVisible)
    const box = $('logBox')
    if (box) box.classList.toggle('visible', state.logVisible)
  }

  const btnBack = $('btnBackToExtract')
  if (btnBack) btnBack.onclick = () => {
    state.timerSeconds    = 60
    state.extractedKey    = null
    state.extractionError = null
    advanceTo(2)
  }

  // Step 3 — copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.onclick = async () => {
      const value = btn.getAttribute('data-value')
      await window.api.copyToClipboard(value)
      const origText = btn.textContent
      btn.textContent = 'Copied!'
      btn.classList.add('copied')
      const feedback = $('copyFeedback')
      if (feedback) {
        feedback.textContent = '✓ Copied to clipboard'
        feedback.style.display = ''
        setTimeout(() => { feedback.style.display = 'none' }, 2000)
      }
      setTimeout(() => {
        btn.textContent = origText
        btn.classList.remove('copied')
      }, 2000)
    }
  })
}

// ─── Step logic ───────────────────────────────────────────────────────────

async function startWechatPolling() {
  renderSidebar()
  renderContent()
  state.wechatPollInterval = setInterval(async () => {
    const found = await window.api.checkWechat()
    if (found) {
      clearInterval(state.wechatPollInterval)
      state.wechatPollInterval = null
      advanceTo(1)
    }
  }, 2000)
}

async function beginExtraction() {
  state.wetraceReady = false
  advanceTo(2)   // renders step 2 with disabled "Starting…" button
  appendLog('Starting wetrace backend…')
  const res = await window.api.startWetrace()
  if (!res.ok) {
    state.stepError = res.error
    appendLog('[ERR] ' + res.error)
    setStepStatus(2, 'error')
    renderContent()
    return
  }
  state.wetraceReady = true
  appendLog('wetrace is ready.')
  renderContent()  // re-renders with active Start button
}

async function runExtraction() {
  const btn = document.getElementById('btnStartExtract')
  if (btn) btn.disabled = true
  startCountdown()
  appendLog('Calling key extraction API… Please log in to WeChat now.')

  const res = await window.api.triggerKeyExtraction()
  stopCountdown()

  if (res.ok && res.key) {
    state.extractedKey = res.key
    state.dbPath       = res.dbPath || null
    appendLog('Key captured.')
    state.steps[2].status = 'complete'
    advanceTo(3)
  } else if (state.timerSeconds <= 0) {
    // Natural timeout — timer already at 0, just re-render to show retry
    appendLog('[ERR] ' + (res.error || 'Key extraction timed out'))
    renderContent()
  } else {
    // API returned an error before the timer ran out (e.g. wetrace not running)
    state.extractionError = res.error || 'Key extraction failed'
    appendLog('[ERR] ' + state.extractionError)
    renderContent()
  }
}

function startCountdown() {
  state.timerSeconds = 60
  state.timerInterval = setInterval(() => {
    state.timerSeconds = Math.max(0, state.timerSeconds - 1)
    const el = document.getElementById('countdown')
    if (el) {
      const mm = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0')
      const ss = String(state.timerSeconds % 60).padStart(2, '0')
      el.textContent = `${mm}:${ss}`
      el.className = 'timer' + (state.timerSeconds <= 30 ? ' urgent' : '')
    }
  }, 1000)
}

function stopCountdown() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null }
}

// ─── Boot ─────────────────────────────────────────────────────────────────

window.api.onLog(line => appendLog(line))
startWechatPolling()
