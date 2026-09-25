import { prisma } from "../src/lib/prisma";
import { seedSampleFacilities } from "./facilities";

/**
 * Add the sample reservoirs, wells and pump stations to an organization that
 * already exists.
 *
 * `seed.ts` empties the database before it writes, which makes it useless for
 * anything that already holds work. This adds only what is missing and leaves
 * everything else — including a facility of the same code someone has since
 * edited — exactly where it is, so it is safe to run more than once and safe to
 * run against a database that is in use.
 *
 *   npm run db:seed:facilities                 the only organization
 *   npm run db:seed:facilities -- <orgId>      one of several
 */
/**
 * Which database this is about to write to, credentials stripped.
 *
 * Every organization in every environment is called Meridian Falls Water
 * Utility, so the name above says nothing about where the rows are landing.
 * `.env` holds the local URL, which means the obvious command writes to Docker
 * even when the intent was production — and the only thing that gave that away
 * was a count of zero.
 */
function whereAmI(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return "nowhere — DATABASE_URL is not set";
  try {
    const { hostname, port, pathname } = new URL(url);
    const local = /^(localhost|127\.0\.0\.1|host\.docker\.internal)$/.test(hostname);
    return `${hostname}${port ? `:${port}` : ""}${pathname} ${local ? "(local)" : "(remote — not your Docker database)"}`;
  } catch {
    return "an unreadable DATABASE_URL";
  }
}

async function main() {
  const wanted = process.argv[2];
  console.log(`Database: ${whereAmI()}`);

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (organizations.length === 0) throw new Error("No organization in this database — run the seed first.");

  const organization = wanted
    ? organizations.find((o) => o.id === wanted)
    : organizations.length === 1
      ? organizations[0]
      : undefined;

  if (!organization) {
    console.error(
      wanted
        ? `No organization ${wanted}. This database holds:`
        : "More than one organization here, so say which one:"
    );
    for (const o of organizations) console.error(`  ${o.id}  ${o.name}`);
    process.exit(1);
  }

  console.log(`Adding sample facilities to ${organization.name}…`);
  const summary = await seedSampleFacilities(prisma, organization.id);
  console.log(`  ${summary.types} asset types configured`);
  console.log(`  ${summary.created} facilities created`);
  console.log(
    summary.skipped > 0
      ? `  ${summary.skipped} already there, left alone`
      : "  nothing was already there"
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
