import bcrypt from "bcryptjs";
import prisma from "../../src/prisma";
import {
  buildModuleAccessMatrix,
  matrixToPermissionKeys,
  type ModuleAction,
} from "../../src/services/moduleAccess.service";

const UAT_AUTH_ROLES = [
  "hr",
  "gmp",
  "partner",
  "manager",
  "finance",
  "marketing",
  "employee",
] as const;

type CanonicalAuthRole = (typeof UAT_AUTH_ROLES)[number];
type UatDepartmentCode = "TAX" | "ADV" | "FIN" | "MKT";

type UatUserBlueprint = {
  email: string;
  firstName: string;
  lastName: string;
  authRole: CanonicalAuthRole;
  departmentCode: UatDepartmentCode | null;
  positionTitle: string;
  positionRoleName: string | null;
  isPartner: boolean;
  reportsToEmail?: string;
  onboardingRequired: boolean;
};

const TEST_PASSWORD = "Test@1234";
const ONBOARDING_CHECKLIST_NAME = "UAT Onboarding Checklist";
const ONBOARDING_ITEM_TEMPLATES = [
  {
    itemName: "Upload ID",
    description: "Upload national ID or passport copy.",
    requiresDocument: true,
  },
  {
    itemName: "Sign contract",
    description: "Confirm employment contract has been signed.",
    requiresDocument: false,
  },
  {
    itemName: "Complete profile",
    description: "Fill all required personal and employment profile fields.",
    requiresDocument: false,
  },
  {
    itemName: "Watch orientation video",
    description: "Watch mandatory onboarding orientation video.",
    requiresDocument: false,
  },
  {
    itemName: "Confirm department",
    description: "Confirm your assigned department and reporting line.",
    requiresDocument: false,
  },
];

const DEFAULT_MODULE_ACTIONS_BY_ROLE: Record<CanonicalAuthRole, ModuleAction[]> = {
  hr: ["admin"],
  gmp: ["admin"],
  partner: ["read"],
  manager: ["read"],
  finance: ["admin"],
  marketing: ["read"],
  employee: ["read"],
};

const UAT_USERS: UatUserBlueprint[] = [
  {
    email: "sarah.hr@testfirm.co",
    firstName: "Sarah",
    lastName: "Odhiambo",
    authRole: "hr",
    departmentCode: null,
    positionTitle: "HR Admin",
    positionRoleName: null,
    isPartner: false,
    reportsToEmail: "grace.gmp@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "grace.gmp@testfirm.co",
    firstName: "Grace",
    lastName: "Kariuki",
    authRole: "gmp",
    departmentCode: null,
    positionTitle: "Group Managing Partner",
    positionRoleName: "Partner",
    isPartner: true,
    onboardingRequired: false,
  },
  {
    email: "james.partner@testfirm.co",
    firstName: "James",
    lastName: "Kariuki",
    authRole: "partner",
    departmentCode: "TAX",
    positionTitle: "Partner - Tax & Audit",
    positionRoleName: "Partner",
    isPartner: true,
    reportsToEmail: "grace.gmp@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "linda.partner@testfirm.co",
    firstName: "Linda",
    lastName: "Waweru",
    authRole: "partner",
    departmentCode: "ADV",
    positionTitle: "Partner - Advisory",
    positionRoleName: "Partner",
    isPartner: true,
    reportsToEmail: "grace.gmp@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "brian.mgr@testfirm.co",
    firstName: "Brian",
    lastName: "Mutua",
    authRole: "manager",
    departmentCode: "TAX",
    positionTitle: "Tax Manager",
    positionRoleName: "Tax Manager",
    isPartner: false,
    reportsToEmail: "james.partner@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "agnes.mgr@testfirm.co",
    firstName: "Agnes",
    lastName: "Njeri",
    authRole: "manager",
    departmentCode: "ADV",
    positionTitle: "Advisory Manager",
    positionRoleName: "Advisory Manager",
    isPartner: false,
    reportsToEmail: "linda.partner@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "diana.finance@testfirm.co",
    firstName: "Diana",
    lastName: "Muthoni",
    authRole: "finance",
    departmentCode: "FIN",
    positionTitle: "Finance Manager",
    positionRoleName: "Finance Manager",
    isPartner: false,
    reportsToEmail: "grace.gmp@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "victor.finance@testfirm.co",
    firstName: "Victor",
    lastName: "Maina",
    authRole: "finance",
    departmentCode: "FIN",
    positionTitle: "Finance Analyst",
    positionRoleName: "Finance Analyst",
    isPartner: false,
    reportsToEmail: "diana.finance@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "pauline.marketing@testfirm.co",
    firstName: "Pauline",
    lastName: "Atieno",
    authRole: "marketing",
    departmentCode: "MKT",
    positionTitle: "Marketing Lead",
    positionRoleName: "Marketing Lead",
    isPartner: false,
    reportsToEmail: "grace.gmp@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "kevin.emp@testfirm.co",
    firstName: "Kevin",
    lastName: "Otieno",
    authRole: "employee",
    departmentCode: "TAX",
    positionTitle: "Tax Consultant",
    positionRoleName: "Tax Consultant",
    isPartner: false,
    reportsToEmail: "brian.mgr@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "ruth.emp@testfirm.co",
    firstName: "Ruth",
    lastName: "Achieng",
    authRole: "employee",
    departmentCode: "TAX",
    positionTitle: "Senior Associate",
    positionRoleName: "Senior Associate",
    isPartner: false,
    reportsToEmail: "brian.mgr@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "samuel.emp@testfirm.co",
    firstName: "Samuel",
    lastName: "Mwangi",
    authRole: "employee",
    departmentCode: "TAX",
    positionTitle: "Associate",
    positionRoleName: "Associate",
    isPartner: false,
    reportsToEmail: "brian.mgr@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "peter.emp@testfirm.co",
    firstName: "Peter",
    lastName: "Kamau",
    authRole: "employee",
    departmentCode: "ADV",
    positionTitle: "Senior Associate",
    positionRoleName: "Senior Associate",
    isPartner: false,
    reportsToEmail: "agnes.mgr@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "esther.emp@testfirm.co",
    firstName: "Esther",
    lastName: "Wanjiru",
    authRole: "employee",
    departmentCode: "ADV",
    positionTitle: "Advisory Consultant",
    positionRoleName: "Advisory Consultant",
    isPartner: false,
    reportsToEmail: "agnes.mgr@testfirm.co",
    onboardingRequired: false,
  },
  {
    email: "nicholas.emp@testfirm.co",
    firstName: "Nicholas",
    lastName: "Otieno",
    authRole: "employee",
    departmentCode: "ADV",
    positionTitle: "Associate",
    positionRoleName: "Associate",
    isPartner: false,
    reportsToEmail: "agnes.mgr@testfirm.co",
    onboardingRequired: false,
  },
];

const ensureAuthRoles = async () => {
  const roles = await Promise.all(
    UAT_AUTH_ROLES.map((name) =>
      prisma.authRole.upsert({
        where: { name },
        update: { isActive: true },
        create: {
          name,
          description: `${name} role`,
          isActive: true,
        },
      })
    )
  );

  return new Map(roles.map((role) => [role.name, role]));
};

const ensureRoleModulePolicy = async (roleName: CanonicalAuthRole, roleId: number) => {
  const matrix = buildModuleAccessMatrix({ roles: [roleName] });
  matrix.finance = Array.from(new Set(DEFAULT_MODULE_ACTIONS_BY_ROLE[roleName]));
  const permissionKeys = matrixToPermissionKeys(matrix);

  await prisma.$transaction(async (tx) => {
    await tx.authRolePermission.deleteMany({
      where: {
        roleId,
        permission: {
          key: {
            startsWith: "module.",
          },
        },
      },
    });

    if (permissionKeys.length === 0) return;

    const permissions = await Promise.all(
      permissionKeys.map((key) =>
        tx.permission.upsert({
          where: { key },
          update: {
            description: `Module permission: ${key}`,
          },
          create: {
            key,
            description: `Module permission: ${key}`,
          },
        })
      )
    );

    await tx.authRolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  });
};

const ensurePositionRoles = async () => {
  const positionRows = await Promise.all(
    [
      { name: "Partner", billingRate: 10000, costRate: 7500 },
      { name: "Tax Manager", billingRate: 7000, costRate: 5200 },
      { name: "Advisory Manager", billingRate: 7000, costRate: 5200 },
      { name: "Finance Manager", billingRate: 6800, costRate: 5000 },
      { name: "Finance Analyst", billingRate: 4300, costRate: 3000 },
      { name: "Marketing Lead", billingRate: 5000, costRate: 3400 },
      { name: "Senior Associate", billingRate: 4500, costRate: 3200 },
      { name: "Advisory Consultant", billingRate: 4000, costRate: 2800 },
      { name: "Tax Consultant", billingRate: 4000, costRate: 2800 },
      { name: "Associate", billingRate: 3200, costRate: 2200 },
    ].map((position) =>
      prisma.positionRole.upsert({
        where: { name: position.name },
        update: {
          billingRate: position.billingRate,
          costRate: position.costRate,
          isActive: true,
        },
        create: {
          name: position.name,
          billingRate: position.billingRate,
          costRate: position.costRate,
          isActive: true,
        },
      })
    )
  );

  return new Map(positionRows.map((row) => [row.name, row]));
};

const ensureDepartments = async () => {
  const tax = await prisma.department.upsert({
    where: { departmentCode: "TAX" },
    update: {
      name: "Tax Department",
      description: "Tax and audit services",
    },
    create: {
      departmentCode: "TAX",
      name: "Tax Department",
      description: "Tax and audit services",
    },
  });

  const advisory = await prisma.department.upsert({
    where: { departmentCode: "ADV" },
    update: {
      name: "Advisory Department",
      description: "Business advisory and consulting services",
    },
    create: {
      departmentCode: "ADV",
      name: "Advisory Department",
      description: "Business advisory and consulting services",
    },
  });

  const finance = await prisma.department.upsert({
    where: { departmentCode: "FIN" },
    update: {
      name: "Finance Department",
      description: "Finance operations, collections, and reporting",
    },
    create: {
      departmentCode: "FIN",
      name: "Finance Department",
      description: "Finance operations, collections, and reporting",
    },
  });

  const marketing = await prisma.department.upsert({
    where: { departmentCode: "MKT" },
    update: {
      name: "Marketing Department",
      description: "Marketing, campaigns, and business development support",
    },
    create: {
      departmentCode: "MKT",
      name: "Marketing Department",
      description: "Marketing, campaigns, and business development support",
    },
  });

  return new Map([
    ["TAX", tax],
    ["ADV", advisory],
    ["FIN", finance],
    ["MKT", marketing],
  ]);
};

const syncChecklistItems = async (checklistId: number) => {
  await prisma.inductionChecklistItem.deleteMany({
    where: { checklistId },
  });

  await prisma.inductionChecklistItem.createMany({
    data: ONBOARDING_ITEM_TEMPLATES.map((item, index) => ({
      checklistId,
      itemName: item.itemName,
      description: item.description,
      orderIndex: index + 1,
      requiresDocument: item.requiresDocument,
      isCompleted: false,
      completedByProfileId: null,
      completedAt: null,
    })),
  });

  await prisma.inductionChecklist.update({
    where: { id: checklistId },
    data: {
      status: "pending",
      totalItems: ONBOARDING_ITEM_TEMPLATES.length,
      completedItems: 0,
      completionPercent: 0,
      completedAt: null,
    },
  });
};

export async function seedUatTeam() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const [authRoleMap, positionRoleMap, departmentMap] = await Promise.all([
    ensureAuthRoles(),
    ensurePositionRoles(),
    ensureDepartments(),
  ]);

  for (const roleName of UAT_AUTH_ROLES) {
    const role = authRoleMap.get(roleName);
    if (!role) {
      throw new Error(`Missing auth role: ${roleName}`);
    }
    await ensureRoleModulePolicy(roleName, role.id);
  }

  const profileByEmail = new Map<string, { id: number; userId: number }>();
  const hrBlueprint = UAT_USERS.find((user) => user.authRole === "hr");
  if (!hrBlueprint) {
    throw new Error("HR blueprint missing");
  }

  for (const blueprint of UAT_USERS) {
    const authRole = authRoleMap.get(blueprint.authRole);
    if (!authRole) {
      throw new Error(`Auth role not found: ${blueprint.authRole}`);
    }

    const departmentId =
      blueprint.departmentCode && departmentMap.get(blueprint.departmentCode)
        ? departmentMap.get(blueprint.departmentCode)!.id
        : null;

    const roleId =
      blueprint.positionRoleName && positionRoleMap.get(blueprint.positionRoleName)
        ? positionRoleMap.get(blueprint.positionRoleName)!.id
        : null;

    const user = await prisma.user.upsert({
      where: { email: blueprint.email },
      update: {
        password: passwordHash,
        isActive: true,
        isVerified: true,
        resetToken: null,
      },
      create: {
        email: blueprint.email,
        password: passwordHash,
        isActive: true,
        isVerified: true,
      },
    });

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        firstName: blueprint.firstName,
        lastName: blueprint.lastName,
        positionTitle: blueprint.positionTitle,
        departmentId,
        roleId,
        status: "active",
        isPartner: blueprint.isPartner,
        onboardingStatus: blueprint.onboardingRequired ? "pending" : "completed",
        onboardingChecklistCompleted: !blueprint.onboardingRequired,
        inductionCompleted: !blueprint.onboardingRequired,
      },
      create: {
        userId: user.id,
        firstName: blueprint.firstName,
        lastName: blueprint.lastName,
        positionTitle: blueprint.positionTitle,
        departmentId,
        roleId,
        status: "active",
        isPartner: blueprint.isPartner,
        onboardingStatus: blueprint.onboardingRequired ? "pending" : "completed",
        onboardingChecklistCompleted: !blueprint.onboardingRequired,
        inductionCompleted: !blueprint.onboardingRequired,
      },
    });

    await prisma.userAuthRole.deleteMany({
      where: { userId: user.id },
    });
    await prisma.userAuthRole.create({
      data: {
        userId: user.id,
        roleId: authRole.id,
      },
    });

    profileByEmail.set(blueprint.email, { id: profile.id, userId: user.id });
  }

  for (const blueprint of UAT_USERS) {
    if (!blueprint.reportsToEmail) continue;

    const current = profileByEmail.get(blueprint.email);
    const manager = profileByEmail.get(blueprint.reportsToEmail);
    if (!current || !manager) continue;

    await prisma.profile.update({
      where: { id: current.id },
      data: { managerId: manager.id },
    });
  }

  const sarahProfile = profileByEmail.get("sarah.hr@testfirm.co");
  if (!sarahProfile) {
    throw new Error("Missing one or more core UAT profiles");
  }

  for (const blueprint of UAT_USERS.filter((user) => user.isPartner)) {
    const partnerProfile = profileByEmail.get(blueprint.email);
    if (!partnerProfile) continue;
    await prisma.partner.upsert({
      where: { profileId: partnerProfile.id },
      update: {},
      create: { profileId: partnerProfile.id },
    });
  }

  const departmentAssignments: Array<{
    code: UatDepartmentCode;
    partnerEmail?: string;
    headEmail: string;
  }> = [
    {
      code: "TAX",
      partnerEmail: "james.partner@testfirm.co",
      headEmail: "brian.mgr@testfirm.co",
    },
    {
      code: "ADV",
      partnerEmail: "linda.partner@testfirm.co",
      headEmail: "agnes.mgr@testfirm.co",
    },
    {
      code: "FIN",
      headEmail: "diana.finance@testfirm.co",
    },
    {
      code: "MKT",
      headEmail: "pauline.marketing@testfirm.co",
    },
  ];

  for (const assignment of departmentAssignments) {
    const department = departmentMap.get(assignment.code);
    const headProfile = profileByEmail.get(assignment.headEmail);
    const partnerProfile = assignment.partnerEmail
      ? profileByEmail.get(assignment.partnerEmail)
      : null;

    if (!department || !headProfile) {
      throw new Error(`Department assignment failed for ${assignment.code}`);
    }

    await prisma.department.update({
      where: { id: department.id },
      data: {
        partnerProfileId: partnerProfile?.id ?? null,
        departmentHeadId: headProfile.id,
      },
    });
  }

  const onboardingTargets = UAT_USERS.filter((user) => user.onboardingRequired);
  for (const target of onboardingTargets) {
    const targetProfile = profileByEmail.get(target.email);
    if (!targetProfile) continue;

    const onboardingCase = await prisma.employeeOnboardingCase.upsert({
      where: { profileId: targetProfile.id },
      update: {
        status: "pending",
        startDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        hrOwnerProfileId: sarahProfile.id,
        notes: "UAT onboarding case",
      },
      create: {
        profileId: targetProfile.id,
        status: "pending",
        startDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        hrOwnerProfileId: sarahProfile.id,
        notes: "UAT onboarding case",
      },
    });

    const checklist = await prisma.inductionChecklist.upsert({
      where: { onboardingCaseId: onboardingCase.id },
      update: {
        employeeProfileId: targetProfile.id,
        checklistName: ONBOARDING_CHECKLIST_NAME,
        status: "pending",
        assignedByProfileId: sarahProfile.id,
        dueDate: onboardingCase.dueDate,
        completedItems: 0,
        totalItems: ONBOARDING_ITEM_TEMPLATES.length,
        completionPercent: 0,
        completedAt: null,
      },
      create: {
        onboardingCaseId: onboardingCase.id,
        employeeProfileId: targetProfile.id,
        checklistName: ONBOARDING_CHECKLIST_NAME,
        status: "pending",
        assignedByProfileId: sarahProfile.id,
        dueDate: onboardingCase.dueDate,
        completedItems: 0,
        totalItems: ONBOARDING_ITEM_TEMPLATES.length,
        completionPercent: 0,
      },
    });

    await syncChecklistItems(checklist.id);

    await prisma.profile.update({
      where: { id: targetProfile.id },
      data: {
        onboardingStatus: "pending",
        onboardingChecklistCompleted: false,
        inductionCompleted: false,
      },
    });

    const existingNotification = await prisma.notification.findFirst({
      where: {
        profileId: targetProfile.id,
        title: "Onboarding checklist assigned",
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existingNotification) {
      await prisma.notification.create({
        data: {
          profileId: targetProfile.id,
          type: "action",
          title: "Onboarding checklist assigned",
          message:
            "Complete all onboarding checklist items before other modules are unlocked.",
          actionRequired: true,
          link: "/profile?tab=onboarding",
        },
      });
    }
  }

  return {
    password: TEST_PASSWORD,
    users: UAT_USERS.map((user) => ({
      email: user.email,
      role: user.authRole,
      departmentCode: user.departmentCode,
      onboardingRequired: user.onboardingRequired,
    })),
    departments: [
      {
        code: "TAX",
        partnerEmail: "james.partner@testfirm.co",
        headEmail: "brian.mgr@testfirm.co",
      },
      {
        code: "ADV",
        partnerEmail: "linda.partner@testfirm.co",
        headEmail: "agnes.mgr@testfirm.co",
      },
      {
        code: "FIN",
        partnerEmail: null,
        headEmail: "diana.finance@testfirm.co",
      },
      {
        code: "MKT",
        partnerEmail: null,
        headEmail: "pauline.marketing@testfirm.co",
      },
    ],
  };
}

if (require.main === module) {
  seedUatTeam()
    .then((summary) => {
      // eslint-disable-next-line no-console
      console.log("UAT team setup complete");
      // eslint-disable-next-line no-console
      console.table(summary.users);
      // eslint-disable-next-line no-console
      console.log(`Default password: ${summary.password}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("UAT team setup failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
