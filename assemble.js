// يجمّع src/index.template.html + src/parts/* إلى index.html (المصدر الحقيقي للتعديل هو src/).
// node scripts/assemble.js          يكتب index.html
// node scripts/assemble.js --check  يفشل إن كان index.html المحفوظ لا يطابق src/ (يُستخدم في CI)
const fs = require('fs');
const path = require('path');
const tpl = fs.readFileSync('src/index.template.html', 'utf8');
const html = tpl.replace(/\{\{part:([^}]+)\}\}/g, (_, name) => {
  const f = path.join('src/parts', name);
  if (!fs.existsSync(f)) throw new Error('جزء ناقص: ' + f);
  return fs.readFileSync(f, 'utf8');
});
if (process.argv.includes('--check')) {
  const cur = fs.existsSync('index.html') ? fs.readFileSync('index.html', 'utf8') : '';
  if (cur !== html) { console.error('index.html لا يطابق src/. شغّل: node scripts/assemble.js'); process.exit(1); }
  console.log('OK: index.html يطابق src/');
} else {
  fs.writeFileSync('index.html', html);
  console.log('index.html written, bytes:', html.length);
}
