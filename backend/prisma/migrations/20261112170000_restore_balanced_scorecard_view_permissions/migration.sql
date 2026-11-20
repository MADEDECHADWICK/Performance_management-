-- Restore Balanced Scorecard view access for roles whose persisted view
-- configurations predate the kpi.* permissions.

INSERT INTO "auth_role_view_permissions" ("roleId", "viewPermissionId")
SELECT role."id", permission."id"
FROM "auth_roles" AS role
JOIN "view_permissions" AS permission
  ON permission."key" = 'kpi.scorecard'
WHERE role."name" IN (
  'super_admin',
  'hr',
  'gmp',
  'partner',
  'manager',
  'finance',
  'marketing',
  'employee'
)
ON CONFLICT DO NOTHING;

INSERT INTO "auth_role_view_permissions" ("roleId", "viewPermissionId")
SELECT role."id", permission."id"
FROM "auth_roles" AS role
JOIN "view_permissions" AS permission
  ON permission."key" = 'kpi.firm_templates'
WHERE role."name" IN ('super_admin', 'gmp')
ON CONFLICT DO NOTHING;
