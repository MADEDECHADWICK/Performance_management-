import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, BarChart3, Users, Target, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Simple Header */}
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/images/logo.png" alt="Logo" className="h-10 w-10" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Ronalds LLP</h1>
                <p className="text-sm text-muted-foreground">Performance Management System</p>
              </div>
            </div>
            <Button onClick={() => navigate("/auth")} className="bg-brand-orange hover:bg-brand-orange/90">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-brand-dark-blue/5 to-brand-orange/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Welcome to Ronalds LLP
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            360° feedback system with integrated financial metrics for data-driven talent management
          </p>
          <Button size="lg" onClick={() => navigate("/auth")} className="bg-brand-orange hover:bg-brand-orange/90 text-white shadow-lg">
            Get Started
          </Button>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-16 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-brand-orange/10">
                  <BarChart3 className="h-8 w-8 text-brand-orange" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Financial Integration</h3>
              <p className="text-sm text-muted-foreground">70% weighted financial metrics from job costing data</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-brand-dark-blue/10">
                  <Users className="h-8 w-8 text-brand-dark-blue" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">360° Feedback</h3>
              <p className="text-sm text-muted-foreground">Self, peer, manager, and client evaluations</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-brand-orange/10">
                  <Target className="h-8 w-8 text-brand-orange" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Competency-Based</h3>
              <p className="text-sm text-muted-foreground">Assess core and role-specific competencies</p>
            </div>

            <div className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-brand-dark-blue/10">
                  <TrendingUp className="h-8 w-8 text-brand-dark-blue" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Analytics Dashboard</h3>
              <p className="text-sm text-muted-foreground">Real-time insights and performance tracking</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>© 2025 Ronalds LLP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
