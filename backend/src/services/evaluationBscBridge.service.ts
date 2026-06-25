import prisma from "../prisma";

/**
 * Routes an evaluation score into the BSC employee contribution table so that
 * the workspace People-perspective card reflects the latest evaluation result.
 *
 * contributionKey matches the id the workspace builds dynamically:
 *   `evaluation-${evaluateeId}`
 * The workspace service overwrites the computed progress with record.latestProgress
 * when it finds a matching row.
 */
export async function bridgeEvaluationScoreToBsc(
  evaluateeId: number,
  cycleId: number,
  evaluationScore100: number
): Promise<void> {
  const contributionKey = `evaluation-${evaluateeId}`;
  const progress = Math.min(100, Math.max(0, Math.round(evaluationScore100)));

  await prisma.balancedScorecardEmployeeContribution.upsert({
    where: {
      profileId_contributionKey: {
        profileId: evaluateeId,
        contributionKey,
      },
    },
    update: {
      latestProgress: progress,
      lastUpdatedAt: new Date(),
      sourceReferenceId: cycleId,
    },
    create: {
      profileId: evaluateeId,
      contributionKey,
      sourceType: "evaluation_cycle",
      sourceReferenceId: cycleId,
      title: "Evaluation cycle contribution",
      latestProgress: progress,
      lastUpdatedAt: new Date(),
    },
  });
}

/**
 * Bulk bridge: called when a cycle is closed to ensure every evaluated
 * employee's contribution record is up to date with their final score.
 */
export async function bridgeAllScoresForCycle(cycleId: number): Promise<void> {
  const scores = await prisma.performanceScore.findMany({
    where: { evaluationCycleId: cycleId },
    select: {
      employeeProfileId: true,
      evaluationScore: true,
    },
  });

  if (scores.length === 0) return;

  const now = new Date();
  await prisma.$transaction(
    scores.map((score) => {
      const contributionKey = `evaluation-${score.employeeProfileId}`;
      const progress = Math.min(100, Math.max(0, Math.round(Number(score.evaluationScore ?? 0))));
      return prisma.balancedScorecardEmployeeContribution.upsert({
        where: {
          profileId_contributionKey: {
            profileId: score.employeeProfileId,
            contributionKey,
          },
        },
        update: { latestProgress: progress, lastUpdatedAt: now, sourceReferenceId: cycleId },
        create: {
          profileId: score.employeeProfileId,
          contributionKey,
          sourceType: "evaluation_cycle",
          sourceReferenceId: cycleId,
          title: "Evaluation cycle contribution",
          latestProgress: progress,
          lastUpdatedAt: now,
        },
      });
    })
  );
}
