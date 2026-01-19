/**
 * EvaluationService (Prisma Schema v2.1 aligned)
 */

import prisma from "../prisma";

type Roles = string[];

const norm = (s: string) => s.toLowerCase().trim();
const hasAnyRole = (roles: Roles, allowed: string[]) => {
  const r = roles.map(norm);
  return allowed.some((a) => r.includes(norm(a)));
};

export class EvaluationService {
  static async listEvaluationCycles(
    opts: { page: number; pageSize: number; status?: string },
    _requesterProfileId: number
  ) {
    const { page, pageSize, status } = opts;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;

    const [cycles, total] = await Promise.all([
      prisma.evaluationCycle.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { startDate: "desc" },
      }),
      prisma.evaluationCycle.count({ where }),
    ]);

    return { cycles, total };
  }

  static async createEvaluationCycle(
    input: {
      cycleName: string;
      description?: string;
      startDate: string;
      endDate: string;
      status?: "draft" | "active" | "closed";
    },
    createdByProfileId: number,
    roles: Roles
  ) {
    if (!hasAnyRole(roles, ["hr", "hr_manager", "admin", "super_admin"])) {
      throw new Error("Forbidden: only HR/Admin can create evaluation cycles");
    }

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid dates supplied");
    }
    if (end < start) {
      throw new Error("endDate cannot be earlier than startDate");
    }

    return prisma.evaluationCycle.create({
      data: {
        cycleName: input.cycleName,
        description: input.description,
        startDate: start,
        endDate: end,
        status: input.status ?? "draft",
        createdByProfileId,
      },
    });
  }

  static async listEvaluationDefinitions(
    opts: {
      page: number;
      pageSize: number;
      cycleId?: number;
      departmentId?: number;
      status?: string;
    },
    _requesterProfileId: number
  ) {
    const { page, pageSize, cycleId, departmentId, status } = opts;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (cycleId) where.cycleId = cycleId;
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;

    const [definitions, total] = await Promise.all([
      prisma.evaluationDefinition.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.evaluationDefinition.count({ where }),
    ]);

    return { definitions, total };
  }

  static async createEvaluationDefinition(
    input: {
      name: string;
      description?: string;
      cycleId?: number;
      departmentId?: number;

      enableSelfEvaluation?: boolean;
      enablePeerEvaluation?: boolean;
      enableUpwardEvaluation?: boolean;
      enableDownwardEvaluation?: boolean;
      enableClientEvaluation?: boolean;

      dueDate?: string;
      processAnonymously?: boolean;
      hideFromDashboard?: boolean;
      excludeFromScore?: boolean;
      requireEvaluatorSignature?: boolean;
      requireEvaluateeSignature?: boolean;

      status?: "draft" | "published" | "closed";

      questions?: any[];
      scoringConfig?: Record<string, any>;
    },
    createdByProfileId: number,
    roles: Roles
  ) {
    if (!hasAnyRole(roles, ["hr", "hr_manager", "admin", "super_admin"])) {
      throw new Error("Forbidden: only HR/Admin can create evaluation definitions");
    }

    const due = input.dueDate ? new Date(input.dueDate) : undefined;
    if (input.dueDate && Number.isNaN(due!.getTime())) {
      throw new Error("Invalid dueDate");
    }

    return prisma.evaluationDefinition.create({
      data: {
        name: input.name,
        description: input.description,

        cycleId: input.cycleId ?? null,
        departmentId: input.departmentId ?? null,

        enableSelfEvaluation: input.enableSelfEvaluation ?? false,
        enablePeerEvaluation: input.enablePeerEvaluation ?? false,
        enableUpwardEvaluation: input.enableUpwardEvaluation ?? false,
        enableDownwardEvaluation: input.enableDownwardEvaluation ?? false,
        enableClientEvaluation: input.enableClientEvaluation ?? false,

        dueDate: due ?? null,
        processAnonymously: input.processAnonymously ?? false,
        hideFromDashboard: input.hideFromDashboard ?? false,
        excludeFromScore: input.excludeFromScore ?? false,
        requireEvaluatorSignature: input.requireEvaluatorSignature ?? false,
        requireEvaluateeSignature: input.requireEvaluateeSignature ?? false,

        status: input.status ?? "draft",
        createdByProfileId,

        questions: input.questions ?? [],
        scoringConfig: input.scoringConfig ?? {},
      },
    });
  }

  static async listEvaluationAssignments(
    opts: {
      page: number;
      pageSize: number;
      status?: string;
      evaluatorType?: string;
      evaluationDefinitionId?: number;
      evaluateeProfileId?: number;
      evaluatorProfileId?: number;
    },
    requesterProfileId: number,
    roles: Roles
  ) {
    const { page, pageSize, status, evaluatorType, evaluationDefinitionId, evaluateeProfileId, evaluatorProfileId } = opts;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (evaluatorType) where.evaluatorType = evaluatorType;
    if (evaluationDefinitionId) where.evaluationDefinitionId = evaluationDefinitionId;
    if (evaluateeProfileId) where.evaluateeProfileId = evaluateeProfileId;
    if (evaluatorProfileId) where.evaluatorProfileId = evaluatorProfileId;

    // Non HR/Admin: restrict to (evaluator OR evaluatee == me)
    const privileged = hasAnyRole(roles, ["hr", "hr_manager", "admin", "super_admin"]);
    if (!privileged) {
      where.OR = [
        { evaluatorProfileId: requesterProfileId },
        { evaluateeProfileId: requesterProfileId },
      ];
    }

    const [assignments, total] = await Promise.all([
      prisma.evaluationAssignment.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          definition: { select: { id: true, name: true, status: true, dueDate: true, cycleId: true } },
          evaluator: { select: { id: true, firstName: true, lastName: true } },
          evaluatee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.evaluationAssignment.count({ where }),
    ]);

    return { assignments, total };
  }

  static async createEvaluationAssignment(
    input: {
      evaluationDefinitionId: number;
      evaluatorProfileId: number;
      evaluateeProfileId: number;
      evaluatorType: "self" | "manager" | "peer" | "direct_report" | "client" | "custom";
    },
    roles: Roles
  ) {
    if (!hasAnyRole(roles, ["hr", "hr_manager", "admin", "super_admin"])) {
      throw new Error("Forbidden: only HR/Admin can create evaluation assignments");
    }

    // Ensure definition exists
    const def = await prisma.evaluationDefinition.findUnique({
      where: { id: input.evaluationDefinitionId },
      select: { id: true, status: true },
    });
    if (!def) throw new Error("Evaluation definition not found");

    // Enforce uniqueness (schema has @@unique([...]))
    // Prisma will throw if duplicate, but we can pre-check for nicer message:
    const existing = await prisma.evaluationAssignment.findFirst({
      where: {
        evaluationDefinitionId: input.evaluationDefinitionId,
        evaluatorProfileId: input.evaluatorProfileId,
        evaluateeProfileId: input.evaluateeProfileId,
        evaluatorType: input.evaluatorType,
      },
      select: { id: true },
    });

    if (existing) {
      throw new Error("This evaluation assignment already exists");
    }

    return prisma.evaluationAssignment.create({
      data: {
        evaluationDefinitionId: input.evaluationDefinitionId,
        evaluatorProfileId: input.evaluatorProfileId,
        evaluateeProfileId: input.evaluateeProfileId,
        evaluatorType: input.evaluatorType,
        status: "pending",
        evidenceUrls: [], // required String[] in schema
      },
      include: {
        definition: { select: { id: true, name: true, status: true } },
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  static async getEvaluationAssignmentById(id: number) {
    return prisma.evaluationAssignment.findUnique({
      where: { id },
      include: {
        definition: true,
        evaluator: { select: { id: true, firstName: true, lastName: true } },
        evaluatee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  static async submitEvaluation(
    assignmentId: number,
    input: {
      responses?: any[];
      score?: number;
      evidenceUrls?: string[];
      evaluatorComments?: string;
      evaluatorSigned?: boolean;
    }
  ) {
    // requireEvaluationAccess("submit") already enforced evaluator identity + status
    return prisma.evaluationAssignment.update({
      where: { id: assignmentId },
      data: {
        responses: input.responses ?? undefined,
        score: typeof input.score === "number" ? input.score : undefined,
        evidenceUrls: Array.isArray(input.evidenceUrls) ? input.evidenceUrls : undefined,
        evaluatorComments: input.evaluatorComments ?? undefined,
        submittedAt: new Date(),
        status: "submitted",

        evaluatorSigned: typeof input.evaluatorSigned === "boolean" ? input.evaluatorSigned : undefined,
        evaluatorSignedAt: input.evaluatorSigned ? new Date() : undefined,
      },
    });
  }

  static async acknowledgeEvaluation(assignmentId: number) {
    // requireEvaluationAccess("view") already enforced evaluatee or evaluator/admin; controller can enforce evaluatee-only if desired
    return prisma.evaluationAssignment.update({
      where: { id: assignmentId },
      data: {
        evaluateeAcknowledged: true,
        evaluateeAcknowledgedAt: new Date(),
      },
    });
  }

  /**
   * Summary: basic aggregation using stored scores for the evaluatee within same definition/cycle.
   * (Schema doesn't include template question mapping; we keep it pragmatic.)
   */
  static async getEvaluationSummary(assignmentId: number) {
    const assignment = await prisma.evaluationAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        id: true,
        evaluateeProfileId: true,
        evaluationDefinitionId: true,
        definition: { select: { cycleId: true, name: true } },
      },
    });

    if (!assignment) throw new Error("Assignment not found");

    const evaluateeProfileId = assignment.evaluateeProfileId;
    const cycleId = assignment.definition?.cycleId ?? null;

    // Collect submitted assignments for evaluatee within same cycle if cycle exists, otherwise same definition
    const where: any = {
      evaluateeProfileId,
      status: "submitted",
    };

    if (cycleId) {
      where.definition = { cycleId };
    } else {
      where.evaluationDefinitionId = assignment.evaluationDefinitionId;
    }

    const rows = await prisma.evaluationAssignment.findMany({
      where,
      select: { id: true, evaluatorType: true, score: true, submittedAt: true },
    });

    const scores = rows.map((r) => (r.score ? Number(r.score) : null)).filter((n): n is number => typeof n === "number");
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const byType: Record<string, number> = {};
    for (const r of rows) {
      byType[r.evaluatorType] = (byType[r.evaluatorType] || 0) + 1;
    }

    return {
      evaluateeProfileId,
      cycleId,
      basis: cycleId ? "cycle" : "definition",
      assignmentsSubmitted: rows.length,
      evaluatorTypeCounts: byType,
      averageScore: avg === null ? null : Number(avg.toFixed(2)),
    };
  }

  static async getEvaluationDashboard(employeeProfileId: number, requesterRoles: Roles) {
    // HR/Admin can view any; others only themselves (controller will enforce)
    const privileged = hasAnyRole(requesterRoles, ["hr", "hr_manager", "admin", "super_admin"]);

    // Show last 5 active cycles + basic counts
    const cycles = await prisma.evaluationCycle.findMany({
      where: { status: "active" },
      orderBy: { startDate: "desc" },
      take: 5,
      select: { id: true, cycleName: true, startDate: true, endDate: true, status: true },
    });

    const dashboard = [];

    for (const c of cycles) {
      // assignments where employee is evaluator (to give)
      const toGive = await prisma.evaluationAssignment.count({
        where: {
          evaluatorProfileId: employeeProfileId,
          status: { in: ["pending", "in_progress"] },
          definition: { cycleId: c.id },
        },
      });

      // assignments where employee is evaluatee (to receive)
      const toReceive = await prisma.evaluationAssignment.count({
        where: {
          evaluateeProfileId: employeeProfileId,
          status: { in: ["pending", "in_progress", "submitted"] },
          definition: { cycleId: c.id },
        },
      });

      const completed = await prisma.evaluationAssignment.count({
        where: {
          evaluateeProfileId: employeeProfileId,
          status: "submitted",
          definition: { cycleId: c.id },
        },
      });

      dashboard.push({
        cycleId: c.id,
        cycleName: c.cycleName,
        startDate: c.startDate,
        endDate: c.endDate,
        isActive: c.status === "active",
        assignmentsToGive: toGive,
        assignmentsToReceive: toReceive,
        completedEvaluations: completed,
        visibleScope: privileged ? "privileged" : "self",
      });
    }

    return dashboard;
  }
}
