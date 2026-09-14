/**
 * Delete old Vercel deployments, keeping the one live in production and the
 * most recent production deployments before it as rollback targets.
 *
 *   npm run vercel:prune                      -- dry run, prints what would be deleted
 *   npm run vercel:prune -- --yes             -- actually deletes
 *   npm run vercel:prune -- --keep-rollbacks 0  -- keep only the live one
 *
 * One rollback is kept by default: a deployment you have deleted cannot be
 * promoted back, so pruning to the live one alone leaves nothing to fall back
 * to if the latest release turns out to be broken.
 *
 * Every push creates a stored deployment (preview or production) that Vercel
 * keeps indefinitely on the Hobby plan, and only the most recent production
 * one ever serves traffic. Left alone, that adds up fast against the plan's
 * function-storage cap. "Live" is looked up by asking the API which
 * deployment PRODUCTION_URL currently resolves to, not by guessing from
 * timestamps, so a manual rollback is respected rather than undone.
 *
 * Needs a Vercel auth token: run `vercel login` once (this reads the token
 * the CLI already saved) or set VERCEL_TOKEN yourself, e.g. in CI. Needs
 * PROJECT_ID and TEAM_ID, read from .vercel/project.json if you've run
 * `vercel link`, or set VERCEL_PROJECT_ID / VERCEL_TEAM_ID directly.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PRODUCTION_URL = "carnacms.vercel.app";

function arg(flag: string): boolean {
  return process.argv.includes(flag);
}

function numberArg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} needs a whole number of 0 or more`);
  return value;
}

function findCliToken(): string | undefined {
  // The Vercel CLI's own config directory moves by OS.
  const candidates = [
    join(homedir(), "AppData", "Roaming", "xdg.data", "com.vercel.cli", "auth.json"), // Windows
    join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"), // macOS
    join(homedir(), ".local", "share", "com.vercel.cli", "auth.json"), // Linux
    join(homedir(), ".vercel", "auth.json"), // older CLI versions, all platforms
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const token = JSON.parse(readFileSync(path, "utf8")).token;
        if (token) return token;
      } catch {
        // fall through to the next candidate
      }
    }
  }
  return undefined;
}

function readLinkedProject(): { projectId?: string; teamId?: string } {
  const path = join(process.cwd(), ".vercel", "project.json");
  if (!existsSync(path)) return {};
  try {
    const json = JSON.parse(readFileSync(path, "utf8"));
    return { projectId: json.projectId, teamId: json.orgId };
  } catch {
    return {};
  }
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

type Deployment = {
  uid: string;
  url: string;
  target: string | null;
  created: number;
  state?: string;
  readyState?: string;
};

async function fetchAllDeployments(token: string, projectId: string, teamId: string): Promise<Deployment[]> {
  const all: Deployment[] = [];
  let next: number | undefined;
  do {
    const qs = new URLSearchParams({ projectId, teamId, limit: "100" });
    if (next) qs.set("until", String(next));
    const page = await api<{ deployments: Deployment[]; pagination: { next: number | null } }>(
      token,
      `/v6/deployments?${qs}`
    );
    all.push(...page.deployments);
    next = page.pagination.next ?? undefined;
  } while (next);
  return all;
}

async function main() {
  const dryRun = !arg("--yes");
  const keepRollbacks = numberArg("--keep-rollbacks", 1);

  const token = process.env.VERCEL_TOKEN ?? findCliToken();
  if (!token) throw new Error("No Vercel token found. Run `vercel login` once, or set VERCEL_TOKEN.");

  const linked = readLinkedProject();
  const projectId = process.env.VERCEL_PROJECT_ID ?? linked.projectId;
  const teamId = process.env.VERCEL_TEAM_ID ?? linked.teamId;
  if (!projectId || !teamId) {
    throw new Error("No project linked. Run `vercel link`, or set VERCEL_PROJECT_ID and VERCEL_TEAM_ID.");
  }

  // Ask the alias what it points at: that is the definition of "live", and it
  // respects a manual rollback. The alias object calls it `deploymentId`; the
  // list endpoint below calls the same value `uid`.
  const alias = await api<{ deploymentId: string }>(
    token,
    `/v4/aliases/${encodeURIComponent(PRODUCTION_URL)}?teamId=${teamId}`
  );
  const liveId = alias.deploymentId;

  const deployments = await fetchAllDeployments(token, projectId, teamId);
  const live = deployments.find((d) => d.uid === liveId);
  if (!live) {
    // Refuse rather than guess: without the live deployment in hand there is
    // no safe way to say which others are older than it.
    throw new Error(`${PRODUCTION_URL} points at ${liveId}, which is not in this project's deployment list.`);
  }

  // Rollback targets: finished production deployments that went live before
  // the current one, newest first. A preview or a failed build cannot be
  // promoted, so neither counts as something to fall back to.
  const rollbacks = deployments
    .filter(
      (d) =>
        d.uid !== liveId &&
        d.target === "production" &&
        (d.state ?? d.readyState) === "READY" &&
        d.created < live.created
    )
    .sort((a, b) => b.created - a.created)
    .slice(0, keepRollbacks);

  const keep = new Set([liveId, ...rollbacks.map((d) => d.uid)]);
  const toDelete = deployments.filter((d) => !keep.has(d.uid));

  console.log(`${deployments.length} deployments total.`);
  console.log(`Keeping live:      ${liveId}  ${new Date(live.created).toISOString()}  (${PRODUCTION_URL})`);
  for (const d of rollbacks) {
    console.log(`Keeping rollback:  ${d.uid}  ${new Date(d.created).toISOString()}`);
  }
  if (rollbacks.length < keepRollbacks) {
    console.log(`(Asked to keep ${keepRollbacks} rollback(s); only ${rollbacks.length} earlier production deployment(s) exist.)`);
  }
  console.log(`${toDelete.length} eligible for deletion.\n`);

  if (dryRun) {
    for (const d of toDelete) {
      console.log(
        `  would delete  ${d.uid}  ${d.target ?? "preview"}  ${d.state ?? d.readyState ?? "?"}  ${new Date(d.created).toISOString()}`
      );
    }
    console.log(`\nDry run — nothing deleted. Re-run with --yes to actually delete these.`);
    return;
  }

  let ok = 0;
  const failed: { uid: string; error: string }[] = [];
  for (const d of toDelete) {
    try {
      await api(token, `/v13/deployments/${d.uid}?teamId=${teamId}`, { method: "DELETE" });
      ok++;
    } catch (e) {
      failed.push({ uid: d.uid, error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`Deleted ${ok}/${toDelete.length}.`);
  if (failed.length) {
    console.log(`Failed:`);
    for (const f of failed) console.log(`  ${f.uid}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
