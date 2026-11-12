'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { version } = require('../package.json');
const folder = path.join(__dirname, '../release');
const names = [`H3X-Searcher-Setup-${version}-x64.exe`, `H3X-Setup-${version}.exe`, 'H3X-Setup.exe'];
const lines = names.map(name => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex');
  return `${hash}  ${name}\n`;
});
fs.writeFileSync(path.join(folder, 'SHA256SUMS.txt'), lines.join(''));
console.log('Installers and SHA256SUMS.txt are ready in release/.');
