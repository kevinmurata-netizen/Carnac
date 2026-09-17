"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RuleSummary } from "@/server/rules";
import { RuleList } from "./rule-list";
import { RuleDialog, type RuleRequest } from "./rule-dialog";

/**
 * The rules list, and the editor that opens over it.
 *
 * A pop-up rather than a section under the list, so opening a rule never
 * sends you scrolling and closing it leaves you where you were. The same
 * pop-up a treatment uses, with Delete added since this is where rules are
 * managed.
 *
 * `?rule=<id>` or `?rule=new` still opens the editor, so an old link lands
 * where it used to; closing clears it from the address.
 */
export function RuleWorkspace({
  rules,
  canEdit,
  initialOpen,
}: {
  rules: RuleSummary[];
  canEdit: boolean;
  /** From the address: a rule id, "new", or nothing. */
  initialOpen: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [request, setRequest] = useState<RuleRequest | null>(() =>
    !canEdit || !initialOpen
      ? null
      : initialOpen === "new"
        ? { id: null, effect: "allow" }
        : rules.some((r) => r.id === initialOpen)
          ? { id: initialOpen }
          : null
  );
  // The id a new rule was saved under, so the list highlights it.
  const [savedId, setSavedId] = useState<string | null>(null);
  const openId = request ? (request.id ?? savedId) : null;

  const close = () => {
    setRequest(null);
    setSavedId(null);
    // Arrived by a link that opened the editor: take the parameter off, so a
    // refresh does not open it again.
    if (initialOpen) router.replace(pathname, { scroll: false });
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>
          Rules <span className="text-muted-foreground">({rules.length})</span>
        </CardTitle>
        {canEdit && (
          <Button type="button" size="sm" onClick={() => setRequest({ id: null, effect: "allow" })}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            New rule
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {rules.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            No rules yet. Without any, every treatment is considered for every inspected asset.
          </p>
        ) : (
          <RuleList rules={rules} selectedId={openId} canEdit={canEdit} onOpen={(id) => setRequest({ id })} />
        )}
      </CardContent>

      <RuleDialog
        request={request}
        usedBy={openId ? (rules.find((r) => r.id === openId)?.usedBy ?? []) : []}
        allowDelete
        onClose={close}
        onSaved={(id) => setSavedId(id)}
      />
    </Card>
  );
}
