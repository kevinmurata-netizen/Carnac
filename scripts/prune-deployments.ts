/**
 * Delete old Vercel deployments, keeping the one live in production and the
 * most recent production deployments before it as rollback targets — for
 * every site in scripts/sites.ts, or the ones named.
 *
 *   npm run vercel:prune                        -- dry run, every site
 *   npm run vercel:prune -- --yes               -- actually deletes
 *   npm run vercel:prune -- --keep-rollbacks 0  -- keep only the live one
 *   npm run vercel:prune -- --site carnac-power -- one site, by name or Vercel project
 *
 * One rollback is kept by default: a deployment you have deleted cannot be
 * promoted back, so pruning to the live one alone leaves nothing to fall back
 * to if the latest release turns out to be broken.
 *
 * Every push creates a stored deployment (preview or production) that Vercel
 * keeps indefinitely on the Hobby plan, and only the most recent production
 * one ever serves traffic. Left alone, that adds up fast against the plan's
 * function-storage cap. "Live" is looked up by asking the API which
 * deployment each site's address currently resolves to, not by guessing from
 * timestamps, so a manual rollback is respected rather than undone.
 *
 * Needs a Vercel auth token: run `vercel login` once (this reads the token
 * the CLI already saved) or set VERCEL_TOKEN yourself, e.g. in CI. Needs the
 * team, read from .vercel/project.json if you've run `vercel link`, or set
 * VERCEL_TEAM_ID directly; each site's project is looked up by its name.
 *
 * On a 403 saying `invalidToken`, run `vercel whoami` and try again. The CLI
 * rotates the token in that file, and this script only ever reads it — so the
 * saved token can be stale while the CLI itself still works, and running any
 * CLI command refreshes it. It looks like an outage and is not one.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SITES, type Site } from "./sites";

function arg(flag: string): boolean {
  return process.argv.includes(flag);
}

/** Every value given for a flag that may repeat: --site a --site b. */
function listArg(flag: string): string[] {
  return process.argv.flatMap((a, i) => (a === flag && process.argv[i + 1] ? [process.argv[i + 1]] : []));
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

function readLinkedTeam(): string | undefined {
  const path = join(process.cwd(), ".vercel", "project.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")).orgId;
  } catch {
    return undefined;
  }
}

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    // The one failure that looks like Vercel being down and is not: the saved
    // token has rotated since this read it. Say what fixes it, here, rather
    // than leaving a bare 403 to be diagnosed twice.
    const stale = res.status === 403 && body.includes("invalidToken");
    throw new Error(
      `${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}` +
        (stale ? `\n\nThe saved Vercel token is stale. Run \`vercel whoami\` to refresh it, then try again.` : "")
    );
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

type Options = { dryRun: boolean; keepRollbacks: number };

/** Prune one site. Returns how many deletions failed. */
async function pruneSite(token: string, teamId: string, site: Site, { dryRun, keepRollbacks }: Options): Promise<number> {
  const project = await api<{ id: string }>(token, `/v9/projects/${encodeURIComponent(site.vercelProject)}?teamId=${teamId}`);

  // Ask the alias what it points at: that is the definition of "live", and it
  // respects a manual rollback. The alias object calls it `deploymentId`; the
  // list endpoint below calls the same value `uid`.
  const alias = await api<{ deploymentId: string }>(
    token,
    `/v4/aliases/${encodeURIComponent(site.address)}?teamId=${teamId}`
  );
  const liveId = alias.deploymentId;

  const deployments = await fetchAllDeployments(token, project.id, teamId);
  const live = deployments.find((d) => d.uid === liveId);
  if (!live) {
    // Refuse rather than guess: without the live deployment in hand there is
    // no safe way to say which others are older than it.
    throw new Error(`${site.address} points at ${liveId}, which is not in ${site.vercelProject}'s deployment list.`);
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
  console.log(`Keeping live:      ${liveId}  ${new Date(live.created).toISOString()}  (${site.address})`);
  for (const d of rollbacks) {
    console.log(`Keeping rollback:  ${d.uid}  ${new Date(d.created).toISOString()}`);
  }
  if (rollbacks.length < keepRollbacks) {
    console.log(`(Asked to keep ${keepRollbacks} rollback(s); only ${rollbacks.length} earlier production deployment(s) exist.)`);
  }
  console.log(`${toDelete.length} eligible for deletion.`);

  if (dryRun) {
    for (const d of toDelete) {
      console.log(
        `  would delete  ${d.uid}  ${d.target ?? "preview"}  ${d.state ?? d.readyState ?? "?"}  ${new Date(d.created).toISOString()}`
      );
    }
    return 0;
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
  for (const f of failed) console.log(`  failed ${f.uid}: ${f.error}`);
  return failed.length;
}

async function main() {
  const options: Options = { dryRun: !arg("--yes"), keepRollbacks: numberArg("--keep-rollbacks", 1) };

  const token = process.env.VERCEL_TOKEN ?? findCliToken();
  if (!token) throw new Error("No Vercel token found. Run `vercel login` once, or set VERCEL_TOKEN.");
  const teamId = process.env.VERCEL_TEAM_ID ?? readLinkedTeam();
  if (!teamId) throw new Error("No team found. Run `vercel link`, or set VERCEL_TEAM_ID.");

  const named = listArg("--site").map((n) => n.toLowerCase());
  const sites = named.length
    ? SITES.filter((s) => named.includes(s.name.toLowerCase()) || named.includes(s.vercelProject.toLowerCase()))
    : SITES;
  const unknown = named.filter(
    (n) => !SITES.some((s) => s.name.toLowerCase() === n || s.vercelProject.toLowerCase() === n)
  );
  if (unknown.length) {
    throw new Error(`No site ${unknown.join(", ")} in scripts/sites.ts. Sites: ${SITES.map((s) => s.vercelProject).join(", ")}.`);
  }

  // One site's trouble — a stale alias, a failed delete — is reported and the
  // rest still run; the exit code says whether everything went through.
  const problems: string[] = [];
  for (const site of sites) {
    console.log(`\n== ${site.name} (${site.vercelProject})`);
    try {
      const failed = await pruneSite(token, teamId, site, options);
      if (failed) problems.push(`${site.name}: ${failed} deletion(s) failed`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log(message);
      problems.push(`${site.name}: ${message.split("\n")[0]}`);
    }
  }

  if (options.dryRun) console.log(`\nDry run — nothing deleted. Re-run with --yes to actually delete these.`);
  if (problems.length) {
    console.log(`\nNot everything went through:`);
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
