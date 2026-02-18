import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Layers, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import performanceFrameworkAPI, {
  DashboardModuleCoverage,
  DashboardModuleKey,
  PyramidLevel,
  BscPerspective,
  ResolveModuleResponse,
} from '@/lib/api/performanceFramework';
import { cn } from '@/lib/utils';

interface FrameworkAlignmentCardProps {
  moduleHint: DashboardModuleKey;
  className?: string;
  title?: string;
}

const levelLabel: Record<PyramidLevel, string> = {
  level_1_corporate_vision: 'L1 Corporate Vision',
  level_2_business_unit: 'L2 Business Unit',
  level_3_operational_systems: 'L3 Operations',
  level_4_people_capability: 'L4 People & Capability',
};

const perspectiveLabel: Record<BscPerspective, string> = {
  financial: 'Financial',
  customer: 'Customer',
  internal_process: 'Internal Process',
  learning_growth: 'Learning & Growth',
};

const formatPercent = (value: number) => `${Math.round((value || 0) * 100)}%`;

export default function FrameworkAlignmentCard({
  moduleHint,
  className,
  title = 'Framework Alignment',
}: FrameworkAlignmentCardProps) {
  const { user, profile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveModuleResponse | null>(null);
  const [coverage, setCoverage] = useState<DashboardModuleCoverage | null>(null);

  const profileId = useMemo(
    () => Number((user as any)?.profileId ?? (user as any)?.profile_id ?? profile?.id ?? 0),
    [user, profile]
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Required linkage step: resolve module for current actor context first.
        const resolvedModule = await performanceFrameworkAPI.resolveModule({
          profileId: profileId || undefined,
          positionTitle: profile?.positionTitle || undefined,
        });
        if (!mounted) return;
        setResolved(resolvedModule);

        // Then load full module coverage for the target dashboard module.
        const targetModule = moduleHint || resolvedModule.module;
        const moduleCoverage = await performanceFrameworkAPI.getModule(targetModule);
        if (!mounted) return;
        setCoverage(moduleCoverage);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load framework alignment.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [moduleHint, profileId, profile?.positionTitle]);

  if (isLoading) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading framework alignment...
        </CardContent>
      </Card>
    );
  }

  if (error || !coverage) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>Could not load framework linkage for this dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || 'Data unavailable.'}</p>
        </CardContent>
      </Card>
    );
  }

  const moduleMismatch = resolved?.module && resolved.module !== moduleHint;

  return (
    <Card className={cn('border-primary/25 bg-primary/5', className)}>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="outline">{coverage.label}</Badge>
          <Badge variant="secondary">Cadence: {coverage.cadence}</Badge>
          <Badge variant="outline">Owner: {coverage.primaryRoleOwner.replaceAll('_', ' ')}</Badge>
          {moduleMismatch && (
            <Badge variant="destructive">
              Resolved role maps to {resolved?.module?.toUpperCase()}
            </Badge>
          )}
        </div>
        <CardDescription>{coverage.strategicIntent}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border bg-background/60 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4" />
              Pyramid Focus
            </p>
            <div className="flex flex-wrap gap-2">
              {coverage.pyramidFocus.map((level) => (
                <Badge key={level} variant="outline">
                  {levelLabel[level] || level}
                </Badge>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-background/60 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4" />
              BSC Perspective Lens
            </p>
            <div className="space-y-1 text-sm">
              {(Object.entries(coverage.perspectiveWeightLens) as Array<[BscPerspective, number]>).map(
                ([perspective, weight]) => (
                  <div key={perspective} className="flex items-center justify-between">
                    <span>{perspectiveLabel[perspective] || perspective}</span>
                    <span className="font-medium">{formatPercent(weight)}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border bg-background/60 p-3">
            <p className="mb-2 text-sm font-medium">Coverage By Pyramid Level</p>
            <div className="space-y-1 text-sm">
              {coverage.coverageByLevel.map((item) => (
                <div key={item.level} className="flex items-center justify-between">
                  <span>{levelLabel[item.level] || item.level}</span>
                  <Badge variant="outline">{item.count}</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-background/60 p-3">
            <p className="mb-2 text-sm font-medium">Coverage By BSC Perspective</p>
            <div className="space-y-1 text-sm">
              {coverage.coverageByPerspective.map((item) => (
                <div key={item.perspective} className="flex items-center justify-between">
                  <span>{perspectiveLabel[item.perspective] || item.perspective}</span>
                  <Badge variant="outline">{item.count}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-background/60 p-3">
          <p className="mb-2 text-sm font-medium">Mapped Metrics ({coverage.metrics.length})</p>
          <div className="flex flex-wrap gap-2">
            {coverage.metrics.slice(0, 8).map((metric) => (
              <Badge key={metric.key} variant="secondary">
                {metric.name}
              </Badge>
            ))}
            {coverage.metrics.length > 8 && (
              <Badge variant="outline">+{coverage.metrics.length - 8} more</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
