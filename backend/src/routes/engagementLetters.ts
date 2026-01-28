import { Router } from "express";
import { prisma } from "../prisma";
import { errorResponse, paginatedResponse } from "../utils/response";

const router = Router();

const parseNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// GET /engagement-letters - list engagement letters across all clients
router.get("/", async (req, res) => {
  try {
    const page = parseNumber(req.query.page) || 1;
    const pageSize = parseNumber(req.query.pageSize) || 20;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const clientId = parseNumber(req.query.clientId);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    const where: any = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (search) {
      where.OR = [
        { jobTitle: { contains: search, mode: "insensitive" } },
        { engagementType: { contains: search, mode: "insensitive" } },
        { client: { clientName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.engagementLetter.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, clientName: true, industry: true } },
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          document: { select: { id: true, fileName: true, filePath: true } },
        },
      }),
      prisma.engagementLetter.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, page, pageSize, "Engagement letters retrieved"));
  } catch (error) {
    console.error("Error fetching engagement letters:", error);
    res.status(500).json(errorResponse("Failed to fetch engagement letters", 500));
  }
});

export default router;
