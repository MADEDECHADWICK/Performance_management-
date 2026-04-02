import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LearningAssignment } from "@/lib/api/learningDevelopment";

type AttendanceStatus = "invited" | "attended" | "missed" | "excused";

type PublishedVersionOption = {
  id: number;
  title: string;
  programTitle: string;
  sessions: Array<{
    id: number;
    title: string;
    startsAt: string;
    endsAt: string;
    location?: string | null;
    attendancePoints: number;
    attendanceRequired: boolean;
  }>;
};

type AttendanceRecordFormState = {
  attendanceStatus: AttendanceStatus;
  notes: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProgramVersionId?: string;
  publishedVersions: PublishedVersionOption[];
  assignments: LearningAssignment[];
  onSubmit: (payload: {
    sessionId: number;
    records: Array<{
      assignmentId: number;
      attendanceStatus: AttendanceStatus;
      notes?: string | null;
    }>;
  }) => void;
  isSubmitting: boolean;
};

const formatPersonName = (assignment: LearningAssignment) =>
  [assignment.employee?.firstName, assignment.employee?.lastName].filter(Boolean).join(" ") || "Employee";

const formatStatusLabel = (value: AttendanceStatus) => value.replace(/_/g, " ");

export default function LearningAttendanceBulkDialog({
  open,
  onOpenChange,
  defaultProgramVersionId,
  publishedVersions,
  assignments,
  onSubmit,
  isSubmitting,
}: Props) {
  const [selectedProgramVersionId, setSelectedProgramVersionId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [recordForms, setRecordForms] = useState<Record<number, AttendanceRecordFormState>>({});

  useEffect(() => {
    if (!open) return;
    setSelectedProgramVersionId(defaultProgramVersionId || publishedVersions[0]?.id?.toString() || "");
  }, [defaultProgramVersionId, open, publishedVersions]);

  const selectedVersion = useMemo(
    () => publishedVersions.find((version) => String(version.id) === selectedProgramVersionId) || null,
    [publishedVersions, selectedProgramVersionId]
  );

  useEffect(() => {
    if (!selectedVersion) {
      setSelectedSessionId("");
      return;
    }
    const currentExists = selectedVersion.sessions.some((session) => String(session.id) === selectedSessionId);
    if (!currentExists) {
      setSelectedSessionId(selectedVersion.sessions[0]?.id?.toString() || "");
    }
  }, [selectedSessionId, selectedVersion]);

  const selectedSessionIdNumber = Number(selectedSessionId || 0);

  const versionAssignments = useMemo(
    () =>
      assignments
        .filter((assignment) => assignment.programVersion?.id === Number(selectedProgramVersionId))
        .sort((left, right) => formatPersonName(left).localeCompare(formatPersonName(right))),
    [assignments, selectedProgramVersionId]
  );

  useEffect(() => {
    if (!open || !selectedSessionIdNumber) {
      setRecordForms({});
      return;
    }

    const nextForms = Object.fromEntries(
      versionAssignments.map((assignment) => {
        const attendanceRecord = assignment.attendanceRecords?.find(
          (record) => record.sessionId === selectedSessionIdNumber
        );
        return [
          assignment.id,
          {
            attendanceStatus: attendanceRecord?.attendanceStatus ?? "invited",
            notes: attendanceRecord?.notes ?? "",
          },
        ];
      })
    ) as Record<number, AttendanceRecordFormState>;

    setRecordForms(nextForms);
  }, [open, selectedSessionIdNumber, versionAssignments]);

  const updateRecord = (
    assignmentId: number,
    updater: (current: AttendanceRecordFormState) => AttendanceRecordFormState
  ) => {
    setRecordForms((prev) => ({
      ...prev,
      [assignmentId]: updater(
        prev[assignmentId] ?? {
          attendanceStatus: "invited",
          notes: "",
        }
      ),
    }));
  };

  const applyStatusToAll = (attendanceStatus: AttendanceStatus) => {
    setRecordForms((prev) =>
      Object.fromEntries(
        versionAssignments.map((assignment) => [
          assignment.id,
          {
            attendanceStatus,
            notes: prev[assignment.id]?.notes ?? "",
          },
        ])
      )
    );
  };

  const handleSubmit = () => {
    if (!selectedSessionIdNumber || versionAssignments.length === 0) {
      return;
    }

    onSubmit({
      sessionId: selectedSessionIdNumber,
      records: versionAssignments.map((assignment) => {
        const current = recordForms[assignment.id] ?? {
          attendanceStatus: "invited" as const,
          notes: "",
        };
        return {
          assignmentId: assignment.id,
          attendanceStatus: current.attendanceStatus,
          notes: current.notes.trim() || null,
        };
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Session Attendance</DialogTitle>
          <DialogDescription>
            Select a published learning session and update attendance for all assigned learners.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Published Version</label>
              <Select
                value={selectedProgramVersionId || "none"}
                onValueChange={(value) => setSelectedProgramVersionId(value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select version</SelectItem>
                  {publishedVersions.map((version) => (
                    <SelectItem key={version.id} value={String(version.id)}>
                      {version.programTitle} - {version.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Session</label>
              <Select
                value={selectedSessionId || "none"}
                onValueChange={(value) => setSelectedSessionId(value === "none" ? "" : value)}
                disabled={!selectedVersion}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select session</SelectItem>
                  {selectedVersion?.sessions.map((session) => (
                    <SelectItem key={session.id} value={String(session.id)}>
                      {session.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedVersion && selectedSessionIdNumber > 0 && (
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-gray-600">
              {(() => {
                const session = selectedVersion.sessions.find((item) => item.id === selectedSessionIdNumber);
                if (!session) return null;
                return (
                  <>
                    <p className="font-medium text-gray-900">{session.title}</p>
                    <p className="mt-1">
                      {new Date(session.startsAt).toLocaleString()} to{" "}
                      {new Date(session.endsAt).toLocaleString()}
                    </p>
                    {session.location && <p>{session.location}</p>}
                    <p className="mt-1">
                      Attendance points: {session.attendancePoints} |{" "}
                      {session.attendanceRequired ? "Required" : "Optional"}
                    </p>
                  </>
                );
              })()}
            </div>
          )}

          {versionAssignments.length > 0 && selectedSessionIdNumber > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyStatusToAll("attended")}>
                Mark All Attended
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyStatusToAll("missed")}>
                Mark All Missed
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyStatusToAll("excused")}>
                Mark All Excused
              </Button>
            </div>
          )}

          <div className="rounded-lg border">
            <div className="grid grid-cols-[minmax(180px,1.2fr)_140px_minmax(220px,1fr)] gap-4 border-b bg-slate-50 px-4 py-3 text-sm font-medium text-gray-700">
              <span>Learner</span>
              <span>Status</span>
              <span>Notes</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {!selectedVersion ? (
                <div className="p-6 text-sm text-muted-foreground">Select a published version first.</div>
              ) : selectedVersion.sessions.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">This version has no live sessions.</div>
              ) : versionAssignments.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  No learners are currently assigned to this version.
                </div>
              ) : !selectedSessionIdNumber ? (
                <div className="p-6 text-sm text-muted-foreground">Select a session to mark attendance.</div>
              ) : (
                versionAssignments.map((assignment) => {
                  const current = recordForms[assignment.id] ?? {
                    attendanceStatus: "invited" as const,
                    notes: "",
                  };

                  return (
                    <div
                      key={assignment.id}
                      className="grid grid-cols-[minmax(180px,1.2fr)_140px_minmax(220px,1fr)] gap-4 border-b px-4 py-3 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium">{formatPersonName(assignment)}</p>
                        <p className="text-xs text-gray-600">
                          {assignment.employee?.managerId ? "Team member" : "Assigned learner"}
                          {assignment.dueAt
                            ? ` | Due ${new Date(assignment.dueAt).toLocaleDateString()}`
                            : ""}
                        </p>
                      </div>
                      <Select
                        value={current.attendanceStatus}
                        onValueChange={(value) =>
                          updateRecord(assignment.id, (existing) => ({
                            ...existing,
                            attendanceStatus: value as AttendanceStatus,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["invited", "attended", "missed", "excused"] as AttendanceStatus[]).map((status) => (
                            <SelectItem key={`${assignment.id}-${status}`} value={status}>
                              {formatStatusLabel(status)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        rows={2}
                        placeholder="Optional attendance notes"
                        value={current.notes}
                        onChange={(event) =>
                          updateRecord(assignment.id, (existing) => ({
                            ...existing,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {selectedVersion && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Assigned learners: {versionAssignments.length}</span>
              <span>
                Sessions available: {selectedVersion.sessions.length}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedSessionIdNumber || versionAssignments.length === 0}
          >
            Save Attendance
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
