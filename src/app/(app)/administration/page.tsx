import { redirect } from "next/navigation";

/**
 * Administration is no longer a landing page of its own — its cards moved into
 * Settings tabs. The sub-pages stay where they are, so this redirect keeps
 * bookmarks and the breadcrumb's "Administration" crumb working rather than
 * dead-ending on a 404.
 */
export default function AdministrationPage() {
  redirect("/settings?tab=administration");
}
