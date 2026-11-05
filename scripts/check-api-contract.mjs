import { readFile } from "node:fs/promises";

const app = await readFile("app.js", "utf8");
const worker = await readFile("thier-decor-api.js", "utf8");
const index = await readFile("index.html", "utf8");

function unique(values) {
  return [...new Set(values)].sort();
}

const adminActions = unique(
  [...app.matchAll(/callAdminWorker\(\s*["']([^"']+)["']/g)].map(match => match[1])
);
const customerActions = unique(
  [...app.matchAll(/callCustomerWorker\(\s*["']([^"']+)["']/g)].map(match => match[1])
);
const workerActions = new Set(
  [...worker.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map(match => match[1])
);

const missing = [...adminActions, ...customerActions].filter(action => !workerActions.has(action));
if (missing.length) {
  throw new Error("Browser actions missing from Worker router: " + unique(missing).join(", "));
}

// Asset query strings are used for cache-busting (for example, app.js?v=44).
const configIndex = index.search(/src=["']td-config\\.js(?:\\?[^"']*)?["']/);
const appIndex = index.search(/src=["']app\\.js(?:\\?[^"']*)?["']/);
const analyticsIndex = index.search(/src=["']analytics-notifications\\.js(?:\\?[^"']*)?["']/);
if (configIndex < 0 || appIndex < 0 || analyticsIndex < 0 ||
    !(configIndex < appIndex && appIndex < analyticsIndex)) {
  throw new Error("Script order must be td-config.js, app.js, then analytics-notifications.js.");
}

console.log("API contract OK: " + adminActions.length + " admin actions, " +
  customerActions.length + " customer actions mapped to Worker routes.");
console.log("Browser script loading order OK.");
