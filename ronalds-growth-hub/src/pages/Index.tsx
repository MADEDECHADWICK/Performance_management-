import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, DollarSign, Target, TrendingUp, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const featureCards = [
  {
    icon: BarChart3,
    title: "Financial Integration",
    description: "Weighted performance scoring informed by job costing and collections data.",
  },
  {
    icon: Users,
    title: "360-Degree Feedback",
    description: "Manager, peer, self, and client perspectives captured in one system.",
  },
  {
    icon: Target,
    title: "Competency Tracking",
    description: "Track development, review outcomes, and role expectations in one place.",
  },
  {
    icon: TrendingUp,
    title: "Analytics at Speed",
    description: "Live dashboards for operational, non-financial, and commercial outcomes.",
  },
];

const quickStats = [
  { label: "Score Components", value: "4 Balanced Areas", icon: Target },
  { label: "Review Signals", value: "Self to Client", icon: Users },
  { label: "Financial Lens", value: "Revenue + Profit", icon: DollarSign },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-16 top-24 h-80 w-80 rounded-full bg-brand-orange/20 blur-3xl" />

      <header className="relative z-10 border-b border-border/60 bg-background/65 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border/70 bg-background/80 p-1.5 shadow-sm">
              <img src="/images/logo.png" alt="Ronalds LLP Logo" className="h-8 w-8 sm:h-9 sm:w-9" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground sm:text-xl">Ronalds LLP</h1>
              <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground sm:text-[11px]">
                Performance Management System
              </p>
            </div>
          </div>
          <Button onClick={() => navigate("/auth")} className="px-5">
            Sign In
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 lg:px-8 lg:pt-14">
        <section className="page-enter grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Workforce Performance Platform
            </span>
            <div className="space-y-4">
              <h2 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl">
                Performance management that
                <span className="block bg-[image:var(--gradient-primary)] bg-clip-text text-transparent">
                  connects people and outcomes
                </span>
              </h2>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Ronalds LLP combines 360-degree evaluations, workforce analytics, and financial impact into one operational command center.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
            </div>
          </div>

          <Card className="glass-panel border-border/70">
            <CardContent className="space-y-6 p-6 sm:p-7">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">At a glance</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">One workflow for feedback, finance, and growth.</h3>
              </div>
              <div className="space-y-3">
                {quickStats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-sm text-muted-foreground">{item.label}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Built for managers, partners, HR, finance, and every employee contributor.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 stagger-in">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="h-full">
                <CardContent className="space-y-4 p-5">
                  <div className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 bg-background/55 py-6 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          <p>(c) {new Date().getFullYear()} Ronalds LLP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
