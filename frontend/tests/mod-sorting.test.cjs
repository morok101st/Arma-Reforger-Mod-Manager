const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'armm-mod-sorting-'));
let sortMods,compareExportOrder;
try {
  execFileSync(path.join(__dirname,'../node_modules/.bin/tsc'),[path.join(__dirname,'../src/lib/utils.ts'),'--module','commonjs','--target','es2020','--skipLibCheck','--outDir',output],{cwd:output,stdio:'pipe'});
  ({sortMods,compareExportOrder}=require(path.join(output,'lib/utils.js')));
} finally {fs.rmSync(output,{recursive:true,force:true});}
const fixtures=[
  {id:'PZ',name:'Z Parent',parent_modset_id:1,status:'UP_TO_DATE',last_checked:'2026-01-01',load_order:2,export_position:2},
  {id:'LA',name:'A Local',parent_modset_id:null,status:'UP_TO_DATE',last_checked:'2026-01-02',load_order:1,export_position:1},
  {id:'PA',name:'A Parent',parent_modset_id:1,status:'UPDATE_AVAILABLE',last_checked:'2026-01-03',load_order:3,export_position:3},
  {id:'LZ',name:'Z Local',parent_modset_id:null,status:'UPDATE_AVAILABLE',last_checked:'2026-01-04',load_order:4,export_position:4},
];
const ids=rows=>rows.map(row=>row.id);
test('child-first grouping takes precedence while each existing sort mode orders within groups',()=>{
  const expected={updates:['LZ','LA','PA','PZ'],status:['LZ','LA','PA','PZ'],name:['LA','LZ','PA','PZ'],last_checked:['LZ','LA','PA','PZ'],load_order:['LA','LZ','PZ','PA']};
  for(const [mode,result] of Object.entries(expected))assert.deepEqual(ids(sortMods(fixtures,mode,true)),result,mode);
});
test('disabling grouping restores global sorting and does not mutate export order',()=>{
  const original=JSON.stringify(fixtures);
  assert.deepEqual(ids(sortMods(fixtures,'updates',false)),['PA','LZ','LA','PZ']);
  sortMods(fixtures,'name',true);
  assert.equal(JSON.stringify(fixtures),original);
  assert.deepEqual(ids([...fixtures].sort(compareExportOrder)),['LA','PZ','PA','LZ']);
});
test('ordinary modsets retain their existing order when child-first is enabled',()=>{
  const plain=fixtures.map(row=>({...row,parent_modset_id:null}));
  for(const mode of ['updates','status','name','last_checked','load_order'])assert.deepEqual(ids(sortMods(plain,mode,true)),ids(sortMods(plain,mode,false)),mode);
});
