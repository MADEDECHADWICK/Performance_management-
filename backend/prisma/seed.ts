import bcrypt from 'bcryptjs';
import prisma from '../src/prisma';
import { NotificationTemplateService } from '../src/services/notificationTemplates.service';
import { buildModuleAccessMatrix, matrixToPermissionKeys } from '../src/services/moduleAccess.service';
import type { ModuleAction } from '../src/services/moduleAccess.service';

type SeedUser = {
  email: string;
  firstName: string;
  lastName: string;
  positionTitle: string;
  authRole: string;
  positionRole?: string;
  isPartner?: boolean;
};

export async function seedDatabase() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const department = await prisma.department.upsert({
    where: { departmentCode: 'ADV' },
    update: { name: 'Advisory' },
    create: {
      name: 'Advisory',
      description: 'Advisory and consulting',
      departmentCode: 'ADV',
    },
  });

  const authRoleNames = [
    'super_admin',
    'hr',
    'manager',
    'partner',
    'employee',
    'marketing',
    'finance',
    'gmp',
  ];

  const authRoles = await Promise.all(
    authRoleNames.map((name) =>
      prisma.authRole.upsert({
        where: { name },
        update: { isActive: true },
        create: { name, description: `${name} role`, isActive: true },
      })
    )
  );

  const authRoleMap = new Map(authRoles.map((role) => [role.name, role]));

  // Seed explicit module policies for finance-phase roles so strict mode
  // has deterministic defaults aligned to expected finance capabilities.
  const defaultFinanceActionsByRole: Record<string, ModuleAction[]> = {
    finance: ['admin'],
    hr: ['read'],
    gmp: ['read'],
    partner: ['read'],
    manager: ['read'],
    employee: ['read'],
    marketing: ['read'],
  };

  const financePolicyRoles = [
    'super_admin',
    'finance',
    'hr',
    'gmp',
    'partner',
    'manager',
    'employee',
    'marketing',
  ];

  const seedRoleModulePolicy = async (roleName: string) => {
    const normalizedRoleName = roleName.toLowerCase().trim();
    const role =
      authRoleMap.get(normalizedRoleName) ||
      (await prisma.authRole.findUnique({ where: { name: normalizedRoleName } }));

    if (!role) return;

    const matrix = buildModuleAccessMatrix({ roles: [normalizedRoleName] });
    const financeActions = defaultFinanceActionsByRole[normalizedRoleName];
    if (financeActions && financeActions.length > 0) {
      matrix.finance = Array.from(new Set(financeActions));
    }

    const permissionKeys = matrixToPermissionKeys(matrix);

    await prisma.$transaction(async (tx) => {
      await tx.authRolePermission.deleteMany({
        where: {
          roleId: role.id,
          permission: {
            key: {
              startsWith: 'module.',
            },
          },
        },
      });

      if (permissionKeys.length === 0) return;

      const permissions = await Promise.all(
        permissionKeys.map((key) =>
          tx.permission.upsert({
            where: { key },
            update: {},
            create: {
              key,
              description: `Module permission: ${key}`,
            },
          })
        )
      );

      await tx.authRolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    });
  };

  for (const roleName of financePolicyRoles) {
    await seedRoleModulePolicy(roleName);
  }

  const positionRoles = await Promise.all(
    [
      { name: 'Partner', billingRate: 10000, costRate: 7500 },
      { name: 'Manager', billingRate: 6000, costRate: 4500 },
      { name: 'Senior', billingRate: 4000, costRate: 3000 },
      { name: 'Semi-Senior', billingRate: 3000, costRate: 2250 },
      { name: 'Associate', billingRate: 2000, costRate: 1500 },
      { name: 'Trainee', billingRate: 2000, costRate: 1500 },
    ].map((role) =>
      prisma.positionRole.upsert({
        where: { name: role.name },
        update: {
          billingRate: role.billingRate,
          costRate: role.costRate,
          isActive: true,
        },
        create: {
          name: role.name,
          billingRate: role.billingRate,
          costRate: role.costRate,
          isActive: true,
        },
      })
    )
  );

  const positionRoleMap = new Map(positionRoles.map((role) => [role.name, role]));

  const usersToSeed: SeedUser[] = [
    {
      email: 'hr@ronalds.local',
      firstName: 'Helen',
      lastName: 'Mugo',
      positionTitle: 'HR Manager',
      authRole: 'hr',
    },
    {
      email: 'marketing@ronalds.local',
      firstName: 'Esther',
      lastName: 'Wanjiku',
      positionTitle: 'Marketing Lead',
      authRole: 'marketing',
    },
    {
      email: 'manager@ronalds.local',
      firstName: 'Patrick',
      lastName: 'Kiptoo',
      positionTitle: 'Manager',
      authRole: 'manager',
      positionRole: 'Manager',
    },
    {
      email: 'partner@ronalds.local',
      firstName: 'Janet',
      lastName: 'Mwangi',
      positionTitle: 'Partner',
      authRole: 'partner',
      positionRole: 'Partner',
      isPartner: true,
    },
    {
      email: 'employee@ronalds.local',
      firstName: 'Chadwick',
      lastName: 'Madede',
      positionTitle: 'Associate',
      authRole: 'employee',
      positionRole: 'Associate',
    },
    {
      email: 'finance@ronalds.local',
      firstName: 'Ronald',
      lastName: 'Ouma',
      positionTitle: 'Finance Lead',
      authRole: 'finance',
    },
    {
      email: 'gmp@ronalds.local',
      firstName: 'Grace',
      lastName: 'Kariuki',
      positionTitle: 'Group Managing Partner',
      authRole: 'gmp',
      positionRole: 'Partner',
      isPartner: true,
    },
  ];

  const seededUsers = [];

  for (const userData of usersToSeed) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: passwordHash,
        isActive: true,
        isVerified: true,
      },
      create: {
        email: userData.email,
        password: passwordHash,
        isActive: true,
        isVerified: true,
      },
    });

    const positionRole = userData.positionRole
      ? positionRoleMap.get(userData.positionRole)
      : undefined;

    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        positionTitle: userData.positionTitle,
        departmentId: department.id,
        roleId: positionRole?.id,
        isPartner: userData.isPartner ?? false,
        status: 'active',
      },
      create: {
        userId: user.id,
        firstName: userData.firstName,
        lastName: userData.lastName,
        positionTitle: userData.positionTitle,
        departmentId: department.id,
        roleId: positionRole?.id,
        isPartner: userData.isPartner ?? false,
        status: 'active',
      },
    });

    const authRole = authRoleMap.get(userData.authRole);
    if (authRole) {
      await prisma.userAuthRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: authRole.id } },
        update: {},
        create: { userId: user.id, roleId: authRole.id },
      });
    }

    seededUsers.push({ user, profile });
  }

  const partnerProfile = seededUsers.find((item) => item.user.email === 'partner@ronalds.local')?.profile;
  const managerProfile = seededUsers.find((item) => item.user.email === 'manager@ronalds.local')?.profile;
  const marketingProfile = seededUsers.find((item) => item.user.email === 'marketing@ronalds.local')?.profile;
  const hrProfile = seededUsers.find((item) => item.user.email === 'hr@ronalds.local')?.profile;

  if (!partnerProfile || !managerProfile || !marketingProfile || !hrProfile) {
    throw new Error('Missing required seed profiles');
  }

  const client = await prisma.client.upsert({
    where: { clientCode: 'GW-001' },
    update: {
      clientName: 'Greenwells Ltd',
      industry: 'Professional Services',
      contactPerson: 'Alice K.',
      contactEmail: 'alice@greenwells.co.ke',
      contactPhone: '+254700000000',
      location: 'Nairobi, Kenya',
      partnerProfileId: partnerProfile.id,
      managerProfileId: managerProfile.id,
      departmentId: department.id,
      status: 'active',
    },
    create: {
      clientName: 'Greenwells Ltd',
      clientCode: 'GW-001',
      industry: 'Professional Services',
      contactPerson: 'Alice K.',
      contactEmail: 'alice@greenwells.co.ke',
      contactPhone: '+254700000000',
      location: 'Nairobi, Kenya',
      partnerProfileId: partnerProfile.id,
      managerProfileId: managerProfile.id,
      departmentId: department.id,
      status: 'active',
    },
  });

  const existingDocument = await prisma.document.findFirst({
    where: { fileName: 'engagement-greenwells.pdf' },
  });

  const document = existingDocument
    ? await prisma.document.update({
        where: { id: existingDocument.id },
        data: {
          filePath: 'seed/engagement-greenwells.pdf',
          documentType: 'engagement_letter',
          entityType: 'Client',
          entityId: client.id,
          accessLevel: 'admin',
          uploadedBy: marketingProfile.id,
        },
      })
    : await prisma.document.create({
        data: {
          fileName: 'engagement-greenwells.pdf',
          filePath: 'seed/engagement-greenwells.pdf',
          documentType: 'engagement_letter',
          entityType: 'Client',
          entityId: client.id,
          accessLevel: 'admin',
          uploadedBy: marketingProfile.id,
          description: 'Seed engagement letter',
        },
      });

  const existingLetter = await prisma.engagementLetter.findFirst({
    where: {
      clientId: client.id,
      jobTitle: 'Audit FY2025',
    },
  });

  const engagementLetter = existingLetter
    ? await prisma.engagementLetter.update({
        where: { id: existingLetter.id },
        data: {
          documentId: document.id,
          engagementType: 'audit',
          feeAmount: 500000,
          currency: 'KES',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-03-31'),
          status: 'approved',
          uploadedByProfileId: marketingProfile.id,
          approvedByProfileId: hrProfile.id,
          approvedAt: new Date(),
        },
      })
    : await prisma.engagementLetter.create({
        data: {
          clientId: client.id,
          documentId: document.id,
          jobTitle: 'Audit FY2025',
          engagementType: 'audit',
          feeAmount: 500000,
          currency: 'KES',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-03-31'),
          status: 'approved',
          uploadedByProfileId: marketingProfile.id,
          approvedByProfileId: hrProfile.id,
          approvedAt: new Date(),
        },
      });

  const fallbackIndustry = client.industry || 'Professional Services';
  const fallbackContactPerson = client.contactPerson || 'Client Contact';
  const fallbackContactEmail = client.contactEmail || 'contact@greenwells.co.ke';
  const fallbackContactPhone = client.contactPhone || '+254700000000';
  const fallbackLocation = client.location || 'Nairobi, Kenya';

  const existingOnboarding = await prisma.clientOnboarding.findFirst({
    where: { engagementLetterId: engagementLetter.id },
  });

  const onboarding = existingOnboarding
    ? await prisma.clientOnboarding.update({
        where: { id: existingOnboarding.id },
        data: {
          status: 'approved',
          clientId: client.id,
          clientName: client.clientName,
          industry: fallbackIndustry,
          contactPerson: fallbackContactPerson,
          contactEmail: fallbackContactEmail,
          contactPhone: fallbackContactPhone,
          location: fallbackLocation,
          departmentId: department.id,
          uploadedByProfileId: marketingProfile.id,
          hrReviewerProfileId: hrProfile.id,
        },
      })
    : await prisma.clientOnboarding.create({
        data: {
          engagementLetterId: engagementLetter.id,
          clientId: client.id,
          clientName: client.clientName,
          industry: fallbackIndustry,
          contactPerson: fallbackContactPerson,
          contactEmail: fallbackContactEmail,
          contactPhone: fallbackContactPhone,
          location: fallbackLocation,
          departmentId: department.id,
          uploadedByProfileId: marketingProfile.id,
          hrReviewerProfileId: hrProfile.id,
          status: 'approved',
        },
      });

  const ensureTemplate = async (template: {
    name: string;
    description: string;
    templateType: string;
    bscCategory?: string;
    competencies?: unknown;
    questions?: unknown;
  }) => {
    const existing = await prisma.evaluationTemplate.findFirst({
      where: { name: template.name, templateType: template.templateType },
    });

    if (existing) {
      return prisma.evaluationTemplate.update({
        where: { id: existing.id },
        data: {
          description: template.description,
          bscCategory: template.bscCategory,
          competencies: template.competencies ?? undefined,
          questions: template.questions ?? undefined,
          isActive: true,
        },
      });
    }

    return prisma.evaluationTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        templateType: template.templateType,
        bscCategory: template.bscCategory,
        competencies: template.competencies ?? undefined,
        questions: template.questions ?? undefined,
        isActive: true,
        createdBy: hrProfile.id,
      },
    });
  };


  await Promise.all([
    ensureTemplate({
      name: 'Competency Review',
      description: 'Role competency and behavioral review.',
      templateType: 'competency',
      bscCategory: 'learning_growth',
      competencies: [
        { title: 'Technical Quality', maxScore: 5 },
        { title: 'Client Communication', maxScore: 5 },
        { title: 'Team Collaboration', maxScore: 5 },
      ],
      questions: [
        { id: 'comp-1', label: 'Strengths observed', type: 'text' },
        { id: 'comp-2', label: 'Development areas', type: 'text' },
      ],
    }),
    ensureTemplate({
      name: 'KPI Scorecard',
      description: 'KPI-weighted scorecard aligned to goals.',
      templateType: 'kpi',
      bscCategory: 'financial',
      questions: [
        { id: 'kpi-1', label: 'KPI performance notes', type: 'text' },
        { id: 'kpi-2', label: 'Evidence / links', type: 'text' },
      ],
    }),
    ensureTemplate({
      name: 'Project Performance',
      description: 'Job-based performance and delivery assessment.',
      templateType: 'project',
      bscCategory: 'internal_process',
      questions: [
        { id: 'proj-1', label: 'Delivery quality', type: 'rating', max: 5 },
        { id: 'proj-2', label: 'Budget adherence', type: 'rating', max: 5 },
        { id: 'proj-3', label: 'Client satisfaction notes', type: 'text' },
      ],
    }),
  ]);

  await NotificationTemplateService.upsertDefaults(hrProfile.id);

  return {
    departmentId: department.id,
    positionRoleIds: Object.fromEntries(positionRoleMap.entries()),
    authRoleIds: Object.fromEntries(authRoleMap.entries()),
    users: seededUsers.map((entry) => entry.user),
    profiles: seededUsers.map((entry) => entry.profile),
    client,
    document,
    engagementLetter,
    onboarding,
  };
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('Seed completed');
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
