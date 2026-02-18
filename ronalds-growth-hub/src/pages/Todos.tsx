import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { CheckCircle2, Clock, AlertCircle, FileText, DollarSign, Calendar } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface Job {
  id: number;
  jobName: string;
  description: string | null;
  startDate: string | null;
  dueDate: string | null;
  budgetHours: number | null;
  fixedFeeAmount: number | null;
  status: string;
  department?: { name: string };
  client?: { clientName: string };
}

interface Todo {
  id: number;
  jobId: number;
  status: string;
  description: string | null;
  job: Job;
}

export default function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    loadTodos();
  }, [authLoading, user]);

  const loadTodos = async () => {
    try {
      if (!user) return;
      const data = await apiFetch('GET', `/todos?userId=${user.id}`);
      setTodos(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateTodoStatus = async (todoId: string, newStatus: string) => {
    try {
      await apiFetch('PATCH', `/todos/${todoId}`, { status: newStatus });

      // If marking as completed, also update the job status
      if (newStatus === 'completed') {
        const todo = todos.find(t => t.id === Number(todoId));
        if (todo) {
          await apiFetch('PATCH', `/jobs/${todo.jobId}`, { status: 'completed' });
        }
      }

      toast({ title: 'Success', description: `Job marked as ${newStatus}` });

      loadTodos();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateNotes = async (todoId: string) => {
    try {
      await apiFetch('PATCH', `/todos/${todoId}/notes`, { description: notes });

      toast({ title: 'Success', description: 'Notes updated successfully' });

      setSelectedTodo(null);
      setNotes('');
      loadTodos();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="bg-blue-50"><AlertCircle className="w-3 h-3 mr-1" />In Progress</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-50"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const calculateFinancialValue = (job: Job) => {
    let total = 0;
    if (job.fixedFeeAmount) {
      total += job.fixedFeeAmount;
    }
    return total;
  };

  const getStats = () => {
    const pending = todos.filter(t => t.status === "pending").length;
    const inProgress = todos.filter(t => t.status === "in_progress").length;
    const completed = todos.filter(t => t.status === "completed").length;
    const totalValue = todos
      .filter(t => t.status === "completed")
      .reduce((sum, todo) => sum + calculateFinancialValue(todo.job), 0);

    return { pending, inProgress, completed, totalValue, total: todos.length };
  };

  const stats = getStats();
  const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading your tasks...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My To-Do List</h1>
          <p className="text-muted-foreground">Track and manage your assigned jobs</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <Progress value={completionRate} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {completionRate.toFixed(0)}% completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <AlertCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Value Generated</CardTitle>
              <DollarSign className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">KES {stats.totalValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">From completed tasks</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for filtering */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Tasks ({stats.total})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress ({stats.inProgress})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {todos.map((todo) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                onStatusChange={updateTodoStatus}
                onNotesClick={(t) => {
                  setSelectedTodo(t);
                  setNotes(t.description || "");
                }}
                calculateFinancialValue={calculateFinancialValue}
                getStatusBadge={getStatusBadge}
              />
            ))}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {todos.filter(t => t.status === "pending").map((todo) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                onStatusChange={updateTodoStatus}
                onNotesClick={(t) => {
                  setSelectedTodo(t);
                  setNotes(t.description || "");
                }}
                calculateFinancialValue={calculateFinancialValue}
                getStatusBadge={getStatusBadge}
              />
            ))}
          </TabsContent>

          <TabsContent value="in_progress" className="space-y-4">
            {todos.filter(t => t.status === "in_progress").map((todo) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                onStatusChange={updateTodoStatus}
                onNotesClick={(t) => {
                  setSelectedTodo(t);
                  setNotes(t.description || "");
                }}
                calculateFinancialValue={calculateFinancialValue}
                getStatusBadge={getStatusBadge}
              />
            ))}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {todos.filter(t => t.status === "completed").map((todo) => (
              <TodoCard
                key={todo.id}
                todo={todo}
                onStatusChange={updateTodoStatus}
                onNotesClick={(t) => {
                  setSelectedTodo(t);
                  setNotes(t.description || "");
                }}
                calculateFinancialValue={calculateFinancialValue}
                getStatusBadge={getStatusBadge}
              />
            ))}
          </TabsContent>
        </Tabs>

        {/* Notes Dialog */}
        {selectedTodo && (
          <Card className="mt-4 border-primary">
            <CardHeader>
              <CardTitle>Add Notes - {selectedTodo.job.jobName}</CardTitle>
              <CardDescription>Update progress notes for this task</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter your notes here..."
                rows={4}
              />
              <div className="flex gap-2">
                <Button onClick={() => updateNotes(selectedTodo.id)}>
                  Save Notes
                </Button>
                <Button variant="outline" onClick={() => {
                  setSelectedTodo(null);
                  setNotes("");
                }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// TodoCard component
function TodoCard({
  todo,
  onStatusChange,
  onNotesClick,
  calculateFinancialValue,
  getStatusBadge,
}: {
  todo: Todo;
  onStatusChange: (id: string, status: string) => void;
  onNotesClick: (todo: Todo) => void;
  calculateFinancialValue: (job: Job) => number;
  getStatusBadge: (status: string) => JSX.Element;
}) {
  const isOverdue = todo.job.dueDate && new Date(todo.job.dueDate) < new Date() && todo.status !== "completed";

  return (
    <Card className={isOverdue ? "border-destructive" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{todo.job.jobName}</CardTitle>
              {getStatusBadge(todo.status)}
              {isOverdue && (
                <Badge variant="destructive">Overdue</Badge>
              )}
            </div>
            <CardDescription className="space-y-1">
              {todo.job.description && <p>{todo.job.description}</p>}
              {todo.job.department && (
                <p className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {todo.job.department.name}
                </p>
              )}
              {todo.job.client && (
                <p className="flex items-center gap-1">
                  Client: {todo.job.client.clientName}
                </p>
              )}
              <p className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Start: {todo.job.startDate ? format(new Date(todo.job.startDate), "MMM dd, yyyy") : "TBD"}
                {todo.job.dueDate && ` - Due: ${format(new Date(todo.job.dueDate), "MMM dd, yyyy")}`}
              </p>
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-success">
              KES {calculateFinancialValue(todo.job).toLocaleString()}
            </div>
            {todo.job.budgetHours && (
              <p className="text-xs text-muted-foreground">
                {todo.job.budgetHours}h budgeted
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {todo.description && (
          <div className="mb-4 p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">Notes:</p>
            <p className="text-sm">{todo.description}</p>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {todo.status === "pending" && (
            <Button
              size="sm"
              onClick={() => onStatusChange(todo.id, "in_progress")}
            >
              Start Working
            </Button>
          )}
          {todo.status === "in_progress" && (
            <Button
              size="sm"
              onClick={() => onStatusChange(todo.id, "completed")}
            >
              Complete Assignment
            </Button>
          )}
          {todo.status !== "completed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNotesClick(todo)}
            >
              <FileText className="w-4 h-4 mr-2" />
              Add Notes
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

