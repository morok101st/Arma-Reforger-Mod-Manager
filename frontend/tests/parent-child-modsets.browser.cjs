const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.ARMM_TEST_URL||'http://127.0.0.1:4178';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.ARMM_TEST_CHROMIUM?{executablePath:process.env.ARMM_TEST_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 page.setDefaultTimeout(8000);
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 let active=2,fail=false,failPreview=false,currentTheme='dark';
 const sets=[{id:1,name:'101st Core',parent_modset_id:null,child_modsets_count:1},{id:2,name:'Operation Alpha',parent_modset_id:1,parent_modset_name:'101st Core'},{id:3,name:'Existing mission',parent_modset_id:null}].map(s=>({owner_username:'admin',is_owner:true,can_edit:true,can_delete:true,can_manage_access:true,has_group_access:false,tracked_mods_count:2,order_mode:'independent',...s}));
 const mod=(id,name,version)=>({id,name,current_version:version,latest_version:'3.0',status:'UPDATE_AVAILABLE',dependencies:[],dependents:[],versions:[],blocking_dependents:[],core_dependents:[],load_order:500,source_url:null});
 const own={1:[mod('FRAMEWORK','Framework','1.4.2')],2:[mod('MAP001','Mission map','2.0')],3:[mod('FRAMEWORK','Framework','1.0')]},orders={};
 const effective=id=>{const s=sets.find(s=>s.id===id);return [...(s.parent_modset_id?own[s.parent_modset_id].map(m=>({...m,parent_modset_id:s.parent_modset_id,parent_modset_name:'101st Core',load_order:orders[`${id}:${m.id}`]??500})):[]),...own[id].map(m=>({...m,load_order:orders[`${id}:${m.id}`]??m.load_order}))].map(m=>({...m,order_mode:s.order_mode}));};
 const user=()=>({id:1,username:'admin',role:'admin',active_modset_id:active,theme_preference:currentTheme,auth_provider:'local',has_local_password:true});
 // Never permit test actions to escape to a real API.
 await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==new URL(base).origin||['fetch','xhr'].includes(r.resourceType())){errors.push('Unmocked request '+r.url());return route.abort();}return route.continue();});
 await context.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url()),path=url.pathname.replace('/api',''),method=r.method(),id=Number(url.searchParams.get('modset_id')||active),body=method==='GET'?null:r.postDataJSON();
  if(method!=='GET')writes.push({path,method,body});let data=[];
  if(path==='/auth/me')data=user();
  else if(path==='/auth/config')data={local_login_enabled:true,oidc_enabled:false};
  else if(path==='/scheduler/status')data={scheduler_timezone:'Europe/Berlin',automatic_run_times:['10:00','19:00']};
  else if(path==='/modsets'&&method==='GET')data=sets;
  else if(path==='/modsets'&&method==='POST'){data={...sets[1],id:sets.length+1,name:body.name,parent_modset_id:body.parent_modset_id,order_mode:body.order_mode};sets.push(data);own[data.id]=[];}
  else if(path==='/mods')data=effective(id);
  else if(/^\/modsets\/\d+\/activate$/.test(path)){active=Number(path.split('/')[2]);data=user();}
  else if(/^\/modsets\/\d+\/order-preview$/.test(path)){if(failPreview)return route.fulfill({status:503,json:{detail:'Preview unavailable.'}});data=effective(Number(path.split('/')[2])).sort((a,b)=>a.load_order-b.load_order).map(m=>({modId:m.id,name:m.name,version:m.current_version}));}
  else if(/^\/modsets\/\d+\/export$/.test(path))data=effective(Number(path.split('/')[2])).map(m=>({modId:m.id,name:m.name,version:m.current_version}));
  else if(/^\/modsets\/\d+\/export-order$/.test(path)){for(const [index,modId] of body.mod_ids.entries())orders[`${Number(path.split('/')[2])}:${modId}`]=index;return route.fulfill({status:204});}
  else if(/^\/modsets\/\d+$/.test(path)&&method==='PATCH'){
   if(fail)return route.fulfill({status:503,json:{detail:'Save unavailable. Try again.'}});
   const s=sets.find(s=>s.id===Number(path.split('/')[2]));
   if('parent_modset_id'in body){if(body.parent_modset_id===null)own[s.id]=effective(s.id).map(m=>({...m,parent_modset_id:null}));else own[s.id]=own[s.id].filter(m=>!own[body.parent_modset_id].some(b=>b.id===m.id));s.parent_modset_id=body.parent_modset_id;s.parent_modset_name=body.parent_modset_id?'101st Core':null;}if('order_mode'in body)s.order_mode=body.order_mode;s.name=body.name;data=s;
  }else if(/^\/mods\//.test(path)&&method==='PATCH'){const mid=path.split('/')[2];orders[`${id}:${mid}`]=body.load_order;data=effective(id).find(m=>m.id===mid);}
  return route.fulfill({json:data});
 });
 const shot=async name=>{if(process.env.ARMM_TEST_SCREENSHOTS){fs.mkdirSync(process.env.ARMM_TEST_SCREENSHOTS,{recursive:true});await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:`${process.env.ARMM_TEST_SCREENSHOTS}/${name}.png`,fullPage:true});}};
 const go=async q=>{await page.goto(base+q);await page.getByRole('button',{name:'Workspace',exact:true}).waitFor();};
 const choose=async(label,option)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();};
 await go('?modset=2&mod=FRAMEWORK');await page.getByText('The installed version is binding',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Save version',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Remove mod',exact:true}).count(),0);
 const browserRows=()=>page.locator('.sidebar .mod-row strong').allTextContents();
 assert(await page.getByRole('checkbox',{name:'Child mods first',exact:true}).isChecked());
 assert.deepEqual(await browserRows(),['Mission map','Framework']);
 await page.getByRole('checkbox',{name:'Child mods first',exact:true}).uncheck();
 assert.deepEqual(await browserRows(),['Framework','Mission map']);
 await page.getByRole('button',{name:'Show filters',exact:true}).click();await choose('Sort by','Name');
 await page.getByRole('checkbox',{name:'Child mods first',exact:true}).check();assert.deepEqual(await browserRows(),['Mission map','Framework']);
 await choose('Sort by','Updates first');
 await shot('child-mods-first-desktop');
 await page.getByRole('button',{name:'Copy JSON',exact:true}).waitFor();await shot('inherited-desktop-dark');
 await page.getByRole('button',{name:'Back to overview',exact:true}).click();await page.getByRole('button',{name:'Expand',exact:true}).first().click();
 assert.equal(await page.getByRole('spinbutton').count(),0);assert.equal(await page.getByRole('button',{name:'Reset order',exact:true}).count(),0);
 await Promise.all([page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/mods?')), page.getByRole('button',{name:'Move Framework to bottom',exact:true}).click()]);
 assert(writes.some(r=>r.path==='/modsets/2/export-order'&&r.body.mod_ids.join(',')==='MAP001,FRAMEWORK'));await page.locator('.export-order-card').scrollIntoViewIfNeeded();await page.waitForTimeout(250);await page.getByRole('cell',{name:'Export position 1 for Mission map',exact:true}).waitFor();await shot('independent-export-positions');
 await Promise.all([page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/mods?')), page.getByRole('button',{name:'Move Framework to top',exact:true}).click()]);
 await go('?view=modsets&modset=2');await page.getByRole('button',{name:'Create modset',exact:true}).click();await page.getByRole('dialog').getByLabel('Name',{exact:true}).fill('New mission');await choose('Parent modset','101st Core');await page.getByRole('button',{name:'Create',exact:true}).click();await page.getByRole('button',{name:'Open modset New mission',exact:true}).waitFor();assert(writes.some(r=>r.path==='/modsets'&&r.body.parent_modset_id===1));
 const row=page.getByRole('row').filter({has:page.getByRole('button',{name:'Open modset Existing mission',exact:true})});await row.getByRole('button',{name:'Edit',exact:true}).click();await choose('Parent modset','101st Core');await page.getByText('These local mods will use the parent versions:',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),false);await page.getByRole('checkbox',{name:'Replace these local entries',exact:false}).check();
 fail=true;await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'Save unavailable'}).waitFor();assert(await page.getByRole('checkbox',{name:'Replace these local entries',exact:false}).isChecked());await shot('link-conflict-retry');fail=false;await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert(writes.some(r=>r.path==='/modsets/3'&&r.body.confirm_parent_conflicts===true));
 await row.getByRole('button',{name:'Edit',exact:true}).click();await choose('Parent modset','Detach — keep current mods and versions');await page.getByRole('checkbox',{name:'Keep the current mods',exact:false}).check();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert(writes.some(r=>r.path==='/modsets/3'&&r.body.parent_modset_id===null));
 await page.getByRole('row').filter({has:page.getByRole('button',{name:'Open modset Operation Alpha',exact:true})}).getByRole('button',{name:'Edit',exact:true}).click();
 failPreview=true;await choose('Export order mode','Follow parent order and insert local mods');await page.getByRole('dialog').getByRole('alert').filter({hasText:'Preview unavailable'}).waitFor();assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),false);
 failPreview=false;await page.getByRole('button',{name:'Retry preview',exact:true}).click();await page.getByLabel('Export order preview').getByText('Framework',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Save',exact:true}).isEnabled(),false);await page.getByRole('checkbox',{name:'Use the previewed export order.',exact:true}).check();await shot('order-mode-preview');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert(writes.some(r=>r.path==='/modsets/2'&&r.body.order_mode==='parent'&&r.body.confirm_order_change===true));
 await go('?modset=2');await page.getByRole('button',{name:'Expand',exact:true}).first().click();assert.equal(await page.getByRole('spinbutton',{name:'Export load order for Framework',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Move Framework to top',exact:true}).isEnabled(),false);await Promise.all([page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/mods?')), page.getByRole('button',{name:'Move Mission map to top',exact:true}).click()]);assert(writes.some(r=>r.path==='/modsets/2/export-order'&&r.body.mod_ids[0]==='MAP001'));await shot('merged-order-desktop');
 for(const theme of ['dark','light'])for(const width of [1440,390,320]){
  currentTheme=theme;await page.setViewportSize({width,height:900});await go('?modset=2&mod=FRAMEWORK');await page.getByText('The installed version is binding',{exact:false}).waitFor();await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(`inherited-${theme}-${width}`);if(width<900){await page.getByRole('button',{name:'Open mod list',exact:true}).click();await page.getByRole('checkbox',{name:'Child mods first',exact:true}).waitFor();assert(await page.getByRole('checkbox',{name:'Child mods first',exact:true}).isChecked());await page.waitForTimeout(300);await shot(`child-mods-first-${theme}-${width}`);await page.getByRole('dialog',{name:'Mod management',exact:true}).getByRole('button',{name:'Close mod list',exact:true}).click();}
  await go('?view=modsets&modset=2');await page.getByRole('button',{name:'Create modset',exact:true}).click();await page.getByRole('dialog').waitFor();assert(await page.locator('.parent-modset-form').evaluate(form=>form.scrollWidth<=form.clientWidth+1), await page.locator('.parent-modset-form').evaluate(form=>JSON.stringify({width:innerWidth,form:[form.clientWidth,form.scrollWidth],overflow:[...form.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>form.getBoundingClientRect().right+1).map(n=>({tag:n.tagName,cls:n.className,width:n.getBoundingClientRect().width,scroll:n.scrollWidth}))}))); await page.waitForTimeout(250);await shot(`create-${theme}-${width}`);await page.keyboard.press('Escape');await go('?modset=2');await page.getByRole('button',{name:'Expand',exact:true}).first().click();await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(`merged-order-${theme}-${width}`);
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('Parent modset browser checks passed: binding versions, sequence-only export positions in both modes, create/link/conflict/retry/detach, both themes at 320–1440px.');
})().catch(e=>{console.error(e);process.exit(1);});
