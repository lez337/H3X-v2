'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (name, payload) => ipcRenderer.invoke(name, payload);
contextBridge.exposeInMainWorld('h3x', Object.freeze({
  load: () => call('state:load'), save: state => call('state:save', state),
  credentials: () => call('secrets:status'), setCredential: (name, value) => call('secrets:set', {name,value}),
  search: payload => call('search:run', payload), scanFile: payload => call('file:scan', payload),
  exportCase: payload => call('case:export', payload), openExternal: url => call('external:open', url),
  clipboard: value => call('clipboard:write', value),
  checkTool: payload => call('tool:check', payload), runGhunt: payload => call('tool:ghunt', payload)
}));
