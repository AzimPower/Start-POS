const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('__START_POS_DESKTOP__', {
  isDesktop: true,
  runtime: 'electron',
});
