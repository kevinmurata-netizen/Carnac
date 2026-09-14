"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScenarioSetForm, type SetFormValues } from "./set-form";
import { updateScenarioSetAction } from "./actions";

/**
 * The set's own details, closed until asked for.
 *
 * The page is about the scenarios in the set, so the five fields describing
 * it stay out of the way. The caller keys this on the set's updatedAt, so a
 * save remounts it closed and showing the stored values.
 */
export function ScenarioSetEditor({ initial, memberCount }: { initial: SetFormValues; memberCount: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Edit set
      </Button>
    );
  }

  return (
    <Card className="mt-4 w-full">
      <CardHeader>
        <CardTitle>Edit {initial.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScenarioSetForm
          initial={initial}
          action={updateScenarioSetAction}
          memberCount={memberCount}
          onCancel={() => setOpen(false)}
        />
      </CardContent>
    </Card>
  );
}
