# Data Structure Specification - Ronalds LLP Job Management System

## Overview
This document defines the complete data model for the job management system with role-based staff assignments and financial tracking.

---

## Core Entities

### 1. USER (Authentication)
**Purpose**: Authentication and system access
```
id (INT, PK)
email (STRING, UNIQUE)
password_hash (STRING)
status (ENUM: active, inactive, suspended)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Relationships**:
- Has ONE Profile (1:1)
- Has MANY UserRoles (1:N) - for authorization

---

### 2. PROFILE (Employee Information)
**Purpose**: Employee details and role assignment
```
id (INT, PK)
user_id (INT, FK → User)
first_name (STRING)
last_name (STRING)
email (STRING)
position (STRING, OPTIONAL)
phone (STRING, OPTIONAL)
role_id (INT, FK → Role) ⭐ PRIMARY ROLE
status (ENUM: active, inactive, left)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Critical Notes**:
- `role_id` defines the employee's base role
- This role's `billing_rate` is their default hourly rate
- When assigned to a job, they can have a DIFFERENT role (via JobStaffAssignment)

**Relationships**:
- Belongs to ONE User (N:1)
- Belongs to ONE Role (N:1) - their primary role
- Has MANY JobStaffAssignments (1:N)
- Has MANY TimeEntries (1:N)

---

### 3. ROLE (Billing Rate Tiers)
**Purpose**: Define job positions and their billing rates
```
id (INT, PK)
name (STRING, UNIQUE)
description (STRING, OPTIONAL)
billing_rate (DECIMAL, NOT NULL) ⭐ HOURLY RATE IN KES
level (INT) - e.g., 1=Junior, 7=Senior
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Seeded Roles** (7 roles with billing rates):
1. Super Administrator - 15,000/hr
2. HR Manager - 6,000/hr
3. Partner - 15,000/hr
4. Manager - 6,000/hr
5. Associate - 4,000/hr
6. Intern - 2,000/hr
7. Employee - 1,500/hr

**Relationships**:
- Has MANY Profiles (1:N)
- Has MANY JobStaffAssignments (1:N)

---

### 4. JOB (Core Work Unit)
**Purpose**: Define a job/project with financial scope
```
id (INT, PK)
job_name (STRING, NOT NULL)
job_code (STRING, UNIQUE) - e.g., JOB-20260108-80080
description (STRING, OPTIONAL)

📊 SCOPE & TIMING:
start_date (DATE)
due_date (DATE, OPTIONAL)
status (ENUM: pending, in_progress, completed, cancelled)
completion_percentage (INT, DEFAULT 0)

💰 FINANCIAL:
fees (DECIMAL) - Fixed fee component (KES)
billable_hours (DECIMAL, OPTIONAL) - Max billable hours (if hourly)
amount_collected (DECIMAL, DEFAULT 0) - Actual amount collected

👥 ASSIGNMENT:
assigned_to (INT, FK → Profile) - Primary assignee
assigned_by (INT, FK → Profile) - Who assigned it
partner_id (INT, FK → Profile, OPTIONAL) - Partner/Job Owner
manager_id (INT, FK → Profile, OPTIONAL) - Manager

🏢 ORGANIZATION:
department_id (INT, FK → Department, OPTIONAL)
client_id (INT, FK → Client, OPTIONAL)

collection_period (STRING, OPTIONAL) - e.g., "Q1 2026"
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Relationships**:
- Belongs to ONE Profile (assigned_to) (N:1)
- Belongs to ONE Profile (assigned_by) (N:1)
- Has MANY JobStaffAssignments (1:N) ⭐ STAFF ROSTER
- Has MANY TimeEntries (1:N) ⭐ ACTUAL WORK TRACKING
- Has MANY JobProfitability records (1:1)

---

### 5. JOB_STAFF_ASSIGNMENT (Staff on Job with Role)
**Purpose**: Assign employees to jobs WITH POTENTIALLY DIFFERENT ROLES and rates

⭐ **THIS IS KEY** - Each assignment can specify a different role than employee's base role

```
id (INT, PK)
job_id (INT, FK → Job, NOT NULL)
employee_id (INT, FK → Profile, NOT NULL)
assigned_role_id (INT, FK → Role, NOT NULL) ⭐ THEIR ROLE ON THIS JOB
assigned_hourly_rate (DECIMAL, NOT NULL) ⭐ THEIR RATE ON THIS JOB

📝 HISTORICAL:
role_snapshot (JSON) - Stores role name/rate at assignment time
created_at (TIMESTAMP)
updated_at (TIMESTAMP)

UNIQUE CONSTRAINT: (job_id, employee_id)
```

**Critical Logic**:
- When creating assignment: Look up Role.billing_rate for the assigned_role_id
- Store that rate in assigned_hourly_rate (prevents future changes to role affecting past jobs)
- Store role metadata in role_snapshot for auditability

**Example Flow**:
```
Employee: John Doe
- Profile.role_id = 5 (Associate, 4,000/hr)

Job: XYZ Project
- Create assignment with assigned_role_id = 3 (Partner, 15,000/hr)
- This employee now bills at 15,000/hr on this job
- role_snapshot = { id: 3, name: "Partner", billing_rate: 15000 }
```

**Relationships**:
- Belongs to ONE Job (N:1)
- Belongs to ONE Profile (N:1)
- Belongs to ONE Role (N:1)

---

### 6. TIME_ENTRY (Actual Work)
**Purpose**: Track hours worked and create billing/cost records
```
id (INT, PK)
job_id (INT, FK → Job)
employee_id (INT, FK → Profile)
date (DATE)
hours (DECIMAL)
billable_amount (DECIMAL) - hours × rate
cost (DECIMAL) - hours × employee cost rate
description (STRING, OPTIONAL)
created_at (TIMESTAMP)
updated_at (TIMESTAMP)
```

**Relationships**:
- Belongs to ONE Job (N:1)
- Belongs to ONE Profile (N:1)

---

### 7. JOB_PROFITABILITY (Financial Summary)
**Purpose**: Denormalized financial metrics per job
```
id (INT, PK)
job_id (INT, FK → Job, UNIQUE)

⏱️ HOURS:
total_actual_hours (DECIMAL) - Sum of all time entries
billable_actual_hours (DECIMAL) - Hours that are billable

💰 REVENUE:
billable_amount (DECIMAL) - billable_hours × assigned_rate
fees (DECIMAL) - Fixed fees from Job
total_revenue (DECIMAL) - billable_amount + fees

💸 COST:
total_cost (DECIMAL) - Sum of time entry costs

📊 METRICS:
efficiency_ratio (DECIMAL) - billable_hours / total_hours (%)
collection_rate (DECIMAL) - amount_collected / total_revenue (%)
net_revenue (DECIMAL) - total_revenue - total_cost

updated_at (TIMESTAMP)
```

**Relationships**:
- Belongs to ONE Job (1:1)

---

## API Data Contracts

### GET /jobs
Returns array of Job objects WITH NESTED data:
```json
{
  "id": 1,
  "job_name": "Brand Refresh",
  "job_code": "JOB-20260108-80080",
  "status": "pending",
  "fees": 50000,
  "billable_hours": null,
  
  // ⭐ KEY: Nested staff assignments with role data
  "jobStaffAssignments": [
    {
      "id": 1,
      "employee_id": 2,
      "assigned_role_id": 3,
      "assigned_hourly_rate": 15000,
      "employee": {
        "id": 2,
        "first_name": "John",
        "last_name": "Doe",
        "role_id": 5  // Their base role
      },
      "role": {
        "id": 3,
        "name": "Partner",
        "billing_rate": 15000
      }
    }
  ],
  
  // ⭐ KEY: Partner info
  "partner": {
    "id": 5,
    "first_name": "Jane",
    "last_name": "Smith"
  },
  
  // ⭐ KEY: Manager info
  "manager": {
    "id": 3,
    "first_name": "Bob",
    "last_name": "Johnson"
  },
  
  // ⭐ KEY: Financial summary
  "jobProfitability": {
    "total_revenue": 50000,
    "total_cost": 15000,
    "net_revenue": 35000,
    "efficiency_ratio": 0.85
  }
}
```

### POST /jobs/:jobId/staff
**Input**:
```json
{
  "employee_id": 2,
  "assigned_role_id": 3,
  "assigned_hourly_rate": 15000
}
```

**Processing**:
1. Validate employee exists
2. Validate role exists and get billing_rate
3. Create JobStaffAssignment
4. Create role_snapshot from Role data
5. Return created assignment with nested employee & role data

---

## Frontend Data Transformation

### In JobTracking Component (loadData):
```typescript
const transformedJobs = (jobsData || []).map((job: any) => ({
  ...job,
  job_staff_assignments: job.jobStaffAssignments || [],  // Alias for display
}));
```

### In JobsTable Component (display):
```typescript
// Calculate job value
const value = job.fees + (job.jobProfitability?.total_revenue || 0);

// Display staff
const staffCount = job.job_staff_assignments?.length || 0;
const staffNames = job.job_staff_assignments
  ?.map(a => `${a.employee.first_name} ${a.employee.last_name}`)
  .join(", ");
```

---

## Key Design Principles

### 1. Single Source of Truth
- ✅ `JobStaffAssignment.assigned_hourly_rate` = locked-in rate when assigned
- ✅ `role_snapshot` = historical record of role at assignment time
- ❌ Don't look up Role.billing_rate later - it might have changed

### 2. Clear Relationships
- ✅ Job → JobStaffAssignments → Employee + Role (clear nesting)
- ✅ Include required related data in API responses (partner, manager, assignments)
- ❌ Don't require multiple API calls to render job card

### 3. Financial Calculation
- ✅ Store `assigned_hourly_rate` on assignment for auditability
- ✅ Use `JobProfitability` for summary metrics (denormalized, computed)
- ✅ `fees` is a fixed amount on Job, independent of staff

### 4. Data Completeness
- ✅ Every GET /jobs response includes jobStaffAssignments with nested employee & role
- ✅ Every assignment includes assigned_hourly_rate and role_snapshot
- ✅ Partner and manager are populated objects, not just IDs

---

## Database Migration Checklist

- [ ] User table
- [ ] Profile table with role_id FK
- [ ] Role table (7 seeded rows with billing_rates)
- [ ] Job table (all fields including partner_id, manager_id)
- [ ] JobStaffAssignment table with unique(job_id, employee_id)
- [ ] TimeEntry table
- [ ] JobProfitability table
- [ ] Create indexes on: job_id (assignments), employee_id (assignments), date (time entries)

---

## Implementation Order

1. **Phase 1**: Verify data structure matches Prisma schema
2. **Phase 2**: Update GET /jobs endpoint to return full nested structure
3. **Phase 3**: Verify POST /jobs/:jobId/staff creates assignments correctly
4. **Phase 4**: Test frontend receives and displays data correctly
5. **Phase 5**: Build financial calculations (JobProfitability)

