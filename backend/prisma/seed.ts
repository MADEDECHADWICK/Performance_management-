import bcrypt from 'bcryptjs';
import {
  LeaveAccrualFrequency,
  LeavePolicyAssignmentScope,
  LeaveUnitType,
  Prisma,
} from '@prisma/client';
import prisma from '../src/prisma';
import { NotificationTemplateService } from '../src/services/notificationTemplates.service';
import { buildModuleAccessMatrix, matrixToPermissionKeys } from '../src/services/moduleAccess.service';
import { seedDefaultRoleViewPermissions } from '../src/services/viewAccess.service';
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

type SeedLeaveTypeConfig = {
  code: string;
  name: string;
  description: string;
  color: string;
  isPaid: boolean;
  balanceTracked: boolean;
  requiresAttachment: boolean;
  allowsHalfDay: boolean;
  unitType: LeaveUnitType;
  defaultNoticeDays: number;
  defaultMaxUnits: number;
  policy: {
    name: string;
    description: string;
    annualEntitlement: number;
    carryoverCap: number;
    accrualEnabled: boolean;
    accrualFrequency: LeaveAccrualFrequency;
    accrualRate: number;
    requiresManagerApproval: boolean;
    requiresHrApproval: boolean;
    excludeWeekends: boolean;
    excludePublicHolidays: boolean;
    minNoticeDays: number;
    maxConsecutiveUnits: number;
    maxUnitsPerRequest: number;
    allowNegativeBalance: boolean;
  };
};

type SeedHolidayConfig = {
  name: string;
  holidayDate: Date;
  isRecurring: boolean;
  countryCode?: string;
  region?: string | null;
};

type SeedRequisitionTypeConfig = {
  code: string;
  name: string;
  description: string;
  sourceModule: string;
  requiresJob?: boolean;
  requiresClient?: boolean;
  requiresVendor?: boolean;
  requiresDueDate?: boolean;
  requiresAttachment?: boolean;
  fieldSchema?: Prisma.InputJsonValue;
};

const createUtcDate = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

const addUtcDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const computeWesternEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return createUtcDate(year, month, day);
};

const kenyaLeaveTypeDefaults: SeedLeaveTypeConfig[] = [
  {
    code: 'ANNUAL',
    name: 'Annual Leave',
    description:
      'Kenya statutory annual leave. Seeded at 21 working days per leave year and accrued monthly at 1.75 days.',
    color: '#79C24A',
    isPaid: true,
    balanceTracked: true,
    requiresAttachment: false,
    allowsHalfDay: true,
    unitType: LeaveUnitType.day,
    defaultNoticeDays: 7,
    defaultMaxUnits: 21,
    policy: {
      name: 'Kenya Statutory Annual Leave',
      description:
        'Based on section 28 of the Employment Act: 21 working days after every 12 consecutive months of service, modeled as monthly accrual of 1.75 days.',
      annualEntitlement: 21,
      carryoverCap: 0,
      accrualEnabled: true,
      accrualFrequency: LeaveAccrualFrequency.monthly,
      accrualRate: 1.75,
      requiresManagerApproval: true,
      requiresHrApproval: false,
      excludeWeekends: true,
      excludePublicHolidays: true,
      minNoticeDays: 7,
      maxConsecutiveUnits: 21,
      maxUnitsPerRequest: 21,
      allowNegativeBalance: false,
    },
  },
  {
    code: 'MATERNITY',
    name: 'Maternity Leave',
    description:
      'Kenya statutory maternity leave. Seeded as 90 calendar days with pay and HR review.',
    color: '#E0B04A',
    isPaid: true,
    balanceTracked: true,
    requiresAttachment: false,
    allowsHalfDay: false,
    unitType: LeaveUnitType.day,
    defaultNoticeDays: 7,
    defaultMaxUnits: 90,
    policy: {
      name: 'Kenya Statutory Maternity Leave',
      description:
        'Based on section 29 of the Employment Act: 3 months maternity leave with full pay. Modeled as 90 calendar days in the balance engine.',
      annualEntitlement: 90,
      carryoverCap: 0,
      accrualEnabled: false,
      accrualFrequency: LeaveAccrualFrequency.manual,
      accrualRate: 0,
      requiresManagerApproval: true,
      requiresHrApproval: true,
      excludeWeekends: false,
      excludePublicHolidays: false,
      minNoticeDays: 7,
      maxConsecutiveUnits: 90,
      maxUnitsPerRequest: 90,
      allowNegativeBalance: false,
    },
  },
  {
    code: 'PATERNITY',
    name: 'Paternity Leave',
    description:
      'Kenya statutory paternity leave. Seeded as 14 calendar days with pay.',
    color: '#6FA8FF',
    isPaid: true,
    balanceTracked: true,
    requiresAttachment: false,
    allowsHalfDay: false,
    unitType: LeaveUnitType.day,
    defaultNoticeDays: 0,
    defaultMaxUnits: 14,
    policy: {
      name: 'Kenya Statutory Paternity Leave',
      description:
        'Based on section 29A of the Employment Act: 2 weeks paternity leave with full pay. Modeled as 14 calendar days.',
      annualEntitlement: 14,
      carryoverCap: 0,
      accrualEnabled: false,
      accrualFrequency: LeaveAccrualFrequency.manual,
      accrualRate: 0,
      requiresManagerApproval: true,
      requiresHrApproval: false,
      excludeWeekends: false,
      excludePublicHolidays: false,
      minNoticeDays: 0,
      maxConsecutiveUnits: 14,
      maxUnitsPerRequest: 14,
      allowNegativeBalance: false,
    },
  },
  {
    code: 'SICK',
    name: 'Sick Leave',
    description:
      'Kenya statutory sick leave. Seeded as 14 calendar days; payroll should still distinguish the first 7 days at full pay and the next 7 at half pay.',
    color: '#7FB0FF',
    isPaid: true,
    balanceTracked: true,
    requiresAttachment: true,
    allowsHalfDay: true,
    unitType: LeaveUnitType.day,
    defaultNoticeDays: 0,
    defaultMaxUnits: 14,
    policy: {
      name: 'Kenya Statutory Sick Leave',
      description:
        'Based on section 30 of the Employment Act: 7 days with full pay and 7 days with half pay after 2 consecutive months of service. Seeded here as a 14-day tracked balance, with pay-band handling deferred to payroll.',
      annualEntitlement: 14,
      carryoverCap: 0,
      accrualEnabled: false,
      accrualFrequency: LeaveAccrualFrequency.manual,
      accrualRate: 0,
      requiresManagerApproval: true,
      requiresHrApproval: false,
      excludeWeekends: false,
      excludePublicHolidays: false,
      minNoticeDays: 0,
      maxConsecutiveUnits: 14,
      maxUnitsPerRequest: 14,
      allowNegativeBalance: false,
    },
  },
  {
    code: 'STUDY',
    name: 'Study Leave',
    description:
      'Configured organisational default for Kenya operations. Seeded as 5 working days and intended to be adjusted by HR if your policy differs.',
    color: '#7A6CFF',
    isPaid: true,
    balanceTracked: true,
    requiresAttachment: true,
    allowsHalfDay: true,
    unitType: LeaveUnitType.day,
    defaultNoticeDays: 14,
    defaultMaxUnits: 5,
    policy: {
      name: 'Kenya Default Study Leave',
      description:
        'Non-statutory organisational default seeded for usability. Set to 5 working days per leave year pending any firm-specific study leave policy.',
      annualEntitlement: 5,
      carryoverCap: 0,
      accrualEnabled: false,
      accrualFrequency: LeaveAccrualFrequency.manual,
      accrualRate: 0,
      requiresManagerApproval: true,
      requiresHrApproval: true,
      excludeWeekends: true,
      excludePublicHolidays: true,
      minNoticeDays: 14,
      maxConsecutiveUnits: 5,
      maxUnitsPerRequest: 5,
      allowNegativeBalance: false,
    },
  },
  {
    code: 'COMPASSIONATE',
    name: 'Compassionate Leave',
    description:
      'Configured organisational default for Kenya operations. Seeded as 5 working days for bereavement or urgent family situations.',
    color: '#D96C6C',
    isPaid: true,
    balanceTracked: true,
    requiresAttachment: false,
    allowsHalfDay: true,
    unitType: LeaveUnitType.day,
    defaultNoticeDays: 0,
    defaultMaxUnits: 5,
    policy: {
      name: 'Kenya Default Compassionate Leave',
      description:
        'Non-statutory organisational default seeded for usability. Set to 5 working days and intended to be revised if your internal policy differs.',
      annualEntitlement: 5,
      carryoverCap: 0,
      accrualEnabled: false,
      accrualFrequency: LeaveAccrualFrequency.manual,
      accrualRate: 0,
      requiresManagerApproval: true,
      requiresHrApproval: false,
      excludeWeekends: true,
      excludePublicHolidays: true,
      minNoticeDays: 0,
      maxConsecutiveUnits: 5,
      maxUnitsPerRequest: 5,
      allowNegativeBalance: false,
    },
  },
];

const kenyaRecurringFixedHolidays = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Labour Day', month: 5, day: 1 },
  { name: 'Madaraka Day', month: 6, day: 1 },
  { name: 'Mazingira Day', month: 10, day: 10 },
  { name: 'Mashujaa Day', month: 10, day: 20 },
  { name: 'Jamhuri Day', month: 12, day: 12 },
  { name: 'Christmas Day', month: 12, day: 25 },
  { name: 'Boxing Day', month: 12, day: 26 },
];

const kenyaGazettedIddUlFitrDates = [
  { name: 'Idd-ul-Fitr', holidayDate: createUtcDate(2024, 4, 10) },
  { name: 'Idd-ul-Fitr', holidayDate: createUtcDate(2025, 3, 31) },
];

const kenyaHolidayYears = [2024, 2025, 2026, 2027, 2028];

const requisitionTypeDefaults: SeedRequisitionTypeConfig[] = [
  {
    code: 'CLIENT_DISBURSEMENT',
    name: 'Client Disbursement',
    description:
      'Client-facing disbursement for audit, tax, filing, registry, courier, or search costs tied to an engagement.',
    sourceModule: 'jobs',
    requiresJob: true,
    requiresClient: true,
    requiresVendor: true,
    requiresDueDate: true,
    requiresAttachment: true,
    fieldSchema: [
      {
        key: 'expenseNature',
        label: 'Expense nature',
        type: 'select',
        required: true,
        options: [
          { label: 'Registry or filing fee', value: 'registry_fee' },
          { label: 'Courier or logistics', value: 'courier' },
          { label: 'Travel or accommodation', value: 'travel' },
          { label: 'Search or compliance fee', value: 'search_fee' },
          { label: 'Third-party support', value: 'subcontractor' },
        ],
      },
      {
        key: 'businessCase',
        label: 'Business case',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    code: 'TRAVEL_ADVANCE',
    name: 'Travel Advance',
    description:
      'Travel advance for client work or internal assignment where the requester needs funds before travel.',
    sourceModule: 'jobs',
    requiresJob: true,
    requiresClient: true,
    requiresDueDate: true,
    fieldSchema: [
      {
        key: 'destination',
        label: 'Destination',
        type: 'text',
        required: true,
      },
      {
        key: 'travelStartDate',
        label: 'Travel start date',
        type: 'date',
        required: true,
      },
      {
        key: 'travelEndDate',
        label: 'Travel end date',
        type: 'date',
        required: true,
      },
      {
        key: 'travelPurpose',
        label: 'Travel purpose',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    code: 'FINANCE_OPERATIONAL',
    name: 'Finance Operational Purchase',
    description:
      'Operational finance spend such as tax payments, statutory processing, banking tools, or finance support services.',
    sourceModule: 'finance',
    requiresVendor: true,
    requiresDueDate: true,
    requiresAttachment: true,
    fieldSchema: [
      {
        key: 'costNature',
        label: 'Cost nature',
        type: 'select',
        required: true,
        options: [
          { label: 'Tax or statutory payment', value: 'statutory' },
          { label: 'Banking or payment support', value: 'banking' },
          { label: 'Software or subscription', value: 'software' },
          { label: 'Professional service', value: 'service' },
        ],
      },
      {
        key: 'taxTreatment',
        label: 'Tax treatment',
        type: 'select',
        required: true,
        options: [
          { label: 'VAT applicable', value: 'vatable' },
          { label: 'VAT exempt or out of scope', value: 'non_vatable' },
          { label: 'Withholding tax applicable', value: 'withholding_applicable' },
        ],
      },
      {
        key: 'paymentPurpose',
        label: 'Payment purpose',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    code: 'MARKETING_CAMPAIGN',
    name: 'Marketing Campaign Spend',
    description:
      'Marketing requisition for campaigns, brand assets, media placements, client events, or promotion activity.',
    sourceModule: 'marketing',
    requiresVendor: true,
    requiresDueDate: true,
    fieldSchema: [
      {
        key: 'campaignName',
        label: 'Campaign name',
        type: 'text',
        required: true,
      },
      {
        key: 'channel',
        label: 'Channel',
        type: 'select',
        required: true,
        options: [
          { label: 'Digital', value: 'digital' },
          { label: 'Event', value: 'event' },
          { label: 'Print', value: 'print' },
          { label: 'Partnership', value: 'partnership' },
        ],
      },
      {
        key: 'objective',
        label: 'Campaign objective',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    code: 'TRAINING_CPD',
    name: 'Training / CPD',
    description:
      'Training, CPD, exams, or professional development requisition raised by staff or team leads.',
    sourceModule: 'users',
    requiresVendor: true,
    requiresDueDate: true,
    fieldSchema: [
      {
        key: 'courseName',
        label: 'Course or training name',
        type: 'text',
        required: true,
      },
      {
        key: 'provider',
        label: 'Training provider',
        type: 'text',
        required: true,
      },
      {
        key: 'startDate',
        label: 'Start date',
        type: 'date',
        required: true,
      },
      {
        key: 'endDate',
        label: 'End date',
        type: 'date',
        required: false,
      },
      {
        key: 'businessCase',
        label: 'Development case',
        type: 'textarea',
        required: true,
      },
    ],
  },
  {
    code: 'OFFICE_PURCHASE',
    name: 'Office Purchase',
    description:
      'General office or administrative purchase for stationery, office equipment, utilities support, or welfare items.',
    sourceModule: 'operations',
    requiresVendor: true,
    requiresDueDate: true,
    fieldSchema: [
      {
        key: 'itemSpecification',
        label: 'Item specification',
        type: 'textarea',
        required: true,
      },
      {
        key: 'deliveryLocation',
        label: 'Delivery location',
        type: 'text',
        required: true,
      },
      {
        key: 'urgencyLevel',
        label: 'Urgency level',
        type: 'select',
        required: true,
        options: [
          { label: 'Routine', value: 'routine' },
          { label: 'Urgent', value: 'urgent' },
          { label: 'Critical', value: 'critical' },
        ],
      },
    ],
  },
];

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

  await seedDefaultRoleViewPermissions(prisma);

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
  const employeeProfile = seededUsers.find((item) => item.user.email === 'employee@ronalds.local')?.profile;

  if (!partnerProfile || !managerProfile || !marketingProfile || !hrProfile || !employeeProfile) {
    throw new Error('Missing required seed profiles');
  }

  await prisma.profile.update({
    where: { id: employeeProfile.id },
    data: { managerId: managerProfile.id },
  });

  const upsertLeaveType = async (config: SeedLeaveTypeConfig) =>
    prisma.leaveType.upsert({
      where: { code: config.code },
      update: {
        name: config.name,
        description: config.description,
        color: config.color,
        isActive: true,
        isPaid: config.isPaid,
        balanceTracked: config.balanceTracked,
        requiresAttachment: config.requiresAttachment,
        allowsHalfDay: config.allowsHalfDay,
        unitType: config.unitType,
        defaultNoticeDays: config.defaultNoticeDays,
        defaultMaxUnits: config.defaultMaxUnits,
      },
      create: {
        code: config.code,
        name: config.name,
        description: config.description,
        color: config.color,
        isActive: true,
        isPaid: config.isPaid,
        balanceTracked: config.balanceTracked,
        requiresAttachment: config.requiresAttachment,
        allowsHalfDay: config.allowsHalfDay,
        unitType: config.unitType,
        defaultNoticeDays: config.defaultNoticeDays,
        defaultMaxUnits: config.defaultMaxUnits,
      },
    });

  const upsertLeavePolicy = async (leaveTypeId: number, config: SeedLeaveTypeConfig['policy']) => {
    const existing = await prisma.leavePolicy.findFirst({
      where: { leaveTypeId, name: config.name },
    });

    const data = {
      leaveTypeId,
      name: config.name,
      description: config.description,
      isActive: true,
      annualEntitlement: config.annualEntitlement,
      carryoverCap: config.carryoverCap,
      accrualEnabled: config.accrualEnabled,
      accrualFrequency: config.accrualFrequency,
      accrualRate: config.accrualRate,
      requiresManagerApproval: config.requiresManagerApproval,
      requiresHrApproval: config.requiresHrApproval,
      excludeWeekends: config.excludeWeekends,
      excludePublicHolidays: config.excludePublicHolidays,
      minNoticeDays: config.minNoticeDays,
      maxConsecutiveUnits: config.maxConsecutiveUnits,
      maxUnitsPerRequest: config.maxUnitsPerRequest,
      allowNegativeBalance: config.allowNegativeBalance,
      effectiveFrom: null,
      effectiveTo: null,
    };

    if (existing) {
      return prisma.leavePolicy.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.leavePolicy.create({ data });
  };

  const ensureGlobalPolicyAssignment = async (policyId: number) => {
    const existing = await prisma.leavePolicyAssignment.findFirst({
      where: {
        policyId,
        scope: LeavePolicyAssignmentScope.global,
        departmentId: null,
        roleId: null,
        profileId: null,
      },
    });

    if (existing) {
      return prisma.leavePolicyAssignment.update({
        where: { id: existing.id },
        data: {
          scope: LeavePolicyAssignmentScope.global,
          departmentId: null,
          roleId: null,
          profileId: null,
          priority: 100,
        },
      });
    }

    return prisma.leavePolicyAssignment.create({
      data: {
        policyId,
        scope: LeavePolicyAssignmentScope.global,
        priority: 100,
      },
    });
  };

  const upsertPublicHoliday = async (config: SeedHolidayConfig) => {
    const existing = await prisma.publicHoliday.findFirst({
      where: {
        name: config.name,
        holidayDate: config.holidayDate,
        countryCode: config.countryCode || 'KE',
      },
    });

    const data = {
      name: config.name,
      holidayDate: config.holidayDate,
      countryCode: config.countryCode || 'KE',
      region: config.region ?? null,
      isRecurring: config.isRecurring,
    };

    if (existing) {
      return prisma.publicHoliday.update({
        where: { id: existing.id },
        data,
      });
    }

    return prisma.publicHoliday.create({ data });
  };

  const upsertRequisitionType = async (config: SeedRequisitionTypeConfig) => {
    return prisma.requisitionType.upsert({
      where: { code: config.code },
      update: {
        name: config.name,
        description: config.description,
        sourceModule: config.sourceModule,
        isActive: true,
        requiresJob: Boolean(config.requiresJob),
        requiresClient: Boolean(config.requiresClient),
        requiresVendor: Boolean(config.requiresVendor),
        requiresDueDate: Boolean(config.requiresDueDate),
        requiresAttachment: Boolean(config.requiresAttachment),
        fieldSchema: config.fieldSchema ?? Prisma.DbNull,
      },
      create: {
        code: config.code,
        name: config.name,
        description: config.description,
        sourceModule: config.sourceModule,
        isActive: true,
        requiresJob: Boolean(config.requiresJob),
        requiresClient: Boolean(config.requiresClient),
        requiresVendor: Boolean(config.requiresVendor),
        requiresDueDate: Boolean(config.requiresDueDate),
        requiresAttachment: Boolean(config.requiresAttachment),
        fieldSchema: config.fieldSchema ?? Prisma.DbNull,
      },
    });
  };

  const seedLeaveManagementDefaults = async () => {
    await prisma.publicHoliday.updateMany({
      where: {
        name: 'New Year Day',
        countryCode: 'KE',
      },
      data: {
        name: "New Year's Day",
      },
    });

    for (const config of kenyaLeaveTypeDefaults) {
      const leaveType = await upsertLeaveType(config);
      const policy = await upsertLeavePolicy(leaveType.id, config.policy);
      await ensureGlobalPolicyAssignment(policy.id);
    }

    for (const holiday of kenyaRecurringFixedHolidays) {
      await upsertPublicHoliday({
        name: holiday.name,
        holidayDate: createUtcDate(2026, holiday.month, holiday.day),
        isRecurring: true,
      });
    }

    for (const holiday of kenyaGazettedIddUlFitrDates) {
      await upsertPublicHoliday({
        name: holiday.name,
        holidayDate: holiday.holidayDate,
        isRecurring: false,
      });
    }

    for (const year of kenyaHolidayYears) {
      const easterSunday = computeWesternEasterSunday(year);
      const movableHolidayDates = [
        {
          name: 'Good Friday',
          holidayDate: addUtcDays(easterSunday, -2),
        },
        {
          name: 'Easter Monday',
          holidayDate: addUtcDays(easterSunday, 1),
        },
        ...kenyaGazettedIddUlFitrDates.filter(
          (holiday) => holiday.holidayDate.getUTCFullYear() === year
        ),
      ];

      for (const holiday of movableHolidayDates) {
        await upsertPublicHoliday({
          name: holiday.name,
          holidayDate: holiday.holidayDate,
          isRecurring: false,
        });
      }

      const occupiedDates = new Set<string>([
        ...kenyaRecurringFixedHolidays.map((holiday) =>
          dateKey(createUtcDate(year, holiday.month, holiday.day))
        ),
        ...movableHolidayDates.map((holiday) => dateKey(holiday.holidayDate)),
      ]);

      for (const holiday of kenyaRecurringFixedHolidays) {
        const actualDate = createUtcDate(year, holiday.month, holiday.day);
        if (actualDate.getUTCDay() !== 0) continue;

        let observedDate = addUtcDays(actualDate, 1);
        while (occupiedDates.has(dateKey(observedDate))) {
          observedDate = addUtcDays(observedDate, 1);
        }

        occupiedDates.add(dateKey(observedDate));
        await upsertPublicHoliday({
          name: `${holiday.name} (Observed)`,
          holidayDate: observedDate,
          isRecurring: false,
        });
      }
    }
  };

  const seedRequisitionDefaults = async () => {
    for (const config of requisitionTypeDefaults) {
      await upsertRequisitionType(config);
    }
  };

  await seedLeaveManagementDefaults();
  await seedRequisitionDefaults();

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
    competencies?: Prisma.InputJsonValue;
    questions?: Prisma.InputJsonValue;
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
      name: 'Performance Reflection',
      description: 'Structured performance reflection aligned to evaluation discussions.',
      templateType: 'performance',
      bscCategory: 'internal_process',
      questions: [
        { id: 'perf-1', label: 'Performance notes', type: 'text' },
        { id: 'perf-2', label: 'Evidence / links', type: 'text' },
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
