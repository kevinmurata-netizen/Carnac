import ExcelJS from "exceljs";
import { WorkPlanItemStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { qualifiesUnderRules, ruleTreeFromFlat } from "@/domain/waterline/decision-tree";
import {
  buildOption,
  explainApplicability,
  splitOptionCost,
  toDecisionInput,
  type AssetTreatmentContext,
  type CombinationDef,
  type TreatmentDef,
} from "@/domain/waterline/treatment";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { loadCombinations } from "@/server/combinations";
import { splitCsvLine } from "@/server/import";
import { assetTreatmentContext } from "@/server/workplans";
import { buildWorkbookSheets } from "@/server/excel";

/**
 * Bringing already-programmed work into a plan from a spreadsheet.
 *
 * A utility's capital programme is rarely a blank page: some projects are
 * committed before any model runs — a main under a road being rebuilt next
 * summer, a job already out to tender. This is how those arrive in bulk.
 *
 * The rules, decided with the person who asked for it:
 *
 * - **The spreadsheet names what the library holds.** Each row is a treatment
 *   or a treatment combination, by its library name. A combination imports as
 *   one project, priced as that combination. A name the library does not know
 *   is an error — the fix is to create it in the app first, so the plan and the
 *   library can never describe the same job two ways.
 * - **Rows are never combined on import.** Two rows on the same segment in the
 *   same year stay two projects; Combine is there afterwards.
 * - **Imported work sits beside the model's.** Nothing already in the plan is
 *   removed. Only an exact repeat — the same work on the same segment in the
 *   same year — is skipped, and the preview says so.
 * - **Rules are reported, not enforced**, exactly as for work added by hand: a
 *   programmed job is a decision, not a recommendation.
 * - **Nothing is written while any row has an error.** A half-imported
 *   programme is worse than none, because nobody can tell which half landed.
 */

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

type Column = "asset" | "treatment" | "year" | "cost" | "status" | "funding" | "notes";

const COLUMNS: Array<{ key: Column; label: string; required: boolean; aliases: string[] }> = [
  { key: "asset", label: "Asset ID", required: true, aliases: ["assetid", "asset", "assetcode", "segment", "segmentid"] },
  {
    key: "treatment",
    label: "Treatment",
    required: true,
    aliases: ["treatment", "treatmentname", "combination", "treatmentorcombination"],
  },
  { key: "year", label: "Year", required: true, aliases: ["year", "plannedyear", "fiscalyear"] },
  { key: "cost", label: "Cost", required: false, aliases: ["cost", "estimatedcost", "estcost", "budget", "amount"] },
  { key: "status", label: "Status", required: false, aliases: ["status"] },
  { key: "funding", label: "Funding", required: false, aliases: ["funding", "fundingsource", "source"] },
  {
    key: "notes",
    label: "Notes",
    required: false,
    aliases: ["notes", "note", "comments", "reference", "projectreference", "projectnumber"],
  },
];

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type ImportFile = { name: string; bytes: ArrayBuffer };

type Sheet = { rows: Array<{ row: number; cells: string[] }> };

/** One cell as the text someone typed — a formula as its result, a number as
 * written rather than as Excel stores it. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return String(value.getUTCFullYear());
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value).trim();
}

async function readSheet(file: ImportFile): Promise<Sheet> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = new TextDecoder().decode(file.bytes).replace(/^﻿/, "");
    return {
      rows: text.split(/\r?\n/).map((line, index) => ({ row: index + 1, cells: splitCsvLine(line) })),
    };
  }
  if (!lower.endsWith(".xlsx")) {
    throw new Error("Upload an Excel workbook (.xlsx) or a CSV file. Older .xls files need saving as .xlsx first.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.bytes);
  } catch {
    throw new Error("That file could not be read as an Excel workbook.");
  }
  // The first sheet that has the columns, so a workbook with a cover or
  // instructions sheet in front still imports.
  for (const worksheet of workbook.worksheets) {
    const rows: Sheet["rows"] = [];
    worksheet.eachRow({ includeEmpty: false }, (r, rowNumber) => {
      const values = r.values as ExcelJS.CellValue[];
      rows.push({ row: rowNumber, cells: values.slice(1).map(cellText) });
    });
    if (findHeader(rows)) return { rows };
  }
  return { rows: [] };
}

/** The header is the first row naming both an asset and a treatment column —
 * not necessarily row 1, since a sheet exported from here has a title above. */
function findHeader(rows: Sheet["rows"]) {
  for (const r of rows.slice(0, 15)) {
    const cells = r.cells.map(normalize);
    const index = (key: Column) => {
      const aliases = COLUMNS.find((c) => c.key === key)!.aliases;
      return cells.findIndex((c) => aliases.includes(c));
    };
    if (index("asset") >= 0 && index("treatment") >= 0) {
      const at = Object.fromEntries(COLUMNS.map((c) => [c.key, index(c.key)])) as Record<Column, number>;
      const known = new Set(COLUMNS.flatMap((c) => c.aliases));
      return {
        headerRow: r.row,
        at,
        unknown: r.cells.filter((c) => c && !known.has(normalize(c))),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Checking it
// ---------------------------------------------------------------------------

const STATUS_WORDS: Record<string, WorkPlanItemStatus> = Object.fromEntries(
  Object.values(WorkPlanItemStatus).map((s) => [normalize(s), s])
);

export type ImportProblem = { row: number; column: string; message: string };

export type ImportRow = {
  row: number;
  assetCode: string;
  /** What the file named: a treatment, or a combination. */
  name: string;
  isCombination: boolean;
  members: string[];
  year: number;
  cost: number;
  costFrom: "file" | "library";
  status: WorkPlanItemStatus;
  funding: string;
  notes: string | null;
  /** Imported anyway, but worth knowing. */
  warnings: string[];
  /** Why the row will not be imported, when it will not. */
  skipped: string | null;
};

export type WorkPlanImportPreview = {
  fileName: string;
  rows: ImportRow[];
  errors: ImportProblem[];
  missingColumns: string[];
  unknownColumns: string[];
  toImport: number;
  toSkip: number;
  totalCost: number;
};

type Member = { treatmentId: string; name: string; cost: number };

type CheckedRow = ImportRow & {
  assetId: string;
  memberRows: Member[];
  effect: {
    conditionBefore: number | null;
    conditionAfter: number | null;
    riskBefore: number;
    riskAfter: number | null;
  };
  refusedBy: string | null;
};

async function planForImport(workPlanId: string) {
  const plan = await prisma.workPlan.findUnique({
    where: { id: workPlanId },
    select: { id: true, name: true, startYear: true, endYear: true, isScenarioMirror: true },
  });
  if (!plan) throw new Error("That work plan no longer exists");
  if (plan.isScenarioMirror) {
    throw new Error(
      `“${plan.name}” is a scenario run's own record and is rebuilt every time that scenario runs. Make a plan from the scenario first, then import into that.`
    );
  }
  return plan;
}

async function checkImport(organizationId: string, workPlanId: string, file: ImportFile) {
  const plan = await planForImport(workPlanId);
  const sheet = await readSheet(file);
  const header = findHeader(sheet.rows);

  const empty = { plan, rows: [] as CheckedRow[], errors: [] as ImportProblem[], unknownColumns: [] as string[] };
  if (!header) {
    return {
      ...empty,
      missingColumns: COLUMNS.filter((c) => c.required).map((c) => c.label),
    };
  }
  const missingColumns = COLUMNS.filter((c) => c.required && header.at[c.key] < 0).map((c) => c.label);
  if (missingColumns.length > 0) return { ...empty, missingColumns, unknownColumns: header.unknown };

  const [library, combinations, treatments, planRows] = await Promise.all([
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
    prisma.treatment.findMany({
      where: { assetType: { code: "WATERLINE", organizationId } },
      select: { id: true, name: true },
    }),
    prisma.workPlanItem.findMany({ where: { workPlanId }, select: { assetId: true, year: true, treatmentId: true } }),
  ]);
  const treatmentId = new Map(treatments.map((t) => [t.name, t.id]));
  const byName = new Map<string, { def: TreatmentDef } | { combo: CombinationDef }>();
  // Combinations first, so a treatment of the same name wins.
  for (const combo of combinations) byName.set(normalize(combo.name), { combo });
  for (const def of library) byName.set(normalize(def.name), { def });

  const dataRows = sheet.rows.filter((r) => r.row > header.headerRow && r.cells.some((c) => c.trim() !== ""));
  const cell = (r: { cells: string[] }, key: Column) => (header.at[key] >= 0 ? (r.cells[header.at[key]] ?? "").trim() : "");

  // Every segment the file names, looked up once.
  const codes = [...new Set(dataRows.map((r) => cell(r, "asset").toUpperCase()).filter(Boolean))];
  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      deletedAt: null,
      assetType: { code: "WATERLINE" },
      assetCode: { in: codes, mode: "insensitive" },
    },
    select: { id: true, assetCode: true, status: true },
  });
  const assetByCode = new Map(assets.map((a) => [a.assetCode.toUpperCase(), a]));
  const contexts = new Map<string, { ctx: AssetTreatmentContext; assetCode: string } | null>();
  const active = assets.filter((a) => a.status === "ACTIVE");
  for (let i = 0; i < active.length; i += 10) {
    await Promise.all(
      active.slice(i, i + 10).map(async (a) => contexts.set(a.id, await assetTreatmentContext(organizationId, a.id)))
    );
  }

  const errors: ImportProblem[] = [];
  const rows: CheckedRow[] = [];
  // What the plan holds, and what this file has already added, by segment,
  // year and treatment — so a repeat is skipped rather than doubled.
  const held = new Set(planRows.map((r) => `${r.assetId}|${r.year}|${r.treatmentId}`));

  for (const r of dataRows) {
    const problems: ImportProblem[] = [];
    const fail = (column: string, message: string) => problems.push({ row: r.row, column, message });

    const code = cell(r, "asset");
    const asset = code ? assetByCode.get(code.toUpperCase()) : undefined;
    if (!code) fail("Asset ID", "No asset ID.");
    else if (!asset) fail("Asset ID", `No waterline segment ${code}.`);
    else if (asset.status !== "ACTIVE") {
      fail(
        "Asset ID",
        `${asset.assetCode} is marked ${asset.status.toLowerCase().replace("_", " ")}. Only active segments are run by the model, so work cannot be planned on it.`
      );
    }

    const name = cell(r, "treatment");
    const found = name ? byName.get(normalize(name)) : undefined;
    if (!name) fail("Treatment", "No treatment.");
    else if (!found) {
      fail(
        "Treatment",
        `“${name}” is not a treatment or combination in the library. Create it in Settings first — Treatments, or Treatment Combinations for work done together — spelled the same way.`
      );
    }

    const yearText = cell(r, "year");
    const year = Number(yearText);
    if (!yearText) fail("Year", "No year.");
    else if (!Number.isInteger(year)) fail("Year", `“${yearText}” is not a year.`);
    else if (year < plan.startYear || year > plan.endYear) {
      fail("Year", `${year} is outside this plan, which runs ${plan.startYear}–${plan.endYear}.`);
    }

    const costText = cell(r, "cost").replace(/[$,\s]/g, "");
    const fileCost = costText ? Number(costText) : null;
    if (fileCost != null && (!Number.isFinite(fileCost) || fileCost < 0)) {
      fail("Cost", `“${cell(r, "cost")}” is not an amount.`);
    }

    const statusText = cell(r, "status");
    const status = statusText ? STATUS_WORDS[normalize(statusText)] : WorkPlanItemStatus.PLANNED;
    if (!status) {
      fail(
        "Status",
        `“${statusText}” is not a status. Use one of: ${Object.values(WorkPlanItemStatus)
          .map((s) => s.replace("_", " ").toLowerCase())
          .join(", ")}.`
      );
    }

    // What the name resolves to, member by member.
    let defs: TreatmentDef[] = [];
    let combo: CombinationDef | null = null;
    if (found && "def" in found) defs = [found.def];
    if (found && "combo" in found) {
      combo = found.combo;
      for (const m of combo.members) {
        const def = library.find((d) => d.name === m.treatment);
        if (def) defs.push(def);
        else fail("Treatment", `${combo.name} includes ${m.treatment}, which is no longer in the treatment library.`);
      }
    }
    if (defs.some((d) => !treatmentId.has(d.name))) fail("Treatment", `“${name}” is missing from the treatment list.`);

    const context = asset ? contexts.get(asset.id) : null;
    const option =
      context && defs.length > 0 && problems.length === 0
        ? buildOption(
            combo ? `combo:${combo.id}` : `t:${defs[0].name}`,
            combo?.name ?? defs[0].name,
            defs,
            context.ctx,
            combo?.mobilizationCost ?? null
          )
        : null;
    if (problems.length === 0 && !option && fileCost == null) {
      fail(
        "Cost",
        `No rate prices ${name} on ${asset!.assetCode}. Give a cost in the file, or add a rate that covers this segment under Treatment Costs.`
      );
    }

    if (problems.length > 0) {
      errors.push(...problems);
      continue;
    }

    const ctx = context!.ctx;
    // The file's figure where it gives one — a programmed job usually has a
    // real estimate — divided between members the way the library would.
    const libraryShares = option ? splitOptionCost(option, ctx) : defs.map(() => 0);
    const libraryTotal = option ? Math.round(option.cost) : 0;
    const total = fileCost != null ? Math.round(fileCost) : libraryTotal;
    const shares =
      fileCost == null
        ? libraryShares
        : libraryTotal > 0
          ? proportional(libraryShares, libraryTotal, total)
          : proportional(
              defs.map(() => 1),
              defs.length,
              total
            );

    const warnings: string[] = [];
    let refusedBy: string | null = null;
    for (const def of defs) {
      const outcome = explainApplicability(def, ctx);
      if (!outcome.pass) {
        const rule = outcome.blockedBy?.name ?? "its own rules";
        refusedBy ??= rule;
        warnings.push(`${def.name} is refused on ${asset!.assetCode} by ${rule}; it is imported anyway.`);
      }
    }
    if (combo && !combo.enabled) warnings.push(`${combo.name} is switched off in the library, so the model never chooses it.`);
    if (
      combo?.rules?.length &&
      !qualifiesUnderRules(combo.rules, ruleTreeFromFlat(combo.rules, combo.qualifyMode ?? "all"), toDecisionInput(ctx)).pass
    ) {
      refusedBy ??= `${combo.name}'s own rules`;
      warnings.push(`${combo.name}'s own rules refuse it on ${asset!.assetCode}; it is imported anyway.`);
    }
    if (!option) warnings.push(`No rate prices this on ${asset!.assetCode}, so the file's cost is used and its effect is unknown.`);

    const keys = defs.map((d) => `${asset!.id}|${year}|${treatmentId.get(d.name)}`);
    const skipped = keys.every((k) => held.has(k))
      ? `Already in this plan for ${year}${defs.length > 1 ? " — every treatment in it" : ""}.`
      : null;
    if (!skipped) for (const k of keys) held.add(k);

    const riskBefore = (ctx.pof ?? 3) * (ctx.cof ?? 3);
    rows.push({
      row: r.row,
      assetCode: asset!.assetCode,
      assetId: asset!.id,
      name: combo?.name ?? defs[0].name,
      isCombination: combo != null,
      members: defs.map((d) => d.name),
      memberRows: defs.map((d, i) => ({ treatmentId: treatmentId.get(d.name)!, name: d.name, cost: shares[i] ?? 0 })),
      year,
      cost: total,
      costFrom: fileCost != null ? "file" : "library",
      status: status!,
      funding: cell(r, "funding") || "Imported",
      notes: cell(r, "notes") || null,
      warnings,
      skipped,
      refusedBy,
      effect: {
        conditionBefore: ctx.conditionScore,
        conditionAfter: option ? Math.round(option.projectedCondition * 10) / 10 : null,
        riskBefore: Math.round(riskBefore * 10) / 10,
        riskAfter: option ? Math.round(Math.max(1, riskBefore * option.failureProbMultiplier) * 10) / 10 : null,
      },
    });
  }

  return { plan, rows, errors, missingColumns: [] as string[], unknownColumns: header.unknown };
}

/** Divide a total in the same proportions as `parts`, summing exactly. */
function proportional(parts: number[], partsTotal: number, total: number) {
  const out = parts.map((p) => Math.round((p / partsTotal) * total));
  const drift = total - out.reduce((s, v) => s + v, 0);
  if (out.length > 0) out[out.indexOf(Math.max(...out))] += drift;
  return out;
}

function toPreview(fileName: string, checked: Awaited<ReturnType<typeof checkImport>>): WorkPlanImportPreview {
  const rows: ImportRow[] = checked.rows.map(
    ({ assetId: _a, memberRows: _m, effect: _e, refusedBy: _r, ...row }) => row
  );
  const importing = rows.filter((r) => !r.skipped);
  return {
    fileName,
    rows,
    errors: checked.errors,
    missingColumns: checked.missingColumns,
    unknownColumns: checked.unknownColumns,
    toImport: importing.length,
    toSkip: rows.length - importing.length,
    totalCost: importing.reduce((s, r) => s + r.cost, 0),
  };
}

/** What importing this file would do, with nothing written. */
export async function previewWorkPlanImport(organizationId: string, workPlanId: string, file: ImportFile) {
  return toPreview(file.name, await checkImport(organizationId, workPlanId, file));
}

/**
 * Import the file. Checked again from scratch rather than trusting the
 * preview, since the library or the plan may have changed in between; and
 * refused outright while any row has an error.
 */
export async function commitWorkPlanImport(organizationId: string, workPlanId: string, file: ImportFile) {
  const checked = await checkImport(organizationId, workPlanId, file);
  const preview = toPreview(file.name, checked);
  if (preview.missingColumns.length > 0 || preview.errors.length > 0) {
    return { imported: 0, preview };
  }

  const data = checked.rows
    .filter((row) => !row.skipped)
    .flatMap((row) => {
      const { effect } = row;
      const riskReductionPct =
        effect.riskAfter != null && effect.riskBefore > 0
          ? Math.round(((effect.riskBefore - effect.riskAfter) / effect.riskBefore) * 1000) / 10
          : null;
      const reason = [
        `Imported from ${file.name}, row ${row.row}${row.notes ? ` — ${row.notes}` : ""}.`,
        row.refusedBy ? `Refused here by ${row.refusedBy}, and imported anyway.` : "",
        row.costFrom === "file" ? "Cost as given in the file." : "Priced from the treatment library.",
        effect.conditionAfter != null
          ? `Condition ${effect.conditionBefore ?? "unknown"} → ${effect.conditionAfter}, risk ${effect.riskBefore} → ${effect.riskAfter}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      // A combination is one project, as a funded combination is: its rows
      // share a bundleId. The row number keeps two imports of the same
      // combination on one segment apart.
      const bundleId = row.isCombination ? `${workPlanId}:${row.assetId}:${row.year}:${row.name}:import-${row.row}` : null;

      return row.memberRows.map((m) => ({
        workPlanId,
        assetId: row.assetId,
        treatmentId: m.treatmentId,
        year: row.year,
        estimatedCost: m.cost,
        bundleId,
        bundleName: row.isCombination ? row.name : null,
        expectedBenefit: {
          ...effect,
          riskReductionPct,
          addedByHand: true,
          imported: true,
          forcedAgainstRules: row.refusedBy != null,
          refusedBy: row.refusedBy,
        },
        reasonExplanation: reason,
        fundingSource: row.funding,
        status: row.status,
      }));
    });

  await prisma.workPlanItem.createMany({ data });
  return { imported: preview.toImport, preview };
}

/**
 * A workbook to fill in: the columns on the first sheet, how to fill them on
 * the second, and every name the Treatment column accepts on the third — so
 * nobody has to guess the library's spelling.
 */
export async function workPlanImportTemplate(organizationId: string) {
  const [library, combinations] = await Promise.all([
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
  ]);

  return buildWorkbookSheets([
    {
      sheetName: "Work to import",
      title: "Programmed work to import into a work plan",
      note: "One row per project. Asset ID, Treatment and Year are required; see the next sheet for how to fill each column.",
      columns: COLUMNS.map((c) => ({
        key: c.key,
        header: c.label,
        type: c.key === "year" ? "text" : c.key === "cost" ? "money" : "text",
        width: c.key === "treatment" ? 30 : c.key === "notes" ? 36 : 14,
      })),
      rows: [],
    },
    {
      sheetName: "How to fill it in",
      title: "How to fill in each column",
      note: "Every row is checked before anything is imported, and nothing is written while any row has an error.",
      columns: [
        { key: "column", header: "Column", width: 12 },
        { key: "required", header: "Required", width: 10 },
        { key: "how", header: "What to put", width: 100 },
        { key: "example", header: "Example", width: 22 },
      ],
      rows: [
        {
          column: "Asset ID",
          required: "Yes",
          how: "The segment's asset ID. It must be an active segment.",
          example: "WL-0058",
        },
        {
          column: "Treatment",
          required: "Yes",
          how: "A treatment or a treatment combination, spelled as in the library (see the Treatments sheet). A combination imports as one project. Anything not in the library must be created in Settings first.",
          example: "Dig-once repair",
        },
        { column: "Year", required: "Yes", how: "The year the work is done. It must fall inside the plan.", example: "2027" },
        {
          column: "Cost",
          required: "No",
          how: "The project's total cost. Leave blank to price it from the treatment library.",
          example: "185000",
        },
        {
          column: "Status",
          required: "No",
          how: "Planned, Approved, In Progress, Complete, Deferred or Cancelled. Blank means Planned.",
          example: "Approved",
        },
        { column: "Funding", required: "No", how: "Where the money comes from. Blank means Imported.", example: "Road scheme" },
        {
          column: "Notes",
          required: "No",
          how: "Anything to keep with the project, such as a project number. It is shown in the reasons.",
          example: "CIP-2027-014",
        },
        {
          column: "",
          required: "",
          how: "Two rows on the same segment in the same year stay two projects — use a combination to make them one. Work already in the plan is kept; an exact repeat (same work, segment and year) is skipped.",
          example: "",
        },
      ],
    },
    {
      sheetName: "Treatments",
      title: "Names the Treatment column accepts",
      note: `${library.length} treatments and ${combinations.length} combinations in the library.`,
      columns: [
        { key: "name", header: "Name", width: 32 },
        { key: "kind", header: "Kind", width: 14 },
        { key: "detail", header: "Includes / category", width: 60 },
      ],
      rows: [
        ...library.map((d) => ({ name: d.name, kind: "Treatment", detail: d.category })),
        ...combinations.map((c) => ({
          name: c.name,
          kind: "Combination",
          detail: c.members.map((m) => m.treatment).join(" + ") + (c.enabled ? "" : " (switched off)"),
        })),
      ],
    },
  ]);
}
