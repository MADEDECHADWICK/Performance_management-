import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Lock, Mail } from "lucide-react";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const resolveDashboardPath = (user: any) => {
    const roles = [
      ...(Array.isArray(user?.roles) ? user.roles : []),
      ...(Array.isArray(user?.authRoles) ? user.authRoles : []),
    ]
      .map((role: any) => (typeof role === 'string' ? role : role?.role?.name))
      .filter(Boolean)
      .map((role: string) => role.toLowerCase());

    const profile = user?.profile;
    const positionTitle = profile?.positionTitle?.toLowerCase() || '';

    const isGMP =
      roles.includes('gmp') ||
      roles.includes('group_managing_partner') ||
      positionTitle.includes('group managing partner') ||
      positionTitle.includes('group_managing_partner');

    const isHROrAdmin =
      roles.includes('admin') ||
      roles.includes('super_admin') ||
      roles.includes('hr') ||
      roles.includes('hr_manager') ||
      positionTitle.includes('hr') ||
      positionTitle.includes('administrator');

    const isPartner = profile?.isPartner || roles.includes('partner') || positionTitle.includes('partner');
    const isManager = roles.includes('manager') || positionTitle.includes('manager');
    const isMarketing =
      roles.includes('marketing') ||
      roles.includes('business_development') ||
      positionTitle.includes('marketing') ||
      positionTitle.includes('business development');
    const isFinance = roles.includes('finance') || positionTitle.includes('finance');

    if (isGMP) return '/gmp-dashboard';
    if (isHROrAdmin) return '/hr-dashboard';
    if (isPartner) return '/partner-dashboard';
    if (isManager) return '/manager-dashboard';
    if (isMarketing) return '/marketing-dashboard';
    if (isFinance) return '/finance-dashboard';
    return '/dashboard';
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const data = await authAPI.login(email, password);
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate(resolveDashboardPath(data.user));
      } else {
        await authAPI.register({ email, password, firstName, lastName });

        toast({
          title: "Account created!",
          description: "You can now sign in with your credentials.",
        });
        setIsLogin(true);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Authentication failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-2 rounded-full bg-primary/10">
              <img src="/images/logo.png" alt="Logo" className="h-10 w-10" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {isLogin ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Sign in to access your performance dashboard"
              : "Register for Ronalds LLP Performance Management"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required={!isLogin}
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:underline"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
