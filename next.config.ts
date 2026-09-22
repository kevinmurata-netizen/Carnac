import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * A work plan import sends the spreadsheet itself. 1 MB, the default,
       * is a few thousand rows of .xlsx once someone's formatting is in it;
       * the action refuses anything over 3 MB with a message, and this leaves
       * room for that file plus the form around it, under Vercel's 4.5 MB
       * request cap.
       */
      bodySizeLimit: "4mb",
    },
  },
  /**
   * The Treatment Rules page moved from /settings/decision-trees in Phase 6.5.
   *
   * Permanent (308), because the old path is not coming back and browsers and
   * search engines may cache it forever. Query values pass through on their
   * own, which matters: the rule-tree editor deep-links to
   * `?rule=<id>`, and a redirect that dropped it would land someone on the
   * list with no indication of which rule they had asked for.
   *
   * Kept indefinitely rather than for a release. Anything anyone bookmarked
   * or linked from outside points at the old path, and a redirect costs
   * nothing to leave in place.
   */
  redirects() {
    return [
      {
        source: "/settings/decision-trees",
        destination: "/settings/treatment-rules",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
