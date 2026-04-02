import { Router } from "express";
import prisma from "../prisma";

const router = Router();

const toIsoStringOrNull = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const resolveIssuedByLabel = (certificate: any) => {
  const templateDefinition =
    certificate.certificateTemplate?.templateDefinition ??
    certificate.globalCertificateTemplate?.templateDefinition ??
    {};
  const configuredIssuedBy =
    templateDefinition &&
    typeof templateDefinition === "object" &&
    !Array.isArray(templateDefinition)
      ? String((templateDefinition as Record<string, unknown>).issuedByLabel || "").trim()
      : "";

  if (configuredIssuedBy) return configuredIssuedBy;
  if (certificate.certificateTemplate?.issuedByLabel) return certificate.certificateTemplate.issuedByLabel;
  if (certificate.globalCertificateTemplate?.issuedByLabel) return certificate.globalCertificateTemplate.issuedByLabel;
  if (certificate.assignment?.programVersion?.provider) return certificate.assignment.programVersion.provider;
  if (certificate.assignment?.programVersion?.externalTrainerName) {
    return certificate.assignment.programVersion.externalTrainerName;
  }
  if (certificate.assignment?.programVersion?.trainer) {
    return [
      certificate.assignment.programVersion.trainer.firstName,
      certificate.assignment.programVersion.trainer.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "Internal";
};

router.get("/verify/:verificationCode", async (req, res) => {
  try {
    const verificationCode = String(req.params.verificationCode || "").trim().toUpperCase();
    if (!verificationCode) {
      return res.status(400).json({ error: "verificationCode is required" });
    }

    const certificate = await prisma.issuedCertificate.findUnique({
      where: {
        verificationCode,
      },
      include: {
        document: true,
        certificateTemplate: true,
        globalCertificateTemplate: true,
        assignment: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeId: true,
              },
            },
            programVersion: {
              include: {
                program: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
                trainer: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!certificate) {
      return res.status(404).json({
        valid: false,
        error: "Certificate not found",
      });
    }

    const learnerName = certificate.assignment?.employee
      ? `${certificate.assignment.employee.firstName} ${certificate.assignment.employee.lastName}`.trim()
      : null;
    const trainingName =
      certificate.assignment?.programVersion?.program?.title ||
      certificate.assignment?.programVersion?.title ||
      null;

    return res.json({
      valid: certificate.status === "issued" && !certificate.revokedAt,
      status: certificate.status,
      certificateNumber: certificate.certificateNumber,
      verificationCode: certificate.verificationCode,
      issuedAt: toIsoStringOrNull(certificate.issuedAt),
      revokedAt: toIsoStringOrNull(certificate.revokedAt),
      learner: certificate.assignment?.employee
        ? {
            id: certificate.assignment.employee.id,
            name: learnerName,
            employeeId: certificate.assignment.employee.employeeId,
          }
        : null,
      training: trainingName
        ? {
            name: trainingName,
            programVersionTitle: certificate.assignment?.programVersion?.title || null,
          }
        : null,
      issuedBy: resolveIssuedByLabel(certificate),
      downloadUrl: certificate.document?.filePath || null,
    });
  } catch {
    return res.status(500).json({ error: "Failed to verify certificate" });
  }
});

export default router;
