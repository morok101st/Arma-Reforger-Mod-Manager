const {chromium}=require("playwright");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const base=process.env.ARMM_TEST_URL||"http://127.0.0.1:4189";
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const theme of ["dark","light"])for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage();
  page.setDefaultTimeout(10000);
  let role="admin",failCreate=true,failDelete=true,key="armm_sync_browser_original",configuration=null,enabled=true;
  const entries=[],errors=[],writes=[];
  const sets=[{id:1,name:"Parent",parent_modset_id:null},{id:42,name:"Community Child",parent_modset_id:1,parent_modset_name:"Parent"}].map(s=>({...s,owner_username:"admin",is_owner:true,can_edit:true,can_delete:true,can_manage_access:true,tracked_mods_count:0,order_mode:"parent"}));
  page.on("pageerror",e=>errors.push(e.message));
  const row=()=>({modset_id:42,modset_name:"Community Child",parent_modset_id:1,parent_modset_name:"Parent",created_by:"admin",owner_username:"admin",base_url:"https://armm.example.com",enabled,usable:enabled,configuration,downloadable:enabled&&Boolean(configuration),key_available:true,created_at:"2026-11-14T12:00:00Z",last_used_at:null});
  await context.route("**/*",route=>["fetch","xhr"].includes(route.request().resourceType())||new URL(route.request().url()).origin!==new URL(base).origin?route.abort():route.continue());
  await context.route("**/api/**",async route=>{
   const req=route.request(),path=new URL(req.url()).pathname.replace(/^\/api/,""),method=req.method();
   const send=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
   if(path==="/auth/me")return send({id:1,username:"admin",role,active_modset_id:42,theme_preference:theme,has_local_password:true});
   if(path==="/auth/config")return send({oidc_enabled:false});
   if(path==="/modsets"||path==="/admin/modsets")return send(sets);
   if(path==="/scheduler/status")return send({automatic_run_times:["10:00","19:00"],scheduler_timezone:"Europe/Berlin"});
   if(path==="/admin/sync-access"&&method==="GET")return send(entries.length?[row()]:[]);
   if(path==="/admin/sync-access"&&method==="POST"){
    writes.push(path);if(failCreate){failCreate=false;return send({detail:"Save failed. Try again."},503);}
    const p=req.postDataJSON();assert.equal(p.modset_id,42);const {modset_id,...settings}=p;configuration=settings;entries.push(42);return send(row(),201);
   }
   if(path==="/admin/sync-access/42"&&method==="DELETE"){
    if(failDelete){failDelete=false;return send({detail:"Delete failed. Try again."},503);}
    entries.splice(0);configuration=null;return route.fulfill({status:204});
   }
   if(path==="/admin/sync-access/42"&&method==="PUT"){
    const {replaceKey,accessKey,...settings}=req.postDataJSON();configuration=settings;if(replaceKey){key="armm_sync_browser_replaced";enabled=true;}return send(row());
   }
   if(path==="/admin/sync-access/42/configuration")return send({format:"armm-sync",formatVersion:1,name:configuration.name,armm:{baseUrl:configuration.baseUrl,modsetId:42,exportPath:"/api/sync/modsets/42/export",accessKey:key},...(configuration.gameServer?{gameServer:configuration.gameServer}:{})});
   if(path==="/modsets/42/sync-access"&&method==="DELETE"){enabled=false;return send(row());}
   if(["/mods","/refresh-jobs","/users","/groups","/admin/groups","/discord-webhooks","/audit","/modsets/42/activity"].includes(path))return send([]);
   errors.push(method+" "+path);return send({detail:"Unmocked"},500);
  });
  const choose=async(label,option)=>{await page.getByRole("combobox",{name:label,exact:true}).click();await page.getByRole("option",{name:option,exact:true}).click();};
  await page.goto(base+"/?view=admin&section=sync&modset=42");
  await page.getByText("No sync access configured",{exact:true}).waitFor();
  assert.equal(await page.getByRole("table",{name:"Sync access overview"}).count(),0);
  await page.getByRole("button",{name:"Create sync access",exact:true}).click();
  await choose("Sync modset","Community Child");
  await page.getByLabel("Access name",{exact:true}).fill("Community Server");
  await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.getByLabel("ARMM public URL").fill("https://armm.example.com");
  await page.getByLabel("Include game server details").check();
  await page.getByLabel("Game server host").fill("gameserver.example.com");
  await page.getByLabel("The game server requires a password").check();
  await page.getByRole("button",{name:"Back",exact:true}).click();
  assert.equal(await page.getByLabel("Access name",{exact:true}).inputValue(),"Community Server");
  await page.getByRole("button",{name:"Next",exact:true}).click();
  assert.equal(await page.getByLabel("Game server host").inputValue(),"gameserver.example.com");
  await page.getByRole("button",{name:"Next",exact:true}).click();
  assert.equal(entries.length,0);
  await page.getByLabel("Allow the sync app to read this modset, including inherited mods.").check();
  if(process.env.ARMM_TEST_SCREENSHOTS){await fs.mkdir(process.env.ARMM_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.ARMM_TEST_SCREENSHOTS}/wizard-${theme}-${width}.png`});}
  await page.getByRole("dialog").getByRole("button",{name:"Create sync access",exact:true}).click();
  await page.getByText("Save failed. Try again.",{exact:true}).waitFor();
  assert.equal(entries.length,0);
  await page.getByRole("dialog").getByRole("button",{name:"Create sync access",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"detached"});
  const table=page.getByRole("table",{name:"Sync access overview"});await table.getByText("Community Server",{exact:true}).waitFor();
  assert.equal(await table.locator("tbody tr").count(),1);
  async function download(){const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download configuration Community Server",exact:true}).click();const d=await pending;assert.equal(d.suggestedFilename(),"armm-sync.json");return JSON.parse(await fs.readFile(await d.path(),"utf8"));}
  const first=await download();assert.equal(first.armm.exportPath,"/api/sync/modsets/42/export");assert.deepEqual(first.gameServer,{host:"gameserver.example.com",port:2001,passwordRequired:true});
  await page.reload();await table.getByText("Community Server",{exact:true}).waitFor();assert.deepEqual(await download(),first);
  await page.getByRole("button",{name:"Edit sync access Community Server",exact:true}).click();
  assert.equal(await page.getByLabel("Access name",{exact:true}).inputValue(),"Community Server");
  await page.getByRole("button",{name:"Next",exact:true}).click();assert.equal(await page.getByLabel("Game server host").inputValue(),"gameserver.example.com");
  await page.getByLabel("Game server port").fill("2002");await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.getByRole("button",{name:"Save sync access",exact:true}).click();await page.getByRole("dialog").waitFor({state:"detached"});
  assert.equal((await download()).armm.accessKey,first.armm.accessKey);assert.equal((await download()).gameServer.port,2002);
  await page.getByLabel("Search sync access").fill("not found");await page.getByText("No sync access matches this search and status filter.").waitFor();await page.getByLabel("Search sync access").fill("");
  if(process.env.ARMM_TEST_SCREENSHOTS)await page.screenshot({path:`${process.env.ARMM_TEST_SCREENSHOTS}/accesses-${theme}-${width}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole("button",{name:"Disable",exact:true}).click();await page.getByRole("button",{name:"Confirm disable",exact:true}).click();await page.getByRole("dialog").waitFor({state:"detached"});
  await table.getByText("Disabled",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Download configuration Community Server",exact:true}).isDisabled(),true);
  await choose("Filter sync access","Active");await page.getByText("No sync access matches this search and status filter.").waitFor();await choose("Filter sync access","All accesses");
  await page.getByRole("button",{name:"Edit sync access Community Server",exact:true}).click();await page.getByRole("button",{name:"Next",exact:true}).click();await page.getByRole("button",{name:"Next",exact:true}).click();
  await page.getByLabel("Replace the key and enable access. Existing configurations will stop working.").check();await page.getByLabel("Invalidate the previous key and enable this access.").check();
  await page.getByRole("button",{name:"Save sync access",exact:true}).click();await page.getByRole("dialog").waitFor({state:"detached"});await table.getByText("Active",{exact:true}).waitFor();assert.notEqual((await download()).armm.accessKey,first.armm.accessKey);
  await page.getByRole("button",{name:"Delete sync access Community Server",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
  assert.equal(entries.length,1);
  await page.getByRole("button",{name:"Delete sync access Community Server",exact:true}).click();
  if(process.env.ARMM_TEST_SCREENSHOTS)await page.screenshot({path:`${process.env.ARMM_TEST_SCREENSHOTS}/delete-${theme}-${width}.png`});
  await page.getByRole("button",{name:"Delete permanently",exact:true}).click();
  await page.getByRole("dialog").getByText("Delete failed. Try again.",{exact:true}).waitFor();
  assert.equal(entries.length,1);
  await page.getByRole("button",{name:"Delete permanently",exact:true}).click();
  await page.getByRole("dialog").waitFor({state:"detached"});
  await page.getByText("No sync access configured",{exact:true}).waitFor();
  assert.equal(entries.length,0);
  await page.getByRole("button",{name:"Create sync access",exact:true}).click();
  await choose("Sync modset","Community Child");
  await page.getByRole("dialog").getByRole("button",{name:"Cancel",exact:true}).click();
  assert.deepEqual(errors,[]);
  role="user";await page.goto(base+"/?view=admin&section=sync&modset=42");await page.getByText("You do not have access to this administration page.").waitFor();
  await context.close();
 }
 await browser.close();console.log("Sync wizard browser checks passed: configured entries only, staged creation/retry, persisted edits/downloads, explicit replacement, disable, delete/cancel/retry/recreate, admin guard; both themes at 320/390/1440px.");
})().catch(e=>{console.error(e);process.exit(1);});
