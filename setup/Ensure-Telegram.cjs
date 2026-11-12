'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const packages={telegram:'^2.26.8',qrcode:'^1.5.4'};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const missing=Object.keys(packages).filter(name=>{
 try{require.resolve(name,{paths:[root]});return !manifest.dependencies?.[name]}catch{return true}
});
if(!missing.length)process.exit(0);
if(process.argv.includes('--check')){
 console.error('Missing Telegram libraries: '+missing.join(', '));process.exit(1);
}
const npmCli=process.env.npm_execpath;
if(!npmCli||!fs.existsSync(npmCli)){
 console.error('Run npm run telegram:ensure so npm can install the Telegram libraries.');process.exit(1);
}
console.log('Downloading required Telegram libraries: '+missing.join(', '));
const result=spawnSync(process.execPath,[npmCli,'install',...missing.map(name=>name+'@'+packages[name]),'--save','--fetch-retries=0','--fetch-timeout=20000'],{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error||result.status!==0){
 console.error('Could not download Telegram libraries. Check your connection to registry.npmjs.org, then retry starting or building the app.');process.exit(1);
}
for(const name of Object.keys(packages)){
 try{require.resolve(name,{paths:[root]})}catch{console.error('Installation did not provide '+name+'.');process.exit(1)}
}
console.log('Telegram libraries are ready.');
