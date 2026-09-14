import { redirect } from "next/navigation";

/**
 * Scenario sets are the top of Scenario Planning itself, so this address —
 * which the breadcrumb on a set's page still links to — goes there.
 */
export default function ScenarioSetsPage() {
  redirect("/scenario-planning");
}
