import { useMemo, useState } from "react";
import { Settings2, ShieldCheck, Target, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  BalancedScorecardKpiAssignmentRecord,
  BalancedScorecardKpiRecord,
  PerformanceBandRecord,
} from "@/lib/api/performanceFramework";
import type { Role } from "@/lib/api/roles";
import type { Profile } from "@/lib/api/types";
import { MetricCard, SectionTitle, StatusBadge } from "@/components/framework/BalancedScorecardPrimitives";

type AssignmentPayload = {
  kpiId: number;
  profileId: number;
  individualTarget?: number;
  individualWeight?: number;
};

type PerformanceBandPayload = {
  roleId?: number | null;
  onTrackMin: number;
  atRiskMin: number;
  label?: string;
};

type Props = {
  currentVersionId: number | null;
  currentVersionLabel: string;
  assignments: BalancedScorecardKpiAssignmentRecord[];
  performanceBands: PerformanceBandRecord[];
  kpis: BalancedScorecardKpiRecord[];
  employeeOptions: Profile[];
  roleOptions: Role[];
  submittingKey: string | null;
  onSaveAssignment: (payload: AssignmentPayload) => Promise<void>;
  onDeleteAssignment: (assignmentId: number) => Promise<void>;
  onSavePerformanceBand: (payload: PerformanceBandPayload) => Promise<void>;
};

export function BalancedScorecardPeopleAdminPanel({
  currentVersionId,
  currentVersionLabel,
  assignments,
  performanceBands,
  kpis,
  employeeOptions,
  roleOptions,
  submittingKey,
  onSaveAssignment,
  onDeleteAssignment,
  onSavePerformanceBand,
}: Props) {
  const [assignmentForm, setAssignmentForm] = useState({
    kpiId: "",
    profileId: "",
    individualTarget: "",
    individualWeight: "",
  });
  const [bandForm, setBandForm] = useState({
    roleId: "default-scope",
    onTrackMin: "85",
    atRiskMin: "65",
    label: "",
  });

  const coveredProfiles = useMemo(
    () => new Set(assignments.map((assignment) => assignment.profileId)).size,
    [assignments]
  );

  const defaultBand = performanceBands.find((band) => band.roleId === null) ?? null;
  const isAssignmentBusy = submittingKey === "saveKpiAssignment";
  const isBandBusy = submittingKey === "savePerformanceBand";

  const handleSaveAssignment = async () => {
    const kpiId = Number(assignmentForm.kpiId);
    const profileId = Number(assignmentForm.profileId);
    if (!Number.isFinite(kpiId) || !Number.isFinite(profileId)) {
      return;
    }

    const individualTarget =
      assignmentForm.individualTarget.trim().length > 0
        ? Number(assignmentForm.individualTarget)
        : undefined;
    const individualWeight =
      assignmentForm.individualWeight.trim().length > 0
        ? Number(assignmentForm.individualWeight)
        : undefined;

    await onSaveAssignment({
      kpiId,
      profileId,
      individualTarget: Number.isFinite(individualTarget) ? individualTarget : undefined,
      individualWeight: Number.isFinite(individualWeight) ? individualWeight : undefined,
    });

    setAssignmentForm({
      kpiId: "",
      profileId: "",
      individualTarget: "",
      individualWeight: "",
    });
  };

  const handleSaveBand = async () => {
    const onTrackMin = Number(bandForm.onTrackMin);
    const atRiskMin = Number(bandForm.atRiskMin);
    if (!Number.isFinite(onTrackMin) || !Number.isFinite(atRiskMin)) {
      return;
    }

    await onSavePerformanceBand({
      roleId: bandForm.roleId === "default-scope" ? null : Number(bandForm.roleId),
      onTrackMin,
      atRiskMin,
      label: bandForm.label.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border-border/70 shadow-sm">
        <CardHeader className="space-y-4">
          <SectionTitle icon={Settings2} title="People controls" />
          <CardDescription>
            Individual KPI targets and score bands live outside the KPI engine flow. This
            panel keeps employee-level accountability tied to the selected scorecard version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Version" value={currentVersionLabel} icon={ShieldCheck} />
            <MetricCard label="Assignments" value={String(assignments.length)} icon={Target} />
            <MetricCard label="Employees covered" value={String(coveredProfiles)} icon={Users} />
            <MetricCard
              label="Default score band"
              value={
                defaultBand ? `${defaultBand.onTrackMin}/${defaultBand.atRiskMin}` : "Not set"
              }
              icon={ShieldCheck}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="rounded-[24px] border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Assign individual KPI targets</CardTitle>
                <CardDescription>
                  Create employee-level targets for the current scorecard version.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">KPI</label>
                    <Select
                      value={assignmentForm.kpiId}
                      onValueChange={(value) =>
                        setAssignmentForm((current) => ({ ...current, kpiId: value }))
                      }
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Select KPI" />
                      </SelectTrigger>
                      <SelectContent>
                        {kpis.map((kpi) => (
                          <SelectItem key={kpi.id} value={String(kpi.id)}>
                            {kpi.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Employee</label>
                    <Select
                      value={assignmentForm.profileId}
                      onValueChange={(value) =>
                        setAssignmentForm((current) => ({ ...current, profileId: value }))
                      }
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employeeOptions.map((profile) => (
                          <SelectItem key={profile.id} value={String(profile.id)}>
                            {`${profile.firstName} ${profile.lastName}`.trim()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Individual target</label>
                    <Input
                      type="number"
                      value={assignmentForm.individualTarget}
                      onChange={(event) =>
                        setAssignmentForm((current) => ({
                          ...current,
                          individualTarget: event.target.value,
                        }))
                      }
                      placeholder="Optional target"
                      className="rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Weight override</label>
                    <Input
                      type="number"
                      value={assignmentForm.individualWeight}
                      onChange={(event) =>
                        setAssignmentForm((current) => ({
                          ...current,
                          individualWeight: event.target.value,
                        }))
                      }
                      placeholder="Optional weight"
                      className="rounded-2xl"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {currentVersionId
                      ? "Assignments are stored against the currently selected scorecard version."
                      : "Publish a scorecard version first so assignments have a governed version scope."}
                  </p>
                  <Button
                    className="rounded-2xl"
                    onClick={handleSaveAssignment}
                    disabled={
                      !currentVersionId ||
                      !assignmentForm.kpiId ||
                      !assignmentForm.profileId ||
                      isAssignmentBusy
                    }
                  >
                    {isAssignmentBusy ? "Saving..." : "Save assignment"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[24px] border-border/60 shadow-none">
              <CardHeader>
                <CardTitle className="text-base">Configure performance bands</CardTitle>
                <CardDescription>
                  Set firm-wide default thresholds or override them for a specific billing role.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">Role scope</label>
                    <Select
                      value={bandForm.roleId}
                      onValueChange={(value) =>
                        setBandForm((current) => ({ ...current, roleId: value }))
                      }
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Select role scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default-scope">Firm-wide default</SelectItem>
                        {roleOptions.map((role) => (
                          <SelectItem key={role.id} value={String(role.id)}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">On-track minimum</label>
                    <Input
                      type="number"
                      value={bandForm.onTrackMin}
                      onChange={(event) =>
                        setBandForm((current) => ({ ...current, onTrackMin: event.target.value }))
                      }
                      className="rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">At-risk minimum</label>
                    <Input
                      type="number"
                      value={bandForm.atRiskMin}
                      onChange={(event) =>
                        setBandForm((current) => ({ ...current, atRiskMin: event.target.value }))
                      }
                      className="rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-foreground">Label</label>
                    <Input
                      value={bandForm.label}
                      onChange={(event) =>
                        setBandForm((current) => ({ ...current, label: event.target.value }))
                      }
                      placeholder="Optional label"
                      className="rounded-2xl"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    className="rounded-2xl"
                    onClick={handleSaveBand}
                    disabled={isBandBusy}
                  >
                    {isBandBusy ? "Saving..." : "Save performance band"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[24px] border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Current KPI assignments</CardTitle>
              <CardDescription>
                Version-scoped employee ownership linked to the active KPI library.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No employee-level KPI targets have been assigned for this version yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{assignment.profileName}</p>
                            <p className="text-xs text-muted-foreground">
                              Version {assignment.scorecardVersionId}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{assignment.roleName || "Unassigned"}</TableCell>
                        <TableCell>{assignment.kpiName}</TableCell>
                        <TableCell>{assignment.individualTarget ?? "Default"}</TableCell>
                        <TableCell>{assignment.individualWeight}%</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-xl text-destructive hover:text-destructive"
                            disabled={submittingKey === `deleteKpiAssignment:${assignment.id}`}
                            onClick={() => onDeleteAssignment(assignment.id)}
                          >
                            {submittingKey === `deleteKpiAssignment:${assignment.id}`
                              ? "Removing..."
                              : "Remove"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border-border/60 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Active performance bands</CardTitle>
              <CardDescription>
                Status thresholds that convert score into on-track, at-risk, and off-track signals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope</TableHead>
                    <TableHead>Thresholds</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Status preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceBands.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No custom performance bands have been configured yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    performanceBands.map((band) => (
                      <TableRow key={band.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{band.roleName || "Firm-wide default"}</span>
                            {band.roleId === null ? (
                              <Badge variant="outline" className="rounded-full">
                                Default
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <p>On track ≥ {band.onTrackMin}</p>
                            <p>At risk ≥ {band.atRiskMin}</p>
                          </div>
                        </TableCell>
                        <TableCell>{band.label || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge status="on_track" />
                            <StatusBadge status="at_risk" />
                            <StatusBadge status="off_track" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
