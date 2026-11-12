'use strict';
const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell,clipboard}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');

const providers=require('./providers.cjs');
const investigation=require('./investigation.cjs');
const publicProviders=require('./public-providers.cjs');
const geocode=require('./geocoding.cjs').createGeocoder();
ipcMain.handle('map:geocode',(_,query,refresh)=>geocode(query,refresh===true));
const {createActivity}=require('./activity.cjs');
let activity;
function activityStore(){return activity||(activity=createActivity(app.getPath('userData')))}
async function log(event,detail='',meta={}){try{await activityStore().add(event,detail,meta)}catch(e){console.error('Activity log write failed:',e.code||'unknown')}}
const registerHandler=ipcMain.handle.bind(ipcMain);
const quietChannels=new Set(['logs:list','logs:export','state:load','state:save','secrets:status','telegram:status','telegram:replies','updates:status','tool:check','evidence:prepare','clipboard:write']);
ipcMain.handle=(channel,handler)=>registerHandler(channel,async(...args)=>{
 const started=Date.now(),scope=channel.split(':')[0],action=channel.replace(':',' / ');
 try{const result=await handler(...args);if(!quietChannels.has(channel)&&!channel.startsWith('search:'))await log(action+' completed','',{scope,durationMs:Date.now()-started});return result}
 catch(e){if(!channel.startsWith('search:'))await log(action+' failed',e.message||'Operation failed',{level:'error',scope,durationMs:Date.now()-started});throw e}
});
ipcMain.handle('logs:list',()=>activityStore().list());
ipcMain.handle('logs:export',async()=>{const entries=await activityStore().list();const {filePath,canceled}=await dialog.showSaveDialog(mainWindow,{title:'Export activity log',defaultPath:'H3X-activity.jsonl',filters:[{name:'JSON Lines',extensions:['jsonl']}]});if(canceled||!filePath)return false;await fs.writeFile(filePath,entries.map(e=>JSON.stringify(e)).join('\n')+'\n','utf8');return true});
ipcMain.handle('evidence:prepare',(_,payload)=>investigation.prepare(payload.fields,payload.excluded,payload.current));
ipcMain.handle('exports:open',async()=>{await fs.mkdir(userFile('exports'),{recursive:true});await shell.openPath(userFile('exports'))});
const DEV_URL='http://127.0.0.1:5173';
const blank=()=>({version:1,cases:[],pins:[],links:[],shortcuts:[],bots:[],settings:{oathFamily:'both',pageSize:20,brixField:'auto',flexible:false,redaction:true,ghuntPath:'',spiderfootUrl:'http://127.0.0.1:5001'}});
let mainWindow;
function userFile(name){return path.join(app.getPath('userData'),name)}
const {TelegramConnection}=require('./telegram.cjs');
const telegram=new TelegramConnection({
 read:async()=>{try{const bytes=await fs.readFile(userFile('telegram.dpapi'));if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');return JSON.parse(safeStorage.decryptString(bytes))}catch(e){if(e.code==='ENOENT')return null;throw e}},
 write:async value=>{if(!value){await fs.rm(userFile('telegram.dpapi'),{force:true});return}if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');await fs.mkdir(app.getPath('userData'),{recursive:true});const target=userFile('telegram.dpapi'),temp=target+'.tmp';await fs.writeFile(temp,safeStorage.encryptString(JSON.stringify(value)));await fs.rename(temp,target)}
});
for(const action of ['status','restore','begin','beginQr','verify','send','replies','logout'])ipcMain.handle('telegram:'+action,async(_,payload)=>{
 try{return await telegram[action](payload||{})}catch(e){
  if(e.code==='MODULE_NOT_FOUND')throw Error('Telegram dependency is missing. Run npm run telegram:install and restart the app.');
  if(e.errorMessage){const code=String(e.errorMessage);const messages={PHONE_CODE_INVALID:'Incorrect Telegram login code.',PHONE_CODE_EXPIRED:'Login code expired. Request a new code.',PASSWORD_HASH_INVALID:'Incorrect two-step verification password.',API_ID_INVALID:'Telegram rejected the API ID or hash.',PHONE_NUMBER_INVALID:'Telegram rejected the phone number.',USERNAME_NOT_OCCUPIED:'No Telegram account has this username.',USERNAME_INVALID:'Invalid bot username.',AUTH_KEY_UNREGISTERED:'Telegram session expired. Sign in again.'};throw Error(messages[code]||(/^FLOOD_WAIT/.test(code)?'Telegram rate limit reached. Wait before retrying.':'Telegram rejected the request ('+code.replace(/[^A-Z0-9_]/g,'').slice(0,60)+').'))}
  throw Error(String(e.message||'Telegram connection failed.').replace(/\+\d{7,15}/g,'[phone]').slice(0,200));
 }
});
app.on('before-quit',()=>{telegram.cancelQr();telegram.client?.disconnect().catch(()=>{})});
async function readJson(name,fallback){try{return JSON.parse(await fs.readFile(userFile(name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw e}}
async function writeJson(name,value){const file=userFile(name),tmp=file+'.'+crypto.randomUUID()+'.tmp';await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(tmp,JSON.stringify(value,null,2),'utf8');await fs.rename(tmp,file)}
function validateState(s){if(!s||typeof s!=='object')throw new Error('Invalid workspace.');const out=blank();for(const k of ['cases','pins','links','shortcuts','bots']){if(!Array.isArray(s[k])||s[k].length>1000)throw new Error(`Invalid ${k} list.`);out[k]=s[k]}if(!s.settings||typeof s.settings!=='object')throw new Error('Invalid settings.');out.settings={...out.settings,...s.settings};if(Buffer.byteLength(JSON.stringify(out))>8*1024*1024)throw new Error('Workspace exceeds 8 MB.');return out}
async function secrets(){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows credential encryption is unavailable.');let data;try{data=await fs.readFile(userFile('secrets.dpapi'))}catch(e){if(e.code==='ENOENT')return {};throw e}return JSON.parse(safeStorage.decryptString(data))}
async function createWindow(){mainWindow=new BrowserWindow({width:1500,height:950,minWidth:1050,minHeight:700,backgroundColor:'#050506',title:'H3X Searcher',icon:path.join(__dirname,'../build/icon.ico'),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});// Identify the desktop app to the tile service; Chromium retains its normal HTTP cache.
mainWindow.webContents.session.webRequest.onBeforeSendHeaders({urls:['https://tile.openstreetmap.org/*']},(details,callback)=>{
 callback({requestHeaders:{...details.requestHeaders,'User-Agent':'H3X-Searcher/'+app.getVersion()}});
});
mainWindow.setMenu(null);mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));mainWindow.webContents.on('will-navigate',e=>e.preventDefault());if(!app.isPackaged)await mainWindow.loadURL(DEV_URL);else await mainWindow.loadFile(path.join(__dirname,'../dist/index.html'));}
app.whenReady().then(async()=>{require('./updates.cjs').setupUpdates({app,ipcMain,net:require('electron').net});await log('Application started','Version '+app.getVersion(),{scope:'app'});await createWindow();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
ipcMain.handle('state:load',async()=>{const state=validateState(await readJson('workspace.json',blank()));state.cases=state.cases.map(investigation.hydrateRecord);return state});
ipcMain.handle('state:save',async(_,state)=>{const valid=validateState(state);await writeJson('workspace.json',valid);if(valid.settings.autoExport){await fs.mkdir(userFile('exports'),{recursive:true});for(const record of valid.cases)await fs.writeFile(path.join(userFile('exports'),String(record.id).replace(/[^a-z0-9_-]/gi,'_')+'.txt'),investigation.textReport(record,valid.settings.excludedFields,valid.settings),'utf8');await log('Automatic export completed',`${valid.cases.length} TXT investigations`)}await log('Workspace saved',`${valid.cases.length} investigations`);return true});
ipcMain.handle('secrets:status',async()=>{const s=await secrets();return {oathnet:Boolean(s.oathnet)}});
ipcMain.handle('secrets:set',async(_,{name,value})=>{if(name!=='oathnet')throw new Error('Unknown credential.');if(typeof value!=='string'||value.length>1024)throw new Error('Invalid key.');const s=await secrets();if(value.trim())s[name]=value.trim();else delete s[name];await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.writeFile(userFile('secrets.dpapi'),safeStorage.encryptString(JSON.stringify(s)));return true});
async function searchProvider(payload){const provider=String(payload.provider||'');const opts={query:String(payload.query||''),settings:payload.settings||{}};const started=Date.now();await log('Search started',provider,{scope:provider});try{let result;if(provider==='oathnet')result=await providers.searchOath(opts,(await secrets()).oathnet);else if(provider==='oathProfile')result=await require('./oath-profiles.cjs').searchProfile({...opts,profileKind:payload.profileKind,parameter:payload.parameter},(await secrets()).oathnet);else if(provider==='brixhub')result=await providers.searchBrix(opts);else if(provider==='github')result=await providers.searchGithub(opts);else if(provider==='rdap')result=await providers.searchRdap(opts);else if(provider==='whatsmyname')result=await publicProviders.searchWhatsMyName(opts);else if(provider==='ghunt')result=await publicProviders.searchGhunt(opts);else if(provider==='telegram'){const workspace=validateState(await readJson('workspace.json',blank()));result=await publicProviders.searchTelegram({...opts,bots:workspace.bots},telegram)}else throw new Error('Unknown provider.');await log('Search completed',`${provider}: ${result.items.length} records`,{scope:provider,durationMs:Date.now()-started});if(result.notice)await log('Provider status',result.notice,{scope:provider,level:'warning'});return result}catch(e){await log('Search failed',e.message,{scope:provider,level:'error',durationMs:Date.now()-started});throw e}}
ipcMain.handle('search:run',(_,payload)=>searchProvider(payload));
ipcMain.handle('search:batch',(_,payload)=>require('./search-workflow.cjs').searchWorkflow(payload,searchProvider));
ipcMain.handle('external:open',async(_,value)=>{const u=new URL(String(value));if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error('Invalid external URL.');await shell.openExternal(u.href);return true});
ipcMain.handle('clipboard:write',(_,value)=>{clipboard.writeText(String(value).slice(0,1000));return true});
ipcMain.handle('case:export',async(_,{record,excluded})=>{if(!record||typeof record!=='object')throw new Error('Invalid record.');const {filePath,canceled}=await dialog.showSaveDialog(mainWindow,{title:'Export investigation text',defaultPath:`H3X-${String(record.title||'case').replace(/[^a-z0-9_-]/gi,'_').slice(0,40)}.txt`,filters:[{name:'Text investigation',extensions:['txt']}]});if(canceled||!filePath)return false;const saved=await readJson('workspace.json',blank());await fs.writeFile(filePath,investigation.textReport(record,excluded,saved.settings),'utf8');await log('Investigation exported','TXT report saved');return true});
ipcMain.handle('case:import',async(_,{excluded}={})=>{const {filePaths,canceled}=await dialog.showOpenDialog(mainWindow,{properties:['openFile'],filters:[{name:'Saved investigation or details',extensions:['txt','json']}]});if(canceled||!filePaths.length)return null;if((await fs.stat(filePaths[0])).size>8*1024*1024)throw new Error('Import exceeds 8 MB.');const text=(await fs.readFile(filePaths[0],'utf8')).replace(/^\uFEFF/,'');let imported;if(path.extname(filePaths[0]).toLowerCase()==='.json'){const data=JSON.parse(text);imported=Array.isArray(data.people)?{record:data}: {fields:investigation.clean(data,excluded)}}else imported=investigation.parseText(text,excluded);await log('Import completed',imported.record?'Investigation loaded':'Details loaded');return imported});
require('./file-scan-ipc.cjs').registerFileScanner({ipcMain,dialog,getWindow:()=>mainWindow,log});
ipcMain.handle('tool:check',async(_,{path:toolPath})=>{if(!toolPath)return false;try{const s=await fs.stat(toolPath);return s.isFile()}catch{return false}});
ipcMain.handle('tool:ghunt',async(_,{toolPath,query})=>{const result=await publicProviders.searchGhunt({query,settings:{ghuntPath:toolPath}});return result.items.map(item=>item.fields.output).join('\n')});
ipcMain.handle('telegram:openReplies',async()=>{await fs.mkdir(userFile('bot-replies'),{recursive:true});await shell.openPath(userFile('bot-replies'));return true});
ipcMain.handle('search:export',async(_,{items})=>{if(!Array.isArray(items)||Buffer.byteLength(JSON.stringify(items))>2*1024*1024)throw Error('Invalid search results.');const {filePath,canceled}=await dialog.showSaveDialog(mainWindow,{title:'Export search results',defaultPath:'H3X-results.txt',filters:[{name:'Text',extensions:['txt']}]});if(canceled||!filePath)return false;const text=items.map(item=>[String(item.source||'Result'),'-'.repeat(40),...Object.entries(item.fields||{}).map(([key,value])=>key.replace(/_/g,' ')+' : '+(typeof value==='object'?JSON.stringify(value):String(value??'')))].join('\r\n')).join('\r\n\r\n');const saved=await readJson('workspace.json',blank());await fs.writeFile(filePath,investigation.decorateText(text,saved.settings),'utf8');return true});

ipcMain.handle('oath:tree',async(_,payload)=>require('./stealer-tree.cjs').loadRedactedTree(payload?.logId,(await secrets()).oathnet));
