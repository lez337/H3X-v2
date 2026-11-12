'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (name, payload) => ipcRenderer.invoke(name, payload);
contextBridge.exposeInMainWorld('h3x', Object.freeze({
  geocode: (query,refresh=false) => ipcRenderer.invoke('map:geocode',query,refresh),
  telegram: (action,payload) => {if(!['status','restore','begin','beginQr','verify','send','replies','logout'].includes(action))return Promise.reject(new Error('Unknown Telegram action.'));return call('telegram:'+action,payload)},
  stealerTree: payload => call('oath:tree',payload),
  exportSearch: payload => call('search:export',payload), openBotReplies: () => call('telegram:openReplies'),
  logs: () => call('logs:list'), exportLogs: () => call('logs:export'), prepareEvidence: payload => call('evidence:prepare',payload), importCase: payload => call('case:import',payload), openExports: () => call('exports:open'),
  load: () => call('state:load'), save: state => call('state:save', state),
  credentials: () => call('secrets:status'), setCredential: (name, value) => call('secrets:set', {name,value}),
  searchBatch: payload => call('search:batch', payload), search: payload => call('search:run', payload), scanFile: payload => call('file:scan', payload),
  cancelFileScan: () => call('file:cancel'),
  onFileProgress: callback => {const listener=(_,progress)=>callback(progress);ipcRenderer.on('file:progress',listener);return ()=>ipcRenderer.removeListener('file:progress',listener)},
  exportCase: payload => call('case:export', payload), openExternal: url => call('external:open', url),
  clipboard: value => call('clipboard:write', value),
  updateStatus: () => call('updates:status'), configureUpdates: value => call('updates:configure', value),
  checkUpdates: () => call('updates:check'), installUpdate: () => call('updates:install'),
  checkTool: payload => call('tool:check', payload), runGhunt: payload => call('tool:ghunt', payload)
}));
