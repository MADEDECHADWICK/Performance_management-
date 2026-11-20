import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import authAPI, { type InviteValidationResponse } from "@/lib/api/auth";
import { useAuth } from "@/contexts/AuthContext";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return String((error as { message?: string }).message);
  }
  return fallback;
};

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const token = useMemo(() => String(searchParams.get("token") || "").trim(), [searchParams]);

  const [invite, setInvite] = useState<InviteValidationResponse | null>(null);
  const [validating, setValidating] = useState(true);
  const [validationError, setValidationError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      if (!token) {
        setValidationError("This invitation link is missing its token.");
        setValidating(false);
        return;
      }
      try {
        const response = await authAPI.validateInvite(token);
        if (!cancelled) setInvite(response);
      } catch (error: unknown) {
        if (!cancelled) {
          setValidationError(
            getErrorMessage(error, "This invitation link is invalid or has expired.")
          );
        }
      } finally {
        if (!cancelled) setValidating(false);
      }
    };
    void validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
      await authAPI.acceptInvite(token, newPassword);
      await refreshUser();
      toast({
        title: "Password set",
        description: "Your account is ready. Continue with onboarding.",
      });
      navigate("/profile?tab=onboarding", { replace: true });
    } catch (error: unknown) {
      toast({
        title: "Unable to accept invitation",
        description: getErrorMessage(error, "The invitation may have expired."),
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
          <CardTitle className="text-2xl font-bold">Set your password</CardTitle>
          <CardDescription>
            Use the one-time invitation link to activate your account and start onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validating ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Checking your invitation...
            </p>
          ) : validationError ? (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {validationError}
              </div>
              <p className="text-sm text-muted-foreground">
                Ask HR to resend a new invitation link.
              </p>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/auth">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Link>
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {invite ? (
                <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
                  {invite.name ? <div className="font-medium">{invite.name}</div> : null}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {invite.email}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Link expires {new Date(invite.expiresAt).toLocaleString()}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    className="pl-10"
                    minLength={8}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    className="pl-10"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSaving}>
                {isSaving ? "Saving..." : "Set password and continue"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
