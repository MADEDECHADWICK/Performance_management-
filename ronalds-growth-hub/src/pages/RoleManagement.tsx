import DashboardLayout from "@/components/DashboardLayout";
import UserRoleManagement from "@/components/UserRoleManagement";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RoleManagement() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Role & Access Management</CardTitle>
            <CardDescription>
              Assign primary access roles and edit module permissions without changing billing
              positions or dashboard layouts.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Billing positions and hourly rates remain under <strong>Positions &amp; Rates</strong>.
          </CardContent>
        </Card>

        <UserRoleManagement />
      </div>
    </DashboardLayout>
  );
}
