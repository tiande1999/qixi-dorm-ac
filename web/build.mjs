import {cp, mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2];
if (!['demo','live'].includes(mode)) throw new Error('Use build.mjs demo or build.mjs live');
const output = path.join(root,'..','artifacts','habitat-' + mode);
await mkdir(output,{recursive:true});
const demo = ['index.html','app.js','store.js','preferences.js','setup-ui.js','setup.css','phone.js','phone.css','phone-support.js','sw.js','manifest.webmanifest'];
const live = ['index.html','live.js','live.css','config.js','provider.js','guide.js'];
const iconFiles = ['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
const allowed = new Set([...(mode==='demo'?demo:live),'styles.css','ui.js','favicon.svg','icons','manifest.webmanifest','sw.js',...(mode==='live'?['model.js']:[])]);
for (const entry of await readdir(output,{withFileTypes:true})) {
  if (!allowed.has(entry.name)) throw new Error('Build output contains unexpected entry: '+entry.name);
}

async function copy(from,name) {
  await cp(path.join(root,from,name),path.join(output,name));
}

for(const file of mode==='demo'?demo:live) await copy(mode==='demo'?'dist':'live',file);
for(const file of ['styles.css','favicon.svg']) await copy('dist',file);
await copy('dist','ui.js');
await mkdir(path.join(output,'icons'),{recursive:true});
for(const file of iconFiles) {
  await cp(path.join(root,mode==='demo'?'dist':'live','icons',file),path.join(output,'icons',file));
}
if(mode==='live') {
  const publicPath=process.env.HABITAT_GATEWAY_PATH ?? '';
  if(publicPath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(publicPath)) throw new Error('Gateway path must be same origin');
  const config = 'export const GATEWAY_PATH = '+JSON.stringify(publicPath)+';\n';
  await writeFile(path.join(output,'config.js'),config);
  const model=JSON.parse(await readFile(path.join(root,'model','feiyuan-xls.json'),'utf8'));
  await writeFile(path.join(output,'model.js'),'export const MODEL = '+JSON.stringify(model,null,2)+';\n');
  const manifest=JSON.parse(await readFile(path.join(root,'dist','manifest.webmanifest'),'utf8'));
  Object.assign(manifest,{id:'./habitat-live',name:'Habitat Live · 栖息',short_name:'栖息 Live',
    description:'查看宿舍设备状态与请求回执',start_url:'./'});
  await writeFile(path.join(output,'manifest.webmanifest'),JSON.stringify(manifest,null,2)+'\n');
  const assets=['./',...live.map(file=>'./'+file),'./styles.css','./favicon.svg','./ui.js','./model.js','./manifest.webmanifest',...iconFiles.map(file=>'./icons/'+file)];
  const revision=createHash('sha256');
  for(const asset of assets.slice(1)) revision.update(await readFile(path.join(output,asset)));
  const sw=await readFile(path.join(root,'live','sw.template.js'),'utf8');
  await writeFile(path.join(output,'sw.js'),sw.replace('ASSET_LIST',JSON.stringify(assets)).replace('ASSET_HASH',revision.digest('hex').slice(0,12)));
} else {
  const swPath=path.join(output,'sw.js');
  const sw=await readFile(swPath,'utf8');
  const revision=createHash('sha256');
  for(const file of [...demo,'styles.css','ui.js','favicon.svg',...iconFiles.map(file=>'icons/'+file)]) {
    revision.update(await readFile(path.join(output,file)));
  }
  await writeFile(swPath,sw.replace('habitat-demo-v1','habitat-demo-'+revision.digest('hex').slice(0,12)));
}
console.log(mode + ': ' + output);
