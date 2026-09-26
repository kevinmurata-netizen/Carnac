import { redirect } from "next/navigation";

/**
 * Configuration was split into Asset Types and Inspection Templates.
 *
 * The route stays as a redirect rather than being deleted: this page has been
 * linked to from the Settings grid since the app was built, and a bookmark or
 * an old link landing on a 404 would look like the feature was removed rather
 * than renamed. Asset types are the larger half, so that is where it goes.
 */
export default function ConfigurationPage() {
  redirect("/settings/asset-types");
}
