import { Router } from 'express';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resolveRequestAccessRoles } from '../auth/accessRoles';
import { requireAnyModuleAccess, requireModuleAccess } from '../middleware/requireModuleAccess';
import { notifyProfile, notifyProfilesByRoles } from '../services/notificationRecipients';
import { getDashboardModuleCoverageSummary } from '../services/performanceFramework.service';
import jobService from '../services/jobs.service';
import JobPerformanceFactsService from '../services/jobPerformanceFacts.service';
import { logger, toLogContext } from '../lib/logger';

const router = Router();
const financeDashboardRoles = new Set(['finance', 'hr', 'gmp', 'super_admin']);
const canReadFinance = requireModuleAccess('finance', 'read');
const canWriteFinance = requireModuleAccess('finance', 'write');
const canApproveFinance = requireModuleAccess('finance', 'approve');
const canAdminFinance = requireModuleAccess('finance', 'admin');
// IMPLEMENTED: Finance projection/collection permission split â€” these flows now accept either legacy finance module access or dedicated split-module permissions.
const canReadCollections = requireAnyModuleAccess([
  { moduleKey: 'finance', action: 'read' },
  { moduleKey: 'finance_collections', action: 'read' },
]);
const canWriteCollections = requireAnyModuleAccess([
  { moduleKey: 'finance', action: 'write' },
  { moduleKey: 'finance_collections', action: 'write' },
]);
const canReadProjections = requireAnyModuleAccess([
  { moduleKey: 'finance', action: 'read' },
  { moduleKey: 'finance_projections', action: 'read' },
]);
const canWriteProjections = requireAnyModuleAccess([
  { moduleKey: 'finance', action: 'write' },
  { moduleKey: 'finance_projections', action: 'write' },
]);

const jobCollectionStages = new Set([
  'not_ready',
  'ready_for_collection',
  'partial_collection',
  'fully_collected',
  'overdue',
]);

const receivableActionTypes = new Set([
  'call',
  'email',
  'meeting',
  'reminder',
  'escalation',
  'promise_to_pay',
  'dispute',
  'note',
]);

const COLLECTION_IDEMPOTENCY_TTL_MS = 15 * 60 * 1000;
const collectionResponseCache = new Map<
  string,
  { expiresAt: number; payload: Record<string, unknown> }
>();
const collectionInFlight = new Map<string, Promise<{ statusCode: number; payload: Record<string, unknown> }>>();

const pruneCollectionIdempotencyCache = () => {
  const now = Date.now();
  collectionResponseCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      collectionResponseCache.delete(key);
    }
  });
};

const parseIsoDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toMonthStartUtc = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const buildCollectionFingerprint = (input: {
  actorProfileId: number | null;
  clientId: number;
  jobId: number | null;
  paymentAmount: number;
  currency: string;
  paymentDateIso: string;
  paymentMethod: string | null;
  referenceNumber: string | null;
  invoiceNumber: string | null;
}) =>
  crypto
    .createHash('sha256')
    .update(
      [
        input.actorProfileId ?? 'none',
        input.clientId,
        input.jobId ?? 'none',
        input.paymentAmount.toFixed(2),
        input.currency,
        input.paymentDateIso,
        input.paymentMethod ?? 'none',
        input.referenceNumber ?? 'none',
        input.invoiceNumber ?? 'none',
      ].join('|')
    )
    .digest('hex');

const getFinanceContext = async (req: AuthRequest) => {
  const userId = req.user?.userId;
  if (!userId) {
    return { error: { status: 401, message: 'Unauthorized' } };
  }

  const roleNames = resolveRequestAccessRoles(req);
  const canUseFinanceDashboard = roleNames.some((role) => financeDashboardRoles.has(role));
  if (!canUseFinanceDashboard) {
    return { error: { status: 403, message: 'Access denied. Finance role required.' } };
  }

  return {
    userId,
    profileId: req.user?.profileId ? Number(req.user.profileId) : null,
  };
};

const resolveJobFee = (job: {
  billingType: string;
  fixedFeeAmount: any;
  jobCosting?: { jobFee: any } | null;
}) => {
  const costingFee = Number(job.jobCosting?.jobFee || 0);
  if (costingFee > 0) return costingFee;
  if (job.billingType === 'fixed_fee') return Number(job.fixedFeeAmount || 0);
  return 0;
};

const resolveReceivableAnchorDate = (job: {
  readyForCollectionAt: Date | null;
  completionDate: Date | null;
  dueDate: Date | null;
  startDate: Date | null;
  createdAt: Date;
}) => {
  return (
    job.readyForCollectionAt ||
    job.completionDate ||
    job.dueDate ||
    job.startDate ||
    job.createdAt
  );
};

const toAgingDays = (anchorDate: Date, nowDate = new Date()) => {
  const diffMs = nowDate.getTime() - anchorDate.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const toAgingBucket = (daysOutstanding: number) => {
  if (daysOutstanding <= 30) return 'current_0_30';
  if (daysOutstanding <= 60) return 'bucket_31_60';
  if (daysOutstanding <= 90) return 'bucket_61_90';
  return 'bucket_over_90';
};

const followUpCadenceDaysByBucket: Record<string, number> = {
  current_0_30: 14,
  bucket_31_60: 7,
  bucket_61_90: 5,
  bucket_over_90: 3,
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeToDayStart = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const resolveReceivableSlaState = ({
  balance,
  agingBucket,
  anchorDate,
  latestFollowUp,
  nowDate = new Date(),
}: {
  balance: number;
  agingBucket: string;
  anchorDate: Date;
  latestFollowUp:
    | {
        actionDate: Date;
        nextFollowUpDate: Date | null;
        isResolved: boolean;
      }
    | null
    | undefined;
  nowDate?: Date;
}) => {
  if (balance <= 0) {
    return {
      slaStatus: 'ok',
      slaBreached: false,
      slaDueSoon: false,
      slaBreachDays: 0,
      expectedFollowUpDate: null as Date | null,
    };
  }

  if (latestFollowUp?.isResolved) {
    return {
      slaStatus: 'ok',
      slaBreached: false,
      slaDueSoon: false,
      slaBreachDays: 0,
      expectedFollowUpDate: latestFollowUp.nextFollowUpDate ?? null,
    };
  }

  const cadenceDays = followUpCadenceDaysByBucket[agingBucket] ?? 7;
  const expectedFollowUpDate =
    latestFollowUp?.nextFollowUpDate ||
    (latestFollowUp?.actionDate
      ? addDays(latestFollowUp.actionDate, cadenceDays)
      : addDays(anchorDate, cadenceDays));

  const nowStart = normalizeToDayStart(nowDate);
  const expectedStart = normalizeToDayStart(expectedFollowUpDate);
  const diffDays = Math.floor(
    (nowStart.getTime() - expectedStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const slaBreached = diffDays > 0;
  const slaDueSoon = diffDays === 0 || diffDays === -1;

  return {
    slaStatus: slaBreached ? 'breached' : slaDueSoon ? 'due_soon' : 'ok',
    slaBreached,
    slaDueSoon,
    slaBreachDays: slaBreached ? diffDays : 0,
    expectedFollowUpDate,
  };
};

// GET /finance-dashboard/overview
router.get('/overview', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [monthPayments, totalPayments, monthProjections] = await Promise.all([
      prisma.clientPayment.aggregate({
        _sum: { paymentAmount: true },
        where: { paymentDate: { gte: monthStart, lt: nextMonthStart } },
      }),
      prisma.clientPayment.aggregate({
        _sum: { paymentAmount: true },
      }),
      prisma.revenueProjection.aggregate({
        _sum: { projectedAmount: true, actualCollected: true },
        where: { monthYear: { gte: monthStart, lt: nextMonthStart } },
      }),
    ]);

    const jobs = await prisma.job.findMany({
      include: {
        jobCosting: true,
        payments: true,
      },
    });

    let totalFees = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;

    jobs.forEach((job) => {
      const fee = resolveJobFee(job);
      const collected = job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      );
      const balance = Math.max(0, fee - collected);
      totalFees += fee;
      totalCollected += collected;
      totalOutstanding += balance;
    });

    const collectionRate = totalFees > 0 ? (totalCollected / totalFees) * 100 : 0;
    const projectedMonth = Number(monthProjections._sum.projectedAmount || 0);
    const collectedMonth = Number(monthPayments._sum.paymentAmount || 0);
    const varianceMonth = collectedMonth - projectedMonth;

    res.json({
      month: monthStart.toISOString(),
      projectedMonth,
      collectedMonth,
      varianceMonth,
      totalCollected,
      totalOutstanding,
      totalFees,
      collectionRate,
      framework: getDashboardModuleCoverageSummary("finance"),
    });
  } catch (error: any) {
    logger.error('finance_dashboard_overview_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load finance overview' });
  }
});

// GET /finance-dashboard/collections
router.get('/collections', authMiddleware, canReadCollections, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const limit = Number(req.query.limit) || 20;
    const payments = await prisma.clientPayment.findMany({
      include: {
        client: { select: { id: true, clientName: true } },
        job: { select: { id: true, jobCode: true, jobName: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take: limit,
    });

    res.json(
      payments.map((payment) => ({
        id: payment.id,
        clientId: payment.clientId,
        clientName: payment.client.clientName,
        jobId: payment.jobId,
        jobCode: payment.job?.jobCode || null,
        jobName: payment.job?.jobName || null,
        paymentAmount: Number(payment.paymentAmount),
        currency: payment.currency,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        referenceNumber: payment.referenceNumber,
        invoiceNumber: payment.invoiceNumber,
        notes: payment.notes,
      }))
    );
  } catch (error: any) {
    logger.error('finance_dashboard_collections_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load collections' });
  }
});

// GET /finance-dashboard/collections/outstanding-invoices
router.get(
  '/collections/outstanding-invoices',
  authMiddleware,
  canReadCollections,
  async (req: AuthRequest, res) => {
    try {
      const context = await getFinanceContext(req);
      if (context.error) {
        return res.status(context.error.status).json({ error: context.error.message });
      }

      const clientIdQuery = String(req.query.clientId || '').trim();
      const jobIdQuery = String(req.query.jobId || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);

      const resolvedClientId = clientIdQuery ? Number(clientIdQuery) : null;
      if (resolvedClientId !== null && (!Number.isFinite(resolvedClientId) || resolvedClientId <= 0)) {
        return res.status(400).json({ error: 'Invalid clientId' });
      }

      const resolvedJobId = jobIdQuery ? Number(jobIdQuery) : null;
      if (resolvedJobId !== null && (!Number.isFinite(resolvedJobId) || resolvedJobId <= 0)) {
        return res.status(400).json({ error: 'Invalid jobId' });
      }

      const invoices = await prisma.jobInvoice.findMany({
        where: {
          amountOutstanding: { gt: 0 },
          status: {
            in: ['draft', 'issued', 'partially_paid', 'overdue'],
          },
          ...(resolvedClientId ? { clientId: resolvedClientId } : {}),
          ...(resolvedJobId ? { jobId: resolvedJobId } : {}),
        },
        include: {
          client: {
            select: {
              id: true,
              clientName: true,
            },
          },
          job: {
            select: {
              id: true,
              jobCode: true,
              jobName: true,
            },
          },
          milestoneTask: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: limit,
      });

      res.json(
        invoices.map((invoice) => ({
          id: invoice.id,
          clientId: invoice.clientId,
          clientName: invoice.client.clientName,
          jobId: invoice.jobId,
          jobCode: invoice.job.jobCode || null,
          jobName: invoice.job.jobName,
          invoiceNumber: invoice.invoiceNumber,
          title: invoice.title,
          status: invoice.status,
          currency: invoice.currency,
          totalAmount: Number(invoice.totalAmount || 0),
          amountPaid: Number(invoice.amountPaid || 0),
          amountOutstanding: Number(invoice.amountOutstanding || 0),
          dueDate: invoice.dueDate,
          issuedAt: invoice.issuedAt,
          milestoneTaskId: invoice.milestoneTaskId,
          milestoneTitle: invoice.milestoneTask?.title || null,
        }))
      );
    } catch (error: any) {
      logger.error('finance_dashboard_outstanding_invoices_error', toLogContext(error));
      res.status(500).json({ error: 'Failed to load outstanding invoices' });
    }
  }
);

// POST /finance-dashboard/collections
router.post('/collections', authMiddleware, canWriteCollections, async (req: AuthRequest, res) => {
  let activeIdempotencyKey: string | null = null;
  let registeredInFlight = false;
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const {
      clientId,
      jobId,
      invoiceId,
      paymentAmount,
      currency,
      paymentDate,
      paymentMethod,
      referenceNumber,
      notes,
      invoiceNumber,
      idempotencyKey: bodyIdempotencyKey,
    } = req.body;

    if (!clientId || paymentAmount === undefined || paymentDate === undefined) {
      return res.status(400).json({ error: 'clientId, paymentAmount, and paymentDate are required' });
    }

    const resolvedClientId = Number(clientId);
    if (!Number.isFinite(resolvedClientId) || resolvedClientId <= 0) {
      return res.status(400).json({ error: 'Invalid clientId' });
    }

    const resolvedJobId =
      jobId === undefined || jobId === null || jobId === '' ? null : Number(jobId);
    if (resolvedJobId !== null && (!Number.isFinite(resolvedJobId) || resolvedJobId <= 0)) {
      return res.status(400).json({ error: 'Invalid jobId' });
    }
    const resolvedInvoiceId =
      invoiceId === undefined || invoiceId === null || invoiceId === '' ? null : Number(invoiceId);
    if (resolvedInvoiceId !== null && (!Number.isFinite(resolvedInvoiceId) || resolvedInvoiceId <= 0)) {
      return res.status(400).json({ error: 'Invalid invoiceId' });
    }

    const paymentAmountNumber = Number(paymentAmount);
    if (!Number.isFinite(paymentAmountNumber) || paymentAmountNumber <= 0) {
      return res.status(400).json({ error: 'paymentAmount must be a positive number' });
    }

    const paymentDateValue = parseIsoDate(paymentDate);
    if (!paymentDateValue) {
      return res.status(400).json({ error: 'Invalid paymentDate' });
    }

    const normalizedCurrency = String(currency || 'KES').trim().toUpperCase() || 'KES';
    const normalizedPaymentMethod = paymentMethod ? String(paymentMethod).trim() : null;
    const normalizedReferenceNumber = referenceNumber ? String(referenceNumber).trim() : null;
    const normalizedInvoiceNumber = invoiceNumber ? String(invoiceNumber).trim() : null;
    const normalizedNotes = notes ? String(notes).trim() : null;

    const requestIdempotencyKey = String(
      req.headers['x-idempotency-key'] || bodyIdempotencyKey || ''
    ).trim();
    const idempotencyKey =
      requestIdempotencyKey ||
      buildCollectionFingerprint({
        actorProfileId: context.profileId,
        clientId: resolvedClientId,
        jobId: resolvedJobId,
        paymentAmount: paymentAmountNumber,
        currency: normalizedCurrency,
        paymentDateIso: paymentDateValue.toISOString(),
        paymentMethod: normalizedPaymentMethod,
        referenceNumber: normalizedReferenceNumber,
        invoiceNumber: normalizedInvoiceNumber,
      });
    activeIdempotencyKey = idempotencyKey;

    pruneCollectionIdempotencyCache();
    const cached = collectionResponseCache.get(idempotencyKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.payload);
    }

    const existingInFlight = collectionInFlight.get(idempotencyKey);
    if (existingInFlight) {
      const inFlightResult = await existingInFlight;
      return res.status(inFlightResult.statusCode).json(inFlightResult.payload);
    }

    const operation = (async () => {
      const txResult = await prisma.$transaction(async (tx) => {
        const existingPayment = await tx.clientPayment.findFirst({
          where: {
            clientId: resolvedClientId,
            jobId: resolvedJobId,
            paymentAmount: paymentAmountNumber,
            currency: normalizedCurrency,
            paymentDate: paymentDateValue,
            paymentMethod: normalizedPaymentMethod,
            referenceNumber: normalizedReferenceNumber,
            invoiceNumber: normalizedInvoiceNumber,
            recordedByProfileId: context.profileId,
          },
          orderBy: { id: 'desc' },
        });

        if (existingPayment) {
          return {
            reused: true,
            payment: existingPayment,
            partnerProfileId: null as number | null,
            managerProfileId: null as number | null,
            receivableOwnerProfileId: null as number | null,
            departmentId: null as number | null,
            jobName: null as string | null,
            jobId: existingPayment.jobId,
            riskAlerts: [] as Array<{
              month: string;
              variancePercent: number;
              jobId: number;
              partnerProfileId: number | null;
              managerProfileId: number | null;
              receivableOwnerProfileId: number | null;
              departmentId: number | null;
            }>,
          };
        }

        let invoiceToApply: {
          id: number;
          jobId: number;
          clientId: number;
          invoiceNumber: string;
          amountOutstanding: Prisma.Decimal;
          status: string;
        } | null = null;

        if (resolvedInvoiceId) {
          invoiceToApply = await tx.jobInvoice.findUnique({
            where: { id: resolvedInvoiceId },
            select: {
              id: true,
              jobId: true,
              clientId: true,
              invoiceNumber: true,
              amountOutstanding: true,
              status: true,
            },
          });

          if (!invoiceToApply) {
            throw new Error('Selected invoice was not found');
          }
          if (invoiceToApply.clientId !== resolvedClientId) {
            throw new Error('Selected invoice does not belong to the chosen client');
          }
          if (resolvedJobId !== null && invoiceToApply.jobId !== resolvedJobId) {
            throw new Error('Selected invoice does not belong to the chosen job');
          }
          if (['paid', 'void'].includes(String(invoiceToApply.status))) {
            throw new Error('Selected invoice cannot receive additional payment');
          }
          if (paymentAmountNumber - Number(invoiceToApply.amountOutstanding || 0) > 0.0001) {
            throw new Error('Payment amount exceeds the invoice outstanding balance');
          }
        } else if (normalizedInvoiceNumber) {
          invoiceToApply = await tx.jobInvoice.findFirst({
            where: {
              invoiceNumber: normalizedInvoiceNumber,
            },
            select: {
              id: true,
              jobId: true,
              clientId: true,
              invoiceNumber: true,
              amountOutstanding: true,
              status: true,
            },
          });

          if (invoiceToApply) {
            if (invoiceToApply.clientId !== resolvedClientId) {
              throw new Error('Invoice number does not belong to the chosen client');
            }
            if (resolvedJobId !== null && invoiceToApply.jobId !== resolvedJobId) {
              throw new Error('Invoice number does not belong to the chosen job');
            }
            if (['paid', 'void'].includes(String(invoiceToApply.status))) {
              throw new Error('Selected invoice cannot receive additional payment');
            }
            if (paymentAmountNumber - Number(invoiceToApply.amountOutstanding || 0) > 0.0001) {
              throw new Error('Payment amount exceeds the invoice outstanding balance');
            }
          }
        }

        const payment = await tx.clientPayment.create({
          data: {
            clientId: resolvedClientId,
            jobId: resolvedJobId ?? invoiceToApply?.jobId ?? null,
            paymentAmount: paymentAmountNumber,
            currency: normalizedCurrency,
            paymentDate: paymentDateValue,
            paymentMethod: normalizedPaymentMethod,
            referenceNumber: normalizedReferenceNumber,
            notes: normalizedNotes,
            invoiceNumber: normalizedInvoiceNumber || invoiceToApply?.invoiceNumber || null,
            recordedByProfileId: context.profileId,
          },
        });

        if (invoiceToApply) {
          await jobService.applyClientPaymentToInvoice(tx, {
            invoiceId: invoiceToApply.id,
            clientPaymentId: payment.id,
            appliedAmount: paymentAmountNumber,
            appliedByProfileId: context.profileId ?? null,
            notes: normalizedNotes,
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'finance_collection_recorded',
            entityType: 'client_payment',
            entityId: payment.id,
            userId: context.userId,
            ipAddress: req.ip || null,
            metadata: {
              clientId: payment.clientId,
              jobId: payment.jobId,
              paymentAmount: paymentAmountNumber,
              currency: payment.currency,
              paymentDate: paymentDateValue.toISOString(),
              idempotencyKey,
              referenceNumber: normalizedReferenceNumber,
              invoiceNumber: normalizedInvoiceNumber,
              invoiceId: resolvedInvoiceId,
            },
          },
        });

        let partnerProfileId: number | null = null;
        let managerProfileId: number | null = null;
        let receivableOwnerProfileId: number | null = null;
        let departmentId: number | null = null;
        let jobName: string | null = null;
        let targetJobId: number | null = payment.jobId;
        const riskAlerts: Array<{
          month: string;
          variancePercent: number;
          jobId: number;
          partnerProfileId: number | null;
          managerProfileId: number | null;
          receivableOwnerProfileId: number | null;
          departmentId: number | null;
        }> = [];

        if (payment.jobId) {
          const job = await tx.job.findUnique({
            where: { id: payment.jobId },
            select: {
              id: true,
              jobName: true,
              departmentId: true,
              partnerProfileId: true,
              managerProfileId: true,
              receivableOwnerProfileId: true,
              billingType: true,
              fixedFeeAmount: true,
              jobCosting: {
                include: { allocations: true },
              },
              timeEntries: {
                where: { status: 'approved' },
                select: {
                  employeeProfileId: true,
                  hours: true,
                  billableAmount: true,
                  billable: true,
                },
              },
            },
          });

          if (job) {
            partnerProfileId = job.partnerProfileId ?? null;
            managerProfileId = job.managerProfileId ?? null;
            receivableOwnerProfileId = job.receivableOwnerProfileId ?? null;
            departmentId = job.departmentId ?? null;
            jobName = job.jobName;
            targetJobId = job.id;

            const allocationMonth = new Date(
              paymentDateValue.getFullYear(),
              paymentDateValue.getMonth(),
              1
            );

            const employeeTotals = new Map<
              number,
              {
                billableHours: number;
                profitHours: number;
                lossHours: number;
                adjustedHours: number;
                ratioBase: number;
                allocatedHours: number;
                allocatedCost: number;
                effectiveRate: number;
              }
            >();

            const allocations = job.jobCosting?.allocations || [];
            allocations.forEach((alloc) => {
              const current = employeeTotals.get(alloc.employeeProfileId) || {
                billableHours: 0,
                profitHours: 0,
                lossHours: 0,
                adjustedHours: 0,
                ratioBase: 0,
                allocatedHours: 0,
                allocatedCost: 0,
                effectiveRate: 0,
              };
              const allocHours = Number(alloc.allocatedHours || 0);
              const allocRate = Number(alloc.hourlyRate || 0);
              current.allocatedHours += allocHours;
              current.allocatedCost += allocHours * allocRate;
              employeeTotals.set(alloc.employeeProfileId, current);
            });

            job.timeEntries.forEach((entry) => {
              const current = employeeTotals.get(entry.employeeProfileId) || {
                billableHours: 0,
                profitHours: 0,
                lossHours: 0,
                adjustedHours: 0,
                ratioBase: 0,
                allocatedHours: 0,
                allocatedCost: 0,
                effectiveRate: 0,
              };
              if (entry.billable) {
                current.billableHours += Number(entry.hours || 0);
              }
              employeeTotals.set(entry.employeeProfileId, current);
            });

            // IMPLEMENTED: Collections revenue allocation formula â€” per-payment allocation now uses adjusted billable hours (billable +/- profit/loss hours).
            employeeTotals.forEach((value) => {
              value.effectiveRate =
                value.allocatedHours > 0 ? value.allocatedCost / value.allocatedHours : 0;
              const varianceHours = value.allocatedHours - value.billableHours;
              value.profitHours = varianceHours > 0 ? varianceHours : 0;
              value.lossHours = varianceHours < 0 ? Math.abs(varianceHours) : 0;
              value.adjustedHours = Math.max(
                0,
                value.billableHours + value.profitHours - value.lossHours
              );
              value.ratioBase = value.adjustedHours;
            });

            let totalAdjustedJobBillableHours = 0;
            employeeTotals.forEach((value) => {
              totalAdjustedJobBillableHours += value.ratioBase;
            });

            if (totalAdjustedJobBillableHours <= 0) {
              employeeTotals.forEach((value) => {
                value.ratioBase = value.allocatedHours > 0 ? value.allocatedHours : value.billableHours;
              });
              totalAdjustedJobBillableHours = Array.from(employeeTotals.values()).reduce(
                (sum, value) => sum + Number(value.ratioBase || 0),
                0
              );
            }

            if (totalAdjustedJobBillableHours > 0) {
              await Promise.all(
                Array.from(employeeTotals.entries()).map(([employeeProfileId, value]) =>
                  tx.revenueAllocation.upsert({
                    where: {
                      jobId_clientPaymentId_employeeProfileId: {
                        jobId: job.id,
                        clientPaymentId: payment.id,
                        employeeProfileId,
                      },
                    },
                    update: {
                      employeeBillable: value.billableHours,
                      employeeProfit: value.profitHours * value.effectiveRate,
                      employeeLoss: value.lossHours * value.effectiveRate,
                      totalJobBillable: totalAdjustedJobBillableHours,
                      allocationPercentage:
                        totalAdjustedJobBillableHours > 0
                          ? value.ratioBase / totalAdjustedJobBillableHours
                          : 0,
                      allocatedAmount:
                        totalAdjustedJobBillableHours > 0
                          ? (value.ratioBase / totalAdjustedJobBillableHours) * paymentAmountNumber
                          : 0,
                      allocationMonth,
                      currency: payment.currency || 'KES',
                    },
                    create: {
                      jobId: job.id,
                      clientPaymentId: payment.id,
                      employeeProfileId,
                      employeeBillable: value.billableHours,
                      employeeProfit: value.profitHours * value.effectiveRate,
                      employeeLoss: value.lossHours * value.effectiveRate,
                      totalJobBillable: totalAdjustedJobBillableHours,
                      allocationPercentage:
                        totalAdjustedJobBillableHours > 0
                          ? value.ratioBase / totalAdjustedJobBillableHours
                          : 0,
                      allocatedAmount:
                        totalAdjustedJobBillableHours > 0
                          ? (value.ratioBase / totalAdjustedJobBillableHours) * paymentAmountNumber
                          : 0,
                      allocationMonth,
                      currency: payment.currency || 'KES',
                    },
                  })
                )
              );
            }

            const projectionMonthStart = allocationMonth;
            const projectionMonthEnd = new Date(
              projectionMonthStart.getFullYear(),
              projectionMonthStart.getMonth() + 1,
              1
            );

            const projectionTargets = await tx.revenueProjection.findMany({
              where: {
                monthYear: { gte: projectionMonthStart, lt: projectionMonthEnd },
                OR: [
                  { clientId: payment.clientId },
                  job.departmentId ? { departmentId: job.departmentId } : undefined,
                ].filter(Boolean) as any,
              },
            });

            await Promise.all(
              projectionTargets.map(async (projection) => {
                const actualCollected =
                  Number(projection.actualCollected || 0) + Number(payment.paymentAmount);
                const variance = actualCollected - Number(projection.projectedAmount || 0);
                const variancePercent =
                  Number(projection.projectedAmount || 0) > 0
                    ? (variance / Number(projection.projectedAmount || 0)) * 100
                    : 0;

                if (variancePercent <= -20) {
                  riskAlerts.push({
                    month: projection.monthYear.toISOString().slice(0, 7),
                    variancePercent,
                    jobId: job.id,
                    partnerProfileId: job.partnerProfileId ?? null,
                    managerProfileId: job.managerProfileId ?? null,
                    receivableOwnerProfileId: job.receivableOwnerProfileId ?? null,
                    departmentId: job.departmentId ?? null,
                  });
                }

                return tx.revenueProjection.update({
                  where: { id: projection.id },
                  data: {
                    actualCollected,
                    variance,
                    variancePercent,
                  },
                });
              })
            );
          }
        }

        return {
          reused: false,
          payment,
          partnerProfileId,
          managerProfileId,
          receivableOwnerProfileId,
          departmentId,
          jobName,
          jobId: targetJobId,
          riskAlerts,
        };
      });

      if (!txResult.reused) {
        try {
          if (txResult.jobName && txResult.jobId) {
            const stakeholderProfiles = new Set<number>();
            [
              txResult.partnerProfileId,
              txResult.managerProfileId,
              txResult.receivableOwnerProfileId,
            ].forEach((profileId) => {
              if (profileId && profileId !== context.profileId) {
                stakeholderProfiles.add(profileId);
              }
            });

            await Promise.all(
              Array.from(stakeholderProfiles).map((profileId) =>
                notifyProfile(
                  profileId,
                  {
                    title: 'Payment recorded',
                    message: `Payment of ${normalizedCurrency} ${paymentAmountNumber.toLocaleString()} was recorded for "${txResult.jobName}".`,
                    link: '/finance-balances',
                    relatedEntityId: txResult.jobId!,
                    actionRequired: false,
                  },
                  req
                )
              )
            );

            await Promise.all([
              notifyProfilesByRoles(
                ['finance'],
                {
                  title: 'Payment recorded',
                  message: `A payment was recorded for "${txResult.jobName}".`,
                  link: '/finance-balances',
                  relatedEntityId: txResult.jobId,
                  actionRequired: false,
                },
                req
              ),
              notifyProfilesByRoles(
                ['gmp'],
                {
                  title: 'Payment recorded',
                  message: `Collections updated for "${txResult.jobName}".`,
                  link: '/finance-balances',
                  relatedEntityId: txResult.jobId,
                  actionRequired: false,
                },
                req
              ),
            ]);
          }

          await Promise.all(
            txResult.riskAlerts.map(async (alert) => {
              const profileTargets = new Set<number>();
              [
                alert.partnerProfileId,
                alert.managerProfileId,
                alert.receivableOwnerProfileId,
              ].forEach((profileId) => {
                if (profileId && profileId !== context.profileId) {
                  profileTargets.add(profileId);
                }
              });

              await Promise.all(
                Array.from(profileTargets).map((profileId) =>
                  notifyProfile(
                    profileId,
                    {
                      title: 'Collection risk detected',
                      message: `Collections are ${Math.abs(alert.variancePercent).toFixed(1)}% below projection for ${alert.month}.`,
                      link: `/finance-dashboard?month=${alert.month}`,
                      relatedEntityId: alert.jobId,
                      actionRequired: true,
                    },
                    req
                  )
                )
              );

              await Promise.all([
                notifyProfilesByRoles(
                  ['finance'],
                  {
                    title: 'Collection risk detected',
                    message: `Collections are ${Math.abs(alert.variancePercent).toFixed(1)}% below projection for ${alert.month}.`,
                    link: `/finance-dashboard?month=${alert.month}`,
                    relatedEntityId: alert.jobId,
                    actionRequired: true,
                  },
                  req
                ),
                notifyProfilesByRoles(
                  ['gmp'],
                  {
                    title: 'Collection risk detected',
                    message: `Collections are ${Math.abs(alert.variancePercent).toFixed(1)}% below projection for ${alert.month}.`,
                    link: `/finance-dashboard?month=${alert.month}`,
                    relatedEntityId: alert.jobId,
                    actionRequired: true,
                  },
                  req
                ),
              ]);
            })
          );

          if (txResult.jobId) {
            await jobService.notifyNextReadyInvoiceMilestone(txResult.jobId, {
              userId: context.userId,
              profileId: context.profileId ?? 0,
              roles: [],
            });
          }
        } catch (notifyError) {
          logger.error('finance_dashboard_collection_notify_error', toLogContext(notifyError));
        }
      }

      const payload = {
        ...txResult.payment,
        idempotency: {
          key: idempotencyKey,
          reused: txResult.reused,
        },
      };
      const statusCode = txResult.reused ? 200 : 201;

      collectionResponseCache.set(idempotencyKey, {
        expiresAt: Date.now() + COLLECTION_IDEMPOTENCY_TTL_MS,
        payload,
      });

      return { statusCode, payload };
    })();

    collectionInFlight.set(idempotencyKey, operation);
    registeredInFlight = true;
    const result = await operation;
    res.status(result.statusCode).json(result.payload);
  } catch (error: any) {
    logger.error('finance_dashboard_collections_create_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to record payment' });
  } finally {
    if (activeIdempotencyKey && registeredInFlight) {
      collectionInFlight.delete(activeIdempotencyKey);
    }
  }
});

// GET /finance-dashboard/projections
router.get('/projections', authMiddleware, canReadProjections, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const projections = await prisma.revenueProjection.findMany({
      include: {
        client: { select: { id: true, clientName: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { monthYear: 'desc' },
      take: 24,
    });

    res.json(
      projections.map((projection) => ({
        id: projection.id,
        monthYear: projection.monthYear,
        projectedAmount: Number(projection.projectedAmount),
        currency: projection.currency,
        actualCollected: Number(projection.actualCollected),
        variance: Number(projection.variance),
        variancePercent: Number(projection.variancePercent),
        status: projection.status,
        clientId: projection.clientId,
        clientName: projection.client?.clientName ?? null,
        departmentId: projection.departmentId,
        departmentName: projection.department?.name ?? null,
      }))
    );
  } catch (error: any) {
    logger.error('finance_dashboard_projections_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load projections' });
  }
});

// POST /finance-dashboard/projections
router.post('/projections', authMiddleware, canWriteProjections, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const { clientId, departmentId, monthYear, projectedAmount, currency } = req.body;
    if (!monthYear || !projectedAmount) {
      return res.status(400).json({ error: 'monthYear and projectedAmount are required' });
    }

    const resolvedClientId = clientId ? Number(clientId) : undefined;
    const resolvedDepartmentId = departmentId ? Number(departmentId) : undefined;
    const parsedMonthYearDate = parseIsoDate(monthYear);
    if (!parsedMonthYearDate) {
      return res.status(400).json({ error: 'Invalid monthYear' });
    }
    const monthYearDate = toMonthStartUtc(parsedMonthYearDate);
    const projectedAmountNumber = Number(projectedAmount);
    if (!Number.isFinite(projectedAmountNumber) || projectedAmountNumber <= 0) {
      return res.status(400).json({ error: 'projectedAmount must be a positive number' });
    }
    if (resolvedClientId !== undefined && (!Number.isFinite(resolvedClientId) || resolvedClientId <= 0)) {
      return res.status(400).json({ error: 'Invalid clientId' });
    }
    if (
      resolvedDepartmentId !== undefined &&
      (!Number.isFinite(resolvedDepartmentId) || resolvedDepartmentId <= 0)
    ) {
      return res.status(400).json({ error: 'Invalid departmentId' });
    }

    const projection = await prisma.$transaction(async (tx) => {
      const existingProjection = await tx.revenueProjection.findFirst({
        where: {
          clientId: resolvedClientId ?? null,
          departmentId: resolvedDepartmentId ?? null,
          monthYear: monthYearDate,
        },
      });

      const savedProjection = existingProjection
        ? await tx.revenueProjection.update({
            where: { id: existingProjection.id },
            data: {
              projectedAmount: projectedAmountNumber,
              currency: currency || 'KES',
            },
          })
        : await tx.revenueProjection.create({
            data: {
              clientId: resolvedClientId,
              departmentId: resolvedDepartmentId,
              monthYear: monthYearDate,
              projectedAmount: projectedAmountNumber,
              currency: currency || 'KES',
              createdByProfileId: context.profileId,
            },
          });

      await tx.auditLog.create({
        data: {
          action: 'finance_projection_upserted',
          entityType: 'revenue_projection',
          entityId: savedProjection.id,
          userId: context.userId,
          ipAddress: req.ip || null,
          metadata: {
            projectionId: savedProjection.id,
            clientId: savedProjection.clientId,
            departmentId: savedProjection.departmentId,
            monthYear: savedProjection.monthYear.toISOString(),
            projectedAmount: Number(savedProjection.projectedAmount),
            currency: savedProjection.currency,
          },
        },
      });

      return savedProjection;
    });

    res.status(201).json(projection);
  } catch (error: any) {
    logger.error('finance_dashboard_projections_create_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to save projection' });
  }
});

// GET /finance-dashboard/client-balances
router.get('/client-balances', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const clients = await prisma.client.findMany({
      include: {
        jobs: {
          include: {
            jobCosting: true,
            payments: true,
          },
        },
      },
    });

    const balances = clients.map((client) => {
      let totalFee = 0;
      let totalCollected = 0;

      client.jobs.forEach((job) => {
        totalFee += resolveJobFee(job);
        totalCollected += job.payments.reduce(
          (sum, payment) => sum + Number(payment.paymentAmount || 0),
          0
        );
      });

      return {
        clientId: client.id,
        clientName: client.clientName,
        totalFee,
        totalCollected,
        balance: Math.max(0, totalFee - totalCollected),
        jobsCount: client.jobs.length,
      };
    });

    res.json(balances);
  } catch (error: any) {
    logger.error('finance_dashboard_client_balances_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load client balances' });
  }
});

// GET /finance-dashboard/job-balances
router.get('/job-balances', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobs = await prisma.job.findMany({
      include: {
        client: { select: { clientName: true } },
        jobCosting: true,
        payments: true,
        receivableOwner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
          },
        },
        receivableFollowUps: {
          orderBy: { actionDate: 'desc' },
          take: 1,
          select: {
            actionDate: true,
            nextFollowUpDate: true,
            actionType: true,
            isResolved: true,
          },
        },
      },
      orderBy: { jobName: 'asc' },
    });

    const nowDate = new Date();
    const balances = jobs.map((job) => {
      const fee = resolveJobFee(job);
      const collected = job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      );
      const balance = Math.max(0, fee - collected);
      const anchorDate = resolveReceivableAnchorDate(job);
      const daysOutstanding = balance > 0 ? toAgingDays(anchorDate) : 0;
      const agingBucket = toAgingBucket(daysOutstanding);
      const latestFollowUp = job.receivableFollowUps[0] ?? null;
      const slaState = resolveReceivableSlaState({
        balance,
        agingBucket,
        anchorDate,
        latestFollowUp,
        nowDate,
      });

      return {
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientName: job.client?.clientName ?? 'Unassigned',
        fee,
        collected,
        balance,
        status: job.status,
        collectionStage: job.collectionStage,
        readyForCollectionAt: job.readyForCollectionAt,
        receivableOwnerProfileId: job.receivableOwnerProfileId,
        receivableOwnerName: job.receivableOwner
          ? `${job.receivableOwner.firstName} ${job.receivableOwner.lastName}`.trim()
          : null,
        receivableOwnerPosition: job.receivableOwner?.positionTitle ?? null,
        daysOutstanding,
        agingBucket,
        lastFollowUpAt: latestFollowUp?.actionDate ?? null,
        nextFollowUpDate: latestFollowUp?.nextFollowUpDate ?? null,
        lastFollowUpActionType: latestFollowUp?.actionType ?? null,
        followUpResolved: latestFollowUp?.isResolved ?? false,
        expectedFollowUpDate: slaState.expectedFollowUpDate,
        slaStatus: slaState.slaStatus,
        slaBreached: slaState.slaBreached,
        slaDueSoon: slaState.slaDueSoon,
        slaBreachDays: slaState.slaBreachDays,
      };
    });

    res.json(balances);
  } catch (error: any) {
    logger.error('finance_dashboard_job_balances_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load job balances' });
  }
});

// GET /finance-dashboard/receivable-owners
router.get('/receivable-owners', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const owners = await prisma.profile.findMany({
      where: {
        status: 'active',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        positionTitle: true,
        department: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 500,
    });

    res.json(
      owners.map((owner) => ({
        profileId: owner.id,
        name: `${owner.firstName} ${owner.lastName}`.trim(),
        positionTitle: owner.positionTitle,
        departmentName: owner.department?.name ?? null,
      }))
    );
  } catch (error: any) {
    logger.error('finance_dashboard_receivable_owners_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load receivable owners' });
  }
});

// PATCH /finance-dashboard/job-balances/:jobId/owner
router.patch('/job-balances/:jobId/owner', authMiddleware, canAdminFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const requestedOwnerRaw = req.body?.ownerProfileId;
    let ownerProfileId: number | null = null;

    if (requestedOwnerRaw !== undefined && requestedOwnerRaw !== null && requestedOwnerRaw !== '') {
      const parsedOwner = Number(requestedOwnerRaw);
      if (!Number.isFinite(parsedOwner) || parsedOwner <= 0) {
        return res.status(400).json({ error: 'Invalid ownerProfileId' });
      }

      const owner = await prisma.profile.findUnique({
        where: { id: parsedOwner },
        select: { id: true, status: true, firstName: true, lastName: true },
      });
      if (!owner || owner.status !== 'active') {
        return res.status(400).json({ error: 'Owner profile not found or inactive' });
      }
      ownerProfileId = owner.id;
    }

    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobName: true,
        receivableOwnerProfileId: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextValue = await tx.job.update({
        where: { id: jobId },
        data: {
          receivableOwnerProfileId: ownerProfileId,
          receivableOwnerAssignedAt: ownerProfileId ? new Date() : null,
        },
        select: {
          id: true,
          jobCode: true,
          jobName: true,
          receivableOwnerProfileId: true,
          receivableOwnerAssignedAt: true,
          receivableOwner: {
            select: {
              firstName: true,
              lastName: true,
              positionTitle: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'finance_receivable_owner_assigned',
          entityType: 'job',
          entityId: nextValue.id,
          userId: context.userId,
          ipAddress: req.ip || null,
          metadata: {
            jobId: nextValue.id,
            previousOwnerProfileId: existingJob.receivableOwnerProfileId,
            ownerProfileId: nextValue.receivableOwnerProfileId,
          },
        },
      });

      return nextValue;
    });

    if (
      ownerProfileId &&
      ownerProfileId !== existingJob.receivableOwnerProfileId &&
      ownerProfileId !== context.profileId
    ) {
      await notifyProfile(
        ownerProfileId,
        {
          title: 'Receivable owner assigned',
          message: `You were assigned as receivable owner for "${existingJob.jobName}".`,
          link: '/finance-balances',
          relatedEntityId: existingJob.id,
          actionRequired: true,
        },
        req
      );
    }

    res.json({
      jobId: updated.id,
      jobCode: updated.jobCode,
      jobName: updated.jobName,
      receivableOwnerProfileId: updated.receivableOwnerProfileId,
      receivableOwnerName: updated.receivableOwner
        ? `${updated.receivableOwner.firstName} ${updated.receivableOwner.lastName}`.trim()
        : null,
      receivableOwnerPosition: updated.receivableOwner?.positionTitle ?? null,
      receivableOwnerAssignedAt: updated.receivableOwnerAssignedAt,
    });
  } catch (error: any) {
    logger.error('finance_dashboard_receivable_owner_update_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to assign receivable owner' });
  }
});

// GET /finance-dashboard/job-balances/:jobId/follow-ups
router.get('/job-balances/:jobId/follow-ups', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 30));
    const logs = await prisma.receivableFollowUpAction.findMany({
      where: { jobId },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
          },
        },
        actionBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            positionTitle: true,
          },
        },
      },
      orderBy: [{ actionDate: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    res.json(
      logs.map((log) => ({
        id: log.id,
        jobId: log.jobId,
        actionType: log.actionType,
        actionDate: log.actionDate,
        notes: log.notes,
        nextFollowUpDate: log.nextFollowUpDate,
        promisedPaymentDate: log.promisedPaymentDate,
        promisedPaymentAmount: Number(log.promisedPaymentAmount || 0),
        isResolved: log.isResolved,
        ownerProfileId: log.ownerProfileId,
        ownerName: log.owner ? `${log.owner.firstName} ${log.owner.lastName}`.trim() : null,
        actionByProfileId: log.actionByProfileId,
        actionByName: `${log.actionBy.firstName} ${log.actionBy.lastName}`.trim(),
      }))
    );
  } catch (error: any) {
    logger.error('finance_dashboard_followup_logs_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load receivable follow-up logs' });
  }
});

// POST /finance-dashboard/job-balances/:jobId/follow-ups
router.post('/job-balances/:jobId/follow-ups', authMiddleware, canWriteFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const actorProfileId = context.profileId;
    if (!actorProfileId) {
      return res.status(400).json({ error: 'Current user profile is required to log follow-up actions' });
    }

    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const requestedActionType = String(req.body?.actionType || 'note').trim();
    if (!receivableActionTypes.has(requestedActionType)) {
      return res.status(400).json({
        error: 'Invalid actionType. Allowed: call, email, meeting, reminder, escalation, promise_to_pay, dispute, note',
      });
    }

    const notes = String(req.body?.notes || '').trim();
    if (!notes) {
      return res.status(400).json({ error: 'notes are required' });
    }

    const nextFollowUpDate = req.body?.nextFollowUpDate ? new Date(req.body.nextFollowUpDate) : null;
    if (nextFollowUpDate && Number.isNaN(nextFollowUpDate.getTime())) {
      return res.status(400).json({ error: 'Invalid nextFollowUpDate' });
    }

    const promisedPaymentDate = req.body?.promisedPaymentDate ? new Date(req.body.promisedPaymentDate) : null;
    if (promisedPaymentDate && Number.isNaN(promisedPaymentDate.getTime())) {
      return res.status(400).json({ error: 'Invalid promisedPaymentDate' });
    }

    const promisedPaymentAmountRaw = req.body?.promisedPaymentAmount;
    const promisedPaymentAmount =
      promisedPaymentAmountRaw === undefined || promisedPaymentAmountRaw === null || promisedPaymentAmountRaw === ''
        ? null
        : Number(promisedPaymentAmountRaw);

    if (promisedPaymentAmount !== null && (!Number.isFinite(promisedPaymentAmount) || promisedPaymentAmount < 0)) {
      return res.status(400).json({ error: 'Invalid promisedPaymentAmount' });
    }

    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        clientId: true,
        jobName: true,
        receivableOwnerProfileId: true,
        managerProfileId: true,
        partnerProfileId: true,
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let ownerProfileId: number | null = existingJob.receivableOwnerProfileId;
    const requestedOwnerRaw = req.body?.ownerProfileId;
    if (requestedOwnerRaw !== undefined && requestedOwnerRaw !== null && requestedOwnerRaw !== '') {
      const parsedOwner = Number(requestedOwnerRaw);
      if (!Number.isFinite(parsedOwner) || parsedOwner <= 0) {
        return res.status(400).json({ error: 'Invalid ownerProfileId' });
      }
      const owner = await prisma.profile.findUnique({
        where: { id: parsedOwner },
        select: { id: true, status: true },
      });
      if (!owner || owner.status !== 'active') {
        return res.status(400).json({ error: 'Owner profile not found or inactive' });
      }
      ownerProfileId = owner.id;
    }

    const isResolved = Boolean(req.body?.isResolved);

    const followUp = await prisma.$transaction(async (tx) => {
      if (ownerProfileId !== existingJob.receivableOwnerProfileId) {
        await tx.job.update({
          where: { id: existingJob.id },
          data: {
            receivableOwnerProfileId: ownerProfileId,
            receivableOwnerAssignedAt: ownerProfileId ? new Date() : null,
          },
        });
      }

      const createdFollowUp = await tx.receivableFollowUpAction.create({
        data: {
          jobId: existingJob.id,
          clientId: existingJob.clientId ?? null,
          ownerProfileId,
          actionByProfileId: actorProfileId,
          actionType: requestedActionType as any,
          notes,
          nextFollowUpDate,
          promisedPaymentDate,
          promisedPaymentAmount,
          isResolved,
        },
        include: {
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              positionTitle: true,
            },
          },
          actionBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              positionTitle: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'finance_receivable_follow_up_logged',
          entityType: 'receivable_follow_up_action',
          entityId: createdFollowUp.id,
          userId: context.userId,
          ipAddress: req.ip || null,
          metadata: {
            jobId: createdFollowUp.jobId,
            ownerProfileId: createdFollowUp.ownerProfileId,
            actionType: createdFollowUp.actionType,
            isResolved: createdFollowUp.isResolved,
            nextFollowUpDate: createdFollowUp.nextFollowUpDate?.toISOString() || null,
            promisedPaymentDate: createdFollowUp.promisedPaymentDate?.toISOString() || null,
            promisedPaymentAmount: Number(createdFollowUp.promisedPaymentAmount || 0),
          },
        },
      });

      return createdFollowUp;
    });

    const followUpTargets = new Set<number>();
    [followUp.ownerProfileId, existingJob.managerProfileId, existingJob.partnerProfileId].forEach(
      (profileId) => {
        if (profileId && profileId !== actorProfileId) {
          followUpTargets.add(profileId);
        }
      }
    );
    const followUpTitle = followUp.isResolved
      ? 'Receivable resolved'
      : 'Receivable follow-up logged';
    const followUpMessage = followUp.isResolved
      ? `Receivable for "${existingJob.jobName}" has been marked resolved.`
      : `A follow-up action was logged for "${existingJob.jobName}".`;
    const followUpActionRequired = !followUp.isResolved;

    await Promise.all(
      Array.from(followUpTargets).map((profileId) =>
        notifyProfile(
          profileId,
          {
            title: followUpTitle,
            message: followUpMessage,
            link: '/finance-balances',
            relatedEntityId: existingJob.id,
            actionRequired: followUpActionRequired,
          },
          req
        )
      )
    );

    await Promise.all([
      notifyProfilesByRoles(
        ['finance'],
        {
          title: followUpTitle,
          message: followUpMessage,
          link: '/finance-balances',
          relatedEntityId: existingJob.id,
          actionRequired: followUpActionRequired,
        },
        req
      ),
      followUp.isResolved
        ? notifyProfilesByRoles(
            ['gmp'],
            {
              title: followUpTitle,
              message: followUpMessage,
              link: '/finance-balances',
              relatedEntityId: existingJob.id,
              actionRequired: false,
            },
            req
          )
        : Promise.resolve(),
    ]);

    res.status(201).json({
      id: followUp.id,
      jobId: followUp.jobId,
      actionType: followUp.actionType,
      actionDate: followUp.actionDate,
      notes: followUp.notes,
      nextFollowUpDate: followUp.nextFollowUpDate,
      promisedPaymentDate: followUp.promisedPaymentDate,
      promisedPaymentAmount: Number(followUp.promisedPaymentAmount || 0),
      isResolved: followUp.isResolved,
      ownerProfileId: followUp.ownerProfileId,
      ownerName: followUp.owner ? `${followUp.owner.firstName} ${followUp.owner.lastName}`.trim() : null,
      actionByProfileId: followUp.actionByProfileId,
      actionByName: `${followUp.actionBy.firstName} ${followUp.actionBy.lastName}`.trim(),
    });
  } catch (error: any) {
    logger.error('finance_dashboard_followup_create_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to log receivable follow-up action' });
  }
});

// POST /finance-dashboard/job-balances/:jobId/escalate
router.post('/job-balances/:jobId/escalate', authMiddleware, canApproveFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const actorProfileId = context.profileId;
    if (!actorProfileId) {
      return res.status(400).json({ error: 'Current user profile is required to escalate receivables' });
    }

    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const escalationLevel = String(req.body?.escalationLevel || 'partner').trim().toLowerCase();
    const allowedEscalationLevels = new Set(['manager', 'partner', 'hr', 'gmp']);
    if (!allowedEscalationLevels.has(escalationLevel)) {
      return res.status(400).json({ error: 'Invalid escalationLevel. Allowed: manager, partner, hr, gmp' });
    }

    const notes = String(req.body?.notes || '').trim();
    if (!notes) {
      return res.status(400).json({ error: 'Escalation notes are required' });
    }

    const nextFollowUpDate = req.body?.nextFollowUpDate ? new Date(req.body.nextFollowUpDate) : null;
    if (nextFollowUpDate && Number.isNaN(nextFollowUpDate.getTime())) {
      return res.status(400).json({ error: 'Invalid nextFollowUpDate' });
    }

    const existingJob = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: { select: { id: true, clientName: true } },
        jobCosting: { select: { jobFee: true } },
        payments: { select: { paymentAmount: true } },
      },
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const fee = resolveJobFee(existingJob);
    const collected = existingJob.payments.reduce(
      (sum, payment) => sum + Number(payment.paymentAmount || 0),
      0
    );
    const balance = Math.max(0, fee - collected);

    if (balance <= 0) {
      return res.status(409).json({ error: 'Receivable is already fully collected' });
    }

    let ownerProfileId: number | null = existingJob.receivableOwnerProfileId;
    const requestedOwnerRaw = req.body?.ownerProfileId;
    if (requestedOwnerRaw !== undefined && requestedOwnerRaw !== null && requestedOwnerRaw !== '') {
      const parsedOwner = Number(requestedOwnerRaw);
      if (!Number.isFinite(parsedOwner) || parsedOwner <= 0) {
        return res.status(400).json({ error: 'Invalid ownerProfileId' });
      }
      const owner = await prisma.profile.findUnique({
        where: { id: parsedOwner },
        select: { id: true, status: true },
      });
      if (!owner || owner.status !== 'active') {
        return res.status(400).json({ error: 'Owner profile not found or inactive' });
      }
      ownerProfileId = owner.id;
    }

    const actionNotes = `[Escalation:${escalationLevel}] ${notes}`;

    const followUp = await prisma.$transaction(async (tx) => {
      if (ownerProfileId !== existingJob.receivableOwnerProfileId) {
        await tx.job.update({
          where: { id: existingJob.id },
          data: {
            receivableOwnerProfileId: ownerProfileId,
            receivableOwnerAssignedAt: ownerProfileId ? new Date() : null,
          },
        });
      }

      const createdFollowUp = await tx.receivableFollowUpAction.create({
        data: {
          jobId: existingJob.id,
          clientId: existingJob.clientId ?? null,
          ownerProfileId,
          actionByProfileId: actorProfileId,
          actionType: 'escalation',
          notes: actionNotes,
          nextFollowUpDate,
          isResolved: false,
        },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, positionTitle: true },
          },
          actionBy: {
            select: { id: true, firstName: true, lastName: true, positionTitle: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'finance_receivable_escalated',
          entityType: 'receivable_follow_up_action',
          entityId: createdFollowUp.id,
          userId: context.userId,
          ipAddress: req.ip || null,
          metadata: {
            jobId: createdFollowUp.jobId,
            ownerProfileId: createdFollowUp.ownerProfileId,
            escalationLevel,
            balance,
            nextFollowUpDate: createdFollowUp.nextFollowUpDate?.toISOString() || null,
          },
        },
      });

      return createdFollowUp;
    });

    const notificationTitle = `Receivable escalation: ${existingJob.jobName}`;
    const notificationMessage = `Escalation (${escalationLevel}) logged for "${existingJob.jobName}" with outstanding balance KES ${balance.toLocaleString()}.`;
    const notificationPayload = {
      title: notificationTitle,
      message: notificationMessage,
      link: '/finance-balances',
      relatedEntityId: existingJob.id,
      actionRequired: true,
    };

    const notifyTasks: Promise<any>[] = [];
    const directTargets = new Set<number>();
    [ownerProfileId, existingJob.managerProfileId, existingJob.partnerProfileId].forEach(
      (profileId) => {
        if (profileId && profileId !== actorProfileId) {
          directTargets.add(profileId);
        }
      }
    );
    directTargets.forEach((profileId) => {
      notifyTasks.push(notifyProfile(profileId, notificationPayload, req));
    });

    notifyTasks.push(notifyProfilesByRoles(['finance'], notificationPayload, req));

    if (escalationLevel === 'hr') {
      notifyTasks.push(notifyProfilesByRoles(['hr'], notificationPayload, req));
    }
    if (escalationLevel === 'gmp') {
      notifyTasks.push(notifyProfilesByRoles(['gmp'], notificationPayload, req));
    }

    await Promise.all(notifyTasks);

    res.status(201).json({
      id: followUp.id,
      jobId: followUp.jobId,
      actionType: followUp.actionType,
      actionDate: followUp.actionDate,
      notes: followUp.notes,
      nextFollowUpDate: followUp.nextFollowUpDate,
      ownerProfileId: followUp.ownerProfileId,
      ownerName: followUp.owner ? `${followUp.owner.firstName} ${followUp.owner.lastName}`.trim() : null,
      actionByProfileId: followUp.actionByProfileId,
      actionByName: `${followUp.actionBy.firstName} ${followUp.actionBy.lastName}`.trim(),
      escalationLevel,
      balance,
      clientName: existingJob.client?.clientName ?? null,
    });
  } catch (error: any) {
    logger.error('finance_dashboard_escalation_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to escalate receivable' });
  }
});

// GET /finance-dashboard/receivables-aging
router.get('/receivables-aging', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobs = await prisma.job.findMany({
      include: {
        client: { select: { clientName: true } },
        jobCosting: true,
        payments: true,
        receivableOwner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        receivableFollowUps: {
          orderBy: { actionDate: 'desc' },
          take: 1,
          select: {
            actionDate: true,
            nextFollowUpDate: true,
            actionType: true,
            isResolved: true,
          },
        },
      },
    });

    const buckets = {
      current_0_30: { label: '0-30 days', amount: 0, jobs: 0 },
      bucket_31_60: { label: '31-60 days', amount: 0, jobs: 0 },
      bucket_61_90: { label: '61-90 days', amount: 0, jobs: 0 },
      bucket_over_90: { label: '90+ days', amount: 0, jobs: 0 },
    };

    let totalOutstanding = 0;
    let unownedJobs = 0;
    let slaBreachedJobs = 0;
    let slaDueSoonJobs = 0;
    const nowDate = new Date();
    const ownerMap = new Map<
      string,
      {
        ownerProfileId: number | null;
        ownerName: string;
        amount: number;
        jobs: number;
        over90Amount: number;
        slaBreachedJobs: number;
        slaDueSoonJobs: number;
      }
    >();

    type ReceivableAgingRecord = {
      jobId: number;
      jobCode: string | null;
      jobName: string;
      clientName: string;
      balance: number;
      daysOutstanding: number;
      agingBucket: keyof typeof buckets;
      receivableOwnerProfileId: number | null;
      receivableOwnerName: string | null;
      lastFollowUpAt: Date | null;
      nextFollowUpDate: Date | null;
      expectedFollowUpDate: Date | null;
      lastFollowUpActionType: string | null;
      followUpResolved: boolean;
      slaStatus: 'ok' | 'due_soon' | 'breached';
      slaBreached: boolean;
      slaDueSoon: boolean;
      slaBreachDays: number;
    };

    const records: ReceivableAgingRecord[] = [];
    for (const job of jobs) {
      const fee = resolveJobFee(job);
      const collected = job.payments.reduce(
        (sum, payment) => sum + Number(payment.paymentAmount || 0),
        0
      );
      const balance = Math.max(0, fee - collected);
      if (balance <= 0) {
        continue;
      }

      const anchorDate = resolveReceivableAnchorDate(job);
      const daysOutstanding = toAgingDays(anchorDate);
      const agingBucket = toAgingBucket(daysOutstanding) as keyof typeof buckets;
      const latestFollowUp = job.receivableFollowUps[0] ?? null;
      const slaState = resolveReceivableSlaState({
        balance,
        agingBucket,
        anchorDate,
        latestFollowUp,
        nowDate,
      });
      const ownerName = job.receivableOwner
        ? `${job.receivableOwner.firstName} ${job.receivableOwner.lastName}`.trim()
        : 'Unassigned';
      const ownerKey = String(job.receivableOwner?.id ?? 'unassigned');

      totalOutstanding += balance;
      buckets[agingBucket].amount += balance;
      buckets[agingBucket].jobs += 1;
      if (!job.receivableOwnerProfileId) {
        unownedJobs += 1;
      }
      if (slaState.slaBreached) {
        slaBreachedJobs += 1;
      }
      if (slaState.slaDueSoon) {
        slaDueSoonJobs += 1;
      }

      const currentOwner = ownerMap.get(ownerKey) || {
        ownerProfileId: job.receivableOwner?.id ?? null,
        ownerName,
        amount: 0,
        jobs: 0,
        over90Amount: 0,
        slaBreachedJobs: 0,
        slaDueSoonJobs: 0,
      };
      currentOwner.amount += balance;
      currentOwner.jobs += 1;
      if (daysOutstanding > 90) {
        currentOwner.over90Amount += balance;
      }
      if (slaState.slaBreached) {
        currentOwner.slaBreachedJobs += 1;
      }
      if (slaState.slaDueSoon) {
        currentOwner.slaDueSoonJobs += 1;
      }
      ownerMap.set(ownerKey, currentOwner);

      records.push({
        jobId: job.id,
        jobCode: job.jobCode,
        jobName: job.jobName,
        clientName: job.client?.clientName ?? 'Unassigned',
        balance,
        daysOutstanding,
        agingBucket,
        receivableOwnerProfileId: job.receivableOwnerProfileId,
        receivableOwnerName: job.receivableOwner
          ? `${job.receivableOwner.firstName} ${job.receivableOwner.lastName}`.trim()
          : null,
        lastFollowUpAt: latestFollowUp?.actionDate ?? null,
        nextFollowUpDate: latestFollowUp?.nextFollowUpDate ?? null,
        expectedFollowUpDate: slaState.expectedFollowUpDate,
        lastFollowUpActionType: latestFollowUp?.actionType ?? null,
        followUpResolved: latestFollowUp?.isResolved ?? false,
        slaStatus: slaState.slaStatus as 'ok' | 'due_soon' | 'breached',
        slaBreached: slaState.slaBreached,
        slaDueSoon: slaState.slaDueSoon,
        slaBreachDays: slaState.slaBreachDays,
      });
    }
    records.sort((a, b) => b.daysOutstanding - a.daysOutstanding);

    const ownerBreakdown = Array.from(ownerMap.values()).sort((a, b) => b.amount - a.amount);

    res.json({
      asOf: new Date().toISOString(),
      summary: {
        totalOutstanding,
        jobsWithOutstanding: records.length,
        unownedJobs,
        over90Jobs: buckets.bucket_over_90.jobs,
        slaBreachedJobs,
        slaDueSoonJobs,
      },
      buckets: Object.entries(buckets).map(([key, value]) => ({
        key,
        label: value.label,
        amount: value.amount,
        jobs: value.jobs,
      })),
      ownerBreakdown,
      jobs: records,
    });
  } catch (error: any) {
    logger.error('finance_dashboard_receivables_aging_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load receivables aging buckets' });
  }
});

// PATCH /finance-dashboard/job-balances/:jobId/collection-stage
router.patch('/job-balances/:jobId/collection-stage', authMiddleware, canApproveFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const jobId = Number(req.params.jobId);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return res.status(400).json({ error: 'Invalid job id' });
    }

    const requestedStage = String(req.body?.collectionStage || '').trim();
    if (!jobCollectionStages.has(requestedStage)) {
      return res.status(400).json({
        error: 'Invalid collection stage. Allowed: not_ready, ready_for_collection, partial_collection, fully_collected, overdue',
      });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        jobName: true,
        collectionStage: true,
        readyForCollectionAt: true,
        partnerProfileId: true,
        managerProfileId: true,
        receivableOwnerProfileId: true,
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    let readyForCollectionAt = job.readyForCollectionAt;
    if (requestedStage === 'not_ready') {
      readyForCollectionAt = null;
    } else if (requestedStage === 'ready_for_collection') {
      readyForCollectionAt = job.readyForCollectionAt ?? new Date();
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextValue = await tx.job.update({
        where: { id: jobId },
        data: {
          collectionStage: requestedStage as any,
          readyForCollectionAt,
        },
        select: {
          id: true,
          jobCode: true,
          jobName: true,
          collectionStage: true,
          readyForCollectionAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'finance_collection_stage_updated',
          entityType: 'job',
          entityId: nextValue.id,
          userId: context.userId,
          ipAddress: req.ip || null,
          metadata: {
            jobId: nextValue.id,
            previousStage: job.collectionStage,
            collectionStage: nextValue.collectionStage,
            readyForCollectionAt: nextValue.readyForCollectionAt?.toISOString() || null,
          },
        },
      });

      return nextValue;
    });

    if (job.collectionStage !== requestedStage) {
      const directTargets = new Set<number>();
      [job.partnerProfileId, job.managerProfileId, job.receivableOwnerProfileId].forEach(
        (profileId) => {
          if (profileId) {
            directTargets.add(profileId);
          }
        }
      );

      if (requestedStage === 'ready_for_collection') {
        await Promise.all(
          Array.from(directTargets).map((profileId) =>
            notifyProfile(
              profileId,
              {
                title: 'Job ready for collection',
                message: `Finance marked "${job.jobName}" as ready for collection.`,
                link: `/finance-balances`,
                relatedEntityId: job.id,
                actionRequired: true,
              },
              req
            )
          )
        );
      }

      if (requestedStage === 'overdue') {
        const overduePayload = {
          title: 'Receivable overdue',
          message: `Receivable for "${job.jobName}" is now overdue and needs immediate follow-up.`,
          link: `/finance-balances`,
          relatedEntityId: job.id,
          actionRequired: true,
        };
        await Promise.all([
          ...Array.from(directTargets).map((profileId) =>
            notifyProfile(profileId, overduePayload, req)
          ),
          notifyProfilesByRoles(['finance'], overduePayload, req),
          notifyProfilesByRoles(['hr'], overduePayload, req),
          notifyProfilesByRoles(['gmp'], overduePayload, req),
        ]);
      }

      if (requestedStage === 'fully_collected') {
        const resolvedPayload = {
          title: 'Receivable fully collected',
          message: `Receivable for "${job.jobName}" has been fully collected.`,
          link: `/finance-balances`,
          relatedEntityId: job.id,
          actionRequired: false,
        };
        await Promise.all([
          ...Array.from(directTargets).map((profileId) =>
            notifyProfile(profileId, resolvedPayload, req)
          ),
          notifyProfilesByRoles(['finance'], resolvedPayload, req),
        ]);
      }
    }

    res.json(updated);
  } catch (error: any) {
    logger.error('finance_dashboard_collection_stage_update_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to update collection stage' });
  }
});

// GET /finance-dashboard/job-profitability
router.get('/job-profitability', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const facts = await JobPerformanceFactsService.listFacts({}, { type: 'firm' });
    const profitability = facts.map((fact) => ({
      jobId: fact.jobId,
      jobCode: fact.jobCode,
      jobName: fact.jobName,
      clientName: fact.clientName ?? 'Unassigned',
      revenue: fact.collectedRevenue,
      billableValue: fact.billableValue,
      billedRevenue: fact.billedRevenue,
      collectedRevenue: fact.collectedRevenue,
      laborCost: fact.laborCost,
      approvedRequisitionCost: fact.approvedRequisitionCost,
      recoverableRequisitionCost: fact.recoverableRequisitionCost,
      cost: fact.actualCost,
      profit: fact.cashProfit,
      workInProgressProfit: fact.workInProgressProfit,
      billedProfit: fact.billedProfit,
      cashProfit: fact.cashProfit,
      margin: fact.marginPercent,
      collected: fact.collectedRevenue,
      billableHours: fact.billableHours,
      nonBillableHours: fact.nonBillableHours,
      budgetUsedPercent: fact.budgetUsedPercent,
    }));

    res.json(profitability);
  } catch (error: any) {
    logger.error('finance_dashboard_job_profitability_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load job profitability' });
  }
});

// GET /finance-dashboard/revenue-allocations
router.get('/revenue-allocations', authMiddleware, canReadFinance, async (req: AuthRequest, res) => {
  try {
    const context = await getFinanceContext(req);
    if (context.error) {
      return res.status(context.error.status).json({ error: context.error.message });
    }

    const allocations = await prisma.revenueAllocation.findMany({
      include: {
        job: { select: { jobCode: true, jobName: true } },
        employee: { select: { firstName: true, lastName: true } },
        clientPayment: {
          include: { client: { select: { clientName: true } } },
        },
      },
      orderBy: { calculatedAt: 'desc' },
      take: 50,
    });

    res.json(
      allocations.map((allocation) => ({
        id: allocation.id,
        jobId: allocation.jobId,
        jobCode: allocation.job.jobCode,
        jobName: allocation.job.jobName,
        clientName: allocation.clientPayment.client.clientName,
        employeeName: `${allocation.employee.firstName} ${allocation.employee.lastName}`.trim(),
        allocatedAmount: Number(allocation.allocatedAmount),
        allocationPercentage: Number(allocation.allocationPercentage),
        allocationMonth: allocation.allocationMonth,
        employeeProfit: Number(allocation.employeeProfit),
        employeeLoss: Number(allocation.employeeLoss),
      }))
    );
  } catch (error: any) {
    logger.error('finance_dashboard_revenue_allocations_error', toLogContext(error));
    res.status(500).json({ error: 'Failed to load revenue allocations' });
  }
});

export default router;

