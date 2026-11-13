const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'armm-modset-size-'));
let parseModSize,formatModSize,getModsetSize;
try {
  execFileSync(path.join(__dirname,'../node_modules/.bin/tsc'),[path.join(__dirname,'../src/lib/modsetSize.ts'),'--module','commonjs','--target','es2020','--skipLibCheck','--outDir',output],{cwd:output,stdio:'pipe'});
  ({parseModSize,formatModSize,getModsetSize}=require(path.join(output,'lib/modsetSize.js')));
} finally {fs.rmSync(output,{recursive:true,force:true});}
test('parses explicit decimal and binary units and decimal separators',()=>{
  for(const [input,expected] of [['0 B',0],['125 B',125],['1.5 KB',1500],[' 1,25 mb ',1250000],['2 GB',2e9],['1 TB',1e12],['1 KiB',1024],['2 MiB',2097152],['1 GiB',1073741824],['1 TiB',1099511627776]])assert.equal(parseModSize(input),expected,input);
});
test('rejects missing, ambiguous, negative, malformed and unsafe sizes',()=>{
  for(const input of [null,'','Unknown','12345','-2 MB','1,234.56 MB','1.2.3 GB','Infinity B','3 GB extra','1 PB','999999999999 TB'])assert.equal(parseModSize(input),null,String(input));
});
test('counts installed local, dependency and inherited mods once without mutating input',()=>{
  const mods=[{id:'local',current_version:'1',size:'1 GB'},{id:'dep',current_version:'2',size:'500 MB',is_dependency:true},{id:'parent',current_version:'3',size:'250 MB',parent_modset_id:1},{id:'dep',current_version:'2',size:'500 MB'},...[null,'','  '].map((v,i)=>({id:`inactive${i}`,current_version:v,size:'10 GB'}))];
  const original=JSON.stringify(mods), result=getModsetSize(mods);
  assert.equal(result.bytes,1750000000);
  assert.equal(result.value,'1.75 GB');
  assert.equal(result.knownCount,3);
  assert.equal(result.unknownCount,0);
  assert.equal(JSON.stringify(mods),original);
});
test('distinguishes empty, entirely unknown, zero and partial totals',()=>{
  assert.equal(getModsetSize([]).value,'0 B');
  const unknown=getModsetSize([{id:'a',current_version:'1',size:null}]);
  assert.equal(unknown.value,'Unknown');
  assert.equal(unknown.detail,'1 size unknown. ');
  const partial=getModsetSize([{id:'a',current_version:'1',size:'1 GB'},{id:'b',current_version:'1',size:null},{id:'c',current_version:'1',size:'unavailable'}]);
  assert.equal(partial.value,'1 GB');
  assert.equal(partial.detail,'2 sizes unknown; partial total. ');
  assert.equal(getModsetSize([{id:'a',current_version:'1',size:'0 B'}]).value,'0 B');
});
test('formats byte totals with bounded precision',()=>{
  for(const [bytes,expected] of [[0,'0 B'],[512,'512 B'],[1024,'1.02 KB'],[1234567890,'1.23 GB'],[1e12,'1 TB']])assert.equal(formatModSize(bytes),expected);
});
