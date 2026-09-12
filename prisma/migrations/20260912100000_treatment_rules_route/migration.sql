-- Phase 6.5: the Treatment Rules page moves to a URL that matches its name.
--
-- See docs/TREATMENT-MODEL-REBUILD.md §6.5. The card has been titled
-- "Treatment Rules" since Phase 1 while the route stayed
-- /settings/decision-trees, which is what it was called before rules became
-- first-class.
--
-- The code half of that rename is cheap. This file is the expensive half,
-- because two tables store the href as a literal string and neither would
-- complain about being wrong.
--
-- WHAT HAPPENS WITHOUT THIS
--
-- `resourceKey()` is `${kind}:${href}`, so after the rename the application
-- asks for `card:/settings/treatment-rules` and every stored row still says
-- `card:/settings/decision-trees`. A permission lookup that matches no row
-- falls through to DEFAULT_ACCESS -- readable and visible to everyone,
-- writable only by Administrator. So a role that had been *restricted* from
-- Treatment Rules silently regains access to it, and a role that had been
-- *granted* write silently loses it. Nothing errors either way.
--
-- Worse, the rows would then be unreachable: `allResourceKeys()` is built from
-- the current cards, and `setRolePermissions` skips any input not in it, so
-- the orphans could not be repaired through the Roles screen afterwards.
--
-- The same argument applies to navigation_labels, where the consequence is
-- milder -- a per-organization rename of the page title silently reverts to
-- the shipped one.

-- One role's access to this card, per organization.
UPDATE "role_permissions"
SET "resource" = 'card:/settings/treatment-rules'
WHERE "resource" = 'card:/settings/decision-trees';

-- A per-organization rename of the page title.
--
-- navigation_labels is unique on (organizationId, href). An organization that
-- had somehow renamed both paths would collide here, which cannot happen --
-- the new path has never existed to be renamed -- but the guard costs nothing
-- and turns a hypothetical constraint violation into a no-op.
UPDATE "navigation_labels" n
SET "href" = '/settings/treatment-rules'
WHERE n."href" = '/settings/decision-trees'
  AND NOT EXISTS (
    SELECT 1 FROM "navigation_labels" other
    WHERE other."organizationId" = n."organizationId"
      AND other."href" = '/settings/treatment-rules'
  );
