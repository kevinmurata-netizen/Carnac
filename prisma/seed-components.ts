import { prisma } from "../src/lib/prisma";
import { seedSampleComponents } from "./components";

/**
 * Add the sample facilities' components, and what inspections found on them,
 * to an organization that already exists. Additive and idempotent: an asset
 * that already has components is left alone.
 *
 *   npm run db:seed:components
 */
async function main() {
  const url = process.env.DATABASE_URL;
  const host = url ? new URL(url).hostname : "nowhere — DATABASE_URL is not set";
  console.log(`Database: ${host}${/^(localhost|127\.0\.0\.1)$/.test(host) ? " (local)" : " (remote — not your Docker database)"}`);

  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  if (organizations.length !== 1) {
    throw new Error(`Expected one organization, found ${organizations.length}`);
  }
  const org = organizations[0];

  console.log(`Adding sample components to ${org.name}…`);
  const s = await seedSampleComponents(prisma, org.id);
  console.log(`  ${s.componentTypes} component types, ${s.links} asset-type links`);
  console.log(`  ${s.componentsCreated} components created with ${s.observations} observations`);
  console.log(s.assetsSkipped > 0 ? `  ${s.assetsSkipped} assets already had components, left alone` : "  nothing was already there");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
