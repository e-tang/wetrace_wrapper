const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  launchWechat:         ()     => ipcRenderer.invoke('launch-wechat'),
  checkWechat:          ()     => ipcRenderer.invoke('check-wechat'),
  startWetrace:         ()     => ipcRenderer.invoke('start-wetrace'),
  stopWetrace:          ()     => ipcRenderer.invoke('stop-wetrace'),
  triggerKeyExtraction: ()     => ipcRenderer.invoke('trigger-key-extraction'),
  copyToClipboard:      (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  onLog: (cb) => {
    const h = (_, line) => cb(line)
    ipcRenderer.on('wetrace-log', h)
    return () => ipcRenderer.removeListener('wetrace-log', h)
  },
})
