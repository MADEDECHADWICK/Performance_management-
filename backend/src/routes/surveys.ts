import { Router } from "express";
import { prisma } from "../prisma";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { requireModuleAccess } from "../middleware/requireModuleAccess";
import { errorResponse, paginatedResponse, successResponse } from "../utils/response";
import { NotificationService } from "../services/notifications.service";
import { notifyProfilesByRoles } from "../services/notificationRecipients";
import crypto from "crypto";

const router = Router();

const parseNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildToken = () => crypto.randomBytes(32).toString("hex");

const PUBLIC_SURVEY_WINDOW_MS = 60 * 1000;
const PUBLIC_SURVEY_READ_LIMIT = 30;
const PUBLIC_SURVEY_SUBMIT_LIMIT = 10;
const publicSurveyRateState = new Map<string, { count: number; resetAt: number }>();

const getClientIp = (req: any) =>
  String(req.ip || req.headers["x-forwarded-for"] || "unknown")
    .split(",")[0]
    .trim();

const consumePublicRateLimit = (bucket: string, maxRequests: number): boolean => {
  const now = Date.now();
  if (publicSurveyRateState.size > 5000) {
    publicSurveyRateState.forEach((value, key) => {
      if (value.resetAt <= now) {
        publicSurveyRateState.delete(key);
      }
    });
  }
  const current = publicSurveyRateState.get(bucket);
  if (!current || current.resetAt <= now) {
    publicSurveyRateState.set(bucket, { count: 1, resetAt: now + PUBLIC_SURVEY_WINDOW_MS });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count += 1;
  publicSurveyRateState.set(bucket, current);
  return true;
};

const parseOptionalRating = (value: unknown, field: string): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error(`${field} must be an integer between 1 and 5`);
  }
  return parsed;
};

const parseOptionalBoolean = (value: unknown, field: string): boolean | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${field} must be true or false`);
};

// GET /surveys - list surveys
router.get("/", authMiddleware, requireModuleAccess("surveys"), async (req: AuthRequest, res) => {
  try {
    const page = parseNumber(req.query.page) || 1;
    const pageSize = parseNumber(req.query.pageSize) || 100;
    const completedParam = req.query.completed;
    const completed =
      typeof completedParam === "string"
        ? completedParam === "true"
          ? true
          : completedParam === "false"
            ? false
            : undefined
        : undefined;
    const clientId = parseNumber(req.query.clientId);
    const jobId = parseNumber(req.query.jobId);

    const where: any = {};
    if (typeof completed === "boolean") {
      where.completedAt = completed ? { not: null } : null;
    }
    if (clientId) where.clientId = clientId;
    if (jobId) where.jobId = jobId;

    const [items, total] = await Promise.all([
      prisma.clientSatisfactionSurvey.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, clientName: true } },
          job: { select: { id: true, jobCode: true, jobName: true } },
        },
      }),
      prisma.clientSatisfactionSurvey.count({ where }),
    ]);

    res.json(
      successResponse(
        {
          surveys: items,
          page,
          pageSize,
          total,
        },
        "Surveys retrieved"
      )
    );
  } catch (error) {
    console.error("Error fetching surveys:", error);
    res.status(500).json(errorResponse("Failed to fetch surveys", 500));
  }
});

// GET /surveys/analytics
router.get("/analytics", authMiddleware, requireModuleAccess("surveys"), async (_req: AuthRequest, res) => {
  try {
    const surveys = await prisma.clientSatisfactionSurvey.findMany({
      where: { completedAt: { not: null } },
      select: {
        completedAt: true,
        overallSatisfaction: true,
        qualityRating: true,
        communicationRating: true,
        timelinessRating: true,
        professionalismRating: true,
        valueForMoneyRating: true,
        wouldRecommend: true,
      },
    });

    const totalSurveys = await prisma.clientSatisfactionSurvey.count();
    const completedSurveys = surveys.length;
    const responseRate = totalSurveys ? completedSurveys / totalSurveys : 0;

    const average = (values: Array<number | null>) => {
      const filtered = values.filter((v) => v !== null && v !== undefined) as number[];
      if (filtered.length === 0) return 0;
      return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
    };

    const averageRatings = {
      quality: average(surveys.map((s) => s.qualityRating ?? null)),
      communication: average(surveys.map((s) => s.communicationRating ?? null)),
      timeliness: average(surveys.map((s) => s.timelinessRating ?? null)),
      professionalism: average(surveys.map((s) => s.professionalismRating ?? null)),
      valueForMoney: average(surveys.map((s) => s.valueForMoneyRating ?? null)),
      overall: average(surveys.map((s) => s.overallSatisfaction ?? null)),
    };

    const recommendCount = surveys.filter((s) => s.wouldRecommend === true).length;
    const recommendRate = completedSurveys ? recommendCount / completedSurveys : 0;

    const now = new Date();
    const monthsBack = 6;
    const trendStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

    const formatMonth = (date: Date) =>
      date.toLocaleString("en-US", { month: "short", year: "2-digit" });

    const monthKeys = Array.from({ length: monthsBack }).map((_, index) => {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
      return {
        key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
        label: formatMonth(monthDate),
      };
    });

    const trendMap = new Map(
      monthKeys.map((item) => [
        item.key,
        { month: item.label, avgSatisfaction: 0, responseCount: 0 },
      ])
    );

    const scoreMap = new Map<string, { total: number; count: number }>();

    surveys.forEach((survey) => {
      if (!survey.completedAt || survey.completedAt < trendStart) return;
      const key = `${survey.completedAt.getFullYear()}-${survey.completedAt.getMonth()}`;
      const entry = trendMap.get(key);
      if (!entry) return;
      entry.responseCount += 1;

      if (survey.overallSatisfaction !== null && survey.overallSatisfaction !== undefined) {
        const scoreEntry = scoreMap.get(key) || { total: 0, count: 0 };
        scoreEntry.total += survey.overallSatisfaction;
        scoreEntry.count += 1;
        scoreMap.set(key, scoreEntry);
      }
    });

    trendMap.forEach((entry, key) => {
      const scoreEntry = scoreMap.get(key);
      if (scoreEntry && scoreEntry.count > 0) {
        entry.avgSatisfaction = scoreEntry.total / scoreEntry.count;
      }
    });

    const trends = monthKeys.map((item) => trendMap.get(item.key) || {
      month: item.label,
      avgSatisfaction: 0,
      responseCount: 0,
    });

    res.json(
      successResponse(
        {
          totalSurveys,
          completedSurveys,
          responseRate,
          averageRatings,
          recommendationRate: recommendRate,
          trends,
        },
        "Survey analytics retrieved"
      )
    );
  } catch (error) {
    console.error("Error fetching survey analytics:", error);
    res.status(500).json(errorResponse("Failed to fetch survey analytics", 500));
  }
});

// GET /surveys/by-client
router.get("/by-client", authMiddleware, requireModuleAccess("surveys"), async (_req: AuthRequest, res) => {
  try {
    const surveys = await prisma.clientSatisfactionSurvey.findMany({
      include: { client: { select: { id: true, clientName: true } } },
    });

    const grouped = new Map<
      number,
      {
        clientId: number;
        clientName: string;
        surveyCount: number;
        satisfactionTotal: number;
        satisfactionCount: number;
        recommendCount: number;
        lastSurveyDate: Date | null;
      }
    >();

    surveys.forEach((survey) => {
      const clientId = survey.clientId;
      const clientName = survey.client?.clientName || "Unknown";
      if (!grouped.has(clientId)) {
        grouped.set(clientId, {
          clientId,
          clientName,
          surveyCount: 0,
          satisfactionTotal: 0,
          satisfactionCount: 0,
          recommendCount: 0,
          lastSurveyDate: null,
        });
      }
      const entry = grouped.get(clientId)!;
      entry.surveyCount += 1;
      if (survey.overallSatisfaction !== null && survey.overallSatisfaction !== undefined) {
        entry.satisfactionTotal += survey.overallSatisfaction;
        entry.satisfactionCount += 1;
      }
      if (survey.wouldRecommend === true) {
        entry.recommendCount += 1;
      }
      if (!entry.lastSurveyDate || survey.createdAt > entry.lastSurveyDate) {
        entry.lastSurveyDate = survey.createdAt;
      }
    });

    const result = Array.from(grouped.values()).map((entry) => ({
      clientId: entry.clientId,
      clientName: entry.clientName,
      surveyCount: entry.surveyCount,
      avgSatisfaction: entry.satisfactionCount
        ? entry.satisfactionTotal / entry.satisfactionCount
        : 0,
      wouldRecommendPercent: entry.surveyCount
        ? (entry.recommendCount / entry.surveyCount) * 100
        : 0,
      lastSurveyDate: entry.lastSurveyDate,
    }));

    res.json(successResponse(result, "Surveys grouped by client"));
  } catch (error) {
    console.error("Error fetching surveys by client:", error);
    res.status(500).json(errorResponse("Failed to fetch surveys by client", 500));
  }
});

// GET /surveys/:id
router.get("/:id", authMiddleware, requireModuleAccess("surveys"), async (req: AuthRequest, res) => {
  try {
    const surveyId = parseNumber(req.params.id);
    if (!surveyId) {
      return res.status(400).json(errorResponse("Invalid survey id", 400));
    }

    const survey = await prisma.clientSatisfactionSurvey.findUnique({
      where: { id: surveyId },
      include: {
        client: { select: { id: true, clientName: true } },
        job: { select: { id: true, jobCode: true, jobName: true } },
      },
    });

    if (!survey) {
      return res.status(404).json(errorResponse("Survey not found", 404));
    }

    res.json(successResponse(survey, "Survey retrieved"));
  } catch (error) {
    console.error("Error fetching survey:", error);
    res.status(500).json(errorResponse("Failed to fetch survey", 500));
  }
});

// GET /surveys/token/:token - public survey access
router.get("/token/:token", async (req, res) => {
  try {
    const requesterIp = getClientIp(req);
    const token = String(req.params.token || "").trim();
    const rateBucket = `survey:view:${requesterIp}:${token}`;
    if (!consumePublicRateLimit(rateBucket, PUBLIC_SURVEY_READ_LIMIT)) {
      return res.status(429).json(errorResponse("Too many requests. Please try again shortly.", 429));
    }

    const survey = await prisma.clientSatisfactionSurvey.findUnique({
      where: { surveyToken: token },
      include: {
        client: { select: { id: true, clientName: true } },
        job: { select: { id: true, jobCode: true, jobName: true } },
      },
    });

    if (!survey) {
      return res.status(404).json(errorResponse("Survey not found", 404));
    }

    if (survey.expiresAt && survey.expiresAt.getTime() < Date.now()) {
      return res.status(410).json(errorResponse("Survey token has expired", 410));
    }

    if (survey.completedAt) {
      return res.status(409).json(errorResponse("Survey has already been submitted", 409));
    }

    res.json(successResponse(survey, "Survey retrieved"));
  } catch (error) {
    console.error("Error fetching survey by token:", error);
    res.status(500).json(errorResponse("Failed to fetch survey", 500));
  }
});

// POST /surveys - create survey
router.post("/", authMiddleware, requireModuleAccess("surveys"), async (req: AuthRequest, res) => {
  try {
    const { clientId, jobId, expiresInDays = 30 } = req.body;
    if (!clientId) {
      return res.status(400).json(errorResponse("clientId is required", 400));
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + Number(expiresInDays) * 24 * 60 * 60 * 1000);

  const created = await prisma.clientSatisfactionSurvey.create({
    data: {
      clientId: Number(clientId),
      jobId: jobId ? Number(jobId) : undefined,
      surveyToken: buildToken(),
      sentAt: now,
      expiresAt,
    },
  });

    const job = jobId
      ? await prisma.job.findUnique({
          where: { id: Number(jobId) },
          select: { id: true, jobName: true, partnerProfileId: true, managerProfileId: true },
        })
      : null;

    if (job?.partnerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.partnerProfileId,
          type: "info",
          title: "Client survey sent",
          message: `A satisfaction survey was sent for "${job.jobName}".`,
          jobId: job.id,
          link: "/client-surveys",
          actionRequired: false,
        },
        { userId: 0, profileId: 0, roleName: "system" }
      );
    }

    if (job?.managerProfileId) {
      await NotificationService.createNotification(
        {
          recipientProfileId: job.managerProfileId,
          type: "info",
          title: "Client survey sent",
          message: `A satisfaction survey was sent for "${job.jobName}".`,
          jobId: job.id,
          link: "/client-surveys",
          actionRequired: false,
        },
        { userId: 0, profileId: 0, roleName: "system" }
      );
    }

    await notifyProfilesByRoles(
      ["marketing"],
      {
        title: "Client survey sent",
        message: "A client survey has been sent and is awaiting response.",
        link: "/client-surveys",
        relatedEntityId: job?.id,
        actionRequired: false,
      },
      { user: { userId: 0, profileId: 0 } } as any
    );

  res.status(201).json(successResponse(created, "Survey created", 201));
  } catch (error) {
    console.error("Error creating survey:", error);
    res.status(500).json(errorResponse("Failed to create survey", 500));
  }
});

// POST /surveys/:id/remind
router.post("/:id/remind", authMiddleware, requireModuleAccess("surveys"), async (req: AuthRequest, res) => {
  try {
    const surveyId = parseNumber(req.params.id);
    if (!surveyId) {
      return res.status(400).json(errorResponse("Invalid survey id", 400));
    }

    const updated = await prisma.clientSatisfactionSurvey.update({
      where: { id: surveyId },
      data: { sentAt: new Date() },
    });

    res.json(successResponse(updated, "Survey reminder sent"));
  } catch (error) {
    console.error("Error sending survey reminder:", error);
    res.status(500).json(errorResponse("Failed to send reminder", 500));
  }
});

// POST /surveys/token/:token/submit - public submission
router.post("/token/:token/submit", async (req, res) => {
  try {
    const requesterIp = getClientIp(req);
    const token = String(req.params.token || "").trim();
    const rateBucket = `survey:submit:${requesterIp}:${token}`;
    if (!consumePublicRateLimit(rateBucket, PUBLIC_SURVEY_SUBMIT_LIMIT)) {
      return res.status(429).json(errorResponse("Too many submission attempts. Please try again shortly.", 429));
    }

    const survey = await prisma.clientSatisfactionSurvey.findUnique({
      where: { surveyToken: token },
    });

    if (!survey) {
      return res.status(404).json(errorResponse("Survey not found", 404));
    }

    if (survey.expiresAt && survey.expiresAt.getTime() < Date.now()) {
      return res.status(410).json(errorResponse("Survey token has expired", 410));
    }

    if (survey.completedAt) {
      return res.status(409).json(errorResponse("Survey has already been submitted", 409));
    }

    const {
      qualityRating,
      communicationRating,
      timelinessRating,
      professionalismRating,
      valueForMoneyRating,
      overallSatisfaction,
      wouldRecommend,
      improvementSuggestions,
      additionalComments,
    } = req.body;

    let normalizedQuality: number | null = null;
    let normalizedCommunication: number | null = null;
    let normalizedTimeliness: number | null = null;
    let normalizedProfessionalism: number | null = null;
    let normalizedValueForMoney: number | null = null;
    let normalizedOverall: number | null = null;
    let normalizedWouldRecommend: boolean | null = null;
    try {
      normalizedQuality = parseOptionalRating(qualityRating, "qualityRating");
      normalizedCommunication = parseOptionalRating(communicationRating, "communicationRating");
      normalizedTimeliness = parseOptionalRating(timelinessRating, "timelinessRating");
      normalizedProfessionalism = parseOptionalRating(professionalismRating, "professionalismRating");
      normalizedValueForMoney = parseOptionalRating(valueForMoneyRating, "valueForMoneyRating");
      normalizedOverall = parseOptionalRating(overallSatisfaction, "overallSatisfaction");
      normalizedWouldRecommend = parseOptionalBoolean(wouldRecommend, "wouldRecommend");
    } catch (validationError: any) {
      return res.status(400).json(errorResponse(validationError.message || "Invalid survey payload", 400));
    }

    const normalizedImprovementSuggestions =
      improvementSuggestions === undefined || improvementSuggestions === null
        ? null
        : String(improvementSuggestions).trim();
    const normalizedAdditionalComments =
      additionalComments === undefined || additionalComments === null
        ? null
        : String(additionalComments).trim();
    if (
      (normalizedImprovementSuggestions && normalizedImprovementSuggestions.length > 5000) ||
      (normalizedAdditionalComments && normalizedAdditionalComments.length > 5000)
    ) {
      return res.status(400).json(errorResponse("Comment fields must be 5000 characters or fewer", 400));
    }

    const now = new Date();
    const updateResult = await prisma.clientSatisfactionSurvey.updateMany({
      where: {
        id: survey.id,
        completedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      data: {
        qualityRating: normalizedQuality,
        communicationRating: normalizedCommunication,
        timelinessRating: normalizedTimeliness,
        professionalismRating: normalizedProfessionalism,
        valueForMoneyRating: normalizedValueForMoney,
        overallSatisfaction: normalizedOverall,
        wouldRecommend: normalizedWouldRecommend,
        improvementSuggestions: normalizedImprovementSuggestions,
        additionalComments: normalizedAdditionalComments,
        completedAt: now,
        ipAddress: requesterIp,
      },
    });

    if (updateResult.count === 0) {
      return res.status(409).json(errorResponse("Survey has already been submitted or expired", 409));
    }

    const updated = await prisma.clientSatisfactionSurvey.findUnique({
      where: { id: survey.id },
    });
    if (!updated) {
      return res.status(500).json(errorResponse("Survey was updated but could not be reloaded", 500));
    }

    if (survey.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: survey.jobId },
        select: { id: true, jobName: true, partnerProfileId: true },
      });

      if (job?.partnerProfileId) {
        await NotificationService.createNotification(
          {
            recipientProfileId: job.partnerProfileId,
            type: "info",
            title: "Client survey submitted",
            message: `Client feedback received for "${job.jobName}".`,
            jobId: job.id,
            link: `/jobs/${job.id}`,
            actionRequired: false,
          },
          { userId: 0, profileId: 0, roleName: "system" }
        );
      }

      await notifyProfilesByRoles(
        ["marketing"],
        {
          title: "Client survey submitted",
          message: `Client feedback received for "${job?.jobName || "job"}".`,
          link: "/client-surveys",
          relatedEntityId: job?.id,
          actionRequired: false,
        },
        { user: { userId: 0, profileId: 0 } } as any
      );
    }

    res.json(successResponse(updated, "Survey submitted"));
  } catch (error) {
    console.error("Error submitting survey:", error);
    res.status(500).json(errorResponse("Failed to submit survey", 500));
  }
});

// DELETE /surveys/:id
router.delete("/:id", authMiddleware, requireModuleAccess("surveys"), async (req: AuthRequest, res) => {
  try {
    const surveyId = parseNumber(req.params.id);
    if (!surveyId) {
      return res.status(400).json(errorResponse("Invalid survey id", 400));
    }

    await prisma.clientSatisfactionSurvey.delete({ where: { id: surveyId } });
    res.json(successResponse({ id: surveyId, deleted: true }, "Survey deleted"));
  } catch (error) {
    console.error("Error deleting survey:", error);
    res.status(500).json(errorResponse("Failed to delete survey", 500));
  }
});

export default router;
