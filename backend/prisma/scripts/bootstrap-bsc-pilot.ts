import prisma from "../../src/prisma";
import {
  createBalancedScorecardInitiative,
  ensureBalancedScorecardSeed,
  listBalancedScorecardStructure,
  upsertBalancedScorecardKpiAssignment,
  updateBalancedScorecardInitiative,
} from "../../src/services/balancedScorecardStructure.service";
import {
  createBalancedScorecardCycle,
  createBalancedScorecardVersion,
  publishBalancedScorecardVersion,
  resolveActiveBalancedScorecardVersionId,
} from "../../src/services/balancedScorecardGovernance.service";

const cycleRangeForCurrentYear = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  return {
    year,
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
};

const scoreToStatus = (progress: number): "on_track" | "at_risk" | "off_track" =>
  progress >= 85 ? "on_track" : progress >= 65 ? "at_risk" : "off_track";

const ensurePilotVersion = async () => {
  const activeVersionId = await resolveActiveBalancedScorecardVersionId();
  if (activeVersionId) return activeVersionId;

  const { year, startDate, endDate } = cycleRangeForCurrentYear();
  const cycleName = `FY ${year} Balanced Scorecard`;
  let cycle = await prisma.balancedScorecardCycle.findFirst({
    where: {
      name: cycleName,
    },
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
};

async function main() {
  await ensureBalancedScorecardSeed();
  const versionId = await ensurePilotVersion();
  const structure = await listBalancedScorecardStructure({ scorecardVersionId: versionId });

  const kpiByMetricKey = new Map(structure.kpis.map((kpi) => [kpi.metricKey, kpi]));
  const profiles = await prisma.profile.findMany({
    where: {
      user: {
        email: {
          in: ["manager@ronalds.local", "employee@ronalds.local", "marketing@ronalds.local"],
        },
      },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      user: { select: { email: true } },
    },
    orderBy: [{ id: "asc" }],
  });

  const profileByEmail = new Map(
    profiles.map((profile) => [profile.user?.email?.toLowerCase() ?? "", profile])
  );

  const pilotAssignments = [
    {
      email: "manager@ronalds.local",
      metricKey: "kpi-9",
      target: 90,
      weight: 40,
      progress: 78,
      scopeRole: "manager",
      title: "Manager review completion pilot",
      summary: "Pilot manager target to complete assigned review actions within the active BSC window.",
    },
    {
      email: "employee@ronalds.local",
      metricKey: "kpi-10",
      target: 100,
      weight: 35,
      progress: 62,
      scopeRole: "employee",
      title: "Employee learning completion pilot",
      summary: "Pilot employee target to close learning assignments linked to the people perspective.",
    },
    {
      email: "marketing@ronalds.local",
      metricKey: "kpi-9",
      target: 85,
      weight: 25,
      progress: 88,
      scopeRole: "employee",
      title: "Cross-functional review support pilot",
      summary: "Pilot cross-functional target showing employee-scoped ownership against review completion.",
    },
  ] as const;

  for (const pilot of pilotAssignments) {
    const profile = profileByEmail.get(pilot.email);
    const kpi = kpiByMetricKey.get(pilot.metricKey);
    if (!profile || !kpi) continue;

    await upsertBalancedScorecardKpiAssignment({
      kpiId: kpi.id,
      profileId: profile.id,
      scorecardVersionId: versionId,
      individualTarget: pilot.target,
      individualWeight: pilot.weight,
      createdByProfileId: null,
    });

    const existingInitiative = await prisma.balancedScorecardInitiative.findFirst({
      where: {
        scorecardVersionId: versionId,
        kpiId: kpi.id,
        ownerProfileId: profile.id,
        title: pilot.title,
        isActive: true,
      },
      select: { id: true },
    });

    if (existingInitiative) {
      await updateBalancedScorecardInitiative(existingInitiative.id, {
        ownerProfileId: profile.id,
        scopeRole: pilot.scopeRole,
        progress: pilot.progress,
        status: scoreToStatus(pilot.progress),
        summary: pilot.summary,
      });
      continue;
    }

    await createBalancedScorecardInitiative({
      goalId: kpi.goalId,
      kpiId: kpi.id,
      scopeRole: pilot.scopeRole,
      title: pilot.title,
      summary: pilot.summary,
      ownerProfileId: profile.id,
      dueDate: `${cycleRangeForCurrentYear().year}-12-31`,
      status: scoreToStatus(pilot.progress),
      progress: pilot.progress,
      createdByProfileId: null,
    });
  }

  console.log(`Balanced scorecard pilot ready on version ${versionId}.`);
}

main()
  .catch((error) => {
    console.error("Failed to bootstrap balanced scorecard pilot.");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
