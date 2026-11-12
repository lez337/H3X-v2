export {};
declare global { interface Window { h3x: {
  geocode:(query:string,refresh?:boolean)=>Promise<{lat:number;lng:number;label:string}|null>;
  telegram:(action:'status'|'restore'|'begin'|'beginQr'|'verify'|'send'|'replies'|'logout',payload?:any)=>Promise<any>;
  stealerTree:(payload:{logId:string})=>Promise<any>;
  exportSearch:(payload:any)=>Promise<boolean>; openBotReplies:()=>Promise<boolean>;
  logs:()=>Promise<any[]>; exportLogs:()=>Promise<boolean>; prepareEvidence:(p:any)=>Promise<any>; importCase:(p:any)=>Promise<any>; openExports:()=>Promise<void>;
  load:()=>Promise<any>; save:(state:any)=>Promise<boolean>; credentials:()=>Promise<{oathnet:boolean}>; setCredential:(name:string,value:string)=>Promise<boolean>;
  searchBatch:(p:any)=>Promise<any>; search:(p:any)=>Promise<any>; scanFile:(p:any)=>Promise<import('./FileSearcher').ScanResult|null>;
  cancelFileScan:()=>Promise<boolean>; onFileProgress:(callback:(progress:import('./FileSearcher').ScanProgress)=>void)=>()=>void;
  exportCase:(p:any)=>Promise<boolean>; openExternal:(url:string)=>Promise<boolean>;
  clipboard:(value:string)=>Promise<boolean>; checkTool:(p:any)=>Promise<boolean>; runGhunt:(p:any)=>Promise<string>;
  updateStatus:()=>Promise<any>; configureUpdates:(value:{repository:string;enabled:boolean})=>Promise<any>; checkUpdates:()=>Promise<any>; installUpdate:()=>Promise<boolean>;
}}}
