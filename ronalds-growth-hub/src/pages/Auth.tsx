import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, Target, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const PASSWORD_SETUP_TOKEN_KEY = "rg_password_setup_token";

const authBenefits = [
  { icon: Target, text: "Track goals and KPI progress in one place." },
  { icon: Users, text: "Capture feedback across manager, peer, and client views." },
  { icon: TrendingUp, text: "Connect individual delivery to business performance." },
];

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

  const isGMP =
    roles.includes("gmp") ||
    roles.includes("group_managing_partner") ||
    positionTitle.includes("group managing partner") ||
    positionTitle.includes("group_managing_partner");

  const isHROrAdmin =
    roles.includes("admin") ||
    roles.includes("super_admin") ||
    roles.includes("hr") ||
    roles.includes("hr_manager") ||
    positionTitle.includes("hr") ||
    positionTitle.includes("administrator");

  const isPartner = profile?.isPartner || roles.includes("partner") || positionTitle.includes("partner");
  const isManager = roles.includes("manager") || positionTitle.includes("manager");
  const isMarketing =
    roles.includes("marketing") ||
    roles.includes("business_development") ||
    positionTitle.includes("marketing") ||
    positionTitle.includes("business development");
  const isFinance = roles.includes("finance") || positionTitle.includes("finance");

  if (isGMP) return "/gmp-dashboard";
  if (isHROrAdmin) return "/hr-dashboard";
  if (isPartner) return "/partner-dashboard";
  if (isManager) return "/manager-dashboard";
  if (isMarketing) return "/marketing-dashboard";
  if (isFinance) return "/finance-dashboard";
  return "/dashboard";
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    sessionStorage.removeItem(PASSWORD_SETUP_TOKEN_KEY);

    try {
      const result = await login(email, password);

      if ("requiresPasswordChange" in result && result.requiresPasswordChange) {
        sessionStorage.setItem(PASSWORD_SETUP_TOKEN_KEY, result.setupToken);
        toast({
          title: "Set your password",
          description: "Your temporary password was accepted. Please set a new password.",
        });
        navigate("/set-password");
        return;
      }

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      sessionStorage.removeItem(PASSWORD_SETUP_TOKEN_KEY);
      navigate(resolveDashboardPath(result));
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
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-6 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute right-0 top-16 h-72 w-72 rounded-full bg-brand-orange/20 blur-3xl" />

      <div className="page-enter relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl items-center justify-center">
        <Card className="w-full overflow-hidden border-border/70 shadow-[0_32px_70px_-42px_hsl(var(--primary)/0.6)]">
          <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
            <div className="hidden flex-col justify-between bg-[image:var(--gradient-primary)] p-8 text-white lg:flex">
              <div>
                <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]">
                  Ronalds LLP
                </div>
                <h1 className="mt-5 text-3xl font-bold leading-tight">
                  Welcome back to your performance workspace.
                </h1>
                <p className="mt-3 text-sm text-white/85">
                  Review score signals, monitor goals, and keep delivery aligned with firm outcomes.
                </p>
              </div>

              <div className="space-y-3">
                {authBenefits.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.text} className="flex items-start gap-3 rounded-xl border border-white/20 bg-black/15 px-3 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <p className="text-sm text-white/90">{item.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-6 sm:p-8 lg:p-10">
              <CardHeader className="space-y-2 px-0 pb-6 pt-0 text-left">
                <div className="mb-2 flex items-center gap-3 lg:hidden">
                  <div className="rounded-xl border border-border/70 bg-background/80 p-1.5 shadow-sm">
                    <img src="/images/logo.png" alt="Ronalds LLP Logo" className="h-8 w-8" />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">Ronalds LLP</span>
                </div>
                <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
                <CardDescription>Enter your details to continue to your dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleAuth} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-11 rounded-xl border-border/70 bg-background/75 pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="********"
                        className="h-11 rounded-xl border-border/70 bg-background/75 pl-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="h-11 w-full text-sm" disabled={loading}>
                    {loading ? "Loading..." : "Sign In"}
                  </Button>
                </form>
              </CardContent>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
