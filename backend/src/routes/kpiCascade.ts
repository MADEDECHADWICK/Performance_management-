import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import {
  listKpiPeriods,
  getDepartmentScorecard,
  getOrgScorecard,
  getPartnerScorecard,
  syncKpiSourceData,
} from "../services/kpiCascade.service";
import {
  createFirmKpiAndCascade,
  listFirmKpiTemplates,
  getFirmKpiCascadeStatus,
  deleteFirmKpiTemplate,
  resyncFirmKpiTemplate,
} from "../services/firmKpiCascade.service";

const router = Router();

const ELEVATED_ROLES = new Set(["gmp", "super_admin", "hr"]);
const ORG_VIEW_ROLES = new Set(["gmp", "super_admin", "hr", "partner"]);
const DEPT_VIEW_ROLES = new Set(["gmp", "super_admin", "hr", "partner", "manager"]);

const hasRole = (roles: string[], allowed: Set<string>) =>
  roles.some((r) => allowed.has(r));

const toInt = (value: unknown, fallback?: number): number | undefined => {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

// GET /kpi-cascade/periods
// All roles: list available measurement periods
router.get("/periods", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const periods = await listKpiPeriods();
    res.json({ periods });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// GET /kpi-cascade/org-scorecard?periodId=X
// GMP / HR: all departments
// Partner: only departments where dept.partnerProfileId = profile.id
router.get("/org-scorecard", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ORG_VIEW_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const periodId = toInt(req.query.periodId);
    if (!periodId) {
      return res.status(400).json({ error: "periodId query parameter is required" });
    }

    let partnerProfileId: number | undefined;
    if (!hasRole(roles, ELEVATED_ROLES) && roles.includes("partner")) {
      // Restrict to the partner's own departments
      const profileId = req.profile?.id ?? req.user?.profileId;
      if (!profileId) return res.status(401).json({ error: "Profile not resolved" });
      partnerProfileId = profileId;
    }

    const scorecard = await getOrgScorecard({ periodId, partnerProfileId });
    res.json(scorecard);
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// GET /kpi-cascade/department/:departmentId?periodId=X
// Manager: only their department
// Partner: only departments they own
// HR / GMP: any
router.get("/department/:departmentId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, DEPT_VIEW_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const departmentId = toInt(req.params.departmentId);
    const periodId = toInt(req.query.periodId);
    if (!departmentId) return res.status(400).json({ error: "Invalid department ID" });
    if (!periodId) return res.status(400).json({ error: "periodId query parameter is required" });

    const profileId = req.profile?.id ?? req.user?.profileId;

    // Enforce department-level scoping for partner and manager
    if (!hasRole(roles, ELEVATED_ROLES)) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { partnerProfileId: true, departmentHeadId: true },
      });
      if (!department) return res.status(404).json({ error: "Department not found" });

      const isPartnerOfDept =
        roles.includes("partner") && department.partnerProfileId === profileId;
      const isManagerOfDept =
        roles.includes("manager") && department.departmentHeadId === profileId;

      if (!isPartnerOfDept && !isManagerOfDept) {
        return res.status(403).json({ error: "You do not have access to this department" });
      }
    }

    const scorecard = await getDepartmentScorecard({ departmentId, periodId });
    res.json(scorecard);
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// POST /kpi-cascade/sync/:periodId
// GMP / HR only: sync a specific period from source modules
router.post("/sync/:periodId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const periodId = toInt(req.params.periodId);
    if (!periodId) return res.status(400).json({ error: "Invalid period ID" });

    const result = await syncKpiSourceData(periodId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// POST /kpi-cascade/sync-all
// GMP / HR only: sync ALL non-closed periods — HTTP fallback that works without Redis
router.post("/sync-all", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const periods = await prisma.balancedScorecardMeasurementPeriod.findMany({
      where: { status: { notIn: ["closed"] as any } },
      select: { id: true, label: true },
      orderBy: { periodStart: "desc" },
      take: 12, // cap at last 12 periods to avoid runaway
    });

    const results: Array<{ periodId: number; label: string; synced: number; skipped: number; errors: number }> = [];
    for (const period of periods) {
      const r = await syncKpiSourceData(period.id);
      results.push({ periodId: period.id, label: period.label ?? `Period ${period.id}`, ...r });
    }

    const totals = results.reduce(
      (acc, r) => ({ synced: acc.synced + r.synced, skipped: acc.skipped + r.skipped, errors: acc.errors + r.errors }),
      { synced: 0, skipped: 0, errors: 0 }
    );

    res.json({ success: true, periodsProcessed: results.length, ...totals, breakdown: results });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// GET /kpi-cascade/my-departments
// Partner: returns the list of departments they own (for UI filtering)
router.get("/my-departments", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    const profileId = req.profile?.id ?? req.user?.profileId;
    if (!profileId) return res.status(401).json({ error: "Profile not resolved" });

    let departments;
    if (hasRole(roles, ELEVATED_ROLES)) {
      // GMP/HR see all departments
      departments = await prisma.department.findMany({
        select: {
          id: true,
          name: true,
          partnerProfileId: true,
          partner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { name: "asc" },
      });
    } else if (roles.includes("partner")) {
      departments = await prisma.department.findMany({
        where: { partnerProfileId: profileId },
        select: {
          id: true,
          name: true,
          partnerProfileId: true,
          partner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { name: "asc" },
      });
    } else if (roles.includes("manager")) {
      departments = await prisma.department.findMany({
        where: { departmentHeadId: profileId },
        select: {
          id: true,
          name: true,
          partnerProfileId: true,
          partner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { name: "asc" },
      });
    } else {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        partnerProfileId: d.partnerProfileId,
        partnerName: d.partner
          ? `${d.partner.firstName} ${d.partner.lastName}`
          : null,
      })),
    });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// ─── Firm KPI Templates ───────────────────────────────────────────────────────

// GET /kpi-cascade/firm-kpis — list all firm-level KPI templates (GMP/HR only)
router.get("/firm-kpis", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const templates = await listFirmKpiTemplates();
    res.json({ templates });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// POST /kpi-cascade/firm-kpis — create a firm KPI and cascade it to employees
router.post("/firm-kpis", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const profileId = req.profile?.id ?? req.user?.profileId;
    const {
      name, description, metricKey, sourceModule, measurementType,
      targetValue, unit, weight, frequency, formulaType,
      formulaNumeratorKey, formulaDenominatorKey, formulaValueKey,
      scoringType, greenThreshold, amberThreshold, redThreshold,
      cascadeScope, departmentIds, roleTypes,
    } = req.body;

    if (!name || !sourceModule || !targetValue || !unit || !cascadeScope) {
      return res.status(400).json({ error: "name, sourceModule, targetValue, unit and cascadeScope are required" });
    }

    const result = await createFirmKpiAndCascade({
      name, description, metricKey, sourceModule, measurementType: measurementType ?? "percentage",
      targetValue: Number(targetValue), unit, weight: weight ? Number(weight) : 100,
      frequency: frequency ?? "monthly", formulaType: formulaType ?? "ratio",
      formulaNumeratorKey, formulaDenominatorKey, formulaValueKey,
      scoringType: scoringType ?? "higher_better",
      greenThreshold: greenThreshold != null ? Number(greenThreshold) : null,
      amberThreshold: amberThreshold != null ? Number(amberThreshold) : null,
      redThreshold: redThreshold != null ? Number(redThreshold) : null,
      cascadeScope, departmentIds, roleTypes,
      createdByProfileId: profileId ?? null,
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// GET /kpi-cascade/firm-kpis/:templateId/status?periodId= — cascade status for a template
router.get("/firm-kpis/:templateId/status", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const templateId = toInt(req.params.templateId);
    const periodId = toInt(req.query.periodId);
    if (!templateId) return res.status(400).json({ error: "Invalid template ID" });
    if (!periodId) return res.status(400).json({ error: "periodId is required" });

    const status = await getFirmKpiCascadeStatus(templateId, periodId);
    res.json(status);
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// POST /kpi-cascade/firm-kpis/:templateId/resync
// Spawns missing individual KPIs for employees who joined after initial cascade
router.post("/firm-kpis/:templateId/resync", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const templateId = toInt(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: "Invalid template ID" });
    const profileId = req.profile?.id ?? req.user?.profileId;
    const result = await resyncFirmKpiTemplate(templateId, profileId ?? null);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// DELETE /kpi-cascade/firm-kpis/:templateId — deactivate template + all spawned KPIs
router.delete("/firm-kpis/:templateId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const templateId = toInt(req.params.templateId);
    if (!templateId) return res.status(400).json({ error: "Invalid template ID" });
    await deleteFirmKpiTemplate(templateId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// ─── Partner Scorecard ────────────────────────────────────────────────────────

// GET /kpi-cascade/partner-scorecard/:partnerId?periodId=
// GMP/HR: any partner; Partner: only self
router.get("/partner-scorecard/:partnerId", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ORG_VIEW_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const partnerProfileId = toInt(req.params.partnerId);
    const periodId = toInt(req.query.periodId);
    if (!partnerProfileId) return res.status(400).json({ error: "Invalid partner ID" });
    if (!periodId) return res.status(400).json({ error: "periodId is required" });

    // Partners can only see their own scorecard
    if (!hasRole(roles, ELEVATED_ROLES) && roles.includes("partner")) {
      const myProfileId = req.profile?.id ?? req.user?.profileId;
      if (myProfileId !== partnerProfileId) {
        return res.status(403).json({ error: "You can only view your own partner scorecard" });
      }
    }

    const scorecard = await getPartnerScorecard({ partnerProfileId, periodId });
    res.json(scorecard);
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message });
  }
});

// GET /kpi-cascade/partners — list all partners (for GMP/HR to select)
router.get("/partners", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const partners = await prisma.profile.findMany({
      where: { isPartner: true, status: "active" },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    res.json({ partners: partners.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      employeeId: p.employeeId,
    })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /kpi-cascade/departments — list all departments with their partner (for firm KPI scope selector)
router.get("/departments", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const roles = resolveRequestAccessRoles(req);
    if (!hasRole(roles, ELEVATED_ROLES)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const depts = await prisma.department.findMany({
      select: {
        id: true, name: true, partnerProfileId: true,
        partner: { select: { firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({ departments: depts.map((d) => ({
      id: d.id,
      name: d.name,
      partnerName: d.partner ? `${d.partner.firstName} ${d.partner.lastName}`.trim() : null,
    })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
