import { Router } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import prisma from "../prisma";

const router = Router();

const isPrivileged = (roles: string[]) =>
  roles.some((r) => ["super_admin", "hr", "manager"].includes(r));

// ----------------------------------------------------------------
// GET /evaluation-reports/scorecard?profileId=&cycleId=
// Individual scorecard: scores by category, competency radar data,
// grade, trend vs previous cycle.
// ----------------------------------------------------------------
router.get(
  "/scorecard",
  authMiddleware,
  loadProfile,
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      const myProfileId = req.profile?.id;
      const requestedProfileId = req.query.profileId ? Number(req.query.profileId) : undefined;
      const cycleId = req.query.cycleId ? Number(req.query.cycleId) : undefined;

      const resolvedProfileId = isPrivileged(roles) && requestedProfileId
        ? requestedProfileId
        : myProfileId;

      if (!resolvedProfileId) return res.status(400).json({ error: "profileId required" });

      // Latest score for this employee (optionally filtered by cycle)
      const score = await prisma.performanceScore.findFirst({
        where: {
          employeeProfileId: resolvedProfileId,
          ...(cycleId ? { evaluationCycleId: cycleId } : {}),
        },
        orderBy: { calculatedAt: "desc" },
        include: {
          cycle: { select: { id: true, cycleName: true, startDate: true, endDate: true } },
          calibrationSession: { select: { id: true, name: true, status: true } },
        },
      });

      // Previous cycle score for trend
      const prevScore = score?.evaluationCycleId
        ? await prisma.performanceScore.findFirst({
            where: {
              employeeProfileId: resolvedProfileId,
              evaluationCycleId: { not: score.evaluationCycleId },
            },
            orderBy: { calculatedAt: "desc" },
            select: { totalScore: true, grade: true, evaluationCycleId: true },
          })
        : null;

      // Competency radar: aggregate responses by competency
      const responses = await prisma.evaluationResponse.findMany({
        where: {
          assignment: {
            evaluateeProfileId: resolvedProfileId,
            status: "submitted",
            ...(cycleId ? { definition: { cycleId } } : {}),
          },
          question: { competencyId: { not: null } },
        },
        include: {
          question: {
            include: { competency: { select: { id: true, name: true, category: true } } },
          },
        },
      });

      const radarMap = new Map<number, { name: string; category: string; scores: number[] }>();
      for (const r of responses) {
        const comp = r.question.competency;
        if (!comp) continue;
        if (!radarMap.has(comp.id)) {
          radarMap.set(comp.id, { name: comp.name, category: comp.category, scores: [] });
        }
        radarMap.get(comp.id)!.scores.push(r.score);
      }

      const radarData = [...radarMap.entries()].map(([id, data]) => ({
        competencyId: id,
        name: data.name,
        category: data.category,
        avgScore: data.scores.length
          ? Math.round((data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 10) / 10
          : 0,
        maxScore: 5,
      }));

      // Development plan items for this employee + cycle
      const devPlanItems = await prisma.developmentPlanItem.findMany({
        where: {
          plan: {
            profileId: resolvedProfileId,
            ...(cycleId ? { evaluationCycleId: cycleId } : {}),
          },
        },
        include: { competency: { select: { id: true, name: true } } },
        orderBy: { priority: "asc" },
        take: 5,
      });

      return res.json({
        profileId: resolvedProfileId,
        score,
        trend: prevScore
          ? {
              previousScore: Number(prevScore.totalScore),
              previousGrade: prevScore.grade,
              delta: score ? Number(score.totalScore) - Number(prevScore.totalScore) : null,
            }
          : null,
        radarData,
        developmentFocus: devPlanItems,
      });
    } catch (err: any) {
      console.error("Error building scorecard:", err);
      return res.status(500).json({ error: "Failed to build scorecard" });
    }
  }
);

// ----------------------------------------------------------------
// GET /evaluation-reports/team-summary?cycleId=&departmentId=
// Team summary table: all employees with score, grade, potential, outcome
// ----------------------------------------------------------------
router.get(
  "/team-summary",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "read"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "Manager access required" });

      const cycleId      = req.query.cycleId      ? Number(req.query.cycleId)      : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      const scores = await prisma.performanceScore.findMany({
        where: {
          ...(cycleId ? { evaluationCycleId: cycleId } : {}),
          ...(departmentId ? { employee: { departmentId } } : {}),
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              positionTitle: true,
              department: { select: { id: true, name: true } },
            },
          },
          cycle: { select: { id: true, cycleName: true } },
          calibratedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { totalScore: "desc" },
      });

      // Resolve band outcomes
      const bands = await prisma.performanceBand.findMany({
        where: { roleId: null },
        orderBy: { onTrackMin: "desc" },
      });

      const resolveOutcome = (totalScore: number) => {
        const band = bands.find((b) => totalScore >= Number(b.atRiskMin)) ?? bands[bands.length - 1];
        return band?.outcome ?? null;
      };

      const rows = scores.map((s) => ({
        employee: s.employee,
        cycleId: s.evaluationCycleId,
        cycleName: s.cycle?.cycleName,
        totalScore: Number(s.totalScore),
        calibratedScore: s.calibratedScore !== null ? Number(s.calibratedScore) : null,
        effectiveScore: s.calibratedScore !== null ? Number(s.calibratedScore) : Number(s.totalScore),
        grade: s.grade,
        potentialRating: s.potentialRating,
        outcome: resolveOutcome(
          s.calibratedScore !== null ? Number(s.calibratedScore) : Number(s.totalScore)
        ),
        calibratedBy: s.calibratedBy,
      }));

      const avg = rows.length
        ? rows.reduce((sum, r) => sum + r.effectiveScore, 0) / rows.length
        : 0;

      return res.json({
        cycleId,
        departmentId,
        count: rows.length,
        average: Math.round(avg * 10) / 10,
        rows,
      });
    } catch (err: any) {
      console.error("Error building team summary:", err);
      return res.status(500).json({ error: "Failed to build team summary" });
    }
  }
);

// ----------------------------------------------------------------
// GET /evaluation-reports/nine-box?cycleId=&departmentId=
// 9-box grid: performance (x) × potential (y), 3×3 matrix
// ----------------------------------------------------------------
router.get(
  "/nine-box",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "read"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "Manager access required" });

      const cycleId      = req.query.cycleId      ? Number(req.query.cycleId)      : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      const scores = await prisma.performanceScore.findMany({
        where: {
          ...(cycleId ? { evaluationCycleId: cycleId } : {}),
          ...(departmentId ? { employee: { departmentId } } : {}),
          potentialRating: { not: null },
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              positionTitle: true,
              department: { select: { name: true } },
            },
          },
        },
      });

      const bin = (value: number, low: number, high: number): "low" | "medium" | "high" =>
        value <= low ? "low" : value <= high ? "medium" : "high";

      // Performance: score 0-100 → low <55, medium 55-74, high ≥75
      // Potential:   rating 1-5  → low 1-2,   medium 3,     high 4-5
      const cells: Record<string, Record<string, any[]>> = {
        low: { low: [], medium: [], high: [] },
        medium: { low: [], medium: [], high: [] },
        high: { low: [], medium: [], high: [] },
      };

      for (const s of scores) {
        const effective = s.calibratedScore !== null ? Number(s.calibratedScore) : Number(s.totalScore);
        const perf = bin(effective, 54, 74);
        const pot  = bin(s.potentialRating!, 2, 3);
        cells[pot][perf].push({
          id: s.employee.id,
          name: `${s.employee.firstName} ${s.employee.lastName}`,
          positionTitle: s.employee.positionTitle,
          department: s.employee.department?.name,
          performance: effective,
          potential: s.potentialRating,
          grade: s.grade,
        });
      }

      return res.json({
        cycleId,
        departmentId,
        totalPlaced: scores.length,
        cells,
        axisLabels: {
          x: { low: "Low performance (<55)", medium: "Moderate (55–74)", high: "High (≥75)" },
          y: { low: "Low potential (1–2)",   medium: "Moderate (3)",     high: "High (4–5)" },
        },
      });
    } catch (err: any) {
      console.error("Error building 9-box:", err);
      return res.status(500).json({ error: "Failed to build 9-box grid" });
    }
  }
);

// ----------------------------------------------------------------
// GET /evaluation-reports/radar?cycleId=&departmentId=
// Aggregated competency radar for a whole team/department
// ----------------------------------------------------------------
router.get(
  "/radar",
  authMiddleware,
  loadProfile,
  requireModuleAccess("evaluations", "read"),
  async (req: AuthRequest, res) => {
    try {
      const roles = resolveRequestAccessRoles(req).map((r) => r.toLowerCase());
      if (!isPrivileged(roles)) return res.status(403).json({ error: "Manager access required" });

      const cycleId      = req.query.cycleId      ? Number(req.query.cycleId)      : undefined;
      const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;

      const responses = await prisma.evaluationResponse.findMany({
        where: {
          assignment: {
            status: "submitted",
            ...(cycleId ? { definition: { cycleId } } : {}),
            ...(departmentId ? { evaluatee: { departmentId } } : {}),
          },
          question: { competencyId: { not: null } },
        },
        include: {
          question: {
            include: { competency: { select: { id: true, name: true, category: true } } },
          },
        },
      });

      const map = new Map<number, { name: string; category: string; scores: number[] }>();
      for (const r of responses) {
        const comp = r.question.competency;
        if (!comp) continue;
        if (!map.has(comp.id)) map.set(comp.id, { name: comp.name, category: comp.category, scores: [] });
        map.get(comp.id)!.scores.push(r.score);
      }

      const radarData = [...map.entries()].map(([id, data]) => ({
        competencyId: id,
        name: data.name,
        category: data.category,
        avgScore: data.scores.length
          ? Math.round((data.scores.reduce((s, v) => s + v, 0) / data.scores.length) * 10) / 10
          : 0,
        responseCount: data.scores.length,
        maxScore: 5,
      })).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

      return res.json({ cycleId, departmentId, radarData });
    } catch (err: any) {
      console.error("Error building radar:", err);
      return res.status(500).json({ error: "Failed to build radar data" });
    }
  }
);

export default router;
