'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
let checked = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'data', '.git'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.js$/.test(file)) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); checked++; }
    else if (/\.html$/.test(file)) {
      const html = fs.readFileSync(file, 'utf8');
      for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (script[1].trim()) new vm.Script(script[1], { filename: file });
      for (const match of html.matchAll(/(?:src|href)="(assets\/[^"?]+)(?:\?[^" ]*)?"/g)) if (!fs.existsSync(path.join(root, match[1]))) throw new Error(`Missing asset: ${match[1]}`);
      checked++;
    }
  }
}
walk(root);
const examples = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const line of examples.split('\n')) if (/^(SERPER_API_KEY|EBAY_CLIENT_SECRET|TELEGRAM_BOT_TOKEN|REVIEWS_SECRET|REVIEWS_ADMIN_PASSWORD)=.+/.test(line)) throw new Error('Secret placeholder must be empty');
console.log(`Syntax and local asset checks passed (${checked} files). No bundling or TypeScript compilation required.`);
