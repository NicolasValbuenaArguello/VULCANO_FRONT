const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const base = 'src/app/pages/vulcano/';
const component = base + 'ventana-limites-seguridad/ventana-limites-seguridad';
const source = fs.readFileSync(component + '.html', 'utf8');
const grid = source.match(/<div class="limits-coord-grid">[\s\S]*?<\/div>/)[0];
const css = [base+'menu/menu.css', base+'ventana-sistemas-artilleria/ventana-sistemas-artilleria.css',component+'.css'].map(p => fs.readFileSync(p,'utf8')).join('\n');
const html = `<!doctype html><meta charset="utf-8"><style>${css}
body{margin:0;background:#071007;font-family:Arial,sans-serif}.systems-window{position:relative;height:550px}.limits-content{display:flex;flex-direction:column}</style>
<section class="systems-window"><div class="limits-content"><div class="limits-workspace"><div class="limits-left"><div class="limits-panel"><div class="limits-panel-heading">COORDENADAS</div>${grid}</div></div><div class="limits-right"></div></div></div></section>
<script>
const win=document.querySelector('.systems-window'), grid=document.querySelector('.limits-coord-grid');
const controls=[...grid.querySelectorAll('input,select')];
const values=['S','90','59','59.999999','-90.000000','W','180','59','59.999999','-180.000000'];
controls.forEach((el,i)=>el.value=values[i]);
const checks=[320,390,420,460,480,680,700,701,703,720,750,820,821,825,850,1100,1920].map(width=>{
win.style.width=width+'px';
const bounds=grid.getBoundingClientRect(), boxes=controls.map(el=>el.getBoundingClientRect());
const noOverlap=boxes.every((a,i)=>boxes.every((b,j)=>i===j||a.right<=b.left+.1||b.right<=a.left+.1||a.bottom<=b.top+.1||b.bottom<=a.top+.1));
const contained=boxes.every(b=>b.left>=bounds.left-.1&&b.right<=bounds.right+.1);
const noClipping=controls.every(el=>{const s=getComputedStyle(el),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.fontSize+' '+s.fontFamily;return ctx.measureText(el.value).width<=el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+.5});
return {width,contained,noOverlap,noClipping,uniformHeight:new Set(boxes.map(b=>b.height)).size===1,gridWidth:bounds.width};
});
win.style.width='850px';controls[0].focus();
const pre=document.createElement('pre');pre.id='checks';pre.style.display='none';pre.textContent=JSON.stringify(checks);document.body.append(pre);
</script>`;
const page=path.join(root,'.tmp/coordinate-layout.html');fs.writeFileSync(page,html);
const output=spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe',[
 '--headless','--no-sandbox','--disable-gpu','--no-first-run','--allow-file-access-from-files',
 '--user-data-dir='+path.join(root,'.tmp/coordinate-chrome'), '--window-size=1920,700', '--dump-dom',
 '--screenshot='+path.join(root,'docs/previews/coordinate-form.png'), 'file:///'+page.replaceAll('\\','/')
],{encoding:'utf8',timeout:30000,maxBuffer:2000000});
if(output.error)throw output.error;
const result=output.stdout.match(/<pre id="checks"[^>]*>(.*?)<\/pre>/)?.[1];
if(!result)throw Error('Chrome no devolvio mediciones: '+output.stderr.slice(-1000));
fs.writeFileSync('docs/previews/coordinate-form-checks.json',result+'\n');
console.log(result);
if(JSON.parse(result).some(c=>!c.contained||!c.noOverlap||!c.noClipping||!c.uniformHeight))process.exitCode=1;



