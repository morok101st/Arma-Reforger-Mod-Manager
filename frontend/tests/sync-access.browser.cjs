const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const baseUrl = process.env.ARMM_TEST_URL || "http://127.0.0.1:4189";
(async () => {
  const browser = await chromium.launch({headless:true});
  for (const theme of ["dark", "light"]) for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
    const page = await context.newPage();
    const errors = [], calls = [];
    page.on("pageerror", e => errors.push(e.message));
    let enabled = false, currentKey = "", failStatus = true, role = "admin";
    const set = {id:42,name:"Community Child",owner_username:"admin",is_owner:true,can_edit:true,can_delete:true,can_manage_access:true,has_group_access:false,tracked_mods_count:0,parent_modset_id:1,parent_modset_name:"Parent",order_mode:"parent"};
    const parent = {...set,id:1,name:"Parent",parent_modset_id:null,order_mode:"independent"};
    const status = () => ({enabled,usable:enabled,created_at:enabled?"2026-11-14T12:00:00Z":null,last_used_at:null,base_url:"https://armm.example.com"});
    await context.route("**/*", route => {
      if (["fetch","xhr"].includes(route.request().resourceType()) || new URL(route.request().url()).origin !== new URL(baseUrl).origin) return route.abort();
      return route.continue();
    });
    await context.route("**/api/**", async route => {
      const req=route.request(), path=new URL(req.url()).pathname.replace(/^\/api/,""), method=req.method();
      const send=(body,code=200)=>route.fulfill({status:code,contentType:"application/json",body:JSON.stringify(body)});
      if(path === "/auth/me") return send({id:1,username:"admin",role,active_modset_id:42,theme_preference:theme,has_local_password:true});
      if(path === "/auth/config") return send({oidc_enabled:false});
      if(path === "/modsets" || path === "/admin/modsets") return send([parent,set]);
      if(path === "/scheduler/status") return send({automatic_run_times:["10:00","19:00"],scheduler_timezone:"Europe/Berlin"});
      if(path === "/admin/sync-access") return send([parent,set].map(s=>({...status(), enabled:s.id===42&&enabled, usable:s.id===42&&enabled, modset_id:s.id,modset_name:s.name,owner_username:s.owner_username,parent_modset_id:s.parent_modset_id,parent_modset_name:s.parent_modset_name,created_by:enabled?"admin":null})));
      if(path === "/modsets/42/group-permissions") return send([]);
      if(path === "/modsets/42/sync-access") {
        calls.push(method);
        if(method === "GET") { if(failStatus) {return send({detail:"Temporary failure"},503);} return send(status()); }
        if(method === "POST") {enabled=true;currentKey="armm_sync_browser_"+calls.length;return send({...status(),access_key:currentKey});}
        if(method === "DELETE") {enabled=false;return send(status());}
      }
      if(path === "/modsets/42/sync-configuration") {
        const p=req.postDataJSON(); assert.equal(p.accessKey,currentKey);
        return send({format:"armm-sync",formatVersion:1,name:p.name,armm:{baseUrl:p.baseUrl,modsetId:42,exportPath:"/api/sync/modsets/42/export",accessKey:p.accessKey},...(p.gameServer?{gameServer:p.gameServer}:{})});
      }
      if(["/mods","/refresh-jobs","/users","/groups","/admin/groups","/discord-webhooks","/audit","/modsets/42/activity"].includes(path)) return send([]);
      errors.push("Unmocked API: "+method+" "+path); return send({detail:"Unmocked"},500);
    });
    await page.goto(baseUrl+"/?view=admin&section=sync&modset=42");
    await page.getByRole("heading",{name:"Sync access",exact:true}).waitFor();
    await page.getByRole("combobox",{name:"Filter sync access"}).click();
    await page.getByRole("option",{name:"Active",exact:true}).click();
    await page.getByText("No modsets match this search and status filter.").waitFor();
    await page.getByRole("combobox",{name:"Filter sync access"}).click();
    await page.getByRole("option",{name:"All modsets",exact:true}).click();
    await page.getByLabel("Search sync access").fill("missing");
    await page.getByText("No modsets match this search and status filter.").waitFor();
    await page.getByLabel("Search sync access").fill("");
    await page.getByRole("button",{name:"Manage sync access for Community Child",exact:true}).click();
    const dialog=page.locator(".sync-admin-editor");
    await dialog.getByRole("button",{name:"Retry sync access"}).waitFor();
    failStatus=false;
    await dialog.getByRole("button",{name:"Retry sync access"}).click();
    await dialog.getByRole("button",{name:"Create sync key"}).click();
    await dialog.getByLabel("Sync access key",{exact:true}).fill(currentKey);
    assert.equal(await dialog.getByLabel("ARMM public URL").inputValue(),"https://armm.example.com");
    await dialog.getByLabel("Include game server details").check();
    await dialog.getByLabel("Game server host").fill("gameserver.example.com");
    await dialog.getByLabel("The game server requires a password").check();
    const downloadPromise=page.waitForEvent("download");
    await dialog.getByRole("button",{name:"Download armm-sync.json"}).click();
    const download=await downloadPromise;
    assert.equal(download.suggestedFilename(),"armm-sync.json");
    const config=JSON.parse(await fs.readFile(await download.path(),"utf8"));
    assert.equal(config.armm.exportPath,"/api/sync/modsets/42/export");
    assert.deepEqual(config.gameServer,{host:"gameserver.example.com",port:2001,passwordRequired:true});
    assert.equal(await dialog.getByRole("button",{name:"Replace sync key",exact:true}).isEnabled(),false);
    await dialog.getByLabel("Replace the key. Existing desktop configurations will stop working.").check();
    await dialog.getByRole("button",{name:"Replace sync key",exact:true}).click();
    await dialog.getByRole("button",{name:"Download armm-sync.json"}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.ARMM_TEST_SCREENSHOTS) {
      await fs.mkdir(process.env.ARMM_TEST_SCREENSHOTS,{recursive:true});
      await page.screenshot({path:`${process.env.ARMM_TEST_SCREENSHOTS}/sync-${theme}-${width}.png`});
    }
    await dialog.getByRole("button",{name:"Disable sync access"}).click();
    await dialog.getByRole("button",{name:"Download armm-sync.json"}).waitFor({state:"detached"});
    assert.equal(calls.filter(c=>c==="POST").length,2);
    assert.deepEqual(errors,[]);
    await dialog.getByRole("button",{name:"Back to sync overview"}).click();
    await page.getByRole("table",{name:"Sync access overview"}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(process.env.ARMM_TEST_SCREENSHOTS) await page.screenshot({path:`${process.env.ARMM_TEST_SCREENSHOTS}/sync-overview-${theme}-${width}.png`});
    await page.getByRole("button",{name:"Modsets",exact:true}).click();
    await page.getByRole("row").filter({has:page.getByRole("button",{name:"Open modset Community Child",exact:true})}).getByRole("button",{name:"Edit",exact:true}).click();
    assert.equal(await page.getByRole("dialog").getByRole("group",{name:"Sync access",exact:true}).count(),0);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({state:"detached"});
    role="user";
    await page.goto(baseUrl+"/?view=admin&section=sync&modset=42");
    await page.getByText("You do not have access to this administration page.").waitFor();
    assert.equal(await page.getByRole("heading",{name:"Sync access",exact:true}).count(),0);
    await context.close();
  }
  await browser.close();
  console.log("Sync admin browser checks passed: overview/search, navigation, retry, create/replace/disable, import contract, no modset editor controls, desktop/mobile and both themes.");
})().catch(e=>{console.error(e);process.exit(1);});
