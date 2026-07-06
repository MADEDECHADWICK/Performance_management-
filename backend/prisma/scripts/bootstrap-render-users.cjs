const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.BOOTSTRAP_USER_PASSWORD || "Password123!";

const accessRoles = [
  "super_admin",
  "hr",
  "gmp",
  "partner",
  "manager",
  "finance",
  "marketing",
  "employee",
];

const positionRoles = [
  { name: "Group Managing Partner", billingRate: 14000, costRate: 10000 },
  { name: "Partner", billingRate: 12000, costRate: 9000 },
  { name: "Senior Manager", billingRate: 8500, costRate: 6500 },
  { name: "Manager", billingRate: 7500, costRate: 5500 },
  { name: "Finance Manager", billingRate: 7000, costRate: 5200 },
  { name: "Finance Controller", billingRate: 6800, costRate: 5000 },
  { name: "Finance Analyst", billingRate: 4500, costRate: 3200 },
  { name: "Collections Officer", billingRate: 4200, costRate: 3000 },
  { name: "Marketing Lead", billingRate: 5500, costRate: 3800 },
  { name: "Business Development Manager", billingRate: 6000, costRate: 4200 },
  { name: "Client Success Officer", billingRate: 4500, costRate: 3100 },
  { name: "Proposal Coordinator", billingRate: 4200, costRate: 2900 },
  { name: "HR Director", billingRate: 6000, costRate: 4300 },
  { name: "HR Officer", billingRate: 3500, costRate: 2500 },
  { name: "HR Associate", billingRate: 3000, costRate: 2200 },
  { name: "Senior Associate", billingRate: 5200, costRate: 3600 },
  { name: "Associate", billingRate: 3800, costRate: 2600 },
  { name: "Consultant", billingRate: 4500, costRate: 3100 },
  { name: "Graduate Trainee", billingRate: 2000, costRate: 1200 },
  { name: "Administrative Assistant", billingRate: 2500, costRate: 1600 },
];

const users = [
  {
    email: "hr.director@ronalds.local",
    firstName: "Naomi",
    lastName: "Wairimu",
    positionTitle: "HR Director",
    positionRoleName: "HR Director",
    authRole: "hr",
    employeeId: "BOOT-001",
    financialTarget: 0,
    utilizationTarget: 0.65,
  },
  {
    email: "hr.officer@ronalds.local",
    firstName: "Brian",
    lastName: "Otieno",
    positionTitle: "HR Officer",
    positionRoleName: "HR Officer",
    authRole: "hr",
    employeeId: "BOOT-002",
    financialTarget: 0,
    utilizationTarget: 0.68,
    reportsToEmail: "hr.director@ronalds.local",
  },
  {
    email: "hr.associate@ronalds.local",
    firstName: "Faith",
    lastName: "Njeri",
    positionTitle: "HR Associate",
    positionRoleName: "HR Associate",
    authRole: "hr",
    employeeId: "BOOT-003",
    financialTarget: 0,
    utilizationTarget: 0.68,
    reportsToEmail: "hr.director@ronalds.local",
  },
  {
    email: "gmp.main@ronalds.local",
    firstName: "Grace",
    lastName: "Kariuki",
    positionTitle: "Group Managing Partner",
    positionRoleName: "Group Managing Partner",
    authRole: "gmp",
    employeeId: "BOOT-004",
    isPartner: true,
    financialTarget: 12000000,
    utilizationTarget: 0.7,
  },
  {
    email: "tax.partner@ronalds.local",
    firstName: "Janet",
    lastName: "Mwangi",
    positionTitle: "Tax Partner",
    positionRoleName: "Partner",
    authRole: "partner",
    employeeId: "BOOT-005",
    isPartner: true,
    financialTarget: 6000000,
    utilizationTarget: 0.72,
    reportsToEmail: "gmp.main@ronalds.local",
  },
  {
    email: "audit.partner@ronalds.local",
    firstName: "Daniel",
    lastName: "Kiptoo",
    positionTitle: "Audit Partner",
    positionRoleName: "Partner",
    authRole: "partner",
    employeeId: "BOOT-006",
    isPartner: true,
    financialTarget: 6500000,
    utilizationTarget: 0.72,
    reportsToEmail: "gmp.main@ronalds.local",
  },
  {
    email: "advisory.partner@ronalds.local",
    firstName: "Rachel",
    lastName: "Achola",
    positionTitle: "Advisory Partner",
    positionRoleName: "Partner",
    authRole: "partner",
    employeeId: "BOOT-007",
    isPartner: true,
    financialTarget: 5500000,
    utilizationTarget: 0.72,
    reportsToEmail: "gmp.main@ronalds.local",
  },
  {
    email: "risk.partner@ronalds.local",
    firstName: "Samuel",
    lastName: "Muthoni",
    positionTitle: "Risk & Compliance Partner",
    positionRoleName: "Partner",
    authRole: "partner",
    employeeId: "BOOT-008",
    isPartner: true,
    financialTarget: 5000000,
    utilizationTarget: 0.72,
    reportsToEmail: "gmp.main@ronalds.local",
  },
  {
    email: "tax.manager@ronalds.local",
    firstName: "James",
    lastName: "Mutua",
    positionTitle: "Tax Manager",
    positionRoleName: "Manager",
    authRole: "manager",
    employeeId: "BOOT-009",
    financialTarget: 3000000,
    utilizationTarget: 0.8,
    reportsToEmail: "tax.partner@ronalds.local",
  },
  {
    email: "audit.manager@ronalds.local",
    firstName: "Patrick",
    lastName: "Kiprono",
    positionTitle: "Audit Manager",
    positionRoleName: "Manager",
    authRole: "manager",
    employeeId: "BOOT-010",
    financialTarget: 3200000,
    utilizationTarget: 0.8,
    reportsToEmail: "audit.partner@ronalds.local",
  },
  {
    email: "advisory.manager@ronalds.local",
    firstName: "Linda",
    lastName: "Akinyi",
    positionTitle: "Advisory Manager",
    positionRoleName: "Senior Manager",
    authRole: "manager",
    employeeId: "BOOT-011",
    financialTarget: 3000000,
    utilizationTarget: 0.78,
    reportsToEmail: "advisory.partner@ronalds.local",
  },
  {
    email: "risk.manager@ronalds.local",
    firstName: "Victor",
    lastName: "Omondi",
    positionTitle: "Risk Manager",
    positionRoleName: "Manager",
    authRole: "manager",
    employeeId: "BOOT-012",
    financialTarget: 2800000,
    utilizationTarget: 0.78,
    reportsToEmail: "risk.partner@ronalds.local",
  },
  {
    email: "payroll.manager@ronalds.local",
    firstName: "Eunice",
    lastName: "Nyambura",
    positionTitle: "Payroll Manager",
    positionRoleName: "Manager",
    authRole: "manager",
    employeeId: "BOOT-013",
    financialTarget: 1800000,
    utilizationTarget: 0.75,
    reportsToEmail: "tax.partner@ronalds.local",
  },
  {
    email: "finance.manager@ronalds.local",
    firstName: "Ronald",
    lastName: "Ouma",
    positionTitle: "Finance Manager",
    positionRoleName: "Finance Manager",
    authRole: "finance",
    employeeId: "BOOT-014",
    financialTarget: 0,
    utilizationTarget: 0.72,
    reportsToEmail: "gmp.main@ronalds.local",
  },
  {
    email: "finance.controller@ronalds.local",
    firstName: "Mercy",
    lastName: "Chebet",
    positionTitle: "Finance Controller",
    positionRoleName: "Finance Controller",
    authRole: "finance",
    employeeId: "BOOT-015",
    financialTarget: 0,
    utilizationTarget: 0.72,
    reportsToEmail: "finance.manager@ronalds.local",
  },
  {
    email: "finance.analyst@ronalds.local",
    firstName: "Kelvin",
    lastName: "Maina",
    positionTitle: "Finance Analyst",
    positionRoleName: "Finance Analyst",
    authRole: "finance",
    employeeId: "BOOT-016",
    financialTarget: 0,
    utilizationTarget: 0.72,
    reportsToEmail: "finance.manager@ronalds.local",
  },
  {
    email: "collections.officer@ronalds.local",
    firstName: "Irene",
    lastName: "Wambui",
    positionTitle: "Collections Officer",
    positionRoleName: "Collections Officer",
    authRole: "finance",
    employeeId: "BOOT-017",
    financialTarget: 0,
    utilizationTarget: 0.72,
    reportsToEmail: "finance.manager@ronalds.local",
  },
  {
    email: "marketing.lead@ronalds.local",
    firstName: "Esther",
    lastName: "Wanjiku",
    positionTitle: "Marketing Lead",
    positionRoleName: "Marketing Lead",
    authRole: "marketing",
    employeeId: "BOOT-018",
    financialTarget: 1600000,
    utilizationTarget: 0.68,
    reportsToEmail: "gmp.main@ronalds.local",
  },
  {
    email: "bd.manager@ronalds.local",
    firstName: "Allan",
    lastName: "Odhiambo",
    positionTitle: "Business Development Manager",
    positionRoleName: "Business Development Manager",
    authRole: "marketing",
    employeeId: "BOOT-019",
    financialTarget: 2200000,
    utilizationTarget: 0.7,
    reportsToEmail: "marketing.lead@ronalds.local",
  },
  {
    email: "client.success@ronalds.local",
    firstName: "Joy",
    lastName: "Atieno",
    positionTitle: "Client Success Officer",
    positionRoleName: "Client Success Officer",
    authRole: "marketing",
    employeeId: "BOOT-020",
    financialTarget: 1200000,
    utilizationTarget: 0.7,
    reportsToEmail: "marketing.lead@ronalds.local",
  },
  {
    email: "proposals.coordinator@ronalds.local",
    firstName: "Martin",
    lastName: "Karanja",
    positionTitle: "Proposal Coordinator",
    positionRoleName: "Proposal Coordinator",
    authRole: "marketing",
    employeeId: "BOOT-021",
    financialTarget: 1000000,
    utilizationTarget: 0.68,
    reportsToEmail: "bd.manager@ronalds.local",
  },
  {
    email: "tax.senior@ronalds.local",
    firstName: "Kevin",
    lastName: "Otieno",
    positionTitle: "Tax Senior",
    positionRoleName: "Senior Associate",
    authRole: "employee",
    employeeId: "BOOT-022",
    financialTarget: 1500000,
    utilizationTarget: 0.82,
    reportsToEmail: "tax.manager@ronalds.local",
  },
  {
    email: "tax.associate@ronalds.local",
    firstName: "Ruth",
    lastName: "Achieng",
    positionTitle: "Tax Associate",
    positionRoleName: "Associate",
    authRole: "employee",
    employeeId: "BOOT-023",
    financialTarget: 1000000,
    utilizationTarget: 0.82,
    reportsToEmail: "tax.manager@ronalds.local",
  },
  {
    email: "audit.senior@ronalds.local",
    firstName: "Peter",
    lastName: "Mworia",
    positionTitle: "Audit Senior",
    positionRoleName: "Senior Associate",
    authRole: "employee",
    employeeId: "BOOT-024",
    financialTarget: 1600000,
    utilizationTarget: 0.82,
    reportsToEmail: "audit.manager@ronalds.local",
  },
  {
    email: "audit.associate@ronalds.local",
    firstName: "Caroline",
    lastName: "Naliaka",
    positionTitle: "Audit Associate",
    positionRoleName: "Associate",
    authRole: "employee",
    employeeId: "BOOT-025",
    financialTarget: 1050000,
    utilizationTarget: 0.82,
    reportsToEmail: "audit.manager@ronalds.local",
  },
  {
    email: "advisory.consultant@ronalds.local",
    firstName: "Dennis",
    lastName: "Barasa",
    positionTitle: "Advisory Consultant",
    positionRoleName: "Consultant",
    authRole: "employee",
    employeeId: "BOOT-026",
    financialTarget: 1400000,
    utilizationTarget: 0.8,
    reportsToEmail: "advisory.manager@ronalds.local",
  },
  {
    email: "risk.associate@ronalds.local",
    firstName: "Sharon",
    lastName: "Moraa",
    positionTitle: "Risk Associate",
    positionRoleName: "Associate",
    authRole: "employee",
    employeeId: "BOOT-027",
    financialTarget: 1000000,
    utilizationTarget: 0.8,
    reportsToEmail: "risk.manager@ronalds.local",
  },
  {
    email: "payroll.associate@ronalds.local",
    firstName: "David",
    lastName: "Kamau",
    positionTitle: "Payroll Associate",
    positionRoleName: "Associate",
    authRole: "employee",
    employeeId: "BOOT-028",
    financialTarget: 900000,
    utilizationTarget: 0.78,
    reportsToEmail: "payroll.manager@ronalds.local",
  },
  {
    email: "trainee.analyst@ronalds.local",
    firstName: "Michelle",
    lastName: "Wekesa",
    positionTitle: "Graduate Trainee",
    positionRoleName: "Graduate Trainee",
    authRole: "employee",
    employeeId: "BOOT-029",
    financialTarget: 500000,
    utilizationTarget: 0.75,
    reportsToEmail: "audit.manager@ronalds.local",
  },
  {
    email: "admin.assistant@ronalds.local",
    firstName: "Lucy",
    lastName: "Mbithe",
    positionTitle: "Administrative Assistant",
    positionRoleName: "Administrative Assistant",
    authRole: "employee",
    employeeId: "BOOT-030",
    financialTarget: 0,
    utilizationTarget: 0.7,
    reportsToEmail: "hr.officer@ronalds.local",
  },
];

async function upsertAccessRoles() {
  const roles = await Promise.all(
    accessRoles.map((name) =>
      prisma.authRole.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, description: `${name} role`, isActive: true },
      })
    )
  );
  return new Map(roles.map((role) => [role.name, role]));
}

async function upsertPositionRoles() {
  const roles = await Promise.all(
    positionRoles.map((role) =>
      prisma.positionRole.upsert({
        where: { name: role.name },
        update: {
          billingRate: role.billingRate,
          costRate: role.costRate,
          isActive: true,
        },
        create: {
          name: role.name,
          description: role.description || null,
          billingRate: role.billingRate,
          costRate: role.costRate,
          isActive: true,
        },
      })
    )
  );
  return new Map(roles.map((role) => [role.name, role]));
}

async function upsertUsers(roleMap, positionRoleMap, passwordHash) {
  const profileByEmail = new Map();

  for (const item of users) {
    const authRole = roleMap.get(item.authRole);
    if (!authRole) throw new Error(`Missing access role: ${item.authRole}`);

    const positionRole = positionRoleMap.get(item.positionRoleName);
    if (!positionRole) throw new Error(`Missing position role: ${item.positionRoleName}`);

    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: {
        password: passwordHash,
        isActive: true,
        isVerified: true,
        resetToken: null,
      },
      create: {
        email: item.email,
        password: passwordHash,
        isActive: true,
        isVerified: true,
        resetToken: null,
      },
    });

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        firstName: item.firstName,
        lastName: item.lastName,
        positionTitle: item.positionTitle,
        employeeId: item.employeeId,
        status: "active",
        roleId: positionRole.id,
        departmentId: null,
        isPartner: Boolean(item.isPartner),
        financialTarget: item.financialTarget,
        utilizationTarget: item.utilizationTarget,
        onboardingStatus: "completed",
        onboardingChecklistCompleted: true,
        inductionCompleted: true,
      },
      create: {
        userId: user.id,
        firstName: item.firstName,
        lastName: item.lastName,
        positionTitle: item.positionTitle,
        employeeId: item.employeeId,
        status: "active",
        roleId: positionRole.id,
        departmentId: null,
        isPartner: Boolean(item.isPartner),
        financialTarget: item.financialTarget,
        utilizationTarget: item.utilizationTarget,
        onboardingStatus: "completed",
        onboardingChecklistCompleted: true,
        inductionCompleted: true,
      },
    });

    await prisma.userAuthRole.deleteMany({ where: { userId: user.id } });
    await prisma.userAuthRole.create({
      data: {
        userId: user.id,
        roleId: authRole.id,
      },
    });

    if (item.isPartner || item.authRole === "partner" || item.authRole === "gmp") {
      await prisma.partner.upsert({
        where: { profileId: profile.id },
        update: {},
        create: { profileId: profile.id },
      });
    }

    profileByEmail.set(item.email, profile);
  }

  return profileByEmail;
}

async function wireReportingLines(profileByEmail) {
  for (const item of users) {
    const profile = profileByEmail.get(item.email);
    if (!profile) continue;

    const manager = item.reportsToEmail ? profileByEmail.get(item.reportsToEmail) : null;
    await prisma.profile.update({
      where: { id: profile.id },
      data: { managerId: manager?.id || null },
    });
  }
}

async function main() {
  if (users.length !== 30) {
    throw new Error(`Expected 30 bootstrap users, found ${users.length}`);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const [roleMap, positionRoleMap] = await Promise.all([
    upsertAccessRoles(),
    upsertPositionRoles(),
  ]);
  const profileByEmail = await upsertUsers(roleMap, positionRoleMap, passwordHash);
  await wireReportingLines(profileByEmail);

  console.log("Render bootstrap users ready.");
  console.log(`Created/updated users: ${users.length}`);
  console.log(`Default password: ${DEFAULT_PASSWORD}`);
  console.log("Departments were intentionally left unassigned.");
  console.table(
    users.map((item) => ({
      email: item.email,
      accessRole: item.authRole,
      position: item.positionTitle,
      department: "Unassigned",
    }))
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
