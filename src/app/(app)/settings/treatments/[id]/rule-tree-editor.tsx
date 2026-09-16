"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSectionDirty } from "@/components/layout/collapsible-section";
import { CancelOrDiscard } from "@/components/layout/save-actions";
import { Plus, Trash2, FolderPlus, Ban, Pencil, CircleDot } from "lucide-react";
import {
  addToRuleGroup,
  removeRuleNode,
  setRuleGroupJoin,
  emptyRuleGroup,
  newRuleRef,
  ruleIdsIn,
  type RuleEffect,
  type RuleGroup,
  type RuleNode,
} from "@/domain/waterline/decision-tree";
import type { RuleSummary } from "@/server/rules";
import { RuleDialog, type RuleRequest } from "./rule-dialog";

const control =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Where a rule being written will go once it exists. */
type Target = { kind: "group"; groupId: string } | { kind: "blocks" };

/**
 * Arranges the rules that decide when a treatment can be used.
 *
 * A flat list with one "match all / match any" switch could not express
 * "condition AND (district OR pressure zone)", which is the shape real policy
 * takes. So rules sit in groups, each joined by AND or OR, and the whole thing
 * is drawn as a flow chart — the arrangement is the point, and a nested list
 * of checkboxes hides it.
 *
 * Blocking rules are not in the tree. They always apply, so an "any of" group
 * containing one would have no clear reading; they are chosen separately, but
 * the same way — searched for and picked, not hunted for in a list of every
 * block ever written.
 *
 * Rules are written and edited in a pop-up over the treatment (see
 * RuleDialog), so neither loses your place. A rule written from a group joins
 * that group; one written from the blocks, or written as a block, joins the
 * blocks.
 *
 * Used two ways. With `onSave` it owns its own saving, which is the treatment
 * detail page. With `onChange` it reports upwards and saves nothing, which is
 * how a treatment that does not exist yet can still be given an arrangement.
 */
export function RuleTreeEditor({
  allRules,
  initialTree,
  initialBlockIds,
  canEdit,
  canEditRules,
  onSave,
  onChange,
}: {
  allRules: RuleSummary[];
  initialTree: RuleGroup;
  initialBlockIds: string[];
  canEdit: boolean;
  /** Whether this role may write rules themselves, which is a separate
   * permission from arranging them on a treatment. Without it, a rule's name
   * links to its page instead of opening the editor. */
  canEditRules: boolean;
  onSave?: (tree: RuleGroup, blockIds: string[]) => Promise<{ ok: boolean; message: string }>;
  onChange?: (tree: RuleGroup, blockIds: string[]) => void;
}) {
  const router = useRouter();
  const [tree, setTree] = useState<RuleGroup>(initialTree);
  const [blockIds, setBlockIds] = useState<string[]>(initialBlockIds);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // The saved arrangement itself, not just its serialisation — Discard has to
  // put it back, not merely notice it differs.
  const [saved, setSaved] = useState<{ tree: RuleGroup; blockIds: string[] }>(() => ({
    tree: initialTree,
    blockIds: initialBlockIds,
  }));
  const key = (t: RuleGroup, b: string[]) => JSON.stringify({ tree: t, blockIds: [...b].sort() });
  const dirty = key(tree, blockIds) !== key(saved.tree, saved.blockIds);

  // The rule pop-up: what it has open, and where a new rule will go.
  const [request, setRequest] = useState<RuleRequest | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  // Rules written here, so one missing from the library reads as still
  // loading (the page is refreshing) rather than as deleted.
  const [written, setWritten] = useState<string[]>([]);
  const openRule = (id: string) => {
    setTarget(null);
    setRequest({ id });
  };
  const writeRule = (to: Target) => {
    setTarget(to);
    setRequest({ id: null, effect: to.kind === "blocks" ? "block" : "allow" });
  };

  // The surrounding section shows the marker, so an arrangement changed and
  // then folded away still says so.
  useSectionDirty(Boolean(onSave) && dirty);

  useEffect(() => {
    onChange?.(tree, blockIds);
    // Reporting a value, not reacting to the callback — a parent that passes a
    // fresh arrow function each render must not re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, blockIds]);

  const byId = useMemo(() => new Map(allRules.map((r) => [r.id, r])), [allRules]);
  const allows = useMemo(() => allRules.filter((r) => r.effect === "allow"), [allRules]);
  const blocks = useMemo(() => allRules.filter((r) => r.effect === "block"), [allRules]);
  const availableBlocks = useMemo(() => blocks.filter((r) => !blockIds.includes(r.id)), [blocks, blockIds]);
  const used = useMemo(() => new Set(ruleIdsIn(tree)), [tree]);

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setResult(null);
    const outcome = await onSave(tree, blockIds);
    setResult(outcome);
    if (outcome.ok) {
      setSaved({ tree, blockIds });
      router.refresh();
    }
    setBusy(false);
  };

  /** A rule just written joins the treatment where it was written — as an
   * unsaved change, like picking an existing one. A block always goes with
   * the blocks, wherever it was started, since it cannot sit in a group. */
  const addCreated = (id: string, effect: RuleEffect) => {
    if (!target) return;
    setWritten((all) => [...all, id]);
    if (effect === "block") {
      setBlockIds((all) => (all.includes(id) ? all : [...all, id]));
    } else {
      const groupId = target.kind === "group" ? target.groupId : tree.id;
      setTree((t) => (ruleIdsIn(t).includes(id) ? t : addToRuleGroup(t, groupId, newRuleRef(id))));
    }
    // Added once; saving the same rule again only updates it.
    setTarget(null);
  };

  const editing = request?.id ? byId.get(request.id) : undefined;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {used.size === 0
            ? "Nothing arranged, so this treatment is considered for every inspected asset."
            : `${used.size} rule${used.size === 1 ? "" : "s"} arranged${blockIds.length > 0 ? `, ${blockIds.length} blocking` : ""}.`}{" "}
          <Link href="/settings/treatment-rules" className="text-primary hover:underline">
            All rules →
          </Link>
        </p>
        {canEdit && onSave && (
          <div className="flex items-center gap-2">
            {/* Adding a rule changes nothing until this is pressed, and that was
                not obvious from a button label alone. */}
            {dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
            <CancelOrDiscard
              dirty={dirty}
              onDiscard={() => {
                setTree(saved.tree);
                setBlockIds(saved.blockIds);
              }}
              disabled={busy}
            />
            <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        )}
      </div>

      <GroupEditor
        group={tree}
        depth={0}
        byId={byId}
        available={allows}
        canEdit={canEdit}
        canEditRules={canEditRules}
        written={written}
        onOpenRule={openRule}
        onWriteRule={(groupId) => writeRule({ kind: "group", groupId })}
        onAddRule={(groupId, ruleId) => setTree((t) => addToRuleGroup(t, groupId, newRuleRef(ruleId)))}
        onAddGroup={(groupId) => setTree((t) => addToRuleGroup(t, groupId, emptyRuleGroup("OR")))}
        onRemove={(nodeId) => setTree((t) => removeRuleNode(t, nodeId))}
        onJoin={(groupId, join) => setTree((t) => setRuleGroupJoin(t, groupId, join))}
      />

      <div className="mt-5 border-t pt-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Ban className="h-3.5 w-3.5" />
          Blocks — refuse the treatment whatever the arrangement above says
        </p>
        <p className="mb-2 text-sm text-muted-foreground">
          Kept out of the arrangement, because a block inside an &ldquo;any of&rdquo; group would have no clear
          meaning. Any one of these matching is enough to rule the asset out.
        </p>

        <div className="space-y-2 border-l-2 border-muted pl-4">
          {blockIds.length === 0 && (
            <p className="py-1 text-sm text-muted-foreground">
              {blocks.length === 0
                ? "No blocking rules written yet."
                : "None applied — nothing refuses this treatment outright."}
            </p>
          )}

          {blockIds.map((id) => {
            const rule = byId.get(id);
            return (
              <div key={id} className="flex items-start gap-2 rounded-md border bg-background px-3 py-2">
                <span className="min-w-0 flex-1">
                  {rule ? (
                    <>
                      <RuleName rule={rule} canEditRules={canEditRules} onOpen={openRule} />
                      <span className="mt-0.5 block text-xs text-muted-foreground">{rule.summary}</span>
                    </>
                  ) : (
                    <MissingRule loading={written.includes(id)} />
                  )}
                </span>
                {rule && !rule.enabled && <Badge variant="secondary">disabled</Badge>}
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${rule?.name ?? "this rule"}`}
                    onClick={() => setBlockIds((all) => all.filter((x) => x !== id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}

          {canEdit && (
            <RulePicker
              available={availableBlocks}
              label="blocking rule"
              onPick={(ruleId) => setBlockIds((all) => (all.includes(ruleId) ? all : [...all, ruleId]))}
              onWrite={canEditRules ? () => writeRule({ kind: "blocks" }) : undefined}
            />
          )}
        </div>
      </div>

      {result && <p className={`mt-3 text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>}

      <RuleDialog
        request={request}
        usedBy={editing?.usedBy ?? []}
        addingTo={
          target?.kind === "blocks"
            ? "added to this treatment's blocks"
            : target
              ? "added to this treatment where you started it"
              : undefined
        }
        onClose={() => {
          setRequest(null);
          setTarget(null);
        }}
        onSaved={(id, effect) => addCreated(id, effect)}
      />
    </div>
  );
}

/** A rule the library does not have: just written and still loading, or gone. */
function MissingRule({ loading }: { loading: boolean }) {
  return loading ? (
    <span className="text-sm text-muted-foreground">Loading this rule…</span>
  ) : (
    <span className="text-sm text-destructive">
      This rule no longer exists. It is skipped rather than failed, so the treatment is not silently narrowed — remove
      it here.
    </span>
  );
}

/** A rule's name: opens it in the pop-up, or links to its page for a role that
 * can only read rules. */
function RuleName({
  rule,
  canEditRules,
  onOpen,
}: {
  rule: RuleSummary;
  canEditRules: boolean;
  onOpen: (id: string) => void;
}) {
  const disabled = !rule.enabled && (
    <span className="ml-1 text-xs font-normal text-muted-foreground">(disabled)</span>
  );
  const className = "group inline-flex items-center gap-1 text-left font-medium text-primary hover:underline";

  if (!canEditRules) {
    return (
      <Link href={`/settings/treatment-rules?rule=${rule.id}`} className={className} title={rule.summary}>
        {rule.name}
        {disabled}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(rule.id)} className={className} title="Edit this rule">
      {rule.name}
      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      {disabled}
    </button>
  );
}

/**
 * Search, then pick. There are already eighteen rules and the number only
 * grows, so a list of every one of them is a worse way to find the one you
 * mean than typing three letters of its name. Beside it, writing a new one.
 */
function RulePicker({
  available,
  label,
  onPick,
  onWrite,
}: {
  available: RuleSummary[];
  label: string;
  onPick: (ruleId: string) => void;
  onWrite?: () => void;
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((r) => r.name.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q));
  }, [available, search]);

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search rules…"
        aria-label={`Search ${label}s to add`}
        className={`${control} w-44`}
      />
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
          setSearch("");
        }}
        aria-label={`Add a ${label}`}
        className={`${control} max-w-sm`}
        disabled={available.length === 0}
      >
        <option value="">
          {available.length === 0
            ? `Every ${label} is already applied`
            : matches.length === 0
              ? "No rule matches that search"
              : `Add a ${label}… (${matches.length})`}
        </option>
        {matches.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.enabled ? "" : " (disabled)"}
          </option>
        ))}
      </select>
      {onWrite && (
        <Button type="button" size="sm" variant="outline" onClick={onWrite}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Write a new {label}
        </Button>
      )}
    </div>
  );
}

type GroupProps = {
  depth: number;
  byId: Map<string, RuleSummary>;
  available: RuleSummary[];
  canEdit: boolean;
  canEditRules: boolean;
  written: string[];
  onOpenRule: (ruleId: string) => void;
  onWriteRule: (groupId: string) => void;
  onAddRule: (groupId: string, ruleId: string) => void;
  onAddGroup: (groupId: string) => void;
  onRemove: (nodeId: string) => void;
  onJoin: (groupId: string, join: "AND" | "OR") => void;
};

/**
 * One group and everything under it, drawn as a flow chart: a join label down
 * the left with a rail connecting each branch, so precedence is visible rather
 * than inferred from indentation alone.
 */
function GroupEditor({ group, ...props }: GroupProps & { group: RuleGroup }) {
  const { depth, available, canEdit, canEditRules, onWriteRule, onAddRule, onAddGroup, onRemove, onJoin } = props;
  return (
    <div className={depth > 0 ? "rounded-md border border-dashed bg-muted/20 p-3" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={group.join}
          onChange={(e) => onJoin(group.id, e.target.value as "AND" | "OR")}
          disabled={!canEdit}
          aria-label="How these combine"
          className={control}
        >
          <option value="AND">Match all of</option>
          <option value="OR">Match any of</option>
        </select>
        <span className="text-sm text-muted-foreground">
          {group.join === "AND"
            ? "every branch below must hold"
            : "one branch below is enough"}
        </span>

        {canEdit && (
          <span className="ml-auto flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => onAddGroup(group.id)}>
              <FolderPlus className="mr-1 h-3.5 w-3.5" />
              Group
            </Button>
            {depth > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Remove this group"
                onClick={() => onRemove(group.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </span>
        )}
      </div>

      {/* The rail: a left border every branch hangs off, so an OR nested in an
          AND is visible at a glance rather than counted out. */}
      <div className="mt-2 space-y-2 border-l-2 border-muted pl-4">
        {group.children.length === 0 && (
          <p className="py-1 text-sm text-muted-foreground">
            Empty — an empty group constrains nothing, so every asset passes it.
          </p>
        )}

        {group.children.map((child) => (
          <Branch key={child.id} node={child} {...props} />
        ))}

        {canEdit && (
          <RulePicker
            available={available}
            label="rule"
            onPick={(ruleId) => onAddRule(group.id, ruleId)}
            onWrite={canEditRules ? () => onWriteRule(group.id) : undefined}
          />
        )}
      </div>
    </div>
  );
}

function Branch({ node, ...props }: GroupProps & { node: RuleNode }) {
  const { depth, byId, canEdit, canEditRules, written, onOpenRule, onRemove } = props;

  if (node.kind === "group") {
    return <GroupEditor group={node} {...props} depth={depth + 1} />;
  }

  const rule = byId.get(node.ruleId);

  return (
    <div className="flex items-start gap-2 rounded-md border bg-background px-3 py-2">
      <span className="min-w-0 flex-1">
        {rule ? (
          <>
            <RuleName rule={rule} canEditRules={canEditRules} onOpen={onOpenRule} />
            <span className="mt-0.5 block text-xs text-muted-foreground">{rule.summary}</span>
          </>
        ) : (
          <MissingRule loading={written.includes(node.ruleId)} />
        )}
      </span>
      {rule && !rule.enabled && <Badge variant="secondary">disabled</Badge>}
      {canEdit && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Remove ${rule?.name ?? "this rule"}`}
          onClick={() => onRemove(node.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
