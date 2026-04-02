import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Profile } from "@/lib/api/types";

type PublishedVersionOption = {
  id: number;
  title: string;
  programTitle: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: {
    programVersionId: string;
    dueAt: string;
    employeeIds: number[];
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      programVersionId: string;
      dueAt: string;
      employeeIds: number[];
    }>
  >;
  publishedVersions: PublishedVersionOption[];
  employeeOptions: Profile[];
  onToggleEmployee: (employeeId: number, checked: boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
};

export default function LearningAssignmentDialog({
  open,
  onOpenChange,
  form,
  setForm,
  publishedVersions,
  employeeOptions,
  onToggleEmployee,
  onSubmit,
  isSubmitting,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Published Learning</DialogTitle>
          <DialogDescription>
            Select a published program version and the employees who should complete it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Published Version</label>
            <Select
              value={form.programVersionId || "none"}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  programVersionId: value === "none" ? "" : value,
                }))
              }
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
            <label className="text-sm font-medium">Due Date</label>
            <Input
              type="datetime-local"
              value={form.dueAt}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  dueAt: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Employees</label>
            <div className="max-h-[320px] space-y-2 overflow-y-auto rounded-lg border p-3">
              {employeeOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active employees available.</p>
              ) : (
                employeeOptions.map((employee) => (
                  <label key={employee.id} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                    <Checkbox
                      checked={form.employeeIds.includes(employee.id)}
                      onCheckedChange={(checked) => onToggleEmployee(employee.id, checked === true)}
                    />
                    <span>
                      <span className="block font-medium">
                        {[employee.firstName, employee.lastName].filter(Boolean).join(" ")}
                      </span>
                      <span className="block text-xs text-gray-600">
                        {employee.positionTitle || employee.role?.name || "Employee"}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            Assign Learning
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
