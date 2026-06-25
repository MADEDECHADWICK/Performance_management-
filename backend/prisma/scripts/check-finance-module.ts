import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const role = await prisma.authRole.findUnique({
    where: { name: "finance" },
    include: {
      moduleAccess: { include: { module: { select: { key: true } } } },
    },
  });
  if (!role) { console.log("finance role not found"); return; }
  console.log("Module keys:", role.moduleAccess.map((m) => m.module.key));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
