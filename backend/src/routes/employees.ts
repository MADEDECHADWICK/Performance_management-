import { Router } from "express";
import prisma from "../prisma";
import { authMiddleware } from "../middleware/auth";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";

const router = Router();

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
};

// GET /employees - List employees with optional filters
router.get("/", authMiddleware, async (req, res) => {
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

    const where: any = {};
    if (status) where.status = status;
    if (Number.isFinite(departmentId)) where.departmentId = departmentId;
    if (Number.isFinite(roleId)) where.roleId = roleId;
    if (Number.isFinite(managerId)) where.managerId = managerId;
    if (typeof isPartner === "boolean") where.isPartner = isPartner;
    if (onboardingStatus) where.onboardingStatus = onboardingStatus;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.profile.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, email: true } },
          role: { select: { id: true, name: true, billingRate: true, costRate: true } },
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
router.get("/partners/list", authMiddleware, async (_req, res) => {
  try {
    const partners = await prisma.profile.findMany({
      where: {
        status: "active",
        isPartner: true,
      },
      include: {
        user: { select: { id: true, email: true } },
        role: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
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
router.get("/managers/list", authMiddleware, async (_req, res) => {
  try {
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

// GET /employees/:employeeId - Get employee profile
router.get("/:employeeId", authMiddleware, async (req, res) => {
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

    res.json(successResponse(employee, "Employee retrieved"));
  } catch (error: any) {
    console.error("Error fetching employee:", error);
    res.status(500).json(errorResponse("Failed to fetch employee", 500));
  }
});

export default router;
