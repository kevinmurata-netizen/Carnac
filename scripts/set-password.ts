/**
 * Set a login password, creating the account if it does not exist.
 *
 *   npm run user:password -- <email> [--name "Full Name"] [--role Executive]
 *
 * A strong password is generated and printed once. Pass --password to choose
 * your own instead — but note that puts the password in your shell history.
 *
 * Runs against whatever DATABASE_URL points at, so to change the password on a
 * deployed instance, set DATABASE_URL to the production connection string for
 * this one command:
 *
 *   DATABASE_URL="postgresql://..." npm run user:password -- reviewer@example.com
 *
 * The seeded demo accounts share a password that is committed to this repo, so
 * anything reachable from the internet should get a fresh one from here.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Base58-ish: no look-alike characters, so it survives being read aloud or
 * retyped from a chat message. */
function generatePassword(length = 20): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run user:password -- <email> [--name \"Full Name\"] [--role Executive]");
    process.exit(1);
  }

  const password = arg("--password") ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email }, include: { role: true } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { passwordHash, isActive: true },
    });
    console.log(`\nUpdated password for existing user.`);
    console.log(`  email:    ${email}`);
    console.log(`  name:     ${existing.name}`);
    console.log(`  role:     ${existing.role.name}`);
  } else {
    const organization = await prisma.organization.findFirst();
    if (!organization) throw new Error("No organization found — run the seed first (npm run db:seed).");

    const roleName = arg("--role") ?? "Executive";
    const role = await prisma.role.findFirst({ where: { name: roleName } });
    if (!role) {
      const available = (await prisma.role.findMany({ select: { name: true } })).map((r) => r.name);
      throw new Error(`Role "${roleName}" not found. Available roles: ${available.join(", ")}`);
    }

    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        email,
        name: arg("--name") ?? email.split("@")[0],
        passwordHash,
        roleId: role.id,
      },
    });
    console.log(`\nCreated new user.`);
    console.log(`  email:    ${email}`);
    console.log(`  name:     ${user.name}`);
    console.log(`  role:     ${role.name}`);
  }

  console.log(`  password: ${password}`);
  console.log(`\nThis password is shown once and stored only as a hash. Send it over something`);
  console.log(`private, not the same channel as the URL if you can avoid it.\n`);
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
