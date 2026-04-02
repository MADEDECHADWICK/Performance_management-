CREATE TABLE "view_permissions" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "view_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_role_view_permissions" (
    "roleId" INTEGER NOT NULL,
    "viewPermissionId" INTEGER NOT NULL,

    CONSTRAINT "auth_role_view_permissions_pkey" PRIMARY KEY ("roleId","viewPermissionId")
);

CREATE UNIQUE INDEX "view_permissions_key_key" ON "view_permissions"("key");
CREATE INDEX "auth_role_view_permissions_viewPermissionId_idx" ON "auth_role_view_permissions"("viewPermissionId");

ALTER TABLE "auth_role_view_permissions"
ADD CONSTRAINT "auth_role_view_permissions_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "auth_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_role_view_permissions"
ADD CONSTRAINT "auth_role_view_permissions_viewPermissionId_fkey"
FOREIGN KEY ("viewPermissionId") REFERENCES "view_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
