/**
 * Every site this repository is deployed as: one Vercel project and one Neon
 * database each, all built from `main`. Scripts that act on every site read
 * this list — keep it in step with the Sites table in DEPLOYMENT.md, which
 * carries the same rows for people.
 *
 * No secrets here: connection strings and passwords live in Neon and in each
 * Vercel project.
 */

export type Site = {
  /** What the runbook calls it. */
  name: string;
  /** The Vercel project's name, as on vercel.com. */
  vercelProject: string;
  /** The production address, without https:// — the alias that is live. */
  address: string;
};

export const SITES: Site[] = [
  { name: "Carnac", vercelProject: "carnac_ms", address: "carnacms.vercel.app" },
  { name: "Carnac Power", vercelProject: "carnac-power", address: "carnac-power.vercel.app" },
];
