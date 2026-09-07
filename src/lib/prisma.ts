import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";

/**
 * Prisma talks to Postgres through the Neon driver rather than its own Rust
 * query engine.
 *
 * The engine is a ~21MB native binary that Next.js traces into every route
 * function touching the database — 53 of 58 here — and it was by far the
 * largest thing in each deployment. With `engineType = "client"` in the
 * schema, Prisma plans queries in a 1.9MB WebAssembly compiler instead and the
 * binary is never generated: 47MB of client became 5.7MB.
 *
 * The Neon driver rather than node-postgres because `pg` reaches for `net`,
 * `dns`, `tls` and `fs`, which cannot be bundled — the build fails under both
 * Turbopack and webpack, `serverExternalPackages` notwithstanding. The Neon
 * driver imports no Node built-ins at all.
 *
 * It speaks WebSocket rather than raw TCP, which is why local development runs
 * a small proxy alongside Postgres (see docker-compose.yml). That keeps one
 * adapter for every environment: the alternative was node-postgres locally and
 * Neon in production, and a database layer that differs between the machine
 * you test on and the one that serves users is how subtle bugs survive review.
 */

const url = process.env.DATABASE_URL ?? "";
const isLocalPostgres = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

if (isLocalPostgres) {
  // Route to the proxy on 5433 and drop the TLS handshakes, which a local
  // plaintext Postgres does not offer. Node 22+ provides WebSocket globally,
  // so no extra package is needed — and nothing here reaches the bundle,
  // because production never takes this branch.
  neonConfig.wsProxy = (host) => `${host}:5433/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // The adapter owns the connection pool now, so pool settings that used to
  // ride in the connection string belong here instead.
  const adapter = new PrismaNeon({ connectionString: url });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
