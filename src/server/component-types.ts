import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  attributesOf,
  editAttributes,
  type ComponentAttribute,
  type NewComponentAttribute,
} from "@/domain/components/attributes";

/**
 * What each asset type is made of: the component types linked to it, in order,
 * each with its default share of the asset's value.
 *
 * A component type belongs to the organization, not to one asset type — a
 * Pump is a part of a well and of a booster station alike — so the link
 * carries what differs between them (the share and the order) and the type
 * carries what does not (its name and what it records).
 */

export type ComponentLinkDetail = {
  componentTypeId: string;
  code: string;
  name: string;
  description: string | null;
  /** The link's defaultCostWeight, read as a percentage share. */
  sharePct: number | null;
  sortOrder: number;
  attributes: ComponentAttribute[];
  /** Components of this kind on assets of this type. Removal is refused above zero. */
  componentCount: number;
  /** Other asset types this component type is also a part of. */
  alsoOn: string[];
};

export type ComponentTypeOption = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  attributes: ComponentAttribute[];
  usedBy: string[];
};

export type ComponentComposition = {
  byAssetType: Record<string, ComponentLinkDetail[]>;
  componentTypes: ComponentTypeOption[];
};

export async function listComponentComposition(organizationId: string): Promise<ComponentComposition> {
  const [types, counts] = await Promise.all([
    prisma.componentType.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: { assetTypes: { include: { assetType: { select: { id: true, name: true } } } } },
    }),
    prisma.$queryRaw<Array<{ assetTypeId: string; componentTypeId: string; n: number }>>`
      SELECT a."assetTypeId", c."componentTypeId", count(*)::int AS n
      FROM asset_components c
      JOIN assets a ON a.id = c."assetId"
      WHERE a."organizationId" = ${organizationId}
      GROUP BY a."assetTypeId", c."componentTypeId"`,
  ]);
  const countOf = new Map(counts.map((c) => [`${c.assetTypeId}:${c.componentTypeId}`, c.n]));

  const byAssetType: Record<string, ComponentLinkDetail[]> = {};
  for (const t of types) {
    const attributes = attributesOf(t.attributeSchema);
    for (const link of t.assetTypes) {
      (byAssetType[link.assetTypeId] ??= []).push({
        componentTypeId: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        sharePct: link.defaultCostWeight,
        sortOrder: link.sortOrder,
        attributes,
        componentCount: countOf.get(`${link.assetTypeId}:${t.id}`) ?? 0,
        alsoOn: t.assetTypes.filter((l) => l.assetTypeId !== link.assetTypeId).map((l) => l.assetType.name),
      });
    }
  }
  for (const list of Object.values(byAssetType)) list.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    byAssetType,
    componentTypes: types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      attributes: attributesOf(t.attributeSchema),
      usedBy: t.assetTypes.map((l) => l.assetType.name),
    })),
  };
}

function checkShare(sharePct: number | null): number | null {
  if (sharePct == null) return null;
  if (!Number.isFinite(sharePct) || sharePct <= 0 || sharePct > 100) {
    throw new Error("A share must be more than 0% and at most 100%");
  }
  return sharePct;
}

async function requireAssetType(organizationId: string, assetTypeId: string) {
  const assetType = await prisma.assetType.findFirst({
    where: { id: assetTypeId, organizationId },
    select: { id: true, name: true },
  });
  if (!assetType) throw new Error("Asset type not found");
  return assetType;
}

async function requireLink(organizationId: string, assetTypeId: string, componentTypeId: string) {
  const link = await prisma.assetTypeComponentType.findFirst({
    where: { assetTypeId, componentTypeId, assetType: { organizationId }, componentType: { organizationId } },
    include: { assetType: { select: { name: true } }, componentType: true },
  });
  if (!link) throw new Error("That component is not part of this asset type");
  return link;
}

/**
 * Make a component type part of an asset type — one that already exists, or a
 * new one created here. Assets of the type gain no components by this: it
 * says what they are made of, not what has been recorded on each.
 */
export async function addComponentToAssetType(
  organizationId: string,
  assetTypeId: string,
  input: {
    sharePct: number | null;
    existing?: { componentTypeId: string };
    create?: { code: string; name: string; description: string | null; attributes: NewComponentAttribute[] };
  }
) {
  const assetType = await requireAssetType(organizationId, assetTypeId);
  const sharePct = checkShare(input.sharePct);

  let componentTypeId: string;
  if (input.existing) {
    const type = await prisma.componentType.findFirst({
      where: { id: input.existing.componentTypeId, organizationId },
      select: { id: true, name: true },
    });
    if (!type) throw new Error("Component type not found");
    const already = await prisma.assetTypeComponentType.findUnique({
      where: { assetTypeId_componentTypeId: { assetTypeId, componentTypeId: type.id } },
    });
    if (already) throw new Error(`${type.name} is already a component of ${assetType.name}`);
    componentTypeId = type.id;
  } else if (input.create) {
    const name = input.create.name.trim();
    if (!name) throw new Error("A name is required");
    const code = (input.create.code.trim() || name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!code) throw new Error("A code is required");
    const clash = await prisma.componentType.findFirst({
      where: { organizationId, OR: [{ code }, { name: { equals: name, mode: "insensitive" } }] },
      select: { code: true, name: true },
    });
    if (clash) {
      throw new Error(
        clash.code === code
          ? `A component type with code "${code}" already exists`
          : `"${clash.name}" already exists — add it as an existing component instead`
      );
    }
    const created = await prisma.componentType.create({
      data: {
        organizationId,
        code,
        name,
        description: input.create.description?.trim() || null,
        attributeSchema: editAttributes({}, { add: input.create.attributes }) as Prisma.InputJsonObject,
      },
      select: { id: true },
    });
    componentTypeId = created.id;
  } else {
    throw new Error("Choose a component, or describe a new one");
  }

  const last = await prisma.assetTypeComponentType.aggregate({
    where: { assetTypeId },
    _max: { sortOrder: true },
  });
  await prisma.assetTypeComponentType.create({
    data: {
      assetTypeId,
      componentTypeId,
      defaultCostWeight: sharePct,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
}

/**
 * Change a component's share on this asset type, and the component type's own
 * name, description and attributes — which, the type being shared, change
 * everywhere it is used.
 */
export async function updateComponentOnAssetType(
  organizationId: string,
  assetTypeId: string,
  componentTypeId: string,
  input: {
    name: string;
    description: string | null;
    sharePct: number | null;
    removeAttributes: string[];
    addAttributes: NewComponentAttribute[];
  }
) {
  const link = await requireLink(organizationId, assetTypeId, componentTypeId);
  const name = input.name.trim();
  if (!name) throw new Error("A name is required");
  const sharePct = checkShare(input.sharePct);

  const clash = await prisma.componentType.findFirst({
    where: { organizationId, id: { not: componentTypeId }, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) throw new Error(`Another component type is already called "${name}"`);

  // An attribute some component has a value for stays: removing it from the
  // schema would leave that value on the record with nothing describing it.
  const labels = new Map(attributesOf(link.componentType.attributeSchema).map((a) => [a.key, a.label]));
  for (const key of input.removeAttributes) {
    const [{ n }] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM asset_components
      WHERE "componentTypeId" = ${componentTypeId} AND jsonb_exists(attributes, ${key})`;
    if (n > 0) {
      throw new Error(
        `${n} component${n === 1 ? " has" : "s have"} a value for “${labels.get(key) ?? key}”, so it cannot be removed`
      );
    }
  }

  await prisma.$transaction([
    prisma.componentType.update({
      where: { id: componentTypeId },
      data: {
        name,
        description: input.description?.trim() || null,
        attributeSchema: editAttributes(link.componentType.attributeSchema, {
          remove: input.removeAttributes,
          add: input.addAttributes,
        }) as Prisma.InputJsonObject,
      },
    }),
    prisma.assetTypeComponentType.update({
      where: { assetTypeId_componentTypeId: { assetTypeId, componentTypeId } },
      data: { defaultCostWeight: sharePct },
    }),
  ]);
}

/** Move a component one place up or down the asset type's list. */
export async function moveComponentOnAssetType(
  organizationId: string,
  assetTypeId: string,
  componentTypeId: string,
  direction: -1 | 1
) {
  await requireLink(organizationId, assetTypeId, componentTypeId);
  const links = await prisma.assetTypeComponentType.findMany({
    where: { assetTypeId },
    orderBy: [{ sortOrder: "asc" }, { componentTypeId: "asc" }],
  });
  const from = links.findIndex((l) => l.componentTypeId === componentTypeId);
  const to = from + direction;
  if (to < 0 || to >= links.length) return;
  [links[from], links[to]] = [links[to], links[from]];

  // Renumbered outright rather than swapped, so ties left by earlier data
  // can't make a move appear to do nothing.
  await prisma.$transaction(
    links.map((l, i) =>
      prisma.assetTypeComponentType.update({
        where: { assetTypeId_componentTypeId: { assetTypeId, componentTypeId: l.componentTypeId } },
        data: { sortOrder: i },
      })
    )
  );
}

/**
 * Stop a component type being part of an asset type. Refused while any asset
 * of the type has one of these components. A component type left part of
 * nothing, with nothing recorded against it, is deleted along with the link —
 * otherwise a mistyped one could never be got rid of.
 */
export async function removeComponentFromAssetType(
  organizationId: string,
  assetTypeId: string,
  componentTypeId: string
): Promise<{ deletedType: boolean; name: string }> {
  const link = await requireLink(organizationId, assetTypeId, componentTypeId);
  const inUse = await prisma.assetComponent.count({
    where: { componentTypeId, asset: { assetTypeId } },
  });
  if (inUse > 0) {
    throw new Error(
      `${inUse} ${link.assetType.name} component${inUse === 1 ? " is a" : "s are"} ${link.componentType.name}, so it cannot be removed. Remove those components from their assets first.`
    );
  }

  await prisma.assetTypeComponentType.delete({
    where: { assetTypeId_componentTypeId: { assetTypeId, componentTypeId } },
  });

  const [links, components, templates] = await Promise.all([
    prisma.assetTypeComponentType.count({ where: { componentTypeId } }),
    prisma.assetComponent.count({ where: { componentTypeId } }),
    prisma.inspectionTemplate.count({ where: { componentTypeId } }),
  ]);
  const orphan = links === 0 && components === 0 && templates === 0;
  if (orphan) await prisma.componentType.delete({ where: { id: componentTypeId } });
  return { deletedType: orphan, name: link.componentType.name };
}
