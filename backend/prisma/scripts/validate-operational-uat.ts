import prisma from "../../src/prisma";
import { TimeEntryService } from "../../src/services/time-entry.service";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

type Check = {
  check: string;
  status: "PASS";
  detail: string;
};

const checks: Check[] = [];

const pass = (check: string, detail: string) => {
  checks.push({ check, status: "PASS", detail });
};

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

async function profileByEmail(email: string) {
  const profile = await prisma.profile.findFirst({
    where: { user: { email } },
    include: {
      user: { select: { email: true } },
      role: { select: { name: true } },
      department: { select: { departmentCode: true, name: true } },
    },
  });
  if (!profile) throw new Error(`Missing profile: ${email}`);
  return profile;
}

async function main() {
  const [
    sarah,
    grace,
    james,
    linda,
    brian,
    agnes,
    diana,
    pauline,
    samuel,
  ] = await Promise.all([
    profileByEmail("sarah.hr@testfirm.co"),
    profileByEmail("grace.gmp@testfirm.co"),
    profileByEmail("james.partner@testfirm.co"),
    profileByEmail("linda.partner@testfirm.co"),
    profileByEmail("brian.mgr@testfirm.co"),
    profileByEmail("agnes.mgr@testfirm.co"),
    profileByEmail("diana.finance@testfirm.co"),
    profileByEmail("pauline.marketing@testfirm.co"),
    profileByEmail("samuel.emp@testfirm.co"),
  ]);

  const onboardingIncomplete = await prisma.profile.count({
    where: {
      user: { email: { endsWith: "@testfirm.co" } },
      OR: [
        { onboardingStatus: { not: "completed" } },
        { onboardingChecklistCompleted: false },
        { inductionCompleted: false },
      ],
    },
  });
  assert(onboardingIncomplete === 0, "Some UAT users still require onboarding");
  pass("Bypass onboarding", "All @testfirm.co profiles are completed for onboarding.");

  const [taxPartnerJobs, advisoryPartnerJobs, taxManagerJobs, advisoryManagerJobs] =
    await Promise.all([
      prisma.job.count({ where: { jobCode: { startsWith: "UAT-JOB-" }, partnerProfileId: james.id } }),
      prisma.job.count({ where: { jobCode: { startsWith: "UAT-JOB-" }, partnerProfileId: linda.id } }),
      prisma.job.count({ where: { jobCode: { startsWith: "UAT-JOB-" }, managerProfileId: brian.id } }),
      prisma.job.count({ where: { jobCode: { startsWith: "UAT-JOB-" }, managerProfileId: agnes.id } }),
    ]);
  assert(taxPartnerJobs === 2, "Tax partner should have exactly 2 UAT jobs");
  assert(advisoryPartnerJobs === 1, "Advisory partner should have exactly 1 UAT job");
  assert(taxManagerJobs === 2, "Tax manager should have exactly 2 UAT jobs");
  assert(advisoryManagerJobs === 1, "Advisory manager should have exactly 1 UAT job");
  pass(
    "Partner/manager scoping",
    `James=2, Linda=1, Brian=2, Agnes=1 UAT jobs.`
  );

  const proposalCounts = await prisma.proposal.groupBy({
    by: ["status"],
    where: { client: { clientCode: { startsWith: "UAT-" } } },
    _count: { _all: true },
  });
  const proposalMap = new Map(proposalCounts.map((row) => [row.status, row._count._all]));
  assert((proposalMap.get("won") ?? 0) >= 2, "Expected at least 2 won UAT proposals");
  assert((proposalMap.get("lost") ?? 0) >= 1, "Expected at least 1 lost UAT proposal");
  assert((proposalMap.get("sent") ?? 0) >= 1, "Expected at least 1 sent UAT proposal");
  pass("Marketing proposals", JSON.stringify(Object.fromEntries(proposalMap)));

  const financeAgg = await prisma.timeEntry.aggregate({
    where: { job: { jobCode: { startsWith: "UAT-JOB-" } } },
    _sum: {
      hours: true,
      billableAmount: true,
      costAmount: true,
      profitLoss: true,
    },
  });
  assert(Number(financeAgg._sum.hours || 0) > 0, "Expected UAT time entries");
  assert(Number(financeAgg._sum.billableAmount || 0) > 0, "Expected UAT billable amount");
  pass(
    "Timesheet finance totals",
    `hours=${Number(financeAgg._sum.hours || 0)}, billable=${Number(
      financeAgg._sum.billableAmount || 0
    )}, cost=${Number(financeAgg._sum.costAmount || 0)}, profit=${Number(
      financeAgg._sum.profitLoss || 0
    )}`
  );

  const invoiceCount = await prisma.jobInvoice.count({
    where: { invoiceNumber: { startsWith: "UAT-INV-" } },
  });
  const paymentCount = await prisma.clientPayment.count({
    where: { referenceNumber: { startsWith: "UAT-PAY-" } },
  });
  const allocationCount = await prisma.revenueAllocation.count({
    where: { job: { jobCode: { startsWith: "UAT-JOB-" } } },
  });
  assert(invoiceCount === 3, "Expected 3 UAT invoices");
  assert(paymentCount === 2, "Expected 2 UAT payments");
  assert(allocationCount >= 6, "Expected UAT revenue allocations");
  pass("Billing and collection", `invoices=${invoiceCount}, payments=${paymentCount}, allocations=${allocationCount}`);

  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: {
      employeeProfileId: samuel.id,
      status: "approved",
      startDate: d("2026-05-12"),
      endDate: d("2026-05-12"),
    },
  });
  assert(leaveRequest, "Expected Samuel approved leave on 2026-05-12");
  const leaveDayTime = await prisma.timeEntry.count({
    where: {
      employeeProfileId: samuel.id,
      dateWorked: d("2026-05-12"),
    },
  });
  assert(leaveDayTime === 0, "Seed should not contain time on Samuel's leave day");

  const taxJob = await prisma.job.findFirst({
    where: { jobCode: "UAT-JOB-TAX-AUDIT-001" },
    select: { id: true },
  });
  assert(taxJob, "Missing UAT tax job");
  let blockedOnLeave = false;
  try {
    await TimeEntryService.createTimeEntry(
      {
        jobId: taxJob!.id,
        dateWorked: "2026-05-12",
        hours: 1,
        description: "UAT blocked leave validation",
      },
      { userId: samuel.userId!, profileId: samuel.id, roleName: "employee" }
    );
  } catch (error: any) {
    blockedOnLeave =
      Number(error?.statusCode) === 409 &&
      String(error?.message || "").includes("approved leave");
  }
  assert(blockedOnLeave, "Time entry service did not block approved leave day");
  pass("Leave blocks time entry", "Samuel cannot log time on approved leave date 2026-05-12.");

  const cycle = await prisma.evaluationCycle.findFirst({
    where: { cycleName: "UAT Q2 2026 Performance Cycle" },
    select: { id: true },
  });
  assert(cycle, "Missing UAT evaluation cycle");
  const [submittedAssignments, performanceScores, bscContributions] = await Promise.all([
    prisma.evaluationAssignment.count({
      where: { cycleId: cycle!.id, status: "submitted" },
    }),
    prisma.performanceScore.count({ where: { evaluationCycleId: cycle!.id } }),
    prisma.balancedScorecardEmployeeContribution.count({
      where: { contributionKey: { startsWith: "evaluation-" } },
    }),
  ]);
  assert(submittedAssignments >= 12, "Expected manager and self evaluation assignments");
  assert(performanceScores >= 8, "Expected employee and manager performance scores");
  assert(bscContributions >= 7, "Expected BSC evaluation contributions");
  pass(
    "Evaluations to performance/BSC",
    `submitted=${submittedAssignments}, scores=${performanceScores}, bsc=${bscContributions}`
  );

  const rolePresence = [sarah, grace, diana, pauline].every((profile) => profile.user?.email);
  assert(rolePresence, "Missing one or more support roles");
  pass("Support roles", "HR, GMP, Finance, and Marketing UAT users are available.");

  console.log("Operational UAT validation passed");
  console.table(checks);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
