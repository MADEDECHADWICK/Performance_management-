import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import performanceFrameworkAPI, {
  BscPerspective,
  DashboardModuleCoverageSummary,
  FrameworkCoverageSummary,
} from '@/lib/api/performanceFramework';

interface FrameworkMaturitySnapshotProps {
  title?: string;
}

const perspectiveLabel: Record<BscPerspective, string> = {
  financial: 'Financial',
  customer: 'Customer',
  internal_process: 'Internal Process',
  learning_growth: 'Learning & Growth',
};

const strongestPerspective = (summary: DashboardModuleCoverageSummary) => {
  const winner = summary.coverageByPerspective
    .slice()
    .sort((a, b) => b.count - a.count)[0];
  if (!winner) return 'None';
  return `${perspectiveLabel[winner.perspective] || winner.perspective} (${winner.count})`;
};

export default function FrameworkMaturitySnapshot({
  title = 'Enterprise Framework Maturity Snapshot',
}: FrameworkMaturitySnapshotProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<FrameworkCoverageSummary | null>(null);
  const [moduleCoverage, setModuleCoverage] = useState<DashboardModuleCoverageSummary[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [moduleData, coverageData] = await Promise.all([
          performanceFrameworkAPI.listModules(),
          performanceFrameworkAPI.getCoverage(),
        ]);

        if (!mounted) return;
        setModuleCoverage(moduleData.coverage || []);
        setCoverage(coverageData);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load framework maturity snapshot.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Uses the backend framework endpoints to show current cross-module BSC and pyramid coverage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading maturity snapshot...
          </div>
        )}

        {!isLoading && error && <p className="text-sm text-muted-foreground">{error}</p>}

        {!isLoading && !error && coverage && (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Framework Version</p>
                <p className="text-sm font-semibold">{coverage.frameworkVersion}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total Metrics</p>
                <p className="text-sm font-semibold">{coverage.totalMetrics}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Unique Data Signals</p>
                <p className="text-sm font-semibold">{coverage.uniqueDataSignals}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Module Dashboards</p>
                <p className="text-sm font-semibold">{moduleCoverage.length}</p>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Module Coverage</p>
              <div className="space-y-2">
                {moduleCoverage.map((item) => (
                  <div
                    key={item.module}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.strategicIntent}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{item.metricCount} metrics</Badge>
                      <Badge variant="secondary">Top: {strongestPerspective(item)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Top Data Signals</p>
              <div className="flex flex-wrap gap-2">
                {coverage.topSignals.slice(0, 8).map((signal) => (
                  <Badge key={signal.signal} variant="outline">
                    {signal.signal} ({signal.count})
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
