const fs = require('fs');
const path = require('path');
const logStream = fs.createWriteStream(path.join(__dirname, 'reconcile_clean.txt'), { flags: 'w', encoding: 'utf8' });

const originalLog = console.log;
console.log = function(...args) {
    const msg = require('util').format(...args);
    logStream.write(msg + '\n');
    originalLog.apply(console, args);
};

require('./backend-api/reconcile.js');
