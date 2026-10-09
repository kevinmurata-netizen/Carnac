/**
 * What a model screen shows for an asset type that has no such model yet —
 * a facility scored only through its components, say — instead of failing.
 */
export function ModelNotSetUp({ typeName, model }: { typeName: string; model: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
      {typeName} has no {model} yet, so there is nothing to edit here for it.
    </div>
  );
}
