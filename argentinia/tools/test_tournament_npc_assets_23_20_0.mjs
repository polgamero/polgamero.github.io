import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const dir=path.join(root,'assets','images','npcs');
const expected=Array.from({length:40},(_,i)=>`npc_${String(i+1).padStart(3,'0')}.png`);
const errors=[];

function pngSize(buf){
  if(buf.length<24)return null;
  if(buf.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')return null;
  return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
}
for(const name of expected){
  const file=path.join(dir,name);
  if(!fs.existsSync(file)){errors.push(`${name}: MISSING`);continue;}
  const size=pngSize(fs.readFileSync(file));
  if(!size){errors.push(`${name}: INVALID_PNG`);continue;}
  if(size.width!==size.height)errors.push(`${name}: NOT_SQUARE ${size.width}x${size.height}`);
  if(size.width<512||size.height<512)errors.push(`${name}: TOO_SMALL ${size.width}x${size.height}`);
}
const unexpected=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/^npc_\d+\.png$/i.test(n)&&!expected.includes(n)):[];
for(const n of unexpected)errors.push(`${n}: UNEXPECTED_NAME`);
const present=expected.filter(n=>fs.existsSync(path.join(dir,n))).length;
if(errors.length){
  console.error(`TOURNAMENT_NPC_ASSETS_23_20_0_FAILED present=${present}/40 errors=${errors.length}`);
  for(const e of errors)console.error(`- ${e}`);
  process.exit(1);
}
console.log('TOURNAMENT_NPC_ASSETS_23_20_0_OK count=40 format=PNG square=PASS min512=PASS canonicalPath=assets/images/npcs');
