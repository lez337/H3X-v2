'use strict';
const {parentPort,workerData}=require('node:worker_threads');
require('./file-scan.cjs').scanFiles(workerData.files,workerData.options,progress=>parentPort.postMessage({type:'progress',progress})).then(
 result=>parentPort.postMessage({type:'result',result}),
 error=>parentPort.postMessage({type:'error',message:error.message||'File scan failed'})
);
