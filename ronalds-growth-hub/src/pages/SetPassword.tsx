import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const PASSWORD_SETUP_TOKEN_KEY = "rg_password_setup_token";

const resolveDashboardPath = (user: any) => {
  const roles = [
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(Array.isArray(user?.authRoles) ? user.authRoles : []),
  ]
    .map((role: any) => (typeof role === "string" ? role : role?.role?.name))
    .filter(Boolean)
    .map((role: string) => role.toLowerCase());

  const profile = user?.profile;
  const positionTitle = profile?.positionTitle?.toLowerCase() || "";

  if (
    roles.includes("gmp") ||
    roles.includes("group_managing_partner") ||
    positionTitle.includes("group managing partner")
  ) {
    return "/gmp-dashboard";
  }
  if (
    roles.includes("admin") ||
    roles.includes("super_admin") ||
    roles.includes("hr") ||
    roles.includes("hr_manager")
  ) {
    return "/hr-dashboard";
  }
  if (profile?.isPartner || roles.includes("partner")) return "/partner-dashboard";
  if (roles.includes("manager")) return "/manager-dashboard";
  if (roles.includes("marketing")) return "/marketing-dashboard";
  if (roles.includes("finance")) return "/finance-dashboard";
  return "/dashboard";
};

export default function SetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { completePasswordSetup } = useAuth();

  const setupToken = useMemo(
    () => sessionStorage.getItem(PASSWORD_SETUP_TOKEN_KEY) || "",
    []
  );

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!setupToken) {
      navigate("/auth", { replace: true });
    }
  }, [navigate, setupToken]);

  if (!setupToken) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Confirm password must match the new password.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      const user = await completePasswordSetup(setupToken, newPassword);
      sessionStorage.removeItem(PASSWORD_SETUP_TOKEN_KEY);
      toast({
        title: "Password updated",
        description: "Your account is now ready to use.",
      });
      navigate(resolveDashboardPath(user), { replace: true });
    } catch (error: any) {
      toast({
        title: "Unable to set password",
        description: error.message || "Try signing in again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold">Set New Password</CardTitle>
          <CardDescription>
            Use a new password to finish your first-time account setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="new-password"
                  type="password"
                  className="pl-10"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  className="pl-10"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
