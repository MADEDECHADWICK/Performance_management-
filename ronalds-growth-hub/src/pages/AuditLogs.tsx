import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, Search } from "lucide-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const AuditLogs = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLogs = async () => {
    try {
      const data = await apiFetch("GET", "/audit-logs?limit=100");
      setLogs(
        (data || []).map((log: any) => ({
          id: log.id,
          action: log.action ?? log.event ?? "unknown",
          entityType: log.entityType ?? log.entity_type ?? "system",
          userId: log.userId ?? log.user_id ?? null,
          ipAddress: log.ipAddress ?? log.ip_address ?? null,
          createdAt: log.createdAt ?? log.created_at ?? log.timestamp ?? null,
          employeeName: log.employeeName ?? log.employee_name ?? null,
          metadata: log.metadata ?? null,
        }))
      );
    } catch (error: any) {
      console.error("Error loading audit logs:", error);
      if (error?.status === 401) {
        window.location.href = "/auth";
        return;
      }
      if (error?.status === 404) {
        setLogs([]);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to load audit logs.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes("create") || action.includes("insert")) {
      return <Badge className="bg-success">CREATE</Badge>;
    }
    if (action.includes("update") || action.includes("edit")) {
      return <Badge className="bg-info">UPDATE</Badge>;
    }
    if (action.includes("delete") || action.includes("remove")) {
      return <Badge variant="destructive">DELETE</Badge>;
    }
    return <Badge variant="outline">{action.toUpperCase()}</Badge>;
  };

  const filteredLogs = logs.filter((log) =>
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entityType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Audit Logs
          </h2>
          <p className="text-muted-foreground">
            Track all system changes and user actions
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <CardDescription>
              Complete audit trail of all actions in the system
            </CardDescription>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by action or entity type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading audit logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "No logs match your search." : "No audit logs yet."}
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>User ID</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">
                          {log.createdAt
                            ? format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")
                            : "N/A"}
                        </TableCell>
                        <TableCell>
                          {getActionBadge(log.action)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.entityType}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.employeeName || "--"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {log.userId ? log.userId.toString().substring(0, 8) + "..." : "System"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.ipAddress || "N/A"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {log.metadata?.note || log.metadata?.reason || "--"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AuditLogs;
