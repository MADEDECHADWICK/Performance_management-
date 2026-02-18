import { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FrameworkAlignmentCard from '@/components/framework/FrameworkAlignmentCard';
import FrameworkMaturitySnapshot from '@/components/framework/FrameworkMaturitySnapshot';
import type { DashboardModuleKey } from '@/lib/api/performanceFramework';

interface FrameworkModuleWorkspaceProps {
  moduleHint: DashboardModuleKey;
  children: ReactNode;
  showMaturity?: boolean;
}

export default function FrameworkModuleWorkspace({
  moduleHint,
  children,
  showMaturity = false,
}: FrameworkModuleWorkspaceProps) {
  return (
    <Tabs defaultValue="framework" className="w-full space-y-4">
      <TabsList className="grid w-full grid-cols-2 md:w-[520px]">
        <TabsTrigger value="framework">BSC + Pyramid Mode</TabsTrigger>
        <TabsTrigger value="operations">Operational Workbench</TabsTrigger>
      </TabsList>
      <p className="text-sm text-muted-foreground">
        Strategy-first view is default. Module coverage is resolved from framework endpoints before operational data.
      </p>

      <TabsContent value="framework" className="space-y-4">
        <FrameworkAlignmentCard moduleHint={moduleHint} />
        {showMaturity && <FrameworkMaturitySnapshot />}
      </TabsContent>

      <TabsContent value="operations" className="space-y-4">
        {children}
      </TabsContent>
    </Tabs>
  );
}
