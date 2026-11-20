import prisma from "../../src/prisma";

const DEMO_JOB_PREFIX = "DEMO-JC-";

type DemoStaff = {
  firstName: string;
  lastName: string;
  roleName: string;
};

type DemoTimeEntry = {
  firstName: string;
  lastName: string;
  date: string;
  hours: number;
};

type DemoCompletion = {
  percent: number;
  at: string;
  note: string;
};

type DemoPayment = {
  date: string;
  amount: number;
};

type DemoJobConfig = {
  jobCode: string;
  jobName: string;
  clientName: string;
  departmentName: string;
  managerName: { firstName: string; lastName: string };
  fee: number;
  budgetHours: number;
  staff: DemoStaff[];
  timeEntries: DemoTimeEntry[];
  completion: DemoCompletion[];
  payments: DemoPayment[];
};

const roundMoney = (value: number) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const findProfile = async (
  firstName: string,
  lastName: string,
  requireRole = false
) => {
  const profile = await prisma.profile.findFirst({
    where: { firstName, lastName, status: "active" },
    include: { role: true },
    orderBy: { id: "asc" },
  });
  if (!profile) {
    throw new Error(`Demo seed: employee ${firstName} ${lastName} was not found`);
  }
  if (requireRole && !profile.role) {
    throw new Error(
      `Demo seed: ${firstName} ${lastName} has no position role/cost rate`
    );
  }
  return profile;
};

const findRole = async (name: string) => {
  const role = await prisma.positionRole.findFirst({ where: { name } });
  if (!role) throw new Error(`Demo seed: position role "${name}" was not found`);
  return role;
};

const cleanupDemoJobs = async (tx: any) => {
  const existing = await tx.job.findMany({
    where: { jobCode: { startsWith: DEMO_JOB_PREFIX } },
    select: { id: true },
  });
  const jobIds = existing.map((job: { id: number }) => job.id);
  if (jobIds.length === 0) return 0;

  await tx.clientPayment.deleteMany({ where: { jobId: { in: jobIds } } });
  await tx.job.deleteMany({ where: { id: { in: jobIds } } });
  return jobIds.length;
};

const createDemoJob = async (tx: any, config: DemoJobConfig) => {
  const [client, department, manager] = await Promise.all([
    prisma.client.findFirst({
      where: { clientName: config.clientName },
      orderBy: { id: "asc" },
    }),
    prisma.department.findFirst({ where: { name: config.departmentName } }),
    findProfile(config.managerName.firstName, config.managerName.lastName),
  ]);

  if (!client) {
    throw new Error(`Demo seed: client "${config.clientName}" was not found`);
  }
  if (!department) {
    throw new Error(
      `Demo seed: department "${config.departmentName}" was not found`
    );
  }

  const staffProfiles = await Promise.all(
    config.staff.map(async (member) => {
      const [profile, role] = await Promise.all([
        findProfile(member.firstName, member.lastName, true),
        findRole(member.roleName),
      ]);
      return { ...member, profile, role };
    })
  );

  const staffByKey = new Map(
    staffProfiles.map((member) => [
      `${member.firstName} ${member.lastName}`,
      member,
    ])
  );

  const timeEntryRows = config.timeEntries.map((entry) => {
    const staff = staffByKey.get(`${entry.firstName} ${entry.lastName}`);
    if (!staff) {
      throw new Error(
        `Demo seed: time entry references ${entry.firstName} ${entry.lastName}, who is not in the staff list`
      );
    }
    const hourlyRate = Number(staff.role.billingRate || 0);
    const costRate = Number(staff.role.costRate || 0);
    const billableAmount = roundMoney(entry.hours * hourlyRate);
    const costAmount = roundMoney(entry.hours * costRate);
    return {
      employeeProfileId: staff.profile.id,
      dateWorked: new Date(entry.date),
      hours: entry.hours,
      billable: true,
      billableAmount,
      costAmount,
      profitLoss: roundMoney(billableAmount - costAmount),
      status: "approved",
      description: `Demo job costing time — ${config.jobCode}`,
    };
  });

  const totalHours = timeEntryRows.reduce((sum, row) => sum + row.hours, 0);
  const totalCost = timeEntryRows.reduce((sum, row) => sum + row.costAmount, 0);
  const lastCompletion = config.completion[config.completion.length - 1];

  const job = await tx.job.create({
    data: {
      jobCode: config.jobCode,
      jobName: config.jobName,
      description:
        "Demo job for job costing, collections and financial performance reporting.",
      clientId: client.id,
      departmentId: department.id,
      partnerProfileId: department.partnerProfileId ?? null,
      managerProfileId: manager.id,
      status: "completed",
      billingType: "fixed_fee",
      fixedFeeAmount: config.fee,
      currency: "KES",
      budgetHours: config.budgetHours,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      dueDate: new Date(lastCompletion.at),
      completionDate: new Date(lastCompletion.at),
      completionPercent: lastCompletion.percent,
      costingCompleted: true,
      teamAssigned: true,
    },
  });

  const jobCosting = await tx.jobCosting.create({
    data: {
      jobId: job.id,
      managerProfileId: manager.id,
      jobFee: config.fee,
      currency: "KES",
      allocatedCost: roundMoney(totalCost),
      remainingBudget: roundMoney(config.fee - totalCost),
      totalEstimatedHours: totalHours,
      totalEstimatedCost: roundMoney(totalCost),
      costingStatus: "approved",
      approvedByPartnerProfileId: department.partnerProfileId ?? null,
      approvedAt: new Date("2026-01-05T00:00:00.000Z"),
      notes: "Demo job costing seed data",
    },
  });

  await tx.budgetCap.create({
    data: {
      jobCostingId: jobCosting.id,
      totalAllocatedHours: config.budgetHours,
      capEnforced: false,
      allowOverage: true,
      maxOveragePercent: 0.2,
      autoLockOnExceed: false,
    },
  });

  for (const member of staffProfiles) {
    await tx.jobStaffAssignment.create({
      data: {
        jobId: job.id,
        employeeProfileId: member.profile.id,
        assignedRoleId: member.role.id,
        assignedHourlyRate: Number(member.role.billingRate || 0),
        roleSnapshot: {
          roleName: member.role.name,
          billingRate: Number(member.role.billingRate || 0),
          costRate: Number(member.role.costRate || 0),
        },
        roleOnJob: member.role.name,
        assignedByProfileId: manager.id,
      },
    });
  }

  await tx.jobCompletionHistory.create({
    data: {
      jobId: job.id,
      completionPercent: 0,
      recordedAt: new Date("2026-01-01T00:00:00.000Z"),
      recordedByProfileId: manager.id,
      note: "Demo baseline",
    },
  });

  for (const completion of config.completion) {
    await tx.jobCompletionHistory.create({
      data: {
        jobId: job.id,
        completionPercent: completion.percent,
        recordedAt: new Date(completion.at),
        recordedByProfileId: manager.id,
        note: completion.note,
      },
    });
  }

  for (const entry of timeEntryRows) {
    await tx.timeEntry.create({
      data: {
        jobId: job.id,
        ...entry,
      },
    });
  }

  for (const payment of config.payments) {
    await tx.clientPayment.create({
      data: {
        clientId: client.id,
        jobId: job.id,
        paymentAmount: payment.amount,
        currency: "KES",
        paymentDate: new Date(payment.date),
        paymentMethod: "bank_transfer",
        notes: `Demo collection for ${config.jobCode}`,
      },
    });
  }

  return {
    job,
    totalHours,
    totalCost,
    staffCount: staffProfiles.length,
    collections: config.payments.reduce((sum, payment) => sum + payment.amount, 0),
  };
};

const JOBS: DemoJobConfig[] = [
  {
    jobCode: "DEMO-JC-001",
    jobName: "Demo — Apex FY2026 Tax Compliance & Audit",
    clientName: "Apex Manufacturing Ltd",
    departmentName: "Tax & Audit",
    managerName: { firstName: "Brian", lastName: "Mutua" },
    fee: 1_800_000,
    budgetHours: 420,
    staff: [
      { firstName: "Brian", lastName: "Mutua", roleName: "Tax Manager" },
      { firstName: "Ruth", lastName: "Achieng", roleName: "Senior Associate" },
      { firstName: "Kevin", lastName: "Otieno", roleName: "Tax Consultant" },
      { firstName: "Samuel", lastName: "Mwangi", roleName: "Associate" },
    ],
    timeEntries: [
      { firstName: "Brian", lastName: "Mutua", date: "2026-02-10", hours: 30 },
      { firstName: "Ruth", lastName: "Achieng", date: "2026-02-15", hours: 80 },
      { firstName: "Kevin", lastName: "Otieno", date: "2026-03-05", hours: 40 },
      { firstName: "Samuel", lastName: "Mwangi", date: "2026-03-10", hours: 20 },
      { firstName: "Brian", lastName: "Mutua", date: "2026-05-12", hours: 25 },
      { firstName: "Ruth", lastName: "Achieng", date: "2026-05-20", hours: 60 },
      { firstName: "Kevin", lastName: "Otieno", date: "2026-06-08", hours: 30 },
      { firstName: "Samuel", lastName: "Mwangi", date: "2026-06-15", hours: 15 },
      { firstName: "Brian", lastName: "Mutua", date: "2026-08-10", hours: 15 },
      { firstName: "Ruth", lastName: "Achieng", date: "2026-08-18", hours: 40 },
      { firstName: "Kevin", lastName: "Otieno", date: "2026-09-05", hours: 20 },
      { firstName: "Samuel", lastName: "Mwangi", date: "2026-09-12", hours: 10 },
    ],
    completion: [
      { percent: 45, at: "2026-03-31T23:00:00.000Z", note: "Q1 completion" },
      { percent: 75, at: "2026-06-30T23:00:00.000Z", note: "Q2 completion" },
      { percent: 100, at: "2026-09-30T23:00:00.000Z", note: "Q3 completion" },
    ],
    payments: [
      { date: "2026-03-20", amount: 350_000 },
      { date: "2026-06-25", amount: 300_000 },
      { date: "2026-09-28", amount: 250_000 },
    ],
  },
  {
    jobCode: "DEMO-JC-002",
    jobName: "Demo — BluePeak Market Entry Advisory",
    clientName: "BluePeak Energy Ltd",
    departmentName: "Advisory",
    managerName: { firstName: "Agnes", lastName: "Njeri" },
    fee: 1_000_000,
    budgetHours: 240,
    staff: [
      { firstName: "Agnes", lastName: "Njeri", roleName: "Advisory Manager" },
      { firstName: "Peter", lastName: "Kamau", roleName: "Senior Associate" },
      { firstName: "Esther", lastName: "Wanjiru", roleName: "Advisory Consultant" },
      { firstName: "Nicholas", lastName: "Otieno", roleName: "Associate" },
    ],
    timeEntries: [
      { firstName: "Agnes", lastName: "Njeri", date: "2026-02-05", hours: 20 },
      { firstName: "Peter", lastName: "Kamau", date: "2026-02-20", hours: 60 },
      { firstName: "Esther", lastName: "Wanjiru", date: "2026-03-12", hours: 30 },
      { firstName: "Nicholas", lastName: "Otieno", date: "2026-03-18", hours: 15 },
      { firstName: "Agnes", lastName: "Njeri", date: "2026-05-05", hours: 15 },
      { firstName: "Peter", lastName: "Kamau", date: "2026-05-15", hours: 40 },
      { firstName: "Esther", lastName: "Wanjiru", date: "2026-06-10", hours: 25 },
      { firstName: "Nicholas", lastName: "Otieno", date: "2026-06-20", hours: 10 },
    ],
    completion: [
      { percent: 55, at: "2026-03-31T23:00:00.000Z", note: "Q1 completion" },
      { percent: 100, at: "2026-06-30T23:00:00.000Z", note: "Q2 completion" },
    ],
    payments: [
      { date: "2026-03-25", amount: 200_000 },
      { date: "2026-06-28", amount: 250_000 },
    ],
  },
  {
    jobCode: "DEMO-JC-003",
    jobName: "Demo — Lakeside Fintech Q4 Advisory",
    clientName: "Lakeside Fintech Ltd",
    departmentName: "Advisory",
    managerName: { firstName: "Agnes", lastName: "Njeri" },
    fee: 900_000,
    budgetHours: 160,
    staff: [
      { firstName: "Agnes", lastName: "Njeri", roleName: "Advisory Manager" },
      { firstName: "Peter", lastName: "Kamau", roleName: "Senior Associate" },
      { firstName: "Esther", lastName: "Wanjiru", roleName: "Advisory Consultant" },
      { firstName: "Nicholas", lastName: "Otieno", roleName: "Associate" },
    ],
    timeEntries: [
      { firstName: "Agnes", lastName: "Njeri", date: "2026-10-15", hours: 10 },
      { firstName: "Peter", lastName: "Kamau", date: "2026-10-20", hours: 35 },
      { firstName: "Esther", lastName: "Wanjiru", date: "2026-11-02", hours: 20 },
      { firstName: "Nicholas", lastName: "Otieno", date: "2026-11-10", hours: 10 },
    ],
    completion: [
      { percent: 30, at: "2026-11-15T23:00:00.000Z", note: "Q4 completion to date" },
    ],
    payments: [{ date: "2026-11-12", amount: 120_000 }],
  },
];

async function main() {
  const deleted = await prisma.$transaction(async (tx) => {
    const removed = await cleanupDemoJobs(tx);
    const results = [];
    for (const job of JOBS) {
      results.push(await createDemoJob(tx, job));
    }
    return { removed, results };
  });

  console.log(`Removed ${deleted.removed} existing demo job(s).`);
  for (const result of deleted.results) {
    console.log(
      [
        result.job.jobCode,
        result.job.jobName,
        `fee=${result.job.fixedFeeAmount}`,
        `hours=${result.totalHours}`,
        `cost=${roundMoney(result.totalCost)}`,
        `collections=${result.collections}`,
        `staff=${result.staffCount}`,
        `completion=${result.job.completionPercent}%`,
      ].join(" | ")
    );
  }
  console.log(
    "Demo data ready. Open Job Costing and select Quarterly or Yearly with a 2026 date."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
