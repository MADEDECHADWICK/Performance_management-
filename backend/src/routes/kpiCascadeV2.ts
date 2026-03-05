import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import createAudit from "../utils/audit";
import { NotificationService } from "../services/notifications.service";

type KpiState =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "active"
  | "completed"
  | "escalated"
  | "archived";
type KpiLevel = "firm" | "team" | "department" | "employee";
type Direction = "higher_better" | "lower_better" | "milestone";
type BscTag = "financial" | "customer" | "internal_process" | "learning_growth";

const router = Router();
const ROLE_ADMIN = new Set(["super_admin"]);
const ROLE_HR = new Set(["hr"]);
const ROLE_GMP = new Set(["gmp"]);
const EXPECTED_PARENT: Record<KpiLevel, KpiLevel | null> = {
  firm: null,
  team: "firm",
  department: "team",
  employee: "department",
};

const parseIntSafe = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const parseNumSafe = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const parseDateSafe = (v: unknown) => {
  const d = new Date(String(v || ""));
  return Number.isNaN(d.getTime()) ? null : d;
};
const cadenceFromWindow = (name: string, startAt: Date, endAt: Date): "quarterly" | "annual" => {
  const normalized = String(name || "")
    .trim()
    .toLowerCase();
  if (/\bq[1-4]\b/.test(normalized) || normalized.includes("quarter")) return "quarterly";
  if (normalized.includes("annual") || normalized.includes("year") || normalized.includes("fy")) return "annual";
  const days = Math.max(1, Math.round((endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000)));
  return days <= 150 ? "quarterly" : "annual";
};
const mapEvaluationCycleState = (value: unknown): "draft" | "active" | "completed" => {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  if (status === "active") return "active";
  if (status === "closed") return "completed";
  return "draft";
};
const kpiCycleKey = (name: string, startAtIso: string, endAtIso: string) =>
  `${name.trim().toLowerCase()}|${startAtIso}|${endAtIso}`;
const parseBscTag = (v: unknown): BscTag | null => {
  const normalized = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "financial") return "financial";
  if (normalized === "customer" || normalized === "client") return "customer";
  if (normalized === "internal_process" || normalized === "internal_processes" || normalized === "process")
    return "internal_process";
  if (normalized === "learning_growth" || normalized === "learning" || normalized === "growth")
    return "learning_growth";
  return null;
};
const toNum = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const normalizeRoleName = (role: unknown) =>
  String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");

const roleSet = (req: AuthRequest) =>
  new Set(
    [req.profile?.role?.name, ...(req.userRoles || [])]
      .filter(Boolean)
      .map((r) => normalizeRoleName(r))
  );
const hasRole = (req: AuthRequest, allowed: Set<string>) => {
  const roles = roleSet(req);
  for (const role of roles) if (allowed.has(role)) return true;
  return false;
};
const isAdmin = (req: AuthRequest) => hasRole(req, ROLE_ADMIN);
const isHR = (req: AuthRequest) => hasRole(req, ROLE_HR);
const isGMP = (req: AuthRequest) => hasRole(req, ROLE_GMP);
const isPartner = (req: AuthRequest) => roleSet(req).has("partner");
const isFinance = (req: AuthRequest) => {
  for (const role of roleSet(req)) {
    if (role === "finance" || role.includes("finance") || role.includes("accounts")) return true;
  }
  return false;
};
const isMarketing = (req: AuthRequest) => {
  for (const role of roleSet(req)) {
    if (role === "marketing" || role.includes("marketing") || role.includes("business_development") || role === "bd")
      return true;
  }
  return false;
};
const isManager = (req: AuthRequest) => {
  for (const role of roleSet(req)) {
    if (role.includes("manager") || role.includes("team_lead") || role.includes("lead")) return true;
  }
  return false;
};
const canManageDepartmentLayer = (req: AuthRequest) => isManager(req) || isFinance(req) || isMarketing(req);
const canOwnTeamLayer = (req: AuthRequest) => isPartner(req) || isGMP(req);
const actorProfileId = (req: AuthRequest) =>
  req.profile?.id ?? (req.user?.profileId ? Number(req.user.profileId) : null);
const actorUserId = (req: AuthRequest) => (req.user?.userId ? Number(req.user.userId) : null);

const requireIdempotencyKey = (req: AuthRequest, res: any) => {
  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key header is required" });
    return null;
  }
  return key;
};

const allowedTransition = (from: KpiState, to: KpiState) => {
  const map: Record<KpiState, KpiState[]> = {
    draft: ["submitted", "archived"],
    submitted: ["in_review", "approved", "rejected", "active", "escalated", "archived"],
    in_review: ["approved", "rejected", "escalated", "archived"],
    approved: ["active", "completed", "escalated", "archived"],
    rejected: ["draft", "archived"],
    active: ["completed", "escalated", "archived"],
    completed: ["archived", "escalated"],
    escalated: ["active", "completed", "archived"],
    archived: [],
  };
  return map[from]?.includes(to);
};

const leafPct = (direction: Direction, baseline: number, target: number, actual: number) => {
  if (direction === "milestone") return actual >= target ? 100 : 0;
  if (direction === "lower_better") {
    const d = baseline - target;
    if (d === 0) return actual <= target ? 100 : 0;
    return clamp(((baseline - actual) / d) * 100, 0, 100);
  }
  const d = target - baseline;
  if (d === 0) return actual >= target ? 100 : 0;
  return clamp(((actual - baseline) / d) * 100, 0, 100);
};
const expectedPct = (startAt: Date | null, endAt: Date | null, asOf: Date = new Date()) => {
  if (!startAt || !endAt) return null;
  const totalMs = endAt.getTime() - startAt.getTime();
  if (totalMs <= 0) return null;
  const elapsed = clamp(asOf.getTime() - startAt.getTime(), 0, totalMs);
  return clamp((elapsed / totalMs) * 100, 0, 100);
};

const ragFromPct = (
  pct: number,
  startAt?: Date | null,
  endAt?: Date | null,
  yellowGap = 15
): "red" | "amber" | "green" => {
  const expected = expectedPct(startAt || null, endAt || null);
  if (expected === null) {
    return pct >= 80 ? "green" : pct >= 60 ? "amber" : "red";
  }
  if (pct >= expected) return "green";
  if (pct >= expected - yellowGap) return "amber";
  return "red";
};
const weighted = <T>(rows: T[], value: (r: T) => number, weight: (r: T) => number) => {
  if (!rows.length) return 0;
  const tw = rows.reduce((s, r) => s + Math.max(0, weight(r)), 0);
  if (tw <= 0) return rows.reduce((s, r) => s + value(r), 0) / rows.length;
  return rows.reduce((s, r) => s + value(r) * Math.max(0, weight(r)), 0) / tw;
};

const notify = async (req: AuthRequest, profileId: number, title: string, message: string, link: string) => {
  try {
    await NotificationService.createNotification(
      { recipientProfileId: profileId, type: "info", title, message, link },
      { userId: req.user?.userId ?? 0, profileId: actorProfileId(req) ?? 0, roleName: req.profile?.role?.name }
    );
  } catch {}
};

const actorRoleLabel = (req: AuthRequest) => {
  if (isAdmin(req)) return "super_admin";
  if (isHR(req)) return "hr";
  if (isGMP(req)) return "gmp";
  if (isPartner(req)) return "partner";
  if (isFinance(req)) return "finance";
  if (isMarketing(req)) return "marketing";
  if (isManager(req)) return "manager";
  return "employee";
};

const findIdempotentTransition = async (entityType: string, entityId: number, key: string) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, to_status
    FROM "status_transitions"
    WHERE entity_type = ${entityType}
      AND entity_id = ${entityId}
      AND COALESCE(metadata->>'idempotencyKey', '') = ${key}
    ORDER BY id DESC
    LIMIT 1
  `);
  return rows[0] || null;
};

const logTransition = async (
  req: AuthRequest,
  entityType: string,
  entityId: number,
  fromState: string,
  toState: string,
  reason?: string,
  idempotencyKey?: string
) => {
  await prisma.statusTransition.create({
    data: {
      entityType,
      entityId,
      fromStatus: fromState,
      toStatus: toState,
      changedByProfileId: actorProfileId(req) || undefined,
      reason: reason || undefined,
      metadata: { idempotencyKey: idempotencyKey || null, requestId: String(req.headers["x-request-id"] || "") || null } as any,
    },
  });
  await createAudit({
    action: `kpi_v2:${entityType}:${toState}`,
    entity_type: entityType,
    entity_id: entityId,
    user_id: actorUserId(req) || undefined,
    ip_address: req.ip,
    metadata: { actorProfileId: actorProfileId(req), fromState, toState, reason: reason || null, idempotencyKey: idempotencyKey || null } as any,
  });
};

const nextApprovalSequence = async (entityType: string, entityId: number) => {
  const rows = await prisma.$queryRaw<Array<{ seq: number }>>(Prisma.sql`
    SELECT COALESCE(MAX(sequence_no), 0) + 1 AS seq
    FROM "kpi_approval_history"
    WHERE entity_type = ${entityType}
      AND entity_id = ${entityId}
  `);
  return Number(rows[0]?.seq || 1);
};

const recordApproval = async (
  req: AuthRequest,
  entityType: string,
  entityId: number,
  fromState: KpiState,
  toState: KpiState,
  comments?: string,
  idempotencyKey?: string
) => {
  const seq = await nextApprovalSequence(entityType, entityId);
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "kpi_approval_history"(
      entity_type, entity_id, from_state, to_state, acted_by_profile_id,
      acted_role, comments, sequence_no, metadata
    )
    VALUES(
      ${entityType},
      ${entityId},
      ${fromState}::"KpiEntityState",
      ${toState}::"KpiEntityState",
      ${actorProfileId(req)},
      ${actorRoleLabel(req)},
      ${comments || null},
      ${seq},
      ${JSON.stringify({ idempotencyKey: idempotencyKey || null, requestId: String(req.headers["x-request-id"] || "") })}::jsonb
    )
  `);
};

const fetchInitiative = async (initiativeId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT i.*, m.direction, m.goal_id
    FROM "kpi_initiatives" i
    INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
    WHERE i.id = ${initiativeId}
    LIMIT 1
  `);
  return rows[0] || null;
};

const fetchParentInitiative = async (parentInitiativeId: number | null | undefined) => {
  if (!parentInitiativeId) return null;
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, level, state, metric_id, due_date, bsc_tag, owner_profile_id, partner_profile_id, manager_profile_id, department_id
    FROM "kpi_initiatives"
    WHERE id = ${parentInitiativeId}
    LIMIT 1
  `);
  return rows[0] || null;
};

const fetchMetricContext = async (metricId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      m.id AS metric_id,
      m.goal_id,
      m.due_date AS metric_due_date,
      g.bsc_tag AS goal_bsc_tag,
      g.due_date AS goal_due_date
    FROM "kpi_metrics" m
    INNER JOIN "kpi_goals" g ON g.id = m.goal_id
    WHERE m.id = ${metricId}
    LIMIT 1
  `);
  return rows[0] || null;
};

const fetchGoalContext = async (goalId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, bsc_tag, due_date, state
    FROM "kpi_goals"
    WHERE id = ${goalId}
    LIMIT 1
  `);
  return rows[0] || null;
};

const fetchManagerPartnerScope = async (managerProfileId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      p.id AS profile_id,
      p.department_id,
      d.partner_profile_id
    FROM "profiles" p
    LEFT JOIN "departments" d ON d.id = p.department_id
    WHERE p.id = ${managerProfileId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    managerProfileId: parseIntSafe(row.profile_id),
    departmentId: parseIntSafe(row.department_id),
    partnerProfileId: parseIntSafe(row.partner_profile_id),
  };
};

const isParentStateEligible = (state: unknown) => {
  const normalized = String(state || "").toLowerCase();
  return normalized === "approved" || normalized === "active";
};

const fetchCycleWindowForGoal = async (goalId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT c.start_at, c.end_at
    FROM "kpi_goals" g
    INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
    INNER JOIN "kpi_cycles" c ON c.id = cv.cycle_id
    WHERE g.id = ${goalId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    startAt: row.start_at ? new Date(row.start_at) : null,
    endAt: row.end_at ? new Date(row.end_at) : null,
  };
};

const fetchCycleWindowForMetric = async (metricId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT c.start_at, c.end_at
    FROM "kpi_metrics" m
    INNER JOIN "kpi_goals" g ON g.id = m.goal_id
    INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
    INNER JOIN "kpi_cycles" c ON c.id = cv.cycle_id
    WHERE m.id = ${metricId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    startAt: row.start_at ? new Date(row.start_at) : null,
    endAt: row.end_at ? new Date(row.end_at) : null,
  };
};

const fetchCycleWindowForInitiative = async (initiativeId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT c.start_at, c.end_at
    FROM "kpi_initiatives" i
    INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
    INNER JOIN "kpi_goals" g ON g.id = m.goal_id
    INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
    INNER JOIN "kpi_cycles" c ON c.id = cv.cycle_id
    WHERE i.id = ${initiativeId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    startAt: row.start_at ? new Date(row.start_at) : null,
    endAt: row.end_at ? new Date(row.end_at) : null,
  };
};

const fetchCycleStateForInitiative = async (initiativeId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT c.state
    FROM "kpi_initiatives" i
    INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
    INNER JOIN "kpi_goals" g ON g.id = m.goal_id
    INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
    INNER JOIN "kpi_cycles" c ON c.id = cv.cycle_id
    WHERE i.id = ${initiativeId}
    LIMIT 1
  `);
  return String(rows[0]?.state || "").toLowerCase();
};

const fetchPartnerProfileIds = async () => {
  const profiles = await prisma.profile.findMany({
    where: {
      status: "active",
      OR: [
        { isPartner: true },
        { role: { is: { name: { equals: "partner", mode: "insensitive" } } } },
        {
          user: {
            is: {
              roles: {
                some: {
                  role: {
                    name: { equals: "partner", mode: "insensitive" },
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  });

  return profiles
    .map((profile) => parseIntSafe(profile.id))
    .filter((id): id is number => Boolean(id));
};

const canSubmit = (req: AuthRequest, i: any) => {
  if (isAdmin(req)) return true;
  if (i.level === "firm") return isHR(req);
  if (i.level === "team") {
    if (isHR(req)) return true;
    const owner = parseIntSafe(i.partner_profile_id) || parseIntSafe(i.owner_profile_id);
    return canOwnTeamLayer(req) && canActAsProfile(req, owner);
  }
  if (i.level === "department") {
    if (isHR(req)) return true;
    const owner = parseIntSafe(i.manager_profile_id) || parseIntSafe(i.owner_profile_id);
    return canManageDepartmentLayer(req) && canActAsProfile(req, owner);
  }
  return false;
};
const canReview = (req: AuthRequest, i: any) => {
  if (isAdmin(req)) return true;
  if (i.level === "firm") return isGMP(req);
  if (i.level === "team") {
    return canManageDepartmentLayer(req) || isHR(req);
  }
  if (i.level === "department") {
    if (isHR(req)) return true;
    const owner = parseIntSafe(i.manager_profile_id) || parseIntSafe(i.owner_profile_id);
    return canManageDepartmentLayer(req) && canActAsProfile(req, owner);
  }
  if (i.level === "employee") {
    if (isHR(req)) return true;
    const managerOwner = parseIntSafe(i.manager_profile_id);
    return canManageDepartmentLayer(req) && canActAsProfile(req, managerOwner);
  }
  return false;
};

const canEditInitiativeEntity = (req: AuthRequest, i: any) => {
  if (isAdmin(req) || isHR(req)) return true;
  const level = String(i.level || "");
  if (level === "team") {
    const owner = parseIntSafe(i.partner_profile_id) || parseIntSafe(i.owner_profile_id);
    return canOwnTeamLayer(req) && canActAsProfile(req, owner);
  }
  if (level === "department") {
    const owner = parseIntSafe(i.manager_profile_id) || parseIntSafe(i.owner_profile_id);
    return canManageDepartmentLayer(req) && canActAsProfile(req, owner);
  }
  if (level === "employee") {
    const owner = parseIntSafe(i.employee_profile_id) || parseIntSafe(i.owner_profile_id);
    return canActAsProfile(req, owner);
  }
  return false;
};

const canActAsProfile = (req: AuthRequest, profileId: number | null | undefined) =>
  isAdmin(req) || (profileId ? actorProfileId(req) === Number(profileId) : false);

const validateInitiativeWeightTotal = async (initiative: any) => {
  if (!initiative) return { ok: false, total: 0 };
  const level = String(initiative.level || "");
  const scopeByMetric = level === "firm";
  const scopeId = scopeByMetric
    ? parseIntSafe(initiative.metric_id)
    : parseIntSafe(initiative.parent_initiative_id);
  if (!scopeId) return { ok: false, total: 0 };

  const rows = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
    SELECT COALESCE(SUM(weight), 0)::double precision AS total
    FROM "kpi_initiatives"
    WHERE level = ${level}::"KpiInitiativeLevel"
      AND state <> 'archived'::"KpiEntityState"
      AND (
        ${scopeByMetric ? Prisma.sql`metric_id = ${scopeId}` : Prisma.sql`parent_initiative_id = ${scopeId}`}
      )
  `);
  const total = toNum(rows[0]?.total, 0);
  const rounded = Number(total.toFixed(2));
  return { ok: Math.abs(rounded - 100) <= 0.01, total: rounded };
};

const syncEvaluationCyclesToKpiCycles = async () => {
  const evalCycles = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, cycle_name, start_date, end_date, status, created_by_profile_id
    FROM "evaluation_cycles"
  `);
  if (!evalCycles.length) return;

  const existingCycles = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT name, start_at, end_at
    FROM "kpi_cycles"
  `);
  const existingKeys = new Set(
    existingCycles
      .map((row) => {
        const startAt = parseDateSafe(row.start_at);
        const endAt = parseDateSafe(row.end_at);
        const name = String(row.name || "").trim();
        if (!name || !startAt || !endAt) return null;
        return kpiCycleKey(name, startAt.toISOString(), endAt.toISOString());
      })
      .filter((key): key is string => Boolean(key))
  );

  for (const row of evalCycles) {
    const name = String(row.cycle_name || "").trim();
    const startAt = parseDateSafe(row.start_date);
    const endAt = parseDateSafe(row.end_date);
    if (!name || !startAt || !endAt || endAt <= startAt) continue;

    const cycleKey = kpiCycleKey(name, startAt.toISOString(), endAt.toISOString());
    if (existingKeys.has(cycleKey)) continue;

    const cadence = cadenceFromWindow(name, startAt, endAt);
    const mappedState = mapEvaluationCycleState(row.status);
    const cadenceSql =
      cadence === "annual" ? Prisma.sql`'annual'::"KpiCadence"` : Prisma.sql`'quarterly'::"KpiCadence"`;
    const stateSql =
      mappedState === "active"
        ? Prisma.sql`'active'::"KpiCycleState"`
        : mappedState === "completed"
          ? Prisma.sql`'completed'::"KpiCycleState"`
          : Prisma.sql`'draft'::"KpiCycleState"`;
    const createdByProfileId = parseIntSafe(row.created_by_profile_id);

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "kpi_cycles"(name, cadence, start_at, end_at, state, created_by_profile_id)
      VALUES(
        ${name},
        ${cadenceSql},
        ${startAt.toISOString()}::timestamptz,
        ${endAt.toISOString()}::timestamptz,
        ${stateSql},
        ${createdByProfileId || null}
      )
    `);
    existingKeys.add(cycleKey);
  }
};

const validateParent = async (metricId: number, level: KpiLevel, parentInitiativeId: number | null) => {
  const expected = EXPECTED_PARENT[level];
  if (!expected) return parentInitiativeId === null;
  if (!parentInitiativeId) return false;
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, level, metric_id
    FROM "kpi_initiatives"
    WHERE id = ${parentInitiativeId}
    LIMIT 1
  `);
  const parent = rows[0];
  return Boolean(parent && String(parent.level) === expected && Number(parent.metric_id) === metricId);
};

router.use(authMiddleware, loadProfile, requireModuleAccess("kpis"));

router.get("/me/scope", async (req: AuthRequest, res) => {
  try {
    const actorId = actorProfileId(req);
    if (!actorId) return res.status(401).json({ error: "Unauthorized" });
    const managerScope = await fetchManagerPartnerScope(actorId);
    return res.json({
      profileId: actorId,
      departmentId: managerScope?.departmentId ?? parseIntSafe(req.profile?.department?.id),
      partnerProfileId: managerScope?.partnerProfileId ?? null,
      hasPartnerAssignment: Boolean(managerScope?.partnerProfileId),
      roleType: isFinance(req)
        ? "finance"
        : isMarketing(req)
          ? "marketing"
          : isManager(req)
            ? "manager"
            : isPartner(req)
              ? "partner"
              : isGMP(req)
                ? "gmp"
                : isHR(req)
                  ? "hr"
                  : "employee",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to load KPI scope" });
  }
});

router.post("/cycles", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can create cycles" });
    const name = String(req.body?.name || "").trim();
    const cadence = String(req.body?.cadence || "").trim().toLowerCase();
    const startAt = parseDateSafe(req.body?.startAt);
    const endAt = parseDateSafe(req.body?.endAt);
    if (!name || !["quarterly", "annual"].includes(cadence)) return res.status(400).json({ error: "name and valid cadence are required" });
    if (!startAt || !endAt || endAt <= startAt) return res.status(400).json({ error: "Invalid startAt/endAt date range" });
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "kpi_cycles"(name, cadence, start_at, end_at, state, created_by_profile_id)
      VALUES(${name}, ${cadence}::"KpiCadence", ${startAt.toISOString()}::timestamptz, ${endAt.toISOString()}::timestamptz, 'draft'::"KpiCycleState", ${actorProfileId(req)})
      RETURNING *
    `);
    return res.status(201).json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to create cycle" });
  }
});

router.get("/cycles", async (req: AuthRequest, res) => {
  try {
    await syncEvaluationCyclesToKpiCycles();

    const state = String(req.query?.state || "").trim().toLowerCase();
    const cadence = String(req.query?.cadence || "").trim().toLowerCase();
    const bscTag = parseBscTag(req.query?.bscTag);

    const cycles = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT c.*
      FROM "kpi_cycles" c
      WHERE (${state ? Prisma.sql`LOWER(c.state::text) = ${state}` : Prisma.sql`TRUE`})
        AND (${cadence ? Prisma.sql`LOWER(c.cadence::text) = ${cadence}` : Prisma.sql`TRUE`})
      ORDER BY c.created_at DESC
      LIMIT 200
    `);

    if (!bscTag) return res.json(cycles);

    const filtered: Array<any> = [];
    for (const cycle of cycles) {
      const hasTag = await prisma.$queryRaw<Array<{ found: boolean }>>(Prisma.sql`
        SELECT EXISTS(
          SELECT 1
          FROM "kpi_cycle_versions" cv
          INNER JOIN "kpi_goals" g ON g.cycle_version_id = cv.id
          WHERE cv.cycle_id = ${cycle.id}
            AND g.bsc_tag = ${bscTag}::"KpiBscPerspective"
        ) AS found
      `);
      if (hasTag[0]?.found) filtered.push(cycle);
    }
    return res.json(filtered);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to list cycles" });
  }
});

router.get("/cycles/:id", async (req: AuthRequest, res) => {
  try {
    const cycleId = parseIntSafe(req.params.id);
    if (!cycleId) return res.status(400).json({ error: "Invalid cycle id" });

    const cycleRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT * FROM "kpi_cycles" WHERE id = ${cycleId} LIMIT 1
    `);
    const cycle = cycleRows[0];
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });

    const versions = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT * FROM "kpi_cycle_versions"
      WHERE cycle_id = ${cycleId}
      ORDER BY version_no DESC
    `);
    const versionIds = versions.map((row) => parseIntSafe(row.id)).filter((id): id is number => Boolean(id));
    const goals = versionIds.length
      ? await prisma.$queryRaw<Array<any>>(Prisma.sql`
          SELECT * FROM "kpi_goals"
          WHERE cycle_version_id IN (${Prisma.join(versionIds)})
          ORDER BY id ASC
        `)
      : [];
    const goalIds = goals.map((row) => parseIntSafe(row.id)).filter((id): id is number => Boolean(id));
    const metrics = goalIds.length
      ? await prisma.$queryRaw<Array<any>>(Prisma.sql`
          SELECT * FROM "kpi_metrics"
          WHERE goal_id IN (${Prisma.join(goalIds)})
          ORDER BY id ASC
        `)
      : [];
    const metricIds = metrics.map((row) => parseIntSafe(row.id)).filter((id): id is number => Boolean(id));
    const initiatives = metricIds.length
      ? await prisma.$queryRaw<Array<any>>(Prisma.sql`
          SELECT * FROM "kpi_initiatives"
          WHERE metric_id IN (${Prisma.join(metricIds)})
          ORDER BY id ASC
        `)
      : [];

    return res.json({ cycle, versions, goals, metrics, initiatives });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to load cycle details" });
  }
});

router.put("/cycles/:id/activate", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) {
      return res.status(403).json({ error: "Only HR/Admin can activate KPI cycles" });
    }
    const cycleId = parseIntSafe(req.params.id);
    if (!cycleId) return res.status(400).json({ error: "Invalid cycle id" });

    const cycleRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, state
      FROM "kpi_cycles"
      WHERE id = ${cycleId}
      LIMIT 1
    `);
    const cycle = cycleRows[0];
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });
    if (String(cycle.state) === "archived") return res.status(409).json({ error: "Archived cycle cannot be activated" });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_cycles"
        SET state = 'active'::"KpiCycleState",
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE id = ${cycleId}
      `);

      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_initiatives"
        SET state = CASE
          WHEN level = 'firm'::"KpiInitiativeLevel" AND state = 'approved'::"KpiEntityState"
            THEN 'active'::"KpiEntityState"
          ELSE state
        END,
        updated_at = NOW(),
        row_version = row_version + 1
        WHERE metric_id IN (
          SELECT m.id
          FROM "kpi_metrics" m
          INNER JOIN "kpi_goals" g ON g.id = m.goal_id
          INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
          WHERE cv.cycle_id = ${cycleId}
        )
      `);
    });

    const partnerIds = await fetchPartnerProfileIds();
    for (const profileId of partnerIds) {
      await notify(req, profileId, "KPI cycle activated", "A KPI cycle is active. Submit Team Initiatives under active Firm Initiatives.", "/kpi-management");
    }

    return res.json({ id: cycleId, state: "active", notifiedPartners: partnerIds.length });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to activate cycle" });
  }
});

router.put("/cycles/:id/archive", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req) || isGMP(req))) {
      return res.status(403).json({ error: "Only HR/Admin/GMP can archive KPI cycles" });
    }
    const cycleId = parseIntSafe(req.params.id);
    if (!cycleId) return res.status(400).json({ error: "Invalid cycle id" });

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, state
      FROM "kpi_cycles"
      WHERE id = ${cycleId}
      LIMIT 1
    `);
    if (!rows[0]) return res.status(404).json({ error: "Cycle not found" });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_cycles"
        SET state = 'archived'::"KpiCycleState",
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE id = ${cycleId}
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_goals"
        SET state = 'archived'::"KpiEntityState",
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE cycle_version_id IN (
          SELECT id FROM "kpi_cycle_versions" WHERE cycle_id = ${cycleId}
        )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_metrics"
        SET state = 'archived'::"KpiEntityState",
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE goal_id IN (
          SELECT g.id
          FROM "kpi_goals" g
          INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
          WHERE cv.cycle_id = ${cycleId}
        )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_initiatives"
        SET state = 'archived'::"KpiEntityState",
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE metric_id IN (
          SELECT m.id
          FROM "kpi_metrics" m
          INNER JOIN "kpi_goals" g ON g.id = m.goal_id
          INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
          WHERE cv.cycle_id = ${cycleId}
        )
      `);
    });

    return res.json({ id: cycleId, state: "archived" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to archive cycle" });
  }
});

router.post("/cycles/:id/versions", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can create versions" });
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const cycleId = parseIntSafe(req.params.id);
    if (!cycleId) return res.status(400).json({ error: "Invalid cycle id" });
    const publish = req.body?.publish === true;
    const existingRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT *
      FROM "kpi_cycle_versions"
      WHERE cycle_id = ${cycleId}
        AND status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY version_no DESC, id DESC
      LIMIT 1
    `);
    const existing = existingRows[0];
    if (existing) {
      if (publish && String(existing.status) !== "published") {
        const promoted = await prisma.$queryRaw<Array<any>>(Prisma.sql`
          UPDATE "kpi_cycle_versions"
          SET status = 'published'::"KpiCycleVersionStatus",
              published_at = NOW(),
              updated_at = NOW(),
              row_version = row_version + 1
          WHERE id = ${Number(existing.id)}
          RETURNING *
        `);
        await logTransition(req, "kpi_cycle_version", Number(existing.id), String(existing.status), "published", undefined, key);
        return res.status(200).json({ ...(promoted[0] || existing), reused: true, promoted: true });
      }
      return res.status(200).json({ ...existing, reused: true });
    }

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "kpi_cycle_versions"(cycle_id, version_no, status, published_at, created_by_profile_id)
      VALUES(${cycleId}, 1, ${publish ? Prisma.sql`'published'::"KpiCycleVersionStatus"` : Prisma.sql`'draft'::"KpiCycleVersionStatus"`}, ${publish ? Prisma.sql`NOW()` : Prisma.sql`NULL`}, ${actorProfileId(req)})
      RETURNING *
    `);
    await logTransition(req, "kpi_cycle_version", Number(rows[0]?.id || 0), "draft", publish ? "published" : "draft", undefined, key);
    return res.status(201).json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to create cycle version" });
  }
});

router.post("/goals", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can create goals" });
    const cycleVersionId = parseIntSafe(req.body?.cycleVersionId);
    const ownerProfileId = parseIntSafe(req.body?.ownerProfileId);
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const bscTag = parseBscTag(req.body?.bscTag);
    const dueDate = parseDateSafe(req.body?.dueDate);
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target);
    const weight = parseNumSafe(req.body?.weight);
    if (!cycleVersionId || !ownerProfileId || !title) return res.status(400).json({ error: "cycleVersionId, ownerProfileId and title are required" });
    if (!bscTag) return res.status(400).json({ error: "bscTag is required" });
    if (baseline === null || target === null || weight === null) return res.status(400).json({ error: "baseline, target and weight are required numbers" });
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "kpi_goals"(cycle_version_id, title, description, owner_profile_id, bsc_tag, due_date, state, baseline, target, actual, weight, percent_complete, rag)
      VALUES(${cycleVersionId}, ${title}, ${description || null}, ${ownerProfileId}, ${bscTag}::"KpiBscPerspective", ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`NULL`}, 'draft'::"KpiEntityState", ${baseline}, ${target}, ${baseline}, ${weight}, 0, 'red'::"KpiRag")
      RETURNING *
    `);
    await createAudit({
      action: "kpi_v2:goal:create",
      entity_type: "kpi_goal",
      entity_id: rows[0]?.id,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorProfileId(req), cycleVersionId } as any,
    });
    return res.status(201).json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to create goal" });
  }
});

router.post("/metrics", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can create metrics" });
    const goalId = parseIntSafe(req.body?.goalId);
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const unit = String(req.body?.unit || "").trim();
    const direction = String(req.body?.direction || "").trim().toLowerCase();
    const aggregationMethod = String(req.body?.aggregationMethod || "").trim();
    const thresholds = req.body?.thresholds || {};
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target);
    const weight = parseNumSafe(req.body?.weight);
    const updateFrequency = String(req.body?.updateFrequency || "").trim().toLowerCase();
    const dueDate = parseDateSafe(req.body?.dueDate);
    if (!goalId || !name || !["higher_better", "lower_better", "milestone"].includes(direction) || !aggregationMethod) return res.status(400).json({ error: "goalId, name, direction and aggregationMethod are required" });
    if (baseline === null || target === null || weight === null) return res.status(400).json({ error: "baseline, target and weight are required numbers" });
    if (updateFrequency && !["weekly", "biweekly", "monthly", "quarterly"].includes(updateFrequency)) return res.status(400).json({ error: "Invalid updateFrequency" });
    const goal = await fetchGoalContext(goalId);
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    const inheritedBscTag = parseBscTag(goal.bsc_tag);
    if (!inheritedBscTag) return res.status(409).json({ error: "Goal must have a valid BSC perspective before adding metrics" });
    if (dueDate && goal.due_date) {
      const goalDueDate = new Date(goal.due_date);
      if (dueDate.getTime() > goalDueDate.getTime()) {
        return res.status(400).json({ error: "Metric dueDate cannot exceed parent Goal dueDate" });
      }
    }
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "kpi_metrics"(goal_id, name, description, bsc_tag, unit, direction, aggregation_method, red_threshold, amber_threshold, green_threshold, state, baseline, target, actual, due_date, weight, percent_complete, rag, update_frequency)
      VALUES(${goalId}, ${name}, ${description || null}, ${inheritedBscTag}::"KpiBscPerspective", ${unit || null}, ${direction}::"KpiDirection", ${aggregationMethod}, ${parseNumSafe(thresholds?.red)}, ${parseNumSafe(thresholds?.amber)}, ${parseNumSafe(thresholds?.green)}, 'draft'::"KpiEntityState", ${baseline}, ${target}, ${baseline}, ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`NULL`}, ${weight}, 0, 'red'::"KpiRag", ${updateFrequency ? Prisma.sql`${updateFrequency}::"KpiUpdateFrequency"` : Prisma.sql`NULL`})
      RETURNING *
    `);
    await createAudit({
      action: "kpi_v2:metric:create",
      entity_type: "kpi_metric",
      entity_id: rows[0]?.id,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorProfileId(req), goalId } as any,
    });
    return res.status(201).json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to create metric" });
  }
});

const createInitiative = (level: KpiLevel) => async (req: AuthRequest, res: any) => {
  try {
    const actorId = actorProfileId(req);
    if (!actorId) return res.status(401).json({ error: "Missing actor profile" });
    if (level === "firm" && !(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can create firm initiatives" });
    if (level === "team" && !(canOwnTeamLayer(req) || isAdmin(req))) return res.status(403).json({ error: "Only Partner/GMP/Admin can create team initiatives" });
    if (level === "department" && !(canManageDepartmentLayer(req) || isAdmin(req))) return res.status(403).json({ error: "Only Manager/Finance/Marketing/Admin can create department initiatives" });
    const metricId = parseIntSafe(req.body?.metricId);
    const parentInitiativeId = parseIntSafe(req.body?.parentInitiativeId);
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const ownerProfileId = parseIntSafe(req.body?.ownerProfileId);
    const partnerProfileId = parseIntSafe(req.body?.partnerProfileId);
    const managerProfileId = parseIntSafe(req.body?.managerProfileId);
    const departmentId = parseIntSafe(req.body?.departmentId);
    const employeeProfileId = parseIntSafe(req.body?.employeeProfileId);
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target);
    const weight = parseNumSafe(req.body?.weight);
    const dueDate = parseDateSafe(req.body?.dueDate);
    const updateFrequency = String(req.body?.updateFrequency || "").trim().toLowerCase();
    const ackRequired = req.body?.ackRequired === true;
    if (!metricId || !title) return res.status(400).json({ error: "metricId and title are required" });
    if (baseline === null || target === null || weight === null) return res.status(400).json({ error: "baseline, target and weight must be valid numbers" });
    if (!["weekly", "biweekly", "monthly", "quarterly"].includes(updateFrequency)) return res.status(400).json({ error: "Invalid updateFrequency" });
    if (level === "team" && !partnerProfileId) return res.status(400).json({ error: "partnerProfileId is required for team initiatives" });
    if (level === "department" && (!managerProfileId || !departmentId)) return res.status(400).json({ error: "managerProfileId and departmentId are required for department initiatives" });
    if (level === "team" && !isAdmin(req) && partnerProfileId !== actorId) return res.status(403).json({ error: "Partners/GMP can only create their own team initiatives" });
    if (level === "department" && !isAdmin(req) && managerProfileId !== actorId) return res.status(403).json({ error: "Department owners can only create their own department initiatives" });
    const metricContext = await fetchMetricContext(metricId);
    if (!metricContext) return res.status(404).json({ error: "Metric not found" });
    const parentOk = await validateParent(metricId, level, parentInitiativeId || null);
    if (!parentOk) return res.status(400).json({ error: "Invalid parent initiative for level" });
    const parent = await fetchParentInitiative(parentInitiativeId || null);
    if (parent && !isParentStateEligible(parent.state)) {
      return res.status(409).json({ error: "A child node can only be created when its parent is Approved or Active" });
    }
    if (parent && dueDate && parent.due_date) {
      const parentDueDate = new Date(parent.due_date);
      if (dueDate.getTime() > parentDueDate.getTime()) {
        return res.status(400).json({ error: "Child dueDate cannot exceed parent dueDate" });
      }
    }
    if (!parent && dueDate) {
      const metricDueDate = metricContext.metric_due_date ? new Date(metricContext.metric_due_date) : null;
      const goalDueDate = metricContext.goal_due_date ? new Date(metricContext.goal_due_date) : null;
      const maxDueDate = metricDueDate && goalDueDate ? (metricDueDate < goalDueDate ? metricDueDate : goalDueDate) : metricDueDate || goalDueDate;
      if (maxDueDate && dueDate.getTime() > maxDueDate.getTime()) {
        return res.status(400).json({ error: "Initiative dueDate cannot exceed parent metric/goal dueDate" });
      }
    }

    let scopedPartnerProfileId = partnerProfileId || null;
    let scopedDepartmentId = departmentId || null;
    let scopedManagerProfileId = managerProfileId || null;
    if (level === "department") {
      const managerScope = await fetchManagerPartnerScope(Number(managerProfileId));
      if (!managerScope?.departmentId) {
        return res.status(409).json({ error: "Department owner must belong to a department" });
      }
      if (Number(departmentId) !== Number(managerScope.departmentId)) {
        return res.status(409).json({ error: "Department Initiative department must match the manager's department" });
      }
      const parentPartnerId = parseIntSafe(parent?.partner_profile_id) || parseIntSafe(parent?.owner_profile_id);
      if (managerScope.partnerProfileId) {
        if (!parentPartnerId) {
          return res.status(409).json({ error: "Parent Team Initiative is missing an owning Partner" });
        }
        if (Number(parentPartnerId) !== Number(managerScope.partnerProfileId)) {
          return res.status(403).json({ error: "Manager can only add Department Initiatives under their assigned Partner's Team Initiatives" });
        }
        scopedPartnerProfileId = managerScope.partnerProfileId;
      } else if (!(isFinance(req) || isMarketing(req) || isHR(req) || isAdmin(req))) {
        return res.status(409).json({ error: "Manager must belong to exactly one department with an assigned Partner" });
      } else {
        // Shared-service departments (e.g. Finance/Marketing) can be cascaded even without a fixed Partner assignment.
        scopedPartnerProfileId = parentPartnerId || null;
      }
      scopedDepartmentId = managerScope.departmentId;
      scopedManagerProfileId = managerScope.managerProfileId;
    }

    const resolvedBscTag = parent ? parseBscTag(parent.bsc_tag) : parseBscTag(metricContext.goal_bsc_tag);
    if (!resolvedBscTag) return res.status(409).json({ error: "Unable to resolve inherited BSC perspective for initiative" });
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "kpi_initiatives"(metric_id, level, parent_initiative_id, title, description, bsc_tag, owner_profile_id, partner_profile_id, manager_profile_id, department_id, employee_profile_id, state, baseline, target, actual, due_date, weight, percent_complete, rag, update_frequency, ack_required)
      VALUES(${metricId}, ${level}::"KpiInitiativeLevel", ${parentInitiativeId || null}, ${title}, ${description || null}, ${resolvedBscTag}::"KpiBscPerspective", ${ownerProfileId || actorId}, ${scopedPartnerProfileId || null}, ${scopedManagerProfileId || null}, ${scopedDepartmentId || null}, ${employeeProfileId || null}, 'draft'::"KpiEntityState", ${baseline}, ${target}, ${baseline}, ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`NULL`}, ${weight}, 0, 'red'::"KpiRag", ${updateFrequency}::"KpiUpdateFrequency", ${level === "employee" ? true : ackRequired})
      RETURNING *
    `);
    await createAudit({
      action: `kpi_v2:initiative:create:${level}`,
      entity_type: "kpi_initiative",
      entity_id: rows[0]?.id,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorId, level, metricId } as any,
    });
    return res.status(201).json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to create initiative" });
  }
};

router.post("/initiatives/firm", createInitiative("firm"));
router.post("/initiatives/team", createInitiative("team"));
router.post("/initiatives/department", createInitiative("department"));
// Compatibility aliases requested by product spec.
router.post("/team-initiatives", createInitiative("team"));
router.post("/dept-initiatives", createInitiative("department"));

router.put("/goals/:id", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can edit goals" });
    const goalId = parseIntSafe(req.params.id);
    if (!goalId) return res.status(400).json({ error: "Invalid goal id" });

    const existingRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, cycle_version_id, state, owner_profile_id
      FROM "kpi_goals"
      WHERE id = ${goalId}
      LIMIT 1
    `);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: "Goal not found" });
    if (String(existing.state) === "archived") return res.status(409).json({ error: "Archived goals cannot be edited" });

    const ownerProfileId = parseIntSafe(req.body?.ownerProfileId) || parseIntSafe(existing.owner_profile_id);
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const bscTag = parseBscTag(req.body?.bscTag);
    const dueDate = parseDateSafe(req.body?.dueDate);
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target);
    const weight = parseNumSafe(req.body?.weight);

    if (!ownerProfileId || !title) return res.status(400).json({ error: "ownerProfileId and title are required" });
    if (!bscTag) return res.status(400).json({ error: "bscTag is required" });
    if (baseline === null || target === null || weight === null) {
      return res.status(400).json({ error: "baseline, target and weight are required numbers" });
    }

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      UPDATE "kpi_goals"
      SET title = ${title},
          description = ${description || null},
          owner_profile_id = ${ownerProfileId},
          bsc_tag = ${bscTag}::"KpiBscPerspective",
          due_date = ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`NULL`},
          baseline = ${baseline},
          target = ${target},
          weight = ${weight},
          updated_at = NOW(),
          row_version = row_version + 1
      WHERE id = ${goalId}
      RETURNING *
    `);

    await createAudit({
      action: "kpi_v2:goal:update",
      entity_type: "kpi_goal",
      entity_id: goalId,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorProfileId(req) } as any,
    });

    return res.json(rows[0] || {});
  } catch (e: any) {
    if (String(e?.code) === "23505") return res.status(409).json({ error: "A goal with the same title already exists in this cycle version" });
    return res.status(500).json({ error: e?.message || "Failed to update goal" });
  }
});

router.put("/metrics/:id", async (req: AuthRequest, res) => {
  try {
    if (!(isHR(req) || isAdmin(req))) return res.status(403).json({ error: "Only HR/Admin can edit metrics" });
    const metricId = parseIntSafe(req.params.id);
    if (!metricId) return res.status(400).json({ error: "Invalid metric id" });

    const existingRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, goal_id, state, direction, aggregation_method, update_frequency
      FROM "kpi_metrics"
      WHERE id = ${metricId}
      LIMIT 1
    `);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: "Metric not found" });
    if (String(existing.state) === "archived") return res.status(409).json({ error: "Archived metrics cannot be edited" });
    const goal = await fetchGoalContext(Number(existing.goal_id));
    if (!goal) return res.status(409).json({ error: "Parent goal for metric is missing" });
    const inheritedBscTag = parseBscTag(goal.bsc_tag);
    if (!inheritedBscTag) return res.status(409).json({ error: "Parent goal is missing a valid BSC perspective" });

    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const unit = String(req.body?.unit || "").trim();
    const direction = String(req.body?.direction || existing.direction || "").trim().toLowerCase();
    const aggregationMethod = String(req.body?.aggregationMethod || existing.aggregation_method || "").trim();
    const thresholds = req.body?.thresholds || {};
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target);
    const weight = parseNumSafe(req.body?.weight);
    const updateFrequency = String(req.body?.updateFrequency || existing.update_frequency || "").trim().toLowerCase();
    const dueDate = parseDateSafe(req.body?.dueDate);

    if (!name || !["higher_better", "lower_better", "milestone"].includes(direction) || !aggregationMethod) {
      return res.status(400).json({ error: "name, direction and aggregationMethod are required" });
    }
    if (baseline === null || target === null || weight === null) return res.status(400).json({ error: "baseline, target and weight are required numbers" });
    if (updateFrequency && !["weekly", "biweekly", "monthly", "quarterly"].includes(updateFrequency)) {
      return res.status(400).json({ error: "Invalid updateFrequency" });
    }
    if (dueDate && goal.due_date) {
      const goalDueDate = new Date(goal.due_date);
      if (dueDate.getTime() > goalDueDate.getTime()) {
        return res.status(400).json({ error: "Metric dueDate cannot exceed parent Goal dueDate" });
      }
    }

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      UPDATE "kpi_metrics"
      SET name = ${name},
          description = ${description || null},
          bsc_tag = ${inheritedBscTag}::"KpiBscPerspective",
          unit = ${unit || null},
          direction = ${direction}::"KpiDirection",
          aggregation_method = ${aggregationMethod},
          red_threshold = ${parseNumSafe(thresholds?.red)},
          amber_threshold = ${parseNumSafe(thresholds?.amber)},
          green_threshold = ${parseNumSafe(thresholds?.green)},
          baseline = ${baseline},
          target = ${target},
          due_date = ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`NULL`},
          weight = ${weight},
          update_frequency = ${updateFrequency ? Prisma.sql`${updateFrequency}::"KpiUpdateFrequency"` : Prisma.sql`NULL`},
          updated_at = NOW(),
          row_version = row_version + 1
      WHERE id = ${metricId}
      RETURNING *
    `);

    await createAudit({
      action: "kpi_v2:metric:update",
      entity_type: "kpi_metric",
      entity_id: metricId,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorProfileId(req) } as any,
    });

    await recomputeMetric(metricId);
    return res.json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to update metric" });
  }
});

router.put("/initiatives/:id", async (req: AuthRequest, res) => {
  try {
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (!canEditInitiativeEntity(req, initiative)) return res.status(403).json({ error: "Not allowed to edit this initiative" });
    if (["archived", "completed"].includes(String(initiative.state))) {
      return res.status(409).json({ error: "Archived or completed initiatives cannot be edited" });
    }

    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target);
    const weight = parseNumSafe(req.body?.weight);
    const dueDate = parseDateSafe(req.body?.dueDate);
    const updateFrequency = String(req.body?.updateFrequency || initiative.update_frequency || "").trim().toLowerCase();

    if (!title) return res.status(400).json({ error: "title is required" });
    if (baseline === null || target === null || weight === null) {
      return res.status(400).json({ error: "baseline, target and weight are required numbers" });
    }
    if (!["weekly", "biweekly", "monthly", "quarterly"].includes(updateFrequency)) {
      return res.status(400).json({ error: "Invalid updateFrequency" });
    }

    const parent = await fetchParentInitiative(parseIntSafe(initiative.parent_initiative_id));
    if (parent && dueDate && parent.due_date) {
      const parentDueDate = new Date(parent.due_date);
      if (dueDate.getTime() > parentDueDate.getTime()) {
        return res.status(400).json({ error: "Child dueDate cannot exceed parent dueDate" });
      }
    }
    const metricContext = await fetchMetricContext(Number(initiative.metric_id));
    let inheritedBscTag = parent ? parseBscTag(parent.bsc_tag) : parseBscTag(metricContext?.goal_bsc_tag);
    if (!inheritedBscTag) inheritedBscTag = parseBscTag(initiative.bsc_tag);
    if (!inheritedBscTag) return res.status(409).json({ error: "Unable to resolve inherited BSC perspective for initiative" });
    if (!parent && dueDate) {
      const metricDueDate = metricContext?.metric_due_date ? new Date(metricContext.metric_due_date) : null;
      const goalDueDate = metricContext?.goal_due_date ? new Date(metricContext.goal_due_date) : null;
      const maxDueDate = metricDueDate && goalDueDate ? (metricDueDate < goalDueDate ? metricDueDate : goalDueDate) : metricDueDate || goalDueDate;
      if (maxDueDate && dueDate.getTime() > maxDueDate.getTime()) {
        return res.status(400).json({ error: "Initiative dueDate cannot exceed parent metric/goal dueDate" });
      }
    }

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      UPDATE "kpi_initiatives"
      SET title = ${title},
          description = ${description || null},
          bsc_tag = ${inheritedBscTag}::"KpiBscPerspective",
          baseline = ${baseline},
          target = ${target},
          due_date = ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`NULL`},
          weight = ${weight},
          state = CASE
            WHEN state = 'rejected'::"KpiEntityState" THEN 'draft'::"KpiEntityState"
            ELSE state
          END,
          update_frequency = ${updateFrequency}::"KpiUpdateFrequency",
          updated_at = NOW(),
          row_version = row_version + 1
      WHERE id = ${initiativeId}
      RETURNING *
    `);

    await createAudit({
      action: "kpi_v2:initiative:update",
      entity_type: "kpi_initiative",
      entity_id: initiativeId,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorProfileId(req), level: initiative.level } as any,
    });

    await recomputeInitiativeUpTree(initiativeId);
    return res.json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to update initiative" });
  }
});

const recomputeGoal = async (goalId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT actual, percent_complete, weight
    FROM "kpi_metrics"
    WHERE goal_id = ${goalId}
      AND state <> 'archived'::"KpiEntityState"
  `);
  const actual = rows.length
    ? weighted(rows, (r) => toNum(r.actual), (r) => toNum(r.weight, 1))
    : 0;
  const pct = rows.length
    ? weighted(rows, (r) => toNum(r.percent_complete), (r) => toNum(r.weight, 1))
    : 0;
  const cycleWindow = await fetchCycleWindowForGoal(goalId);
  const rag = ragFromPct(pct, cycleWindow?.startAt, cycleWindow?.endAt);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "kpi_goals"
    SET actual = ${actual},
        percent_complete = ${pct},
        rag = ${rag}::"KpiRag",
        last_updated_at = NOW(),
        updated_at = NOW(),
        row_version = row_version + 1
    WHERE id = ${goalId}
  `);
  return { percentComplete: pct, rag };
};

const recomputeMetric = async (metricId: number) => {
  const metricRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id, goal_id, direction, baseline, target, actual
    FROM "kpi_metrics"
    WHERE id = ${metricId}
    LIMIT 1
  `);
  const metric = metricRows[0];
  if (!metric) return null;
  const firmRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT actual, percent_complete, weight
    FROM "kpi_initiatives"
    WHERE metric_id = ${metricId}
      AND level = 'firm'::"KpiInitiativeLevel"
      AND state <> 'archived'::"KpiEntityState"
  `);
  const actual = firmRows.length
    ? weighted(firmRows, (r) => toNum(r.actual), (r) => toNum(r.weight, 1))
    : toNum(metric.actual);
  const pct = firmRows.length
    ? weighted(firmRows, (r) => toNum(r.percent_complete), (r) => toNum(r.weight, 1))
    : leafPct(
        String(metric.direction) as Direction,
        toNum(metric.baseline),
        toNum(metric.target),
        toNum(metric.actual)
      );
  const cycleWindow = await fetchCycleWindowForMetric(metricId);
  const rag = ragFromPct(pct, cycleWindow?.startAt, cycleWindow?.endAt);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "kpi_metrics"
    SET actual = ${actual},
        percent_complete = ${pct},
        rag = ${rag}::"KpiRag",
        last_updated_at = NOW(),
        updated_at = NOW(),
        row_version = row_version + 1
    WHERE id = ${metricId}
  `);
  await recomputeGoal(Number(metric.goal_id));
  return { percentComplete: pct, rag };
};

const recomputeInitiativeUpTree = async (initiativeId: number): Promise<void> => {
  const initiative = await fetchInitiative(initiativeId);
  if (!initiative) return;
  const children = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT actual, percent_complete, weight
    FROM "kpi_initiatives"
    WHERE parent_initiative_id = ${initiativeId}
      AND state <> 'archived'::"KpiEntityState"
  `);
  const actual = children.length
    ? weighted(children, (r) => toNum(r.actual), (r) => toNum(r.weight, 1))
    : toNum(initiative.actual);
  const pct = children.length
    ? weighted(children, (r) => toNum(r.percent_complete), (r) => toNum(r.weight, 1))
    : leafPct(
        String(initiative.direction) as Direction,
        toNum(initiative.baseline),
        toNum(initiative.target),
        toNum(initiative.actual)
      );
  const cycleWindow = await fetchCycleWindowForInitiative(initiativeId);
  const rag = ragFromPct(pct, cycleWindow?.startAt, cycleWindow?.endAt);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "kpi_initiatives"
    SET actual = ${actual},
        percent_complete = ${pct},
        rag = ${rag}::"KpiRag",
        last_updated_at = NOW(),
        updated_at = NOW(),
        row_version = row_version + 1
    WHERE id = ${initiativeId}
  `);
  if (initiative.parent_initiative_id) {
    await recomputeInitiativeUpTree(Number(initiative.parent_initiative_id));
  } else {
    await recomputeMetric(Number(initiative.metric_id));
  }
};

const getRollup = async (initiativeId: number) => {
  const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
    SELECT
      i.percent_complete AS initiative_percent_complete,
      i.rag AS initiative_rag,
      m.percent_complete AS metric_percent_complete,
      m.rag AS metric_rag,
      g.percent_complete AS goal_percent_complete,
      g.rag AS goal_rag
    FROM "kpi_initiatives" i
    INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
    INNER JOIN "kpi_goals" g ON g.id = m.goal_id
    WHERE i.id = ${initiativeId}
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    initiative: { percentComplete: toNum(row.initiative_percent_complete), rag: row.initiative_rag },
    metric: { percentComplete: toNum(row.metric_percent_complete), rag: row.metric_rag },
    goal: { percentComplete: toNum(row.goal_percent_complete), rag: row.goal_rag },
  };
};

router.post("/initiatives/:id/submit", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    const existing = await findIdempotentTransition("kpi_initiative", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: existing.to_status, idempotent: true });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (!canSubmit(req, initiative)) return res.status(403).json({ error: "Not allowed to submit this initiative" });
    const weightCheck = await validateInitiativeWeightTotal(initiative);
    if (!weightCheck.ok) {
      return res.status(409).json({ error: `Weights must sum to 100%. Current total: ${weightCheck.total.toFixed(2)}%` });
    }
    const parent = await fetchParentInitiative(parseIntSafe(initiative.parent_initiative_id));
    if (initiative.level === "team" && parent && String(parent.state) !== "active") {
      return res.status(409).json({ error: "Team Initiatives can only be submitted when parent Firm Initiative is active" });
    }
    if (initiative.level === "department" && parent && String(parent.state) !== "approved") {
      return res.status(409).json({ error: "Department Initiatives can only be submitted when parent Team Initiative is approved" });
    }
    const fromState = String(initiative.state) as KpiState;
    const toState: KpiState = "submitted";
    if (!allowedTransition(fromState, toState)) return res.status(409).json({ error: `Invalid transition ${fromState} -> ${toState}` });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives" SET state = 'submitted'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_initiative", initiativeId, fromState, toState, undefined, key);
    await recordApproval(req, "initiative", initiativeId, fromState, toState, undefined, key);
    if (initiative.level === "firm") {
      const partnerIds = await fetchPartnerProfileIds();
      for (const profileId of partnerIds) {
        await notify(req, profileId, "Firm initiative submitted", `A firm initiative "${initiative.title}" needs team inputs.`, "/kpi-management");
      }
    }
    if (initiative.level === "team" && initiative.manager_profile_id) {
      await notify(req, Number(initiative.manager_profile_id), "Team initiative submitted", `Team initiative "${initiative.title}" awaits manager review.`, "/kpi-management");
    }
    return res.json({ id: initiativeId, state: toState });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to submit initiative" });
  }
});

router.post("/initiatives/:id/approve", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    const existing = await findIdempotentTransition("kpi_initiative", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: existing.to_status, idempotent: true });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (!canReview(req, initiative)) return res.status(403).json({ error: "Not allowed to approve this initiative" });
    const fromState = String(initiative.state) as KpiState;
    const toState: KpiState = "approved";
    if (!allowedTransition(fromState, toState)) return res.status(409).json({ error: `Invalid transition ${fromState} -> ${toState}` });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives" SET state = 'approved'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_initiative", initiativeId, fromState, toState, undefined, key);
    await recordApproval(req, "initiative", initiativeId, fromState, toState, undefined, key);
    let finalState: KpiState = toState;
    if (initiative.level === "firm") {
      const cycleState = await fetchCycleStateForInitiative(initiativeId);
      if (cycleState === "active") {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE "kpi_initiatives"
          SET state = 'active'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
          WHERE id = ${initiativeId}
            AND state = 'approved'::"KpiEntityState"
        `);
        await logTransition(req, "kpi_initiative", initiativeId, "approved", "active", "Auto-activated because cycle is active", key);
        await recordApproval(req, "initiative", initiativeId, "approved", "active", "Auto-activated because cycle is active", key);
        finalState = "active";
      }
    }
    return res.json({ id: initiativeId, state: finalState });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to approve initiative" });
  }
});

router.post("/initiatives/:id/reject", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    if (!reason) return res.status(400).json({ error: "reason is required" });
    if (reason.length < 20) return res.status(400).json({ error: "reason must be at least 20 characters" });
    const existing = await findIdempotentTransition("kpi_initiative", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: existing.to_status, idempotent: true });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (!canReview(req, initiative)) return res.status(403).json({ error: "Not allowed to reject this initiative" });
    const fromState = String(initiative.state) as KpiState;
    const toState: KpiState = "rejected";
    if (!allowedTransition(fromState, toState)) return res.status(409).json({ error: `Invalid transition ${fromState} -> ${toState}` });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives" SET state = 'rejected'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_initiative", initiativeId, fromState, toState, reason, key);
    await recordApproval(req, "initiative", initiativeId, fromState, toState, reason, key);
    if (initiative.owner_profile_id) {
      await notify(req, Number(initiative.owner_profile_id), "Initiative rejected", `Initiative "${initiative.title}" was rejected: ${reason}`, "/kpi-management");
    }
    return res.json({ id: initiativeId, state: toState });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to reject initiative" });
  }
});

router.post("/initiatives/:id/cascade", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    const existing = await findIdempotentTransition("kpi_initiative_cascade", initiativeId, key);
    if (existing) return res.json({ createdCount: 0, idempotent: true });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (!(isAdmin(req) || canManageDepartmentLayer(req) || isHR(req))) return res.status(403).json({ error: "Not allowed to cascade initiatives" });
    if (initiative.level !== "department") return res.status(400).json({ error: "Cascade supports department -> employee only" });
    if (!["approved", "active"].includes(String(initiative.state))) return res.status(409).json({ error: "Department initiative must be approved or active before cascade" });
    if (!initiative.department_id) return res.status(400).json({ error: "Department initiative has no departmentId" });
    const employees = await prisma.profile.findMany({
      where: {
        departmentId: Number(initiative.department_id),
        status: "active",
      },
      select: { id: true },
    });
    const existingChildren = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT id, employee_profile_id
      FROM "kpi_initiatives"
      WHERE parent_initiative_id = ${initiativeId}
        AND level = 'employee'::"KpiInitiativeLevel"
        AND state <> 'archived'::"KpiEntityState"
    `);
    const existingEmployeeIds = new Set(
      existingChildren.map((c) => parseIntSafe(c.employee_profile_id)).filter((id): id is number => Boolean(id))
    );
    const toCreate = employees
      .map((e) => parseIntSafe(e.id))
      .filter((id): id is number => Boolean(id))
      .filter((id) => !existingEmployeeIds.has(id));
    const total = existingChildren.length + toCreate.length;
    const distributedWeight = total > 0 ? Number((100 / total).toFixed(2)) : 0;
    await prisma.$transaction(async (tx) => {
      if (existingChildren.length) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "kpi_initiatives"
          SET weight = ${distributedWeight}, updated_at = NOW(), row_version = row_version + 1
          WHERE parent_initiative_id = ${initiativeId}
            AND level = 'employee'::"KpiInitiativeLevel"
            AND state <> 'archived'::"KpiEntityState"
        `);
      }
      for (const employeeId of toCreate) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "kpi_initiatives"(metric_id, level, parent_initiative_id, title, description, bsc_tag, owner_profile_id, partner_profile_id, manager_profile_id, department_id, employee_profile_id, state, baseline, target, actual, due_date, weight, percent_complete, rag, update_frequency, ack_required)
          VALUES(${initiative.metric_id}, 'employee'::"KpiInitiativeLevel", ${initiativeId}, ${initiative.title}, ${initiative.description || null}, ${initiative.bsc_tag || null}, ${employeeId}, ${initiative.partner_profile_id || null}, ${initiative.manager_profile_id || null}, ${initiative.department_id}, ${employeeId}, 'submitted'::"KpiEntityState", ${toNum(initiative.baseline)}, ${toNum(initiative.target)}, ${toNum(initiative.baseline)}, ${initiative.due_date || null}, ${distributedWeight}, 0, 'red'::"KpiRag", ${initiative.update_frequency}::"KpiUpdateFrequency", true)
        `);
      }
    });
    for (const employeeId of toCreate) {
      await notify(req, employeeId, "New KPI initiative assigned", `You have been assigned "${initiative.title}".`, "/kpi-management");
    }
    await logTransition(req, "kpi_initiative_cascade", initiativeId, String(initiative.state), "submitted", `Created ${toCreate.length} employee initiatives`, key);
    await recomputeInitiativeUpTree(initiativeId);
    return res.json({ createdCount: toCreate.length });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to cascade initiatives" });
  }
});

router.post("/employee-initiatives/:id/acknowledge", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    const existing = await findIdempotentTransition("kpi_employee_ack", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: "active", idempotent: true });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (initiative.level !== "employee") return res.status(400).json({ error: "Only employee initiatives can be acknowledged" });
    if (!canActAsProfile(req, parseIntSafe(initiative.employee_profile_id))) return res.status(403).json({ error: "Not allowed to acknowledge this initiative" });
    const fromState = String(initiative.state) as KpiState;
    const toState: KpiState = "active";
    if (!allowedTransition(fromState, toState) && fromState !== "active") return res.status(409).json({ error: `Invalid transition ${fromState} -> ${toState}` });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives"
      SET acknowledged_at = NOW(), state = 'active'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_employee_ack", initiativeId, fromState, "active", undefined, key);
    return res.json({ id: initiativeId, state: "active" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to acknowledge initiative" });
  }
});

router.post("/employee-initiatives/:id/progress", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    const periodStart = parseDateSafe(req.body?.periodStart);
    const periodEnd = parseDateSafe(req.body?.periodEnd);
    const actual = parseNumSafe(req.body?.actual);
    const note = String(req.body?.note || "").trim();
    const evidenceUrls = Array.isArray(req.body?.evidenceUrls)
      ? req.body.evidenceUrls.map((x: unknown) => String(x)).filter(Boolean)
      : [];
    if (!periodStart || !periodEnd || periodEnd <= periodStart) return res.status(400).json({ error: "Invalid periodStart/periodEnd" });
    if (actual === null) return res.status(400).json({ error: "actual must be a valid number" });
    const existing = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT initiative_id, period_start, period_end, actual
      FROM "kpi_progress_updates"
      WHERE idempotency_key = ${key}
      LIMIT 1
    `);
    if (existing[0]) {
      const rollup = await getRollup(Number(existing[0].initiative_id));
      return res.json({ initiativeId: Number(existing[0].initiative_id), actual: toNum(existing[0].actual), periodStart: existing[0].period_start, periodEnd: existing[0].period_end, rollup, idempotent: true });
    }
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (initiative.level !== "employee") return res.status(400).json({ error: "Progress updates are only supported for employee initiatives" });
    if (!canActAsProfile(req, parseIntSafe(initiative.employee_profile_id))) return res.status(403).json({ error: "Not allowed to update this initiative" });
    if (initiative.ack_required && !initiative.acknowledged_at) return res.status(409).json({ error: "Employee must acknowledge initiative before progress updates" });
    const cycleWindow = await fetchCycleWindowForInitiative(initiativeId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "kpi_progress_updates"(initiative_id, period_start, period_end, actual, note, evidence_urls, updated_by_profile_id, source, idempotency_key)
        VALUES(${initiativeId}, ${periodStart.toISOString()}::timestamptz, ${periodEnd.toISOString()}::timestamptz, ${actual}, ${note || null}, ${evidenceUrls}::text[], ${actorProfileId(req)}, 'api'::"KpiProgressSource", ${key})
      `);
      const pct = leafPct(String(initiative.direction) as Direction, toNum(initiative.baseline), toNum(initiative.target), actual);
      const rag = ragFromPct(pct, cycleWindow?.startAt, cycleWindow?.endAt);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_initiatives"
        SET actual = ${actual},
            percent_complete = ${pct},
            rag = ${rag}::"KpiRag",
            state = CASE WHEN state IN ('submitted'::"KpiEntityState", 'approved'::"KpiEntityState") THEN 'active'::"KpiEntityState" ELSE state END,
            last_updated_at = NOW(),
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE id = ${initiativeId}
      `);
    });
    await recomputeInitiativeUpTree(initiativeId);
    if (String(initiative.state) !== "active") {
      await logTransition(req, "kpi_initiative", initiativeId, String(initiative.state), "active", "Progress update activated initiative", key);
    }
    const rollup = await getRollup(initiativeId);
    return res.json({ initiativeId, actual, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), rollup });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to save progress update" });
  }
});

router.post("/initiatives/:id/reassign", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid initiative id" });
    if (!(isAdmin(req) || isHR(req) || isManager(req))) return res.status(403).json({ error: "Not allowed to reassign initiatives" });
    const toProfileId = parseIntSafe(req.body?.toProfileId);
    const reason = String(req.body?.reason || "").trim();
    const effectiveAt = parseDateSafe(req.body?.effectiveAt);
    if (!toProfileId || !reason || !effectiveAt) return res.status(400).json({ error: "toProfileId, reason and effectiveAt are required" });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    const fromProfileId = parseIntSafe(initiative.owner_profile_id);
    await prisma.$transaction(async (tx) => {
      if (initiative.level === "team") {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, partner_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      } else if (initiative.level === "department") {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, manager_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      } else if (initiative.level === "employee") {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, employee_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      } else {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "kpi_reassignments"(initiative_id, from_profile_id, to_profile_id, reason, effective_at, approved_by_profile_id)
        VALUES(${initiativeId}, ${fromProfileId || null}, ${toProfileId}, ${reason}, ${effectiveAt.toISOString()}::timestamptz, ${actorProfileId(req)})
      `);
    });
    await logTransition(req, "kpi_initiative_reassign", initiativeId, String(initiative.state), String(initiative.state), reason, key);
    if (fromProfileId) await notify(req, fromProfileId, "KPI initiative reassigned", `Initiative "${initiative.title}" was reassigned.`, "/kpi-management");
    await notify(req, toProfileId, "KPI initiative assigned", `You have been assigned "${initiative.title}".`, "/kpi-management");
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT * FROM "kpi_initiatives" WHERE id = ${initiativeId} LIMIT 1
    `);
    return res.json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to reassign initiative" });
  }
});

router.get("/team-initiatives/by-partner/:partnerId", async (req: AuthRequest, res) => {
  try {
    const partnerId = parseIntSafe(req.params.partnerId);
    if (!partnerId) return res.status(400).json({ error: "Invalid partnerId" });
    const actorId = actorProfileId(req);
    if (!actorId) return res.status(401).json({ error: "Unauthorized" });
    if (!(isAdmin(req) || isHR(req) || isGMP(req) || isPartner(req) || isManager(req))) {
      return res.status(403).json({ error: "Not allowed to view team initiatives" });
    }
    if (isPartner(req) && !isAdmin(req) && !isHR(req) && !isGMP(req) && actorId !== partnerId) {
      return res.status(403).json({ error: "Partners can only view their own initiatives" });
    }
    if (isManager(req) && !isAdmin(req) && !isHR(req) && !isGMP(req)) {
      const managerScope = await fetchManagerPartnerScope(actorId);
      if (!managerScope?.partnerProfileId || Number(managerScope.partnerProfileId) !== Number(partnerId)) {
        return res.status(403).json({ error: "Managers can only view Team Initiatives for their assigned Partner" });
      }
    }

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT *
      FROM "kpi_initiatives"
      WHERE level = 'team'::"KpiInitiativeLevel"
        AND partner_profile_id = ${partnerId}
        AND state IN ('approved'::"KpiEntityState", 'active'::"KpiEntityState")
      ORDER BY updated_at DESC
    `);
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch team initiatives" });
  }
});

router.put("/team-initiatives/:id/submit", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid team initiative id" });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (initiative.level !== "team") return res.status(400).json({ error: "Endpoint supports Team Initiatives only" });
    const parent = await fetchParentInitiative(parseIntSafe(initiative.parent_initiative_id));
    if (!parent || String(parent.state) !== "active") {
      return res.status(409).json({ error: "Team Initiative can only be submitted when parent Firm Initiative is active" });
    }
    const weightCheck = await validateInitiativeWeightTotal(initiative);
    if (!weightCheck.ok) {
      return res.status(409).json({ error: `Weights must sum to 100%. Current total: ${weightCheck.total.toFixed(2)}%` });
    }
    const existing = await findIdempotentTransition("kpi_initiative", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: existing.to_status, idempotent: true });
    if (!canSubmit(req, initiative)) return res.status(403).json({ error: "Not allowed to submit this initiative" });
    const fromState = String(initiative.state) as KpiState;
    const toState: KpiState = "submitted";
    if (!allowedTransition(fromState, toState)) return res.status(409).json({ error: `Invalid transition ${fromState} -> ${toState}` });
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives"
      SET state = 'submitted'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_initiative", initiativeId, fromState, toState, undefined, key);
    await recordApproval(req, "initiative", initiativeId, fromState, toState, undefined, key);
    if (initiative.manager_profile_id) {
      await notify(req, Number(initiative.manager_profile_id), "Team initiative submitted", `Team initiative "${initiative.title}" awaits manager review.`, "/kpi-management");
    }
    return res.json({ id: initiativeId, state: toState });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to submit team initiative" });
  }
});

router.put("/dept-initiatives/:id/approve", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid department initiative id" });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (initiative.level !== "department") return res.status(400).json({ error: "Endpoint supports Department Initiatives only" });
    const parent = await fetchParentInitiative(parseIntSafe(initiative.parent_initiative_id));
    if (!parent || String(parent.state) !== "approved") {
      return res.status(409).json({ error: "Department Initiative can only be approved when parent Team Initiative is approved" });
    }
    const weightCheck = await validateInitiativeWeightTotal(initiative);
    if (!weightCheck.ok) {
      return res.status(409).json({ error: `Weights must sum to 100%. Current total: ${weightCheck.total.toFixed(2)}%` });
    }
    const existing = await findIdempotentTransition("kpi_initiative", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: existing.to_status, idempotent: true });
    if (!canReview(req, initiative)) return res.status(403).json({ error: "Not allowed to approve this initiative" });

    const fromState = String(initiative.state) as KpiState;
    const toState: KpiState = "approved";
    if (!allowedTransition(fromState, toState)) return res.status(409).json({ error: `Invalid transition ${fromState} -> ${toState}` });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives"
      SET state = 'approved'::"KpiEntityState", updated_at = NOW(), row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_initiative", initiativeId, fromState, toState, undefined, key);
    await recordApproval(req, "initiative", initiativeId, fromState, toState, undefined, key);

    let createdCount = 0;
    const shouldAutoCascade = req.body?.autoCascade === true;
    if (shouldAutoCascade) {
      const cascadeKey = `${key}:cascade`;
      const existingCascade = await findIdempotentTransition("kpi_initiative_cascade", initiativeId, cascadeKey);
      if (!existingCascade) {
      const employees = await prisma.profile.findMany({
        where: {
          departmentId: Number(initiative.department_id),
          status: "active",
        },
        select: { id: true },
      });
      const existingChildren = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT id, employee_profile_id
        FROM "kpi_initiatives"
        WHERE parent_initiative_id = ${initiativeId}
          AND level = 'employee'::"KpiInitiativeLevel"
          AND state <> 'archived'::"KpiEntityState"
      `);
      const existingEmployeeIds = new Set(
        existingChildren.map((c) => parseIntSafe(c.employee_profile_id)).filter((id): id is number => Boolean(id))
      );
      const toCreate = employees
        .map((e) => parseIntSafe(e.id))
        .filter((id): id is number => Boolean(id))
        .filter((id) => !existingEmployeeIds.has(id));
      createdCount = toCreate.length;
      const total = existingChildren.length + toCreate.length;
      const distributedWeight = total > 0 ? Number((100 / total).toFixed(2)) : 0;
      await prisma.$transaction(async (tx) => {
        if (existingChildren.length) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "kpi_initiatives"
            SET weight = ${distributedWeight}, updated_at = NOW(), row_version = row_version + 1
            WHERE parent_initiative_id = ${initiativeId}
              AND level = 'employee'::"KpiInitiativeLevel"
              AND state <> 'archived'::"KpiEntityState"
          `);
        }
        for (const employeeId of toCreate) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "kpi_initiatives"(metric_id, level, parent_initiative_id, title, description, bsc_tag, owner_profile_id, partner_profile_id, manager_profile_id, department_id, employee_profile_id, state, baseline, target, actual, due_date, weight, percent_complete, rag, update_frequency, ack_required)
            VALUES(${initiative.metric_id}, 'employee'::"KpiInitiativeLevel", ${initiativeId}, ${initiative.title}, ${initiative.description || null}, ${initiative.bsc_tag || null}, ${employeeId}, ${initiative.partner_profile_id || null}, ${initiative.manager_profile_id || null}, ${initiative.department_id}, ${employeeId}, 'submitted'::"KpiEntityState", ${toNum(initiative.baseline)}, ${toNum(initiative.target)}, ${toNum(initiative.baseline)}, ${initiative.due_date || null}, ${distributedWeight}, 0, 'red'::"KpiRag", ${initiative.update_frequency}::"KpiUpdateFrequency", true)
          `);
        }
      });
      for (const employeeId of toCreate) {
        await notify(req, employeeId, "New KPI assigned", `You have a new KPI "${initiative.title}". Please acknowledge it.`, "/kpi-management");
      }
      await logTransition(req, "kpi_initiative_cascade", initiativeId, "approved", "submitted", `Created ${toCreate.length} employee initiatives`, cascadeKey);
      }
    }
    await recomputeInitiativeUpTree(initiativeId);
    return res.json({ id: initiativeId, state: toState, autoCascade: shouldAutoCascade, createdEmployeeKpis: createdCount });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to approve department initiative" });
  }
});

router.post("/employee-kpis", async (req: AuthRequest, res) => {
  try {
    if (!(isAdmin(req) || isHR(req) || canManageDepartmentLayer(req))) {
      return res.status(403).json({ error: "Only Manager/Finance/Marketing/HR/Admin can assign employee KPIs" });
    }
    const actorId = actorProfileId(req);
    if (!actorId) return res.status(401).json({ error: "Missing actor profile" });

    const deptInitiativeId = parseIntSafe(
      req.body?.deptInitiativeId || req.body?.departmentInitiativeId || req.body?.parentInitiativeId
    );
    const employeeProfileId = parseIntSafe(req.body?.employeeProfileId || req.body?.employeeId);
    const title = String(req.body?.name || req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const baseline = parseNumSafe(req.body?.baseline);
    const target = parseNumSafe(req.body?.target || req.body?.targetValue);
    const weight = parseNumSafe(req.body?.weight);
    const dueDate = parseDateSafe(req.body?.dueDate);
    const requestedFrequency = String(req.body?.updateFrequency || "").trim().toLowerCase();

    if (!deptInitiativeId || !employeeProfileId || !title) {
      return res.status(400).json({ error: "deptInitiativeId, employeeProfileId and name are required" });
    }
    if (target === null || weight === null) {
      return res.status(400).json({ error: "target and weight are required numbers" });
    }

    const parent = await fetchInitiative(deptInitiativeId);
    if (!parent) return res.status(404).json({ error: "Department Initiative not found" });
    if (parent.level !== "department") {
      return res.status(400).json({ error: "Employee KPI must be linked to a Department Initiative" });
    }
    if (String(parent.state) !== "approved") {
      return res.status(409).json({ error: "Employee KPI cannot be assigned unless parent Department Initiative is Approved" });
    }
    const parentManagerId = parseIntSafe(parent.manager_profile_id) || parseIntSafe(parent.owner_profile_id);
    if (!isAdmin(req) && !isHR(req) && (!parentManagerId || Number(parentManagerId) !== Number(actorId))) {
      return res.status(403).json({ error: "Department owners can only assign Employee KPIs for their own Department Initiatives" });
    }

    const employee = await prisma.profile.findUnique({
      where: { id: employeeProfileId },
      select: { id: true, departmentId: true, status: true },
    });
    if (!employee) return res.status(404).json({ error: "Employee not found" });
    if (employee.status !== "active") return res.status(409).json({ error: "Employee must be active for KPI assignment" });
    if (parent.department_id && Number(employee.departmentId) !== Number(parent.department_id)) {
      return res.status(403).json({ error: "Employee must belong to the same department as the assigning Manager" });
    }

    if (dueDate && parent.due_date) {
      const parentDueDate = new Date(parent.due_date);
      if (dueDate.getTime() > parentDueDate.getTime()) {
        return res.status(400).json({ error: "Child dueDate cannot exceed parent dueDate" });
      }
    }

    const duplicateRows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM "kpi_initiatives"
      WHERE parent_initiative_id = ${deptInitiativeId}
        AND level = 'employee'::"KpiInitiativeLevel"
        AND employee_profile_id = ${employeeProfileId}
        AND LOWER(title) = LOWER(${title})
        AND state <> 'archived'::"KpiEntityState"
      LIMIT 1
    `);
    if (duplicateRows[0]) {
      return res.status(409).json({ error: "Duplicate Employee KPI name under this Department Initiative", existingId: Number(duplicateRows[0].id) });
    }

    const resolvedFrequency = requestedFrequency || String(parent.update_frequency || "").toLowerCase();
    if (!["weekly", "biweekly", "monthly", "quarterly"].includes(resolvedFrequency)) {
      return res.status(400).json({ error: "Invalid updateFrequency" });
    }
    const metricContext = await fetchMetricContext(Number(parent.metric_id));
    const inheritedBscTag = parseBscTag(parent.bsc_tag) || parseBscTag(metricContext?.goal_bsc_tag);
    if (!inheritedBscTag) {
      return res.status(409).json({ error: "Unable to resolve inherited BSC perspective for employee KPI" });
    }

    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      INSERT INTO "kpi_initiatives"(
        metric_id, level, parent_initiative_id, title, description, bsc_tag,
        owner_profile_id, partner_profile_id, manager_profile_id, department_id, employee_profile_id,
        state, baseline, target, actual, due_date, weight, percent_complete, rag, update_frequency, ack_required
      )
      VALUES(
        ${parent.metric_id},
        'employee'::"KpiInitiativeLevel",
        ${deptInitiativeId},
        ${title},
        ${description || null},
        ${inheritedBscTag}::"KpiBscPerspective",
        ${employeeProfileId},
        ${parent.partner_profile_id || null},
        ${parent.manager_profile_id || null},
        ${parent.department_id || null},
        ${employeeProfileId},
        'submitted'::"KpiEntityState",
        ${baseline === null ? toNum(parent.baseline) : baseline},
        ${target},
        ${baseline === null ? toNum(parent.baseline) : baseline},
        ${dueDate ? Prisma.sql`${dueDate.toISOString()}::timestamptz` : Prisma.sql`${parent.due_date || null}`},
        ${weight},
        0,
        'red'::"KpiRag",
        ${resolvedFrequency}::"KpiUpdateFrequency",
        true
      )
      RETURNING *
    `);

    await createAudit({
      action: "kpi_v2:employee_kpi:assign",
      entity_type: "kpi_initiative",
      entity_id: rows[0]?.id,
      user_id: actorUserId(req) || undefined,
      ip_address: req.ip,
      metadata: { actorProfileId: actorId, deptInitiativeId, employeeProfileId } as any,
    });
    await notify(req, employeeProfileId, "New KPI assigned", `You have a new KPI "${title}". Please acknowledge it.`, "/kpi-management");
    await recomputeInitiativeUpTree(deptInitiativeId);
    return res.status(201).json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to assign employee KPI" });
  }
});

router.get("/employees/:id/kpis", async (req: AuthRequest, res) => {
  try {
    const profileId = parseIntSafe(req.params.id);
    if (!profileId) return res.status(400).json({ error: "Invalid employee id" });
    const actorId = actorProfileId(req);
    if (!isAdmin(req) && !isHR(req) && actorId !== profileId && !canManageDepartmentLayer(req)) {
      return res.status(403).json({ error: "Not allowed to view these employee KPIs" });
    }
    if (!isAdmin(req) && !isHR(req) && canManageDepartmentLayer(req) && actorId !== profileId) {
      const [viewer, employee] = await Promise.all([
        prisma.profile.findUnique({
          where: { id: Number(actorId) },
          select: { departmentId: true },
        }),
        prisma.profile.findUnique({
          where: { id: profileId },
          select: { departmentId: true },
        }),
      ]);
      if (!viewer?.departmentId || !employee?.departmentId || Number(viewer.departmentId) !== Number(employee.departmentId)) {
        return res.status(403).json({ error: "Department owners can only view employee KPIs in their own department" });
      }
    }
    const initiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT i.*
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.employee_profile_id = ${profileId}
        AND i.level = 'employee'::"KpiInitiativeLevel"
        AND i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY i.updated_at DESC
    `);
    return res.json(initiatives);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch employee KPIs" });
  }
});

router.put("/employee-kpis/:id/acknowledge", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.params.id);
    if (!initiativeId) return res.status(400).json({ error: "Invalid employee KPI id" });
    const existing = await findIdempotentTransition("kpi_employee_ack", initiativeId, key);
    if (existing) return res.json({ id: initiativeId, state: "active", idempotent: true });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (initiative.level !== "employee") return res.status(400).json({ error: "Only employee initiatives can be acknowledged" });
    if (!canActAsProfile(req, parseIntSafe(initiative.employee_profile_id))) return res.status(403).json({ error: "Not allowed to acknowledge this initiative" });
    const fromState = String(initiative.state) as KpiState;
    if (!allowedTransition(fromState, "active") && fromState !== "active") {
      return res.status(409).json({ error: `Invalid transition ${fromState} -> active` });
    }
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "kpi_initiatives"
      SET acknowledged_at = NOW(),
          state = 'active'::"KpiEntityState",
          updated_at = NOW(),
          row_version = row_version + 1
      WHERE id = ${initiativeId}
    `);
    await logTransition(req, "kpi_employee_ack", initiativeId, fromState, "active", undefined, key);
    return res.json({ id: initiativeId, state: "active" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to acknowledge employee KPI" });
  }
});

router.post("/updates", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.body?.employeeKpiId || req.body?.kpiId || req.body?.initiativeId);
    if (!initiativeId) return res.status(400).json({ error: "employeeKpiId is required" });
    const actual = parseNumSafe(req.body?.actual ?? req.body?.actualValue);
    if (actual === null) return res.status(400).json({ error: "actualValue must be a valid number" });

    const periodStart = parseDateSafe(req.body?.periodStart) || new Date();
    const periodEnd =
      parseDateSafe(req.body?.periodEnd) ||
      new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (periodEnd <= periodStart) return res.status(400).json({ error: "periodEnd must be greater than periodStart" });
    const note = String(req.body?.comment || req.body?.note || "").trim();
    const evidenceUrls = Array.isArray(req.body?.evidenceUrls)
      ? req.body.evidenceUrls.map((x: unknown) => String(x)).filter(Boolean)
      : req.body?.attachmentUrl
      ? [String(req.body.attachmentUrl)]
      : [];

    const existing = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT initiative_id, period_start, period_end, actual
      FROM "kpi_progress_updates"
      WHERE idempotency_key = ${key}
      LIMIT 1
    `);
    if (existing[0]) {
      const rollup = await getRollup(Number(existing[0].initiative_id));
      return res.json({
        initiativeId: Number(existing[0].initiative_id),
        actual: toNum(existing[0].actual),
        periodStart: existing[0].period_start,
        periodEnd: existing[0].period_end,
        rollup,
        idempotent: true,
      });
    }

    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    if (initiative.level !== "employee") return res.status(400).json({ error: "Progress updates are only supported for employee initiatives" });
    if (!canActAsProfile(req, parseIntSafe(initiative.employee_profile_id))) return res.status(403).json({ error: "Not allowed to update this initiative" });
    if (initiative.ack_required && !initiative.acknowledged_at) return res.status(409).json({ error: "Employee must acknowledge KPI before progress updates" });
    const cycleWindow = await fetchCycleWindowForInitiative(initiativeId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "kpi_progress_updates"(initiative_id, period_start, period_end, actual, note, evidence_urls, updated_by_profile_id, source, idempotency_key)
        VALUES(${initiativeId}, ${periodStart.toISOString()}::timestamptz, ${periodEnd.toISOString()}::timestamptz, ${actual}, ${note || null}, ${evidenceUrls}::text[], ${actorProfileId(req)}, 'api'::"KpiProgressSource", ${key})
      `);
      const pct = leafPct(String(initiative.direction) as Direction, toNum(initiative.baseline), toNum(initiative.target), actual);
      const rag = ragFromPct(pct, cycleWindow?.startAt, cycleWindow?.endAt);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "kpi_initiatives"
        SET actual = ${actual},
            percent_complete = ${pct},
            rag = ${rag}::"KpiRag",
            state = CASE WHEN state IN ('submitted'::"KpiEntityState", 'approved'::"KpiEntityState") THEN 'active'::"KpiEntityState" ELSE state END,
            last_updated_at = NOW(),
            updated_at = NOW(),
            row_version = row_version + 1
        WHERE id = ${initiativeId}
      `);
    });
    await recomputeInitiativeUpTree(initiativeId);
    const rollup = await getRollup(initiativeId);
    return res.json({
      initiativeId,
      actual,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      rollup,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to submit KPI update" });
  }
});

router.get("/rollup/:level/:id", async (req: AuthRequest, res) => {
  try {
    const level = String(req.params.level || "").trim().toLowerCase();
    const id = parseIntSafe(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    if (["initiative", "employee", "department", "team", "firm"].includes(level)) {
      const rollup = await getRollup(id);
      if (!rollup) return res.status(404).json({ error: "Rollup target not found" });
      return res.json({ level, id, ...rollup });
    }

    if (level === "metric") {
      const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT percent_complete, rag, actual, baseline, target, weight
        FROM "kpi_metrics"
        WHERE id = ${id}
        LIMIT 1
      `);
      if (!rows[0]) return res.status(404).json({ error: "Metric not found" });
      return res.json({ level, id, metric: rows[0] });
    }

    if (level === "goal") {
      const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT percent_complete, rag, actual, baseline, target, weight
        FROM "kpi_goals"
        WHERE id = ${id}
        LIMIT 1
      `);
      if (!rows[0]) return res.status(404).json({ error: "Goal not found" });
      return res.json({ level, id, goal: rows[0] });
    }

    return res.status(400).json({ error: "level must be one of goal, metric, initiative, firm, team, department, employee" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch rollup" });
  }
});

router.get("/reports/bsc", async (req: AuthRequest, res) => {
  try {
    const bscTag = parseBscTag(req.query?.bscTag);
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        i.bsc_tag,
        COUNT(*)::int AS total_nodes,
        AVG(i.percent_complete)::numeric(7,2) AS avg_percent_complete,
        SUM(CASE WHEN i.rag = 'green'::"KpiRag" THEN 1 ELSE 0 END)::int AS green_count,
        SUM(CASE WHEN i.rag = 'amber'::"KpiRag" THEN 1 ELSE 0 END)::int AS amber_count,
        SUM(CASE WHEN i.rag = 'red'::"KpiRag" THEN 1 ELSE 0 END)::int AS red_count
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
        AND (${bscTag ? Prisma.sql`i.bsc_tag = ${bscTag}::"KpiBscPerspective"` : Prisma.sql`TRUE`})
      GROUP BY i.bsc_tag
      ORDER BY i.bsc_tag
    `);
    return res.json({ filter: bscTag || null, rows });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to build BSC report" });
  }
});

router.get("/audit/:entity/:id", async (req: AuthRequest, res) => {
  try {
    const entity = String(req.params.entity || "").trim().toLowerCase();
    const id = parseIntSafe(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const allowed = new Set(["cycle", "goal", "metric", "initiative", "employee_kpi"]);
    if (!allowed.has(entity)) return res.status(400).json({ error: "Unsupported entity" });
    const entityType = entity === "employee_kpi" ? "kpi_initiative" : `kpi_${entity}`;

    const transitions = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT *
      FROM "status_transitions"
      WHERE entity_type = ${entityType}
        AND entity_id = ${id}
      ORDER BY id DESC
    `);
    const approvals = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT *
      FROM "kpi_approval_history"
      WHERE entity_type = ${entity}
        AND entity_id = ${id}
      ORDER BY acted_at DESC
    `);
    const audit = await prisma.auditLog.findMany({
      where: { entityType, entityId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return res.json({ entity, id, transitions, approvals, audit });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch audit trail" });
  }
});

router.post("/reassign", async (req: AuthRequest, res) => {
  try {
    const key = requireIdempotencyKey(req, res);
    if (!key) return;
    const initiativeId = parseIntSafe(req.body?.initiativeId || req.body?.id);
    if (!initiativeId) return res.status(400).json({ error: "initiativeId is required" });
    if (!(isAdmin(req) || isHR(req) || isManager(req))) return res.status(403).json({ error: "Not allowed to reassign initiatives" });
    const toProfileId = parseIntSafe(req.body?.toProfileId);
    const reason = String(req.body?.reason || "").trim();
    const effectiveAt = parseDateSafe(req.body?.effectiveAt) || new Date();
    if (!toProfileId || !reason) return res.status(400).json({ error: "toProfileId and reason are required" });
    const initiative = await fetchInitiative(initiativeId);
    if (!initiative) return res.status(404).json({ error: "Initiative not found" });
    const fromProfileId = parseIntSafe(initiative.owner_profile_id);
    await prisma.$transaction(async (tx) => {
      if (initiative.level === "team") {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, partner_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      } else if (initiative.level === "department") {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, manager_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      } else if (initiative.level === "employee") {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, employee_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      } else {
        await tx.$executeRaw(Prisma.sql`UPDATE "kpi_initiatives" SET owner_profile_id = ${toProfileId}, updated_at = NOW(), row_version = row_version + 1 WHERE id = ${initiativeId}`);
      }
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "kpi_reassignments"(initiative_id, from_profile_id, to_profile_id, reason, effective_at, approved_by_profile_id)
        VALUES(${initiativeId}, ${fromProfileId || null}, ${toProfileId}, ${reason}, ${effectiveAt.toISOString()}::timestamptz, ${actorProfileId(req)})
      `);
    });
    await logTransition(req, "kpi_initiative_reassign", initiativeId, String(initiative.state), String(initiative.state), reason, key);
    if (fromProfileId) await notify(req, fromProfileId, "KPI reassigned", `Initiative "${initiative.title}" was reassigned.`, "/kpi-management");
    await notify(req, toProfileId, "KPI assigned", `You have been assigned "${initiative.title}".`, "/kpi-management");
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT * FROM "kpi_initiatives" WHERE id = ${initiativeId} LIMIT 1
    `);
    return res.json(rows[0] || {});
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to reassign ownership" });
  }
});

const buildSummary = (rows: Array<any>) => {
  const total = rows.length;
  const active = rows.filter((r) => String(r.state) === "active").length;
  const completed = rows.filter((r) => String(r.state) === "completed").length;
  const red = rows.filter((r) => String(r.rag) === "red").length;
  const amber = rows.filter((r) => String(r.rag) === "amber").length;
  const green = rows.filter((r) => String(r.rag) === "green").length;
  const percentComplete = total
    ? weighted(rows, (r) => toNum(r.percent_complete), (r) => toNum(r.weight, 1))
    : 0;
  return { total, active, completed, rag: { red, amber, green }, percentComplete };
};

router.get("/hierarchy/:entityType/:id", async (req: AuthRequest, res) => {
  try {
    const entityType = String(req.params.entityType || "").trim().toLowerCase();
    const id = parseIntSafe(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (!["goal", "metric", "initiative"].includes(entityType)) {
      return res.status(400).json({ error: "entityType must be goal, metric, or initiative" });
    }

    if (entityType === "goal") {
      const goalRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT * FROM "kpi_goals" WHERE id = ${id} LIMIT 1
      `);
      if (!goalRows[0]) return res.status(404).json({ error: "Goal not found" });
      const metrics = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT * FROM "kpi_metrics" WHERE goal_id = ${id} ORDER BY id ASC
      `);
      const initiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT i.*
        FROM "kpi_initiatives" i
        INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
        WHERE m.goal_id = ${id}
        ORDER BY i.id ASC
      `);
      return res.json({ entityType, goal: goalRows[0], metrics, initiatives });
    }

    if (entityType === "metric") {
      const metricRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT * FROM "kpi_metrics" WHERE id = ${id} LIMIT 1
      `);
      const metric = metricRows[0];
      if (!metric) return res.status(404).json({ error: "Metric not found" });
      const goalRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT * FROM "kpi_goals" WHERE id = ${metric.goal_id} LIMIT 1
      `);
      const initiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
        SELECT * FROM "kpi_initiatives" WHERE metric_id = ${id} ORDER BY id ASC
      `);
      return res.json({ entityType, metric, goal: goalRows[0] || null, initiatives });
    }

    const currentRows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT * FROM "kpi_initiatives" WHERE id = ${id} LIMIT 1
    `);
    if (!currentRows[0]) return res.status(404).json({ error: "Initiative not found" });
    const ancestors = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      WITH RECURSIVE chain AS (
        SELECT * FROM "kpi_initiatives" WHERE id = ${id}
        UNION ALL
        SELECT parent.*
        FROM "kpi_initiatives" parent
        INNER JOIN chain child ON child.parent_initiative_id = parent.id
      )
      SELECT * FROM chain WHERE id <> ${id} ORDER BY id DESC
    `);
    const descendants = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT * FROM "kpi_initiatives" WHERE id = ${id}
        UNION ALL
        SELECT child.*
        FROM "kpi_initiatives" child
        INNER JOIN tree parent ON child.parent_initiative_id = parent.id
      )
      SELECT * FROM tree WHERE id <> ${id} ORDER BY id ASC
    `);
    return res.json({ entityType, initiative: currentRows[0], ancestors, descendants });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch hierarchy" });
  }
});

router.get("/reporting/firm", async (_req: AuthRequest, res) => {
  try {
    const goals = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT g.*
      FROM "kpi_goals" g
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE g.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY g.id DESC
    `);
    const metrics = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT m.*
      FROM "kpi_metrics" m
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE m.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY m.id DESC
    `);
    const initiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT i.*
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY i.id DESC
    `);
    return res.json({
      summary: {
        goals: buildSummary(goals),
        metrics: buildSummary(metrics),
        initiatives: buildSummary(initiatives),
      },
      goals,
      metrics,
      initiatives,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to build firm report" });
  }
});

router.get("/reporting/partners/:profileId", async (req: AuthRequest, res) => {
  try {
    const profileId = parseIntSafe(req.params.profileId);
    if (!profileId) return res.status(400).json({ error: "Invalid profileId" });
    const initiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT i.*
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.partner_profile_id = ${profileId}
        AND i.level = 'team'::"KpiInitiativeLevel"
        AND i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY i.id DESC
    `);
    return res.json({ summary: buildSummary(initiatives), initiatives });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to build partner report" });
  }
});

router.get("/reporting/departments/:departmentId", async (req: AuthRequest, res) => {
  try {
    const departmentId = parseIntSafe(req.params.departmentId);
    if (!departmentId) return res.status(400).json({ error: "Invalid departmentId" });
    const departmentInitiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT i.*
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.department_id = ${departmentId}
        AND i.level = 'department'::"KpiInitiativeLevel"
        AND i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY i.id DESC
    `);
    const employeeInitiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT i.*
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.department_id = ${departmentId}
        AND i.level = 'employee'::"KpiInitiativeLevel"
        AND i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY i.id DESC
    `);
    return res.json({
      summary: { department: buildSummary(departmentInitiatives), employees: buildSummary(employeeInitiatives) },
      departmentInitiatives,
      employeeInitiatives,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to build department report" });
  }
});

router.get("/reporting/employees/:profileId", async (req: AuthRequest, res) => {
  try {
    const profileId = parseIntSafe(req.params.profileId);
    if (!profileId) return res.status(400).json({ error: "Invalid profileId" });
    const initiatives = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT i.*
      FROM "kpi_initiatives" i
      INNER JOIN "kpi_metrics" m ON m.id = i.metric_id
      INNER JOIN "kpi_goals" g ON g.id = m.goal_id
      INNER JOIN "kpi_cycle_versions" cv ON cv.id = g.cycle_version_id
      WHERE i.employee_profile_id = ${profileId}
        AND i.level = 'employee'::"KpiInitiativeLevel"
        AND i.state <> 'archived'::"KpiEntityState"
        AND cv.status <> 'locked'::"KpiCycleVersionStatus"
      ORDER BY i.id DESC
    `);
    return res.json({ summary: buildSummary(initiatives), initiatives });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to build employee report" });
  }
});

router.get("/archive/kpis", async (_req: AuthRequest, res) => {
  try {
    const rows = await prisma.$queryRaw<Array<any>>(Prisma.sql`
      SELECT
        k.id, k.name, k.description, k.category, k.kpi_type, k.is_active, k."createdAt" AS created_at,
        (SELECT COUNT(*)::int FROM "employee_kpi_assignments" a WHERE a.kpi_id = k.id) AS assignment_count,
        (SELECT COUNT(*)::int FROM "okr_objectives" o WHERE o.kpi_id = k.id) AS objective_count
      FROM "kpis" k
      ORDER BY k."createdAt" DESC
      LIMIT 1000
    `);
    return res.json(rows);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Failed to fetch legacy KPI archive" });
  }
});

export default router;
