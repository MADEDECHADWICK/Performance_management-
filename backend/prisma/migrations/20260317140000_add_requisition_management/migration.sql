CREATE TYPE "RequisitionStatus" AS ENUM (
  'pending_manager_approval',
  'pending_partner_approval',
  'pending_gmp_approval',
  'approved',
  'declined',
  'cancelled'
);

CREATE TYPE "RequisitionApprovalDecision" AS ENUM (
  'pending',
  'approved',
  'declined',
  'skipped'
);

CREATE TYPE "RequisitionApprovalStageType" AS ENUM (
  'manager',
  'partner',
  'gmp'
);

CREATE TABLE "requisition_types" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "source_module" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "requires_job" BOOLEAN NOT NULL DEFAULT false,
  "requires_client" BOOLEAN NOT NULL DEFAULT false,
  "requires_vendor" BOOLEAN NOT NULL DEFAULT false,
  "requires_due_date" BOOLEAN NOT NULL DEFAULT false,
  "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
  "field_schema" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requisition_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "requisition_types_code_key" ON "requisition_types"("code");
CREATE INDEX "requisition_types_source_module_is_active_idx"
  ON "requisition_types"("source_module", "is_active");

CREATE TABLE "requisition_requests" (
  "id" SERIAL NOT NULL,
  "requisition_number" TEXT NOT NULL,
  "requisition_type_id" INTEGER NOT NULL,
  "requester_profile_id" INTEGER NOT NULL,
  "requester_department_id" INTEGER,
  "current_approver_profile_id" INTEGER,
  "source_module" TEXT NOT NULL,
  "status" "RequisitionStatus" NOT NULL DEFAULT 'pending_manager_approval',
  "title" TEXT NOT NULL,
  "justification" TEXT,
  "amount" NUMERIC(14, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KES',
  "quantity" NUMERIC(12, 2),
  "needed_by_date" TIMESTAMP(3),
  "vendor_name" TEXT,
  "client_id" INTEGER,
  "job_id" INTEGER,
  "is_client_recoverable" BOOLEAN NOT NULL DEFAULT false,
  "tax_impact_notes" TEXT,
  "module_data" JSONB,
  "approval_route_snapshot" JSONB,
  "decline_reason" TEXT,
  "cancellation_reason" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "declined_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requisition_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requisition_requests_requisition_type_id_fkey"
    FOREIGN KEY ("requisition_type_id") REFERENCES "requisition_types"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "requisition_requests_requester_profile_id_fkey"
    FOREIGN KEY ("requester_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "requisition_requests_requester_department_id_fkey"
    FOREIGN KEY ("requester_department_id") REFERENCES "departments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "requisition_requests_current_approver_profile_id_fkey"
    FOREIGN KEY ("current_approver_profile_id") REFERENCES "profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "requisition_requests_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "requisition_requests_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "requisition_requests_requisition_number_key"
  ON "requisition_requests"("requisition_number");
CREATE INDEX "requisition_requests_requisition_type_id_idx"
  ON "requisition_requests"("requisition_type_id");
CREATE INDEX "requisition_requests_requester_profile_id_status_idx"
  ON "requisition_requests"("requester_profile_id", "status");
CREATE INDEX "requisition_requests_current_approver_profile_id_status_idx"
  ON "requisition_requests"("current_approver_profile_id", "status");
CREATE INDEX "requisition_requests_source_module_status_idx"
  ON "requisition_requests"("source_module", "status");
CREATE INDEX "requisition_requests_client_id_idx"
  ON "requisition_requests"("client_id");
CREATE INDEX "requisition_requests_job_id_idx"
  ON "requisition_requests"("job_id");

CREATE TABLE "requisition_approval_steps" (
  "id" SERIAL NOT NULL,
  "requisition_request_id" INTEGER NOT NULL,
  "step_number" INTEGER NOT NULL,
  "stage_type" "RequisitionApprovalStageType" NOT NULL,
  "approver_profile_id" INTEGER NOT NULL,
  "decision" "RequisitionApprovalDecision" NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "acted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requisition_approval_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requisition_approval_steps_requisition_request_id_fkey"
    FOREIGN KEY ("requisition_request_id") REFERENCES "requisition_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "requisition_approval_steps_approver_profile_id_fkey"
    FOREIGN KEY ("approver_profile_id") REFERENCES "profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "requisition_approval_steps_requisition_request_id_step_number_key"
  ON "requisition_approval_steps"("requisition_request_id", "step_number");
CREATE INDEX "requisition_approval_steps_approver_profile_id_decision_idx"
  ON "requisition_approval_steps"("approver_profile_id", "decision");
CREATE INDEX "requisition_approval_steps_requisition_request_id_decision_idx"
  ON "requisition_approval_steps"("requisition_request_id", "decision");
