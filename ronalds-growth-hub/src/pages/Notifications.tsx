import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, CheckCircle2, ExternalLink, Filter, Loader2, Trash2 } from "lucide-react";
import apiFetch from "@/integrations/apiClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  actionRequired?: boolean;
  link?: string | null;
  createdAt?: string;
  jobId?: number | null;
};

const PAGE_SIZE = 12;

const Notifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isHR, isAdmin } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | "read" | "unread">("unread");
  const [typeFilter, setTypeFilter] = useState("all");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [createForm, setCreateForm] = useState({
    recipientProfileId: "",
    type: "info",
    title: "",
    message: "",
    link: "",
    actionRequired: false,
  });

  const hrTemplates = [
    {
      id: "onboarding-approval",
      label: "Onboarding approval reminder",
      title: "Onboarding approval pending",
      message: "A client onboarding is pending HR review. Please approve or reject.",
      actionRequired: true,
      type: "action",
    },
    {
      id: "overdue-job",
      label: "Overdue job reminder",
      title: "Overdue job requires attention",
      message: "A job is past its due date. Please follow up with the manager.",
      actionRequired: true,
      type: "warning",
    },
    {
      id: "document-review",
      label: "Document review request",
      title: "Document review needed",
      message: "An employee document requires HR review and verification.",
      actionRequired: true,
      type: "action",
    },
  ];

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.title, item.message].some((field) =>
        field?.toLowerCase().includes(query)
      )
    );
  }, [items, search]);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if ((isHR || isAdmin) && scope === "all") params.set("scope", "all");

      const response = await apiFetch("GET", `/notifications?${params.toString()}`);
      const payload = response?.data ?? response ?? {};
      const list = Array.isArray(payload.items) ? payload.items : payload.items?.items ?? [];
      const pagination = payload.pagination ?? payload.items?.pagination ?? {};

      setItems(list);
      setTotal(pagination.total ?? list.length ?? 0);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load notifications",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [page, statusFilter, typeFilter, scope]);

  const sendNotification = async () => {
    if (!createForm.recipientProfileId || !createForm.title || !createForm.message) {
      toast({
        title: "Missing fields",
        description: "Recipient, title, and message are required.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      await apiFetch("POST", "/notifications", {
        recipientProfileId: Number(createForm.recipientProfileId),
        type: createForm.type,
        title: createForm.title,
        message: createForm.message,
        actionRequired: createForm.actionRequired,
        link: createForm.link || undefined,
      });

      toast({ title: "Notification sent" });
      setCreateForm({
        recipientProfileId: "",
        type: "info",
        title: "",
        message: "",
        link: "",
        actionRequired: false,
      });
      loadNotifications();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to send notification",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const markRead = async (id: number) => {
    try {
      await apiFetch("PATCH", `/notifications/${id}/read`);
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to mark notification as read",
        variant: "destructive",
      });
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch("PATCH", "/notifications/read-all");
      setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
      toast({ title: "All notifications marked as read" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to mark all as read",
        variant: "destructive",
      });
    }
  };

  const deleteNotification = async (id: number) => {
    try {
      await apiFetch("DELETE", `/notifications/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete notification",
        variant: "destructive",
      });
    }
  };

  const openNotification = (item: NotificationItem) => {
    if (item.link) {
      navigate(item.link);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Bell className="h-7 w-7 text-primary" />
              Notifications
            </h2>
            <p className="text-muted-foreground">
              Track important updates, approvals, and requests in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={markAllRead}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark all read
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            <CardDescription>Refine notifications by status or type.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search notifications..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {(isHR || isAdmin) && (
              <Select value={scope} onValueChange={(value) => setScope(value as typeof scope)}>
                <SelectTrigger>
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">My notifications</SelectItem>
                  <SelectItem value="all">All notifications</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="action">Action</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="escalation">Escalation</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {(isHR || isAdmin) && (
          <Card>
            <CardHeader>
              <CardTitle>HR Notifications</CardTitle>
              <CardDescription>Create a targeted notification for a specific profile.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Recipient profile ID"
                value={createForm.recipientProfileId}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, recipientProfileId: event.target.value }))
                }
              />
              <Select
                onValueChange={(value) => {
                  const template = hrTemplates.find((item) => item.id === value);
                  if (!template) return;
                  setCreateForm((prev) => ({
                    ...prev,
                    type: template.type,
                    title: template.title,
                    message: template.message,
                    actionRequired: template.actionRequired,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Apply template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {hrTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={createForm.type}
                onValueChange={(value) => setCreateForm((prev) => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="action">Action</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="escalation">Escalation</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Title"
                value={createForm.title}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Input
                placeholder="Link (optional)"
                value={createForm.link}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, link: event.target.value }))}
              />
              <Input
                className="md:col-span-2"
                placeholder="Message"
                value={createForm.message}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, message: event.target.value }))}
              />
              <div className="md:col-span-2 flex items-center justify-between">
                <label className="text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={createForm.actionRequired}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, actionRequired: event.target.checked }))
                    }
                  />
                  Action required
                </label>
                <Button onClick={sendNotification} disabled={isSending}>
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>{total} total notifications</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No notifications found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-4 transition-shadow ${
                      item.isRead ? "border-border/60 bg-background" : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                          {!item.isRead && <Badge variant="secondary">New</Badge>}
                          {item.type && (
                            <Badge variant="outline" className="capitalize">
                              {item.type}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.message}</p>
                        <div className="text-xs text-muted-foreground">
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Just now"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.link && (
                          <Button variant="outline" size="sm" onClick={() => openNotification(item)}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open
                          </Button>
                        )}
                        {!item.isRead && (
                          <Button variant="outline" size="sm" onClick={() => markRead(item.id)}>
                            Mark read
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => deleteNotification(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Notifications;
