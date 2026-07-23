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

function parseEvent() {
  try {
    return JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON || "{}");
  } catch {
    return {};
  }
}

// Best-effort extraction — field names aren't fully documented, so try a
// handful of plausible shapes rather than assuming one.
function firstDefined(...vals) {
  return vals.find((v) => v !== undefined && v !== null && v !== "");
}

function resolveTabId(context, event) {
  return firstDefined(
    process.env.HERDR_TAB_ID,
    context.tab?.tab_id,
    context.tab_id,
    event.tab?.tab_id,
    event.tab_id,
  );
}

function resolveCwd(context, event, tabId) {
  const fromContext = firstDefined(
    context.pane?.cwd,
    context.worktree?.path,
    context.cwd,
    event.pane?.cwd,
    event.cwd,
  );
  if (fromContext) return fromContext;

  if (tabId) {
    const info = herdrJson(["tab", "get", tabId]);
    const cwd = firstDefined(
      info?.result?.root_pane?.cwd,
      info?.result?.tab?.cwd,
      info?.result?.cwd,
    );
    if (cwd) return cwd;
  }
  return null;
}

function resolveAgentName(context, event) {
  return firstDefined(
    context.agent?.name,
    context.pane?.agent,
    event.agent?.name,
    event.pane?.agent_name,
  );
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

function buildLabel(cwd, agentName) {
  if (!cwd) return agentName || null;
  const dirName = path.basename(cwd);
  const branch = gitBranch(cwd);

  let label = branch && branch !== "HEAD" ? `${dirName}:${branch}` : dirName;
  if (agentName) label = `${label} · ${agentName}`;
  return label;
}

function main() {
  const context = parseContext();
  const event = parseEvent();

  const tabId = resolveTabId(context, event);
  if (!tabId) {
    process.stderr.write("autotab: no tab id available, skipping rename\n");
    return;
  }

  const cwd = resolveCwd(context, event, tabId);
  const agentName = resolveAgentName(context, event);
  const label = buildLabel(cwd, agentName);

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
