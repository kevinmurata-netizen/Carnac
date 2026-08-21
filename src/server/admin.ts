import { prisma } from "@/lib/prisma";

export type ConfigSummary = {
  assetTypes: Array<{ id: string; code: string; name: string; assetCount: number }>;
  attributeDefinitions: Array<{ code: string; label: string; dataType: string; unit: string | null; required: boolean }>;
  inspectionTemplates: Array<{ name: string; fieldCount: number; inspectionCount: number; active: boolean }>;
  conditionModels: Array<{ name: string; scale: string; bandCount: number; measurementCount: number }>;
  deteriorationModels: Array<{ name: string; type: string; predictionCount: number; active: boolean }>;
  riskModels: Array<{ name: string; assessmentCount: number; active: boolean }>;
  treatments: Array<{ name: string; category: string; conditionRange: string; unitCost: number; costUnit: string }>;
  failureTypes: Array<{ code: string; label: string; eventCount: number }>;
};

export async function getConfigSummary(organizationId: string): Promise<ConfigSummary> {
  const [assetTypes, attributes, templates, conditionModels, deteriorationModels, riskModels, treatments, failureTypes] =
    await Promise.all([
      prisma.assetType.findMany({
        where: { organizationId },
        include: { _count: { select: { assets: true } } },
      }),
      prisma.assetAttributeDefinition.findMany({
        where: { assetType: { organizationId } },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.inspectionTemplate.findMany({
        where: { assetType: { organizationId } },
        include: { _count: { select: { fields: true, inspections: true } } },
      }),
      prisma.conditionModel.findMany({
        where: { assetType: { organizationId } },
        include: { _count: { select: { measurements: true } } },
      }),
      prisma.deteriorationModel.findMany({
        where: { assetType: { organizationId } },
        include: { _count: { select: { predictions: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.riskModel.findMany({
        where: { assetType: { organizationId } },
        include: { _count: { select: { assessments: true } } },
      }),
      prisma.treatment.findMany({
        where: { assetType: { organizationId } },
        orderBy: { applicableConditionMin: "asc" },
      }),
      prisma.failureType.findMany({
        where: { assetType: { organizationId } },
        include: { _count: { select: { events: true } } },
        orderBy: { label: "asc" },
      }),
    ]);

  return {
    assetTypes: assetTypes.map((t) => ({ id: t.id, code: t.code, name: t.name, assetCount: t._count.assets })),
    attributeDefinitions: attributes.map((a) => ({
      code: a.code,
      label: a.label,
      dataType: a.dataType,
      unit: a.unit,
      required: a.isRequired,
    })),
    inspectionTemplates: templates.map((t) => ({
      name: t.name,
      fieldCount: t._count.fields,
      inspectionCount: t._count.inspections,
      active: t.isActive,
    })),
    conditionModels: conditionModels.map((m) => ({
      name: m.name,
      scale: `${m.scaleMin}–${m.scaleMax}`,
      bandCount: Array.isArray(m.bands) ? m.bands.length : 0,
      measurementCount: m._count.measurements,
    })),
    deteriorationModels: deteriorationModels.map((m) => ({
      name: m.name,
      type: m.modelType,
      predictionCount: m._count.predictions,
      active: m.isActive,
    })),
    riskModels: riskModels.map((m) => ({ name: m.name, assessmentCount: m._count.assessments, active: m.isActive })),
    treatments: treatments.map((t) => ({
      name: t.name,
      category: String((t.applicability as { category?: string } | null)?.category ?? "—"),
      conditionRange: `${t.applicableConditionMin ?? 0}–${t.applicableConditionMax ?? 100}`,
      unitCost: t.unitCost ?? 0,
      costUnit: t.costUnit ?? "",
    })),
    failureTypes: failureTypes.map((f) => ({ code: f.code, label: f.label, eventCount: f._count.events })),
  };
}

export async function listUsers(organizationId: string) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    include: { role: true, _count: { select: { inspectionsPerformed: true } } },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roleId: u.roleId,
    roleName: u.role.name,
    isActive: u.isActive,
    inspectionCount: u._count.inspectionsPerformed,
    createdAt: u.createdAt,
  }));
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
    userCount: r._count.users,
  }));
}

export async function updateUserRole(organizationId: string, userId: string, roleId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new Error("User not found");
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("Role not found");
  await prisma.user.update({ where: { id: userId }, data: { roleId } });
}

export async function setUserActive(organizationId: string, userId: string, isActive: boolean) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new Error("User not found");
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
}

export type DatabaseInfo = {
  reachable: boolean;
  error: string | null;
  host: string | null;
  port: string | null;
  database: string | null;
  user: string | null;
  ssl: boolean;
  serverVersion: string | null;
  postgisVersion: string | null;
  sizeOnDisk: string | null;
  tableCount: number | null;
  migrationsApplied: number | null;
  latestMigration: string | null;
};

/**
 * Connection facts for the operations screen. Everything here is read from the
 * live connection rather than assumed from config, so a stale DATABASE_URL
 * shows up as unreachable instead of quietly reporting a healthy database.
 *
 * The password is deliberately never read out of the URL — nothing in this
 * shape can carry it, so it cannot leak into the page, a log line, or an error.
 */
export async function getDatabaseInfo(): Promise<DatabaseInfo> {
  const empty: DatabaseInfo = {
    reachable: false,
    error: null,
    host: null,
    port: null,
    database: null,
    user: null,
    ssl: false,
    serverVersion: null,
    postgisVersion: null,
    sizeOnDisk: null,
    tableCount: null,
    migrationsApplied: null,
    latestMigration: null,
  };

  let parsed: URL | null = null;
  try {
    parsed = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    return { ...empty, error: "DATABASE_URL is missing or not a valid connection string" };
  }

  const target = {
    host: parsed.hostname || null,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "") || null,
    user: decodeURIComponent(parsed.username) || null,
    ssl: /sslmode=(require|verify)/.test(parsed.search),
  };

  try {
    const [version] = await prisma.$queryRaw<Array<{ v: string }>>`SELECT version() AS v`;
    const [size] = await prisma.$queryRaw<Array<{ s: string }>>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS s`;
    const [tables] = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public'`;
    const postgis = await prisma.$queryRaw<Array<{ v: string }>>`
      SELECT extversion AS v FROM pg_extension WHERE extname = 'postgis'`;
    const migrations = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT migration_name AS name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL ORDER BY finished_at DESC`;

    return {
      ...empty,
      ...target,
      reachable: true,
      // "PostgreSQL 16.4 on x86_64-pc-linux-gnu, compiled by ..." — the first
      // two words are the only part worth showing.
      serverVersion: version?.v.split(" ").slice(0, 2).join(" ") ?? null,
      postgisVersion: postgis[0]?.v ?? null,
      sizeOnDisk: size?.s ?? null,
      tableCount: tables ? Number(tables.n) : null,
      migrationsApplied: migrations.length,
      latestMigration: migrations[0]?.name ?? null,
    };
  } catch (e) {
    return { ...empty, ...target, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

export type AuditEntry = {
  when: Date;
  entity: string;
  action: string;
  detail: string;
  actor: string | null;
};

/**
 * Recent activity assembled from the audit timestamps the schema already
 * carries (SPEC §26). This is a derived view rather than a separate audit
 * log, so it reflects what actually happened to the records themselves.
 */
export async function getRecentActivity(organizationId: string, limit = 40): Promise<AuditEntry[]> {
  const [assets, inspections, failures, workPlans, scenarios] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { assetCode: true, createdAt: true, updatedAt: true, createdBy: true, updatedBy: true },
    }),
    prisma.inspection.findMany({
      where: { asset: { organizationId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { asset: { select: { assetCode: true } }, inspector: { select: { name: true } } },
    }),
    prisma.failureEvent.findMany({
      where: { asset: { organizationId } },
      orderBy: { failureDate: "desc" },
      take: limit,
      include: { asset: { select: { assetCode: true } }, failureType: { select: { label: true } } },
    }),
    prisma.workPlan.findMany({ orderBy: { updatedAt: "desc" }, take: limit }),
    prisma.scenario.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: limit }),
  ]);

  const entries: AuditEntry[] = [
    ...assets.map((a) => ({
      when: a.updatedAt,
      entity: "Asset",
      action: a.createdAt.getTime() === a.updatedAt.getTime() ? "Created" : "Updated",
      detail: a.assetCode,
      actor: a.updatedBy ?? a.createdBy ?? null,
    })),
    ...inspections.map((i) => ({
      when: i.createdAt,
      entity: "Inspection",
      action: "Recorded",
      detail: `${i.asset.assetCode} — ${i.inspectionType}`,
      actor: i.inspector.name,
    })),
    ...failures.map((f) => ({
      when: f.failureDate,
      entity: "Failure",
      action: "Recorded",
      detail: `${f.asset.assetCode} — ${f.failureType.label} (${f.severity ?? "unspecified"})`,
      actor: null,
    })),
    ...workPlans.map((w) => ({
      when: w.updatedAt,
      entity: "Work Plan",
      action: w.createdAt.getTime() === w.updatedAt.getTime() ? "Generated" : "Updated",
      detail: w.name,
      actor: null,
    })),
    ...scenarios.map((s) => ({
      when: s.updatedAt,
      entity: "Scenario",
      action: s.createdAt.getTime() === s.updatedAt.getTime() ? "Created" : "Re-run",
      detail: s.name,
      actor: null,
    })),
  ];

  return entries.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, limit);
}
