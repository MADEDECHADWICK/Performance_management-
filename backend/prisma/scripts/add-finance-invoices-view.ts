import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const vp = await prisma.viewPermission.upsert({
    where: { key: "finance.invoices" },
    update: {},
    create: { key: "finance.invoices" },
  });

  const role = await prisma.authRole.findUnique({ where: { name: "finance" } });
  if (!role) {
    console.log("Finance role not found in DB");
    return;
  }

  await prisma.authRoleViewPermission.upsert({
    where: { roleId_viewPermissionId: { roleId: role.id, viewPermissionId: vp.id } },
    update: {},
    create: { roleId: role.id, viewPermissionId: vp.id },
  });

  console.log(`Done. 'finance.invoices' linked to finance role (roleId=${role.id}, vpId=${vp.id})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
