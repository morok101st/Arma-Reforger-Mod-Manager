const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const baseUrl = (process.env.ARMM_TEST_URL || "http://127.0.0.1:4178").replace(
  /\/$/,
  "",
);
(async () => {
  const browser = await chromium.launch({ headless: true });
  async function fixture() {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(8000);
    const failures = new Set(),
      gates = new Map(),
      requests = [],
      errors = [];
    let active = 1,
      signedIn = true,
      role = "admin";
    const added = new Map(),
      removed = new Set();
    page.on("pageerror", (e) => errors.push(e.message));
    const sets = [1, 2].map((id) => ({
      id,
      name: id === 1 ? "Operations" : "Reserve",
      owner_username: "admin",
      is_owner: true,
      can_edit: true,
      can_delete: true,
      can_manage_access: true,
      has_group_access: false,
      tracked_mods_count: 2,
    }));
    const user = () => ({
      id: 1,
      username: "admin",
      role,
      active_modset_id: active,
      theme_preference: "dark",
      auth_provider: "local",
      has_local_password: true,
    });
    const mod = (id, set) => ({
      id,
      name: `${set === 1 ? "Operations" : "Reserve"} ${id}`,
      current_version: "1.0",
      latest_version: "2.0",
      status: "UPDATE_AVAILABLE",
      dependencies: [],
      dependents: [],
      versions: [],
      blocking_dependents: [],
      core_dependents: [],
      load_order: 500,
      source_url: null,
    });
    // Never let an incorrectly configured frontend send test actions to a real API.
    await page.route("**/*", (route) => {
      const request = route.request();
      if (
        new URL(request.url()).origin !== new URL(baseUrl).origin ||
        ["fetch", "xhr"].includes(request.resourceType())
      ) {
        errors.push("Unexpected request outside mocked /api: " + request.url());
        return route.abort();
      }
      return route.continue();
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname.replace("/api", ""),
        method = req.method(),
        set = Number(url.searchParams.get("modset_id") || 1),
        key =
          path === "/mods"
            ? method === "POST"
              ? "add"
              : `mods:${set}`
            : method === "DELETE"
              ? "remove"
              : path;
      requests.push({ path, method, set });
      if (gates.has(key)) await gates.get(key).promise;
      if (failures.has(key)) {
        await route.fulfill({
          status: 503,
          json: { detail: "Temporary failure" },
        });
        return;
      }
      let data;
      if (path === "/auth/config")
        data = { local_login_enabled: true, oidc_enabled: true };
      else if (path === "/auth/me") data = signedIn ? user() : null;
      else if (path === "/auth/login") {
        signedIn = true;
        data = user();
      } else if (path === "/auth/logout") {
        signedIn = false;
        data = {};
      } else if (path === "/modsets" || path === "/admin/modsets") data = sets;
      else if (path === "/users") data = [{ ...user(), is_active: true }];
      else if (path === "/groups") data = [];
      else if (
        path === "/admin/groups" ||
        path === "/discord-webhooks" ||
        path === "/audit" ||
        path.endsWith("/activity")
      )
        data = [];
      else if (path.match(/^\/modsets\/\d+\/activate$/)) {
        active = Number(path.split("/")[2]);
        data = user();
      } else if (path === "/mods" && method === "POST") {
        data = mod(req.postDataJSON().id, set);
        added.set(`${set}:${data.id}`, data);
      } else if (path.startsWith("/mods/") && method === "DELETE") {
        removed.add(`${set}:${path.split("/")[2]}`);
        data = {};
      } else if (path === "/mods")
        data = [
          mod("ABC", set),
          mod("DEF", set),
          ...Array.from(added.values()).filter(
            (m) => added.get(`${set}:${m.id}`) === m,
          ),
        ].filter((m) => !removed.has(`${set}:${m.id}`));
      else if (path === "/scheduler/status")
        data = {
          scheduler_timezone: "Europe/Berlin",
          automatic_run_times: ["10:00", "19:00"],
        };
      else throw new Error(`Unhandled ${method} ${path}`);
      await route.fulfill({ status: 200, json: data });
    });
    return {
      page,
      context,
      failures,
      requests,
      errors,
      hold(key) {
        let resolve;
        const promise = new Promise((r) => (resolve = r));
        gates.set(key, { promise, resolve });
      },
      release(key) {
        const gate = gates.get(key);
        gates.delete(key);
        gate?.resolve();
      },
      login(value) {
        signedIn = value;
      },
      role(value) {
        role = value;
      },
      async start(query = "") {
        await page.goto(baseUrl + "/" + query);
      },
      async close() {
        assert.deepEqual(errors, []);
        await context.close();
      },
    };
  }
  async function test(name, fn) {
    const f = await fixture();
    try {
      await fn(f);
      console.log("PASS", name);
    } catch (e) {
      console.log("FAIL URL", f.page.url());
      console.log((await f.page.locator("body").innerText()).slice(0, 1500));
      throw e;
    } finally {
      await f.close();
    }
  }
  try {
    await test("view/mod history, reload, exact copied links and sidebar filter independence", async (f) => {
      const p = f.page;
      await f.start();
      await p.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      assert.equal(new URL(p.url()).searchParams.get("modset"), "1");
      await p.locator(".mod-row").filter({ hasText: "Operations ABC" }).click();
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      const abc = p.url();
      await p.locator(".mod-row").filter({ hasText: "Operations DEF" }).click();
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      await p.goBack();
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      assert.equal(p.url(), abc);
      await p.goForward();
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      await p.reload();
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      await p.getByLabel("Search mods").fill("ABC");
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      assert.equal(new URL(p.url()).searchParams.get("mod"), "DEF");
      await p.getByRole("button", { name: "Modsets", exact: true }).click();
      assert.equal(new URL(p.url()).searchParams.get("view"), "modsets");
      await p.reload();
      await p
        .getByRole("button", { name: "Open modset Reserve", exact: true })
        .waitFor();
      await p.goBack();
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      await p.goto(abc);
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
    });
    await test("administration sections and account restore through back/forward and reload", async (f) => {
      const p = f.page;
      await f.start("?view=admin&section=groups");
      await p.getByRole("heading", { name: /^Groups(?: \d+)?$/ }).waitFor();
      const nav = p.getByRole("navigation", {
        name: "Administration sections",
      });
      await nav.getByRole("button", { name: "Discord", exact: true }).click();
      await p
        .getByRole("heading", { name: "Discord webhooks", exact: true })
        .waitFor();
      await nav.getByRole("button", { name: "Audit log", exact: true }).click();
      await p.reload();
      await p
        .getByRole("heading", { name: "Audit log", exact: true })
        .waitFor();
      assert.equal(new URL(p.url()).searchParams.get("section"), "audit");
      await p.goBack();
      await p
        .getByRole("heading", { name: "Discord webhooks", exact: true })
        .waitFor();
      await p.goBack();
      await p.getByRole("heading", { name: /^Groups(?: \d+)?$/ }).waitFor();
      await p.goForward();
      await p
        .getByRole("heading", { name: "Discord webhooks", exact: true })
        .waitFor();
      await p.locator(".account-menu summary").click();
      await p
        .getByRole("button", { name: "Account settings", exact: true })
        .click();
      await p.reload();
      await p
        .getByRole("heading", { name: "Account settings", exact: true })
        .waitFor();
      assert.equal(new URL(p.url()).searchParams.get("view"), "account");
    });
    await test("legacy Discord links and delayed mod loading retain intended selection", async (f) => {
      f.hold("mods:2");
      await f.start("?modset=2&mod=DEF");
      await f.page
        .getByText("Loading mods…", { exact: true })
        .first()
        .waitFor();
      assert.equal(new URL(f.page.url()).searchParams.get("mod"), "DEF");
      assert.equal(
        await f.page
          .getByRole("heading", { name: "Operations ABC", exact: true })
          .count(),
        0,
      );
      f.release("mods:2");
      await f.page
        .getByRole("heading", { name: "Reserve DEF", exact: true })
        .waitFor();
      await f.page.reload();
      await f.page
        .getByRole("heading", { name: "Reserve DEF", exact: true })
        .waitFor();
      assert.equal(f.requests.filter((r) => r.method !== "GET").length, 0);
    });
    await test("failed list reads preserve URL and retry selects original target", async (f) => {
      f.failures.add("/modsets");
      await f.start("?modset=2&mod=DEF");
      await f.page
        .getByText("Could not load modsets.", { exact: true })
        .waitFor();
      assert.equal(new URL(f.page.url()).searchParams.get("modset"), "2");
      f.failures.delete("/modsets");
      f.failures.add("mods:2");
      await f.page.getByRole("button", { name: "Retry", exact: true }).click();
      await f.page
        .getByText("Could not load mods.", { exact: true })
        .first()
        .waitFor();
      assert.equal(new URL(f.page.url()).searchParams.get("mod"), "DEF");
      f.failures.delete("mods:2");
      await f.page
        .locator(".detail")
        .getByRole("button", { name: "Retry", exact: true })
        .click();
      await f.page
        .getByRole("heading", { name: "Reserve DEF", exact: true })
        .waitFor();
    });
    await test("local login retains requested destination", async (f) => {
      f.login(false);
      await f.start("?modset=2&mod=DEF");
      await f.page.getByLabel("Username", { exact: true }).fill("admin");
      await f.page
        .getByLabel("Password", { exact: true })
        .fill("test-password");
      await f.page
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await f.page
        .getByRole("heading", { name: "Reserve DEF", exact: true })
        .waitFor();
    });
    await test("OIDC round-trip restores destination once from same-tab storage", async (f) => {
      f.login(false);
      await f.start("?view=admin&section=groups&modset=2");
      await f.page
        .getByRole("button", { name: "Sign in with OIDC", exact: true })
        .waitFor();
      await f.page.route("**/api/auth/oidc/login", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "OIDC provider fixture",
        }),
      );
      await f.page
        .getByRole("button", { name: "Sign in with OIDC", exact: true })
        .click();
      await f.page.waitForURL("**/api/auth/oidc/login");
      f.login(true);
      await f.page.goto(baseUrl + "/");
      await f.page
        .getByRole("heading", { name: /^Groups(?: \d+)?$/ })
        .waitFor();
      assert.equal(new URL(f.page.url()).searchParams.get("modset"), "2");
      assert.equal(
        await f.page.evaluate(() =>
          sessionStorage.getItem("armm.loginDestination"),
        ),
        null,
      );
    });
    await test("unavailable targets and malformed links provide recovery without URL rewrite", async (f) => {
      for (const query of [
        "?modset=999&mod=ABC",
        "?modset=2&mod=MISSING",
        "?view=invalid",
        "?modset=bad",
        "?view=admin&section=bad",
      ]) {
        await f.start(query);
        await f.page
          .getByRole("heading", { name: "Page unavailable", exact: true })
          .waitFor();
        assert.equal(new URL(f.page.url()).search, query);
        await f.page
          .locator(".detail")
          .getByRole("button", { name: "Back to overview", exact: true })
          .click();
        await f.page
          .getByRole("heading", { name: "Overview", exact: true })
          .waitFor();
      }
    });
    await test("non-admin cannot open administrative URL; account remains available", async (f) => {
      f.role("user");
      await f.start("?view=admin&section=users");
      await f.page
        .getByText("You do not have access to this administration page.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        f.requests.some((r) => r.path === "/users"),
        false,
      );
      await f.start("?view=account");
      await f.page
        .getByRole("heading", { name: "Account settings", exact: true })
        .waitFor();
    });
    await test("switch modsets then back restores prior mod despite persisted server preference", async (f) => {
      const p = f.page;
      await f.start("?modset=1&mod=DEF");
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      await p
        .getByRole("combobox", { name: "Active modset", exact: true })
        .click();
      await p.getByRole("option", { name: "Reserve", exact: true }).click();
      await p.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      assert.equal(new URL(p.url()).searchParams.get("modset"), "2");
      await p.goBack();
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
      await p.reload();
      await p
        .getByRole("heading", { name: "Operations DEF", exact: true })
        .waitFor();
    });
    await test("late mod responses and activation cannot overwrite newer browser navigation", async (f) => {
      const p = f.page;
      await f.start("?modset=1&mod=ABC");
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      await p.getByRole("button", { name: "Modsets", exact: true }).click();
      f.hold("/modsets/2/activate");
      await p
        .getByRole("button", { name: "Open modset Reserve", exact: true })
        .click();
      await p.waitForTimeout(100);
      await p.goBack();
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      f.release("/modsets/2/activate");
      await p.waitForTimeout(500);
      assert.equal(new URL(p.url()).searchParams.get("modset"), "1");
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      f.hold("mods:2");
      await p
        .getByRole("combobox", { name: "Active modset", exact: true })
        .click();
      await p.getByRole("option", { name: "Reserve", exact: true }).click();
      await p.getByText("Loading mods…", { exact: true }).first().waitFor();
      await p.goBack();
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      f.release("mods:2");
      await p.waitForTimeout(400);
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
    });
    await test("adding to another modset opens its exact URL and deleting returns to overview", async (f) => {
      const p = f.page;
      await f.start("?modset=1");
      await p.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      await p.getByRole("button", { name: "Add mod", exact: true }).click();
      let dialog = p.getByRole("dialog");
      await dialog.getByLabel("Workshop ID", { exact: true }).fill("NEW");
      await dialog
        .getByRole("combobox", { name: "Target modset", exact: true })
        .click();
      await p.getByRole("option", { name: "Reserve", exact: true }).click();
      await dialog.getByRole("button", { name: "Add", exact: true }).click();
      await p
        .getByRole("heading", { name: "Reserve NEW", exact: true })
        .waitFor();
      assert.equal(new URL(p.url()).searchParams.get("modset"), "2");
      assert.equal(new URL(p.url()).searchParams.get("mod"), "NEW");
      await p.getByRole("button", { name: "Remove mod", exact: true }).click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await p.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      assert.equal(new URL(p.url()).searchParams.has("mod"), false);
      await p.goBack();
      await p
        .getByText("This mod is no longer tracked in this modset.", {
          exact: true,
        })
        .waitFor();
    });
    await test("late mod creation and deletion do not redirect newer browser history", async (f) => {
      const p = f.page;
      await f.start("?modset=1&mod=ABC");
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      await p.getByRole("button", { name: "Workspace", exact: true }).click();
      await p.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      f.hold("add");
      await p.getByRole("button", { name: "Add mod", exact: true }).click();
      await p
        .getByRole("dialog")
        .getByLabel("Workshop ID", { exact: true })
        .fill("NEW");
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Add", exact: true })
        .click();
      await p.waitForTimeout(100);
      await p.goBack();
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      f.release("add");
      await p.waitForTimeout(400);
      assert.equal(new URL(p.url()).searchParams.get("mod"), "ABC");
      await p.getByRole("button", { name: "Workspace", exact: true }).click();
      await p.locator(".mod-row").filter({ hasText: "Operations ABC" }).click();
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      f.hold("remove");
      await p.getByRole("button", { name: "Remove mod", exact: true }).click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await p.waitForTimeout(100);
      await p.goBack();
      await p.getByRole("heading", { name: "Overview", exact: true }).waitFor();
      const before = p.url();
      f.release("remove");
      await p.waitForTimeout(400);
      assert.equal(p.url(), before);
    });
    await test("mobile back closes drawer and errors fit both themes", async (f) => {
      const p = f.page;
      await p.setViewportSize({ width: 390, height: 844 });
      await f.start("?modset=1&mod=ABC");
      await p
        .getByRole("heading", { name: "Operations ABC", exact: true })
        .waitFor();
      await p.getByRole("button", { name: "Modsets", exact: true }).click();
      await p.goBack();
      await p
        .getByRole("button", { name: "Open mod list", exact: true })
        .click();
      await p
        .getByRole("button", { name: "Close mod list", exact: true })
        .first()
        .waitFor();
      await p.goForward();
      await p
        .getByRole("button", { name: "Open modset Reserve", exact: true })
        .waitFor();
      assert.equal(await p.locator(".detail").evaluate((n) => n.inert), false);
      for (const theme of ["dark", "light"]) {
        await f.start("?modset=2&mod=MISSING");
        await p
          .getByRole("heading", { name: "Page unavailable", exact: true })
          .waitFor();
        await p.evaluate(
          (t) => (document.documentElement.dataset.theme = t),
          theme,
        );
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await p.waitForTimeout(250);
        if (process.env.ARMM_TEST_SCREENSHOTS) {
          require("node:fs").mkdirSync(process.env.ARMM_TEST_SCREENSHOTS, {
            recursive: true,
          });
          await p.screenshot({
            path: require("node:path").join(
              process.env.ARMM_TEST_SCREENSHOTS,
              `url-error-${theme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    });
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
