// تشغيل مرة واحدة: يفصل index.html إلى src/index.template.html + src/parts/* (سكربتات وأنماط وبيانات كبيرة)
// بحيث يمكن مراجعتها وتعديلها كملفات منفصلة. scripts/assemble.js يعيد التجميع إلى index.html بنفس البايتات.
const fs = require('fs');
const path = require('path');
const MIN = 1500; // نفصل فقط الأجسام الأكبر من هذا الحجم
let html = fs.readFileSync('index.html', 'utf8');
if (html.includes('{{part:')) throw new Error('index.html يحتوي {{part: أصلاً');
const parts = {};
let n = 0;
const out = html.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attrs, body) => {
  if (body.length < MIN) return all;
  n++;
  const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
  const plain = /type="text\/plain"/.test(attrs);
  const dir = plain ? 'data' : tag === 'script' ? 'js' : 'css';
  const ext = plain ? 'txt' : tag === 'script' ? 'js' : 'css';
  const name = dir + '/' + String(n).padStart(3, '0') + (id ? '-' + id.replace(/[^\w.-]/g, '_') : '') + '.' + ext;
  parts[name] = body;
  return '<' + tag + attrs + '>{{part:' + name + '}}</' + tag + '>';
});
fs.rmSync('src', { recursive: true, force: true });
fs.mkdirSync('src/parts', { recursive: true });
for (const [name, body] of Object.entries(parts)) {
  fs.mkdirSync(path.dirname(path.join('src/parts', name)), { recursive: true });
  fs.writeFileSync(path.join('src/parts', name), body);
}
fs.writeFileSync('src/index.template.html', out);
console.log('parts:', Object.keys(parts).length, ' template bytes:', out.length);
