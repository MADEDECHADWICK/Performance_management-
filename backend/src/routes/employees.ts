// This file defines the API routes for managing employee profiles. It includes endpoints for listing employees with optional filters, retrieving individual employee profiles, and fetching lists of partners and managers. The routes are protected with authentication and profile loading middleware to ensure that only authorized users can access the data. The implementation also includes utility functions for checking user roles and permissions to control access to certain endpoints. By organizing these routes in a dedicated file, we can maintain a clear structure for our API and facilitate the management of employee data within the application.

import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/auth";
import { loadProfile } from "../middleware/loadProfile";
import { resolveRequestAccessRoles } from "../auth/accessRoles";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { hrOrAdmin } from "../utils/middleware";

const router = Router();
const privilegedRoles = new Set([
  "super_admin",
  "hr",
  "gmp",
]);

const getRoleNames = (req: any) => {
  return resolveRequestAccessRoles(req).map((role) => String(role).toLowerCase());
};

const isPrivileged = (req: any) =>
  getRoleNames(req).some((role: string) => privilegedRoles.has(role));

const isManagerRole = (req: any) =>
  getRoleNames(req).some(
    (role: string) => role === "manager" || role === "partner"
  );

const hasMarketingRole = (req: any) =>
  getRoleNames(req).some((role: string) => role.includes("marketing"));

const canViewPartners = (req: any) => isPrivileged(req) || isManagerRole(req) || hasMarketingRole(req);

const resolveRequesterProfileId = (req: any) =>
  req.profile?.id ?? (req.user?.profileId ? Number(req.user.profileId) : undefined);

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

// GET /employees - List employees with optional filters
router.get("/", authMiddleware, loadProfile, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const skip = (page - 1) * pageSize;

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
    const roleId = req.query.roleId ? Number(req.query.roleId) : undefined;
    const managerId = req.query.managerId ? Number(req.query.managerId) : undefined;
    const isPartner = req.query.isPartner === "true" ? true : req.query.isPartner === "false" ? false : undefined;
    const onboardingStatus = typeof req.query.onboardingStatus === "string" ? req.query.onboardingStatus : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const filters: any[] = [];
    if (status) filters.push({ status });
    if (Number.isFinite(departmentId)) filters.push({ departmentId });
    if (Number.isFinite(roleId)) filters.push({ roleId });
    if (Number.isFinite(managerId)) filters.push({ managerId });
    if (typeof isPartner === "boolean") filters.push({ isPartner });
    if (onboardingStatus) filters.push({ onboardingStatus });
    if (search) {
      filters.push({
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { user: { email: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    if (!isPrivileged(req)) {
      const requesterId = resolveRequesterProfileId(req);
      if (!requesterId) {
        return res.status(401).json(errorResponse("Unauthorized", 401));
      }
      if (isManagerRole(req)) {
        filters.push({
          OR: [{ id: requesterId }, { managerId: requesterId }],
        });
      } else {
        filters.push({ id: requesterId });
      }
    }

    const where: any = filters.length ? { AND: filters } : {};

    const showCostRate = isPrivileged(req);
    const [employees, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, email: true } },
          role: { select: { id: true, name: true, billingRate: true, ...(showCostRate ? { costRate: true } : {}) } },
          department: { select: { id: true, name: true, departmentCode: true } },
        },
      }),
      prisma.profile.count({ where }),
    ]);

    res.json(paginatedResponse(employees, total, page, pageSize, "Employees retrieved"));
  } catch (error: any) {
    console.error("Error fetching employees:", error);
    res.status(500).json(errorResponse("Failed to fetch employees", 500));
  }
});

// GET /employees/partners - Get partner profiles
router.get("/partners/list", authMiddleware, loadProfile, async (req, res) => {
  try {
    if (!canViewPartners(req)) {
      return res.status(403).json(errorResponse("Access denied", 403));
    }

    const partners = await prisma.profile.findMany({
      where: {
        status: "active",
        isPartner: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
        department: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
      orderBy: { lastName: "asc" },
    });

    
    res.json(successResponse(partners, "Partners retrieved"));
  } catch (error: any) {
    console.error("Error fetching partners:", error);
    res.status(500).json(errorResponse("Failed to fetch partners", 500));
  }
});

// GET /employees/managers - Get manager profiles
router.get("/managers/list", authMiddleware, loadProfile, async (req, res) => {
  try {
    if (!isPrivileged(req) && !isManagerRole(req)) {
      return res.status(403).json(errorResponse("Access denied", 403));
    }

    const managers = await prisma.profile.findMany({
      where: {
        status: "active",
        positionTitle: { contains: "manager", mode: "insensitive" },
      },
      include: {
        user: { select: { id: true, email: true } },
        role: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { lastName: "asc" },
    });

    res.json(successResponse(managers, "Managers retrieved"));
  } catch (error: any) {
    console.error("Error fetching managers:", error);
    res.status(500).json(errorResponse("Failed to fetch managers", 500));
  }
});

// GET /employees/missing-induction - HR/Admin missing induction checklist list
router.get("/missing-induction", ...hrOrAdmin(), async (_req, res) => {
  try {
    const employees = await prisma.profile.findMany({
      where: {
        status: "active",
        OR: [
          { onboardingChecklistCompleted: false },
          { inductionCompleted: false },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        onboardingChecklistCompleted: true,
        inductionCompleted: true,
        onboardingStatus: true,
        department: { select: { id: true, name: true } },
        user: { select: { email: true } },
      },
      orderBy: { lastName: "asc" },
    });

    res.json(successResponse(employees, "Employees missing induction checklist"));
  } catch (error: any) {
    console.error("Error fetching missing induction checklists:", error);
    res.status(500).json(errorResponse("Failed to fetch missing induction checklists", 500));
  }
});

// GET /employees/:employeeId - Get employee profile
router.get("/:employeeId", authMiddleware, loadProfile, async (req, res) => {
  try {
    const employeeId = parseId(req.params.employeeId);
    if (!employeeId) {
      res.status(400).json(errorResponse("Invalid employee id", 400));
      return;
    }

    const employee = await prisma.profile.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { id: true, email: true } },
        role: { select: { id: true, name: true, billingRate: true, costRate: true } },
        department: { select: { id: true, name: true, departmentCode: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!employee) {
      res.status(404).json(errorResponse("Employee not found", 404));
      return;
    }

    if (!isPrivileged(req)) {
      const requesterId = resolveRequesterProfileId(req);
      if (!requesterId) {
        return res.status(401).json(errorResponse("Unauthorized", 401));
      }
      const canViewSelf = requesterId === employeeId;
      const canViewDirectReport =
        isManagerRole(req) && employee.managerId === requesterId;
      if (!canViewSelf && !canViewDirectReport) {
        return res.status(403).json(errorResponse("Access denied", 403));
      }
    }

    res.json(successResponse(employee, "Employee retrieved"));
  } catch (error: any) {
    console.error("Error fetching employee:", error);
    res.status(500).json(errorResponse("Failed to fetch employee", 500));
  }
});

export default router;
