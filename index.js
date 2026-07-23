"use strict";

const { spawnSync, execSync } = require("node:child_process");
const path = require("node:path");

const herdr = process.env.HERDR_BIN_PATH ?? "herdr";

function herdrJson(args) {
  const result = spawnSync(herdr, [...args, "--json"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function parseContext() {
  try {
    return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || "{}");
  } catch {
    return {};
  }
}

// Field names confirmed against `herdr api schema --json`'s
// PluginInvocationContext (this is the shape of HERDR_PLUGIN_CONTEXT_JSON) —
// it's flat, not nested under "tab"/"pane" keys.
function firstDefined(...vals) {
  return vals.find((v) => v !== undefined && v !== null && v !== "");
}

function resolveTabId(context) {
  return firstDefined(process.env.HERDR_TAB_ID, context.tab_id);
}

function resolveCwd(context, tabId) {
  const fromContext = firstDefined(
    context.focused_pane_cwd,
    context.worktree?.checkout_path,
    context.workspace_cwd,
  );
  if (fromContext) return fromContext;

  if (tabId) {
    const info = herdrJson(["tab", "get", tabId]);
    const cwd = firstDefined(info?.result?.root_pane?.cwd);
    if (cwd) return cwd;
  }
  return null;
}

function resolveAgentName(context) {
  return firstDefined(context.focused_pane_agent);
}

function gitBranch(cwd) {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function buildLabel(cwd, repoName, agentName) {
  if (!cwd && !repoName) return agentName || null;
  const dirName = repoName || path.basename(cwd);
  const branch = cwd ? gitBranch(cwd) : null;

  let label = branch && branch !== "HEAD" ? `${dirName}:${branch}` : dirName;
  if (agentName) label = `${label} · ${agentName}`;
  return label;
}

function main() {
  const context = parseContext();

  const tabId = resolveTabId(context);
  if (!tabId) {
    process.stderr.write("autotab: no tab id available, skipping rename\n");
    return;
  }

  const cwd = resolveCwd(context, tabId);
  const repoName = context.worktree?.repo_name;
  const agentName = resolveAgentName(context);
  const label = buildLabel(cwd, repoName, agentName);

  if (!label) {
    process.stderr.write("autotab: could not determine a label, skipping rename\n");
    return;
  }

  const result = spawnSync(herdr, ["tab", "rename", tabId, label], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    process.stderr.write(`autotab: rename failed: ${result.stderr}\n`);
  }
}

main();
