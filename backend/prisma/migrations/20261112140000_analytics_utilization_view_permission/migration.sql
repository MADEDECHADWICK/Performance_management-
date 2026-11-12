-- Register the utilization view and grant it to management roles

INSERT INTO "view_permissions" ("key", "createdAt", "updatedAt")
VALUES ('analytics.utilization', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "auth_role_view_permissions" ("roleId", "viewPermissionId")
SELECT role."id", permission."id"
FROM "auth_roles" AS role
JOIN "view_permissions" AS permission
  ON permission."key" = 'analytics.utilization'
WHERE role."name" IN (
  'super_admin',
  'hr',
  'gmp',
  'partner',
  'manager',
  'finance'
)
ON CONFLICT DO NOTHING;
