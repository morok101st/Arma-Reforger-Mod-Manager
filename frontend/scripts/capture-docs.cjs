/** Capture the real frontend with synthetic API data; never contact a live API. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = (process.env.ARMM_DOCS_URL || 'http://127.0.0.1:4178').replace(/\/$/, '');
const output = path.resolve(process.env.ARMM_DOCS_OUTPUT || '../docs/images');
const stamp = '2026-11-14T10:15:00Z';
const user = { id: 1, username: 'demo-admin', role: 'admin', theme_preference: 'dark', active_modset_id: 1,
  active_modset_name: 'Everon Operations', session_expires_at: '2026-11-21T10:15:00Z', auth_provider: 'local', has_local_password: true };
const group = { id: 1, name: 'Server operators', description: 'Example operations team', user_ids: [1, 2] };
const sets = ['Everon Operations', 'Training Server', 'Weekend Testing'].map((name, i) => ({
  id: i + 1, name, tracked_mods_count: i ? 3 : 6, owner_username: i === 1 ? 'demo-editor' : 'demo-admin',
  is_owner: i !== 1, can_edit: true, can_delete: true, can_manage_access: true, has_group_access: i === 1,
  created_at: stamp, updated_at: stamp,
}));
sets[0].child_modsets_count = 1;
sets[1].parent_modset_id = 1; sets[1].parent_modset_name = sets[0].name;
const syncAccess = { modset_id: 1, modset_name: sets[0].name, parent_modset_id: null, parent_modset_name: null, owner_username: 'demo-admin', created_by: 'demo-admin', enabled: true, usable: true, downloadable: true, key_available: true, created_at: stamp, last_used_at: stamp, base_url: 'https://armm.example.com', configuration: {name: 'Community Server', baseUrl: 'https://armm.example.com', gameServer: {host: 'gameserver.example.com', port: 2001, passwordRequired: true}} };
const names = ['Field Operations Core', 'Terrain Objects', 'Radio Equipment', 'Vehicle Collection', 'Training Utilities', 'Mission Templates'];
const ids = names.map((_, i) => `DE0000000000000${i + 1}`);
const mods = names.map((name, i) => ({
  id: ids[i], name, summary: 'Documentation example',
  description: 'A fictional Workshop entry used to demonstrate mod tracking, version comparison and dependency navigation. Screenshot data is illustrative.',
  current_version: i === 4 ? null : '1.4.0', latest_version: i === 5 ? null : i % 2 ? '1.4.0' : '1.5.0',
  status: i === 4 ? 'NOT_INSTALLED' : i === 5 ? 'UNKNOWN' : i % 2 ? 'UP_TO_DATE' : 'UPDATE_AVAILABLE',
  game_version: '1.6', size: '124 MB', source_url: `https://example.invalid/workshop/${ids[i]}`,
  last_checked: stamp, pinned: false, is_core: i === 0, dependency_origin: i === 1, load_order: i === 0 ? 100 : 500,
  is_dependency: i === 1, tracking_reason: i === 1 ? 'dependency' : 'manual', delete_blocked: i === 1,
  dependencies: i === 0 ? [{ id: ids[1], name: names[1], url: `https://example.invalid/workshop/${ids[1]}` }] : [],
  dependents: i === 1 ? [{ id: ids[0], name: names[0], source_url: null }] : [],
  blocking_dependents: [], core_dependents: [],
  versions: ['1.5.0', '1.4.0'].map((version, n) => ({ id: i * 2 + n + 1, version, changelog: n ? 'Previous stable version.' : 'Updated equipment configuration.\nImproved compatibility.', published_at: stamp, last_modified_at: stamp, created_at: stamp })),
}));
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB', timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const errors = [];
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin !== new URL(base).origin || ['fetch', 'xhr'].includes(request.resourceType())) {
        errors.push('Unmocked request: ' + request.url());
        return route.abort();
      }
      return route.continue();
    });
    await context.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), p = url.pathname.replace(/^\/api/, '');
      assert.equal(req.method(), 'GET', 'Documentation captures must not submit mutations');
      let data;
      if (p === '/auth/config') data = { local_login_enabled: true, oidc_enabled: true };
      else if (p === '/auth/me') data = user;
      else if (p === '/modsets' || p === '/admin/modsets') data = sets;
      else if (p === '/mods') data = mods;
      else if (p === '/refresh-jobs') data = [];
      else if (p === '/groups') data = [{ id: group.id, name: group.name }];
      else if (p === '/admin/groups') data = [group];
      else if (p === '/admin/sync-access') data = [syncAccess];
      else if (/\/sync-access$/.test(p)) data = { enabled: false, usable: false, created_at: null, last_used_at: null, base_url: 'https://armm.example.com' };
      else if (/\/group-permissions$/.test(p)) data = [{ group_id: 1, permission: 'write' }];
      else if (p === '/users') data = [user, { ...user, id: 2, username: 'demo-editor', role: 'user' }, { ...user, id: 3, username: 'demo-integration', role: 'user' }].map(u => ({ ...u, is_active: true, created_at: stamp, last_login_at: stamp, email: null }));
      else if (p === '/discord-webhooks' || p === '/audit' || p.endsWith('/activity')) data = [];
      else if (p === '/scheduler/status') data = { scheduler_timezone: 'Europe/Berlin', automatic_run_times: ['10:00', '19:00'], last_automatic_started_at: stamp, last_automatic_completed_at: stamp, next_automatic_run_at: '2026-11-14T18:00:00Z', last_refreshed: 6, last_failed: {}, last_error: null };
      else throw new Error('Unhandled API read: ' + p);
      return route.fulfill({ status: 200, json: data });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const captures = [
      ['workspace-dark.png', '?modset=1', 'Overview', 1440, 'dark'],
      ['mod-detail-dark.png', `?modset=1&mod=${ids[0]}`, names[0], 1440, 'dark'],
      ['modsets-dark.png', '?view=modsets&modset=1', 'Modsets', 1440, 'dark'],
      ['administration-dark.png', '?view=admin&section=users&modset=1', /^Users/, 1440, 'dark'],
      ['sync-access-dark.png', '?view=admin&section=sync&modset=1', 'Sync access', 1440, 'dark'],
      ['sync-wizard-dark.png', '?view=admin&section=sync&modset=1', 'Sync access', 1440, 'dark'],
      ['workspace-light.png', '?modset=1', 'Overview', 1440, 'light'],
      ['mod-detail-mobile.png', `?modset=1&mod=${ids[0]}`, names[0], 390, 'dark'],
    ];
    for (const [file, query, heading, width, theme] of captures) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(base + '/' + query);
      await page.getByRole('heading', { name: heading, exact: typeof heading === 'string' }).waitFor();
      await page.waitForFunction(() => !document.body.innerText.includes('Loading update check status'));
      await page.evaluate(async theme => { document.documentElement.dataset.theme = theme; await document.fonts.ready; }, theme);
      if (file === 'sync-wizard-dark.png') {
        await page.getByRole('button', {name:'Create sync access',exact:true}).click();
        await page.getByRole('combobox',{name:'Sync modset',exact:true}).click();
        await page.getByRole('option',{name:'Training Server',exact:true}).click();
        await page.getByLabel('Access name',{exact:true}).fill('Training Server');
        await page.getByRole('button',{name:'Next',exact:true}).click();
        await page.getByLabel('ARMM public URL').fill('https://armm.example.com');
        await page.getByLabel('Include game server details').check();
        await page.getByLabel('Game server host').fill('training.example.com');
        await page.getByRole('button',{name:'Next',exact:true}).click();
      }
      await page.waitForTimeout(350);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), file + ' overflows');
      await page.screenshot({ path: path.join(output, file), fullPage: false });
      console.log('Captured ' + file);
    }
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
