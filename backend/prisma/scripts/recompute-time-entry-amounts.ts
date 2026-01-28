import prisma from '../../src/prisma';

type AssignmentKey = string;

const toKey = (jobId: number, employeeProfileId: number): AssignmentKey =>
  `${jobId}:${employeeProfileId}`;

const parseArgs = () => {
  const args = process.argv.slice(2);
  return {
    onlyZero: args.includes('--only-zero'),
    dryRun: args.includes('--dry-run'),
  };
};

async function main() {
  const { onlyZero, dryRun } = parseArgs();

  const assignments = await prisma.jobStaffAssignment.findMany({
    select: { jobId: true, employeeProfileId: true, assignedHourlyRate: true },
  });

  const assignmentMap = new Map<AssignmentKey, number>();
  assignments.forEach((assignment) => {
    assignmentMap.set(
      toKey(assignment.jobId, assignment.employeeProfileId),
      Number(assignment.assignedHourlyRate || 0)
    );
  });

  const where = onlyZero
    ? { billableAmount: 0, costAmount: 0, profitLoss: 0 }
    : undefined;

  const entries = await prisma.timeEntry.findMany({
    where,
    select: {
      id: true,
      jobId: true,
      employeeProfileId: true,
      hours: true,
      billable: true,
      billableAmount: true,
      costAmount: true,
      profitLoss: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  const updates: ReturnType<typeof prisma.timeEntry.update>[] = [];

  entries.forEach((entry) => {
    const hourlyRate = assignmentMap.get(toKey(entry.jobId, entry.employeeProfileId));
    if (!hourlyRate || hourlyRate <= 0) {
      skipped += 1;
      return;
    }

    const hours = Number(entry.hours || 0);
    const billableAmount = entry.billable ? hours * hourlyRate : 0;
    const costAmount = hours * hourlyRate;
    const profitLoss = billableAmount - costAmount;

    updates.push(
      prisma.timeEntry.update({
        where: { id: entry.id },
        data: {
          billableAmount,
          costAmount,
          profitLoss,
        },
      })
    );
  });

  if (dryRun) {
    console.log('[dry-run] Would update entries:', updates.length);
    console.log('[dry-run] Skipped entries (missing rate):', skipped);
    return;
  }

  const batchSize = 50;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    await prisma.$transaction(batch);
    updated += batch.length;
  }

  console.log(`Updated ${updated} time entries.`);
  console.log(`Skipped ${skipped} entries (missing assigned hourly rate).`);
}

main()
  .catch((error) => {
    console.error('Recompute failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
