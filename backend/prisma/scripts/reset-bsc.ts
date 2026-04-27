import prisma from "../../src/prisma";
import { ensureBalancedScorecardSeed } from "../../src/services/balancedScorecardStructure.service";
import {
  createBalancedScorecardCycle,
  createBalancedScorecardVersion,
  publishBalancedScorecardVersion,
  resolveActiveBalancedScorecardVersionId,
} from "../../src/services/balancedScorecardGovernance.service";

async function clearBscTables() {
  console.log("Clearing BSC tables...");

  await prisma.balancedScorecardKpiSnapshotTrace.deleteMany();
  await prisma.balancedScorecardKpiSnapshot.deleteMany();
  await prisma.balancedScorecardMeasurementReview.deleteMany();
  await prisma.balancedScorecardEmployeeContributionUpdate.deleteMany();
  await prisma.balancedScorecardEmployeeContribution.deleteMany();
  await prisma.balancedScorecardKpiActualHistory.deleteMany();
  await prisma.balancedScorecardKpiAssignment.deleteMany();
  await prisma.balancedScorecardInitiative.deleteMany();
  await prisma.balancedScorecardKpi.deleteMany();
  await prisma.balancedScorecardGoal.deleteMany();
  await prisma.balancedScorecardPerspective.deleteMany();
  await prisma.balancedScorecardMeasurementPeriod.deleteMany();

  // Break circular FK before deleting versions and cycles
  await prisma.$executeRaw`UPDATE balanced_scorecard_cycles SET active_version_id = NULL WHERE active_version_id IS NOT NULL`;
  await prisma.balancedScorecardVersion.deleteMany();
  await prisma.balancedScorecardCycle.deleteMany();

  console.log("All BSC tables cleared.");
}

const cycleRangeForCurrentYear = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  return {
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

async function ensurePilotVersion() {
  const activeVersionId = await resolveActiveBalancedScorecardVersionId();
  if (activeVersionId) return activeVersionId;

  const { year, startDate, endDate } = cycleRangeForCurrentYear();
  const cycleName = `FY ${year} Balanced Scorecard`;
  let cycle = await prisma.balancedScorecardCycle.findFirst({
    where: { name: cycleName },
    orderBy: [{ id: "desc" }],
    select: { id: true },
  });

  if (!cycle) {
    cycle = await createBalancedScorecardCycle({
      name: cycleName,
      cadence: "monthly",
      startDate,
      endDate,
      createdByProfileId: null,
    });
  }

  const latestVersion =
    (await prisma.balancedScorecardVersion.findFirst({
      where: { cycleId: cycle.id },
      orderBy: [{ versionNumber: "desc" }, { id: "desc" }],
      select: { id: true, status: true },
    })) ??
    (await createBalancedScorecardVersion({
      cycleId: cycle.id,
      label: "Pilot baseline",
      createdByProfileId: null,
    }));

  if (latestVersion.status !== "published") {
    await publishBalancedScorecardVersion(latestVersion.id);
  }

  return latestVersion.id;
}

async function main() {
  await clearBscTables();

  console.log("Seeding BSC with real employee data...");
  await ensureBalancedScorecardSeed();

  console.log("Creating and publishing pilot version...");
  await ensurePilotVersion();

  console.log("BSC reset complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
