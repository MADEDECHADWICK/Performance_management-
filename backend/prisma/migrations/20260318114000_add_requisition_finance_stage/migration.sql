ALTER TYPE "RequisitionStatus" ADD VALUE IF NOT EXISTS 'pending_finance_approval';

ALTER TYPE "RequisitionApprovalStageType" ADD VALUE IF NOT EXISTS 'finance';
