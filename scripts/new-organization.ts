/**
 * Start a customer from nothing: an organization, its branding and one
 * Administrator, with no demo data — no assets, no asset types, no models.
 * Everything else is set up in the app: Settings › Asset Types, Data Import.
 *
 *   npm run org:new -- --name "Ridgeway Power Cooperative" --admin you@example.com
 *     [--admin-name "Full Name"] [--product "Ridgeway AMS"] [--tagline "Asset Management Platform"]
 *     [--logo zap|droplets|flame|network] [--asset Asset] [--assets Assets]
 *     [--item asset] [--items assets] [--alongside]
 *
 * Runs against whatever DATABASE_URL points at — a new customer's own Neon
 * database, after `npx prisma migrate deploy` (see DEPLOYMENT.md, "A new
 * customer"). It refuses a database that already has an organization, so a
 * customer's site is never run beside another's by accident; --alongside adds
 * the organization to a shared site deliberately.
 *
 * The Administrator's password is generated and printed once, stored only as
 * a hash.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { ensureSystemRoles } from "../src/server/system-roles";
import { updateBranding } from "../src/server/branding";
import { BRAND_LOGOS, DEFAULT_BRANDING } from "../src/lib/branding";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Base58-ish: no look-alike characters, so it survives being read aloud. */
function generatePassword(length = 20): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join("");
}

const USAGE =
  'Usage: npm run org:new -- --name "Organization Name" --admin admin@example.com [--admin-name "Full Name"] ' +
  "[--product NAME] [--tagline TEXT] [--logo zap|droplets|flame|network] [--asset Asset] [--assets Assets] " +
  "[--item asset] [--items assets] [--alongside]";

async function main() {
  const name = arg("--name")?.trim();
  const adminEmail = arg("--admin")?.trim().toLowerCase();
  if (!name || !adminEmail || !adminEmail.includes("@")) throw new Error(USAGE);

  const logo = arg("--logo") ?? "network";
  if (!BRAND_LOGOS.some((l) => l.key === logo)) {
    throw new Error(`--logo must be one of: ${BRAND_LOGOS.map((l) => l.key).join(", ")}`);
  }

  const existing = await prisma.organization.findMany({ select: { name: true } });
  if (existing.length > 0 && !process.argv.includes("--alongside")) {
    throw new Error(
      `This database already has ${existing.map((o) => `"${o.name}"`).join(", ")}. A new customer gets its own ` +
        "database; pass --alongside only to add an organization to a shared site on purpose."
    );
  }
  if (existing.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`An organization called "${name}" already exists here`);
  }
  if (await prisma.user.findUnique({ where: { email: adminEmail } })) {
    throw new Error(`${adminEmail} already has an account on this site`);
  }

  const roles = await ensureSystemRoles();
  const organization = await prisma.organization.create({ data: { name } });

  // A neutral platform by default — not water's words — unless told otherwise.
  await updateBranding(organization.id, {
    productName: arg("--product") ?? DEFAULT_BRANDING.productName,
    tagline: arg("--tagline") ?? "Asset Management Platform",
    logo,
    assetSingular: arg("--asset") ?? "Asset",
    assetPlural: arg("--assets") ?? "Assets",
    itemSingular: arg("--item") ?? "asset",
    itemPlural: arg("--items") ?? "assets",
  });

  const password = generatePassword();
  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: adminEmail,
      name: arg("--admin-name") ?? adminEmail.split("@")[0],
      passwordHash: await bcrypt.hash(password, 10),
      roleId: roles.ADMINISTRATOR,
    },
  });

  console.log(`\nCreated ${name}.`);
  console.log(`  administrator: ${adminEmail}`);
  console.log(`  password:      ${password}`);
  console.log(`\nThe password is shown once and stored only as a hash. Sign in, then set the network up under`);
  console.log(`Settings › Asset Types and load it under Settings › Data Import.\n`);
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
