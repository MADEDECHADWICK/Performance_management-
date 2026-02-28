import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Crown, Lock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const PASSWORD_SETUP_TOKEN_KEY = "rg_password_setup_token";

const hasGmpPrivileges = (user: any) => {
  const roles = [
    ...(Array.isArray(user?.roles) ? user.roles : []),
    ...(Array.isArray(user?.authRoles) ? user.authRoles : []),
  ]
    .map((role: any) => (typeof role === "string" ? role : role?.role?.name))
    .filter(Boolean)
    .map((role: string) => role.toLowerCase());

  const position = String(user?.profile?.positionTitle || "").toLowerCase();

  return (
    roles.includes("gmp") ||
    roles.includes("group_managing_partner") ||
    roles.includes("admin") ||
    roles.includes("super_admin") ||
    position.includes("group managing partner") ||
    position.includes("group_managing_partner")
  );
};

export default function GMPLogin() {
  const [email, setEmail] = useState("gmp@ronalds.local");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { toast } = useToast();
  const { login, logout } = useAuth();

  const testCredentials = useMemo(
    () => ({
      email: "gmp@ronalds.local",
      password: "Password123!",
    }),
    []
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    sessionStorage.removeItem(PASSWORD_SETUP_TOKEN_KEY);

    try {
      const result = await login(email, password);

      if ("requiresPasswordChange" in result && result.requiresPasswordChange) {
        sessionStorage.setItem(PASSWORD_SETUP_TOKEN_KEY, result.setupToken);
        toast({
          title: "Set your password",
          description: "Please complete first-time password setup.",
        });
        navigate("/set-password");
        return;
      }

      if (!hasGmpPrivileges(result)) {
        await logout();
        setError("Insufficient privileges for GMP access.");
        return;
      }

      toast({
        title: "Login Successful",
        description: `Welcome back, ${result.email}!`,
      });
      navigate("/gmp-dashboard");
    } catch (loginError: any) {
      setError(loginError?.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-2xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 w-16 h-16 bg-gradient-to-r from-amber-400 to-yellow-600 rounded-full flex items-center justify-center">
              <Crown className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Group Managing Partner
            </CardTitle>
            <p className="text-gray-600 mt-2">Secure Executive Access Portal</p>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center">
                  <User className="h-4 w-4 mr-2" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gmp@ronalds.local"
                  required
                  className="bg-gray-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center">
                  <Lock className="h-4 w-4 mr-2" />
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your secure password"
                  required
                  className="bg-gray-50"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Authenticating...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Shield className="h-4 w-4 mr-2" />
                    Access GMP Dashboard
                  </div>
                )}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg">
              <h4 className="font-semibold text-amber-800 mb-2">Test Credentials</h4>
              <div className="text-sm text-amber-700 space-y-1">
                <p>
                  <strong>Email:</strong> {testCredentials.email}
                </p>
                <p>
                  <strong>Password:</strong> {testCredentials.password}
                </p>
              </div>
            </div>

            <div className="mt-4 text-center">
              <Button
                variant="link"
                onClick={() => navigate("/auth")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {"<-"} Back to General Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
