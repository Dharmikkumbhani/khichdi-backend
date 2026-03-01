const webpush = require('web-push');
const fs = require('fs');
const keys = webpush.generateVAPIDKeys();
fs.writeFileSync('keys.json', JSON.stringify(keys));
