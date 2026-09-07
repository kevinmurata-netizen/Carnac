"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FolderPlus, Ban, ExternalLink } from "lucide-react";
import {
  addToRuleGroup,
  removeRuleNode,
  setRuleGroupJoin,
  emptyRuleGroup,
  newRuleRef,
  ruleIdsIn,
  type RuleGroup,
  type RuleNode,
} from "@/domain/waterline/decision-tree";
import type { RuleSummary } from "@/server/rules";

const control =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
 * containing one would have no clear reading; they are listed separately.
 */
export function RuleTreeEditor({

  allRules,
  initialTree,
  initialBlockIds,
  canEdit,
  onSave,
}: {

  allRules: RuleSummary[];
  initialTree: RuleGroup;
  initialBlockIds: string[];
  canEdit: boolean;
  onSave: (tree: RuleGroup, blockIds: string[]) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [tree, setTree] = useState<RuleGroup>(initialTree);
  const [blockIds, setBlockIds] = useState<string[]>(initialBlockIds);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(() => JSON.stringify({ tree: initialTree, blockIds: [...initialBlockIds].sort() }));
  const dirty = JSON.stringify({ tree, blockIds: [...blockIds].sort() }) !== saved;

  const byId = useMemo(() => new Map(allRules.map((r) => [r.id, r])), [allRules]);
  const allows = useMemo(() => allRules.filter((r) => r.effect === "allow"), [allRules]);
  const blocks = useMemo(() => allRules.filter((r) => r.effect === "block"), [allRules]);
  const used = useMemo(() => new Set(ruleIdsIn(tree)), [tree]);

  const save = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await onSave(tree, blockIds);
    setResult(outcome);
    if (outcome.ok) {
      setSaved(JSON.stringify({ tree, blockIds: [...blockIds].sort() }));
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {used.size === 0
            ? "Nothing arranged, so this treatment is considered for every inspected asset."
            : `${used.size} rule${used.size === 1 ? "" : "s"} arranged${blockIds.length > 0 ? `, ${blockIds.length} blocking` : ""}.`}{" "}
          <Link href="/settings/decision-trees" className="text-primary hover:underline">
            Write or edit rules →
          </Link>
        </p>
        {canEdit && (
          <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        )}
      </div>

      <GroupEditor
        group={tree}
        depth={0}
        byId={byId}
        available={allows}
        canEdit={canEdit}
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
          Not part of the arrangement, because a block inside an &ldquo;any of&rdquo; group would have no clear
          meaning. Any one of these matching is enough to rule the asset out.
        </p>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocking rules written yet.</p>
        ) : (
          blocks.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={blockIds.includes(r.id)}
                onChange={() =>
                  setBlockIds((all) => (all.includes(r.id) ? all.filter((x) => x !== r.id) : [...all, r.id]))
                }
                disabled={!canEdit}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <RuleLink rule={r} />
                <span className="mt-0.5 block text-xs text-muted-foreground">{r.summary}</span>
              </span>
            </label>
          ))
        )}
      </div>

      {result && <p className={`mt-3 text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>}
    </div>
  );
}

/** A rule's name, linking through to the page where it is written. */
function RuleLink({ rule }: { rule: RuleSummary }) {
  return (
    <Link
      href={`/settings/decision-trees?rule=${rule.id}`}
      className="group inline-flex items-center gap-1 font-medium text-primary hover:underline"
      title={rule.summary}
    >
      {rule.name}
      <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      {!rule.enabled && <span className="ml-1 text-xs font-normal text-muted-foreground">(disabled)</span>}
    </Link>
  );
}

/**
 * One group and everything under it, drawn as a flow chart: a join label down
 * the left with a rail connecting each branch, so precedence is visible rather
 * than inferred from indentation alone.
 */
function GroupEditor({
  group,
  depth,
  byId,
  available,
  canEdit,
  onAddRule,
  onAddGroup,
  onRemove,
  onJoin,
}: {
  group: RuleGroup;
  depth: number;
  byId: Map<string, RuleSummary>;
  available: RuleSummary[];
  canEdit: boolean;
  onAddRule: (groupId: string, ruleId: string) => void;
  onAddGroup: (groupId: string) => void;
  onRemove: (nodeId: string) => void;
  onJoin: (groupId: string, join: "AND" | "OR") => void;
}) {
  const [search, setSearch] = useState("");
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((r) => r.name.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q));
  }, [available, search]);

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
          <Branch
            key={child.id}
            node={child}
            depth={depth}
            byId={byId}
            available={available}
            canEdit={canEdit}
            onAddRule={onAddRule}
            onAddGroup={onAddGroup}
            onRemove={onRemove}
            onJoin={onJoin}
          />
        ))}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rules…"
              aria-label="Search rules to add"
              className={`${control} w-44`}
            />
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onAddRule(group.id, e.target.value);
                setSearch("");
              }}
              aria-label="Add a rule to this group"
              className={`${control} max-w-sm`}
            >
              <option value="">
                {matches.length === 0 ? "No rule matches that search" : `Add a rule… (${matches.length})`}
              </option>
              {matches.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.enabled ? "" : " (disabled)"}
                </option>
              ))}
            </select>
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function Branch({
  node,
  depth,
  byId,
  available,
  canEdit,
  onAddRule,
  onAddGroup,
  onRemove,
  onJoin,
}: {
  node: RuleNode;
  depth: number;
  byId: Map<string, RuleSummary>;
  available: RuleSummary[];
  canEdit: boolean;
  onAddRule: (groupId: string, ruleId: string) => void;
  onAddGroup: (groupId: string) => void;
  onRemove: (nodeId: string) => void;
  onJoin: (groupId: string, join: "AND" | "OR") => void;
}) {
  if (node.kind === "group") {
    return (
      <GroupEditor
        group={node}
        depth={depth + 1}
        byId={byId}
        available={available}
        canEdit={canEdit}
        onAddRule={onAddRule}
        onAddGroup={onAddGroup}
        onRemove={onRemove}
        onJoin={onJoin}
      />
    );
  }

  const rule = byId.get(node.ruleId);

  return (
    <div className="flex items-start gap-2 rounded-md border bg-background px-3 py-2">
      <span className="min-w-0 flex-1">
        {rule ? (
          <>
            <RuleLink rule={rule} />
            <span className="mt-0.5 block text-xs text-muted-foreground">{rule.summary}</span>
          </>
        ) : (
          <span className="text-sm text-destructive">
            This rule no longer exists. It is skipped rather than failed, so the treatment is not silently narrowed —
            remove it here.
          </span>
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
