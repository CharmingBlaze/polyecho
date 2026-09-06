const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('polyechoDesktop', {
  isDesktop: true,
  platform: process.platform,
  setTitle: (title) => ipcRenderer.invoke('desktop:setTitle', title),
  saveFile: (payload) => ipcRenderer.invoke('desktop:saveFile', payload),
  writeFile: (payload) => ipcRenderer.invoke('desktop:writeFile', payload),
  openFile: (payload) => ipcRenderer.invoke('desktop:openFile', payload),
  unsavedClose: () => ipcRenderer.invoke('desktop:unsavedClose'),
  allowClose: () => ipcRenderer.invoke('desktop:allowClose'),
  cancelClose: () => ipcRenderer.invoke('desktop:cancelClose'),
  onCloseRequest: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('desktop:closeRequest', listener)
    return () => ipcRenderer.removeListener('desktop:closeRequest', listener)
  },
  listRecent: () => ipcRenderer.invoke('desktop:listRecent'),
  addRecent: (filePath) => ipcRenderer.invoke('desktop:addRecent', filePath),
  openPath: (filePath) => ipcRenderer.invoke('desktop:openPath', filePath),
  getLaunchPath: () => ipcRenderer.invoke('desktop:getLaunchPath'),
  logCrash: (payload) => ipcRenderer.invoke('desktop:logCrash', payload),
  revealCrashLog: () => ipcRenderer.invoke('desktop:revealCrashLog'),
  showAbout: () => ipcRenderer.invoke('desktop:showAbout'),
  requestQuit: () => ipcRenderer.invoke('desktop:requestQuit'),
  revealInFolder: (filePath) => ipcRenderer.invoke('desktop:revealInFolder', filePath),
  onOpenExternal: (callback) => {
    const listener = (_event, filePath) => {
      if (typeof filePath === 'string') callback(filePath)
    }
    ipcRenderer.on('desktop:openExternal', listener)
    return () => ipcRenderer.removeListener('desktop:openExternal', listener)
  }
})
