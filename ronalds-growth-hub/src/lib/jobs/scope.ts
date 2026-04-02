import type { Job } from "@/lib/api/types";

interface JobViewerScope {
  profileId?: number | null;
  isAdmin?: boolean;
  isHR?: boolean;
  isGMP?: boolean;
  isFinance?: boolean;
  isManager?: boolean;
  isPartner?: boolean;
  isEmployee?: boolean;
}

const toNumericProfileId = (value?: number | string | null) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const hasStaffAssignment = (job: Job, profileId: number) =>
  Array.isArray(job.staffing) &&
  job.staffing.some((assignment) => toNumericProfileId(assignment.employeeProfileId) === profileId);

export const scopeJobsForViewer = (jobs: Job[], viewer: JobViewerScope): Job[] => {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];

  const profileId = toNumericProfileId(viewer.profileId);
  const isAdminLike = Boolean(viewer.isAdmin || viewer.isHR || viewer.isGMP || viewer.isFinance);

  if (isAdminLike) {
    return jobs;
  }

  if (!profileId) {
    return [];
  }

  const isManager = Boolean(viewer.isManager);
  const isPartner = Boolean(viewer.isPartner);
  const isEmployee = Boolean(viewer.isEmployee);

  return jobs.filter((job) => {
    const assignedToJob = hasStaffAssignment(job, profileId);

    if (isManager || isPartner) {
      return (
        toNumericProfileId(job.managerProfileId) === profileId ||
        toNumericProfileId(job.partnerProfileId) === profileId ||
        assignedToJob
      );
    }

    if (isEmployee) {
      return assignedToJob;
    }

    return assignedToJob;
  });
};
