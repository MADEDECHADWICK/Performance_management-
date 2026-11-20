-- Register the job costing report and grant it to reporting roles
INSERT INTO "view_permissions" ("key", "createdAt", "updatedAt")
VALUES ('finance.job_costing', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "auth_role_view_permissions" ("roleId", "viewPermissionId")
SELECT role."id", permission."id"
FROM "auth_roles" AS role
JOIN "view_permissions" AS permission
  ON permission."key" = 'finance.job_costing'
WHERE role."name" IN (
  'super_admin',
  'hr',
  'gmp',
  'partner',
  'manager',
  'finance',
  'employee'
)
ON CONFLICT DO NOTHING;
