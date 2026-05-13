const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__START_POS_DESKTOP__', {
  isDesktop: true,
  runtime: 'electron',
  printers: {
    list: () => ipcRenderer.invoke('desktop-printers:list'),
    printHtml: (payload) => ipcRenderer.invoke('desktop-printers:print-html', payload),
    printRaw: (payload) => ipcRenderer.invoke('desktop-printers:print-raw', payload),
  },
});
