import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api/client";
import { useAuth } from "@/contexts";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

type PositionRole = {
  id: number;
  name: string;
  description?: string;
  billingRate: number;
  costRate: number;
  isActive: boolean;
  createdAt: string;
};

const emptyForm = {
  name: "",
  billingRate: 0,
  costRate: 0,
  description: "",
  isActive: true,
};

export default function PositionsRates() {
  const { isHR, isAdmin } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState<PositionRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PositionRole | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await api.get<PositionRole[]>("/roles");
      setRoles(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load positions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const openCreate = () => {
    setEditingRole(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (role: PositionRole) => {
    setEditingRole(role);
    setForm({
      name: role.name,
      billingRate: role.billingRate,
      costRate: role.costRate,
      description: role.description || "",
      isActive: role.isActive,
    });
    setDialogOpen(true);
  };

  const saveRole = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Validation",
        description: "Position name is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingRole) {
        await api.put(`/roles/${editingRole.id}`, form);
        toast({
          title: "Updated",
          description: `${form.name} updated successfully.`,
        });
      } else {
        await api.post("/roles", form);
        toast({
          title: "Created",
          description: `${form.name} created successfully.`,
        });
      }
      setDialogOpen(false);
      await loadRoles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save position.",
        variant: "destructive",
      });
    }
  };

  const deactivateRole = async (role: PositionRole) => {
    if (!confirm(`Deactivate ${role.name}?`)) return;

    try {
      await api.delete(`/roles/${role.id}`);
      toast({
        title: "Deactivated",
        description: `${role.name} is now inactive.`,
      });
      await loadRoles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to deactivate position.",
        variant: "destructive",
      });
    }
  };

  if (!isHR && !isAdmin) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>Only HR/Admin can manage billing positions.</CardDescription>
          </CardHeader>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Positions & Rates</h2>
            <p className="text-muted-foreground">
              Manage billing positions used for job costing and revenue allocation.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            New Position
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Billing Positions</CardTitle>
            <CardDescription>
              These positions control hourly billing rates for job costing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      <TableHead>Billing Rate (KES/hr)</TableHead>
                      <TableHead>Cost Rate (KES/hr)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No positions available.
                        </TableCell>
                      </TableRow>
                    ) : (
                      roles.map((role) => (
                        <TableRow key={role.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{role.name}</p>
                              {role.description && (
                                <p className="text-xs text-muted-foreground">{role.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {role.billingRate.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {role.costRate.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={role.isActive ? "default" : "secondary"}>
                              {role.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="space-x-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(role)}>
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            {role.isActive && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => deactivateRole(role)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Deactivate
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Position" : "New Position"}</DialogTitle>
            <DialogDescription>
              Set the billing and cost rates used in job costing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="position-name">Position name</Label>
              <Input
                id="position-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Senior"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="billing-rate">Billing rate (KES/hr)</Label>
              <Input
                id="billing-rate"
                type="number"
                value={form.billingRate}
                onChange={(event) =>
                  setForm({ ...form, billingRate: Number(event.target.value) })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cost-rate">Cost rate (KES/hr)</Label>
              <Input
                id="cost-rate"
                type="number"
                value={form.costRate}
                onChange={(event) =>
                  setForm({ ...form, costRate: Number(event.target.value) })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRole}>
              {editingRole ? "Update Position" : "Create Position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
