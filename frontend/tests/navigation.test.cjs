const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

// Use the same compiler as the production build, without depending on its JS API.
const output = fs.mkdtempSync(path.join(os.tmpdir(), "armm-navigation-tests-"));
let source;
try {
  execFileSync(
    path.join(__dirname, "../node_modules/.bin/tsc"),
    [
      path.join(__dirname, "../src/lib/navigation.ts"),
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--skipLibCheck",
      "--outDir",
      output,
    ],
    { cwd: output, stdio: "pipe" },
  );
  source = fs.readFileSync(path.join(output, "navigation.js"), "utf8");
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

function browser(href = "https://armm.example/", destination = null) {
  const storage = new Map();
  if (destination)
    storage.set("armm.loginDestination", JSON.stringify(destination));
  const window = { location: new URL(href) };
  window.history = {
    replaceState(_state, _unused, url) {
      window.location = new URL(url, window.location);
    },
  };
  const sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const context = { exports: {}, URL, URLSearchParams, window, sessionStorage };
  vm.runInNewContext(source, context);
  return { ...context.exports, window, storage, sessionStorage };
}

test("existing Discord links retain the explicit modset and mod", () => {
  const nav = browser();
  const route = nav.readRoute("?modset=2&mod=ABC");
  assert.equal(route.view, "workspace");
  assert.equal(route.modsetId, 2);
  assert.equal(route.modId, "ABC");
  assert.equal(route.invalid, false);
});

test("all application destinations survive URL serialization", () => {
  const nav = browser();
  for (const search of [
    "?modset=2&mod=ABC",
    "?view=modsets&modset=2",
    "?view=account&modset=2",
    ...["users", "groups", "discord", "audit"].map(
      (section) => `?view=admin&section=${section}&modset=2`,
    ),
  ]) {
    const route = nav.readRoute(search);
    const result = nav.readRoute(
      new URL(nav.routeUrl(route), nav.window.location).search,
    );
    assert.equal(JSON.stringify(result), JSON.stringify(route));
  }
});

test("invalid destinations cannot silently select another page or modset", () => {
  const nav = browser();
  for (const search of [
    "?modset=bad",
    "?modset=",
    "?modset=0",
    "?modset=-1",
    "?modset=1.5",
    "?modset=9007199254740992",
    "?view=other",
    "?view=admin&section=other",
  ]) {
    assert.equal(nav.readRoute(search).invalid, true, search);
  }
});

test("navigation preserves unrelated query parameters and anchors", () => {
  const nav = browser(
    "https://armm.example/?context=example&modset=1&mod=OLD#workspace-content",
  );
  const route = nav.readRoute("?view=modsets&modset=2");
  const url = new URL(nav.routeUrl(route), nav.window.location);
  assert.equal(url.origin, "https://armm.example");
  assert.equal(url.searchParams.get("context"), "example");
  assert.equal(url.searchParams.get("modset"), "2");
  assert.equal(url.searchParams.has("mod"), false);
  assert.equal(url.hash, "#workspace-content");
});

test("OIDC returns to the saved local destination once", () => {
  const nav = browser(
    "https://armm.example/?view=admin&section=groups&modset=2",
  );
  nav.rememberLoginDestination();
  nav.window.location = new URL("https://armm.example/");
  const route = nav.initialRoute();
  assert.equal(route.view, "admin");
  assert.equal(route.section, "groups");
  assert.equal(route.modsetId, 2);
  assert.equal(nav.storage.has("armm.loginDestination"), false);
});

test("an explicit incoming URL takes precedence over an old login destination", () => {
  const nav = browser("https://armm.example/?modset=3&mod=NEW", {
    search: "?modset=2&mod=OLD",
    time: Date.now(),
  });
  assert.equal(nav.initialRoute().modId, "NEW");
  assert.equal(nav.storage.size, 0);
});

test("expired, malformed, future and external login destinations are discarded", () => {
  for (const destination of [
    { search: "?modset=2", time: Date.now() - 16 * 60 * 1000 },
    { search: "?modset=2", time: Date.now() + 60000 },
    { search: "?modset=bad", time: Date.now() },
    { search: "https://other.example/?modset=2", time: Date.now() },
  ]) {
    const nav = browser(undefined, destination);
    assert.equal(nav.initialRoute().modsetId, null);
    assert.equal(nav.window.location.href, "https://armm.example/");
    assert.equal(nav.storage.size, 0);
  }
});

test("navigation continues when browser storage is blocked", () => {
  const nav = browser("https://armm.example/?modset=2&mod=ABC");
  nav.sessionStorage.getItem = nav.sessionStorage.setItem = () => {
    throw new Error("Storage blocked");
  };
  assert.doesNotThrow(() => nav.rememberLoginDestination());
  assert.equal(nav.initialRoute().modId, "ABC");
});
