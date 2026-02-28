import crypto from "crypto";
import { prisma } from "../prisma";
import { AuthRequest } from "../middleware/auth";
import { notifyProfilesByRoles } from "./notificationRecipients";

const buildToken = () => crypto.randomBytes(32).toString("hex");

export const createClientSurveyForJobCompletion = async (
  jobId: number,
  auth: AuthRequest,
  expiresInDays = 30
) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, jobName: true, clientId: true },
  });

  if (!job?.clientId) return null;

  const existing = await prisma.clientSatisfactionSurvey.findFirst({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(expiresInDays) * 24 * 60 * 60 * 1000);

  const created = await prisma.clientSatisfactionSurvey.create({
    data: {
      clientId: job.clientId,
      jobId: job.id,
      surveyToken: buildToken(),
      sentAt: now,
      expiresAt,
    },
  });

  await notifyProfilesByRoles(
    ["marketing"],
    {
      title: "Client survey ready",
      message: `Survey created for job "${job.jobName}". Send to the client.`,
      link: `/client-surveys?surveyId=${created.id}`,
      relatedEntityId: job.id,
      actionRequired: true,
    },
    auth
  );

  return created;
};
