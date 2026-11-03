/* Android bridge v2: حفظ الفيديو والصور في المعرض، ومشاركة بقية الملفات */
(function(){var C=window.Capacitor;if(!C||!C.isNativePlatform||!C.isNativePlatform())return;
var FS=C.Plugins.Filesystem,SH=C.Plugins.Share,MD=C.Plugins.Media,CH=3*1024*1024,AL='Rassam';
function b64(b){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(String(r.result).split(',')[1]||'')};r.onerror=no;r.readAsDataURL(b)})}
async function album(){var r=await MD.getAlbums(),f=(r.albums||[]).filter(function(a){return a.name===AL})[0];
if(!f){await MD.createAlbum({name:AL});r=await MD.getAlbums();f=(r.albums||[]).filter(function(a){return a.name===AL})[0]}return f&&f.identifier}
async function save(h,name){var blob=await (await fetch(h)).blob(),first=true;
for(var o=0;o<blob.size||first;o+=CH){var d=await b64(blob.slice(o,o+CH));
if(first){await FS.writeFile({path:name,data:d,directory:'CACHE'});first=false}
else await FS.appendFile({path:name,data:d,directory:'CACHE'});if(!blob.size)break}
var u=await FS.getUri({path:name,directory:'CACHE'});
var isV=/\.(mp4|webm|mov|mkv)$/i.test(name)||blob.type.indexOf('video/')===0,isI=/\.(png|jpe?g|webp|gif)$/i.test(name);
if((isV||isI)&&MD){try{var id=await album(),op={path:u.uri,albumIdentifier:id};
if(isV)await MD.saveVideo(op);else await MD.savePhoto(op);
alert('تم الحفظ في المعرض داخل ألبوم '+AL);return}catch(x){console.warn('gallery save failed',x);alert('تعذّر الحفظ في المعرض، سأفتح المشاركة بدلاً منه.\n'+(x&&x.message||x))}}
await SH.share({title:name,url:u.uri,dialogTitle:'حفظ أو مشاركة الملف'})}
var AP=C.Plugins.App;if(AP&&AP.addListener)AP.addListener('backButton',function(){if(confirm('هل تريد الخروج من التطبيق؟'))AP.exitApp()});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[download]');if(!a)return;
var h=a.getAttribute('href')||'';if(!/^(blob|data):/.test(h))return;e.preventDefault();e.stopPropagation();
var n=(a.getAttribute('download')||'file').replace(/[\\\/:*?"<>|]+/g,'_');
save(h,n).catch(function(x){if(x&&/cancel/i.test(String(x.message||x)))return;alert('تعذّر حفظ الملف: '+(x&&x.message||x))})},true)})();
