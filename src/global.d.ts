export {};
declare global { interface Window { h3x: {
  load:()=>Promise<any>; save:(state:any)=>Promise<boolean>; credentials:()=>Promise<{oathnet:boolean}>; setCredential:(name:string,value:string)=>Promise<boolean>;
  search:(p:any)=>Promise<any>; scanFile:(p:any)=>Promise<any>; exportCase:(p:any)=>Promise<boolean>; openExternal:(url:string)=>Promise<boolean>;
  clipboard:(value:string)=>Promise<boolean>; checkTool:(p:any)=>Promise<boolean>; runGhunt:(p:any)=>Promise<string>;
}}}
