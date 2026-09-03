/**
 * Delete every Vercel deployment except the one currently live in production.
 *
 *   npm run vercel:prune              -- dry run, prints what would be deleted
 *   npm run vercel:prune -- --yes     -- actually deletes
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

type Deployment = { uid: string; url: string; target: string | null; created: number };

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

  const token = process.env.VERCEL_TOKEN ?? findCliToken();
  if (!token) throw new Error("No Vercel token found. Run `vercel login` once, or set VERCEL_TOKEN.");

  const linked = readLinkedProject();
  const projectId = process.env.VERCEL_PROJECT_ID ?? linked.projectId;
  const teamId = process.env.VERCEL_TEAM_ID ?? linked.teamId;
  if (!projectId || !teamId) {
    throw new Error("No project linked. Run `vercel link`, or set VERCEL_PROJECT_ID and VERCEL_TEAM_ID.");
  }

  // This endpoint's deployment object uses `id`; the list endpoint below
  // uses `uid` for the same value — genuinely inconsistent across the API.
  const live = await api<{ id: string }>(
    token,
    `/v13/deployments/get?url=${encodeURIComponent(PRODUCTION_URL)}&teamId=${teamId}`
  );

  const deployments = await fetchAllDeployments(token, projectId, teamId);
  const toDelete = deployments.filter((d) => d.uid !== live.id);

  console.log(`${deployments.length} deployments total. Keeping the live one: ${live.id} (${PRODUCTION_URL}).`);
  console.log(`${toDelete.length} eligible for deletion.\n`);

  if (dryRun) {
    for (const d of toDelete) {
      console.log(`  would delete  ${d.uid}  ${d.url}  ${d.target ?? "preview"}  ${new Date(d.created).toISOString()}`);
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
