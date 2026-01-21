/**
 * Document Management Page
 * Role-based document upload, viewing, and verification
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import documentsAPI, { DOCUMENT_TYPES } from '@/lib/api/documents';
import { employeesAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  CheckCircle, 
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Shield,
  AlertTriangle,
  FolderOpen,
  User,
  Building2,
  Briefcase
} from 'lucide-react';
import { format } from 'date-fns';

// Access level display
const ACCESS_LEVELS = {
  employee: { label: 'Employee', color: 'bg-blue-100 text-blue-800', icon: User },
  manager: { label: 'Manager', color: 'bg-green-100 text-green-800', icon: User },
  hr: { label: 'HR', color: 'bg-purple-100 text-purple-800', icon: Shield },
  admin: { label: 'Admin', color: 'bg-red-100 text-red-800', icon: Shield },
};

// Verification status display
const VERIFICATION_STATUS = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  verified: { label: 'Verified', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
};

// Entity type display
const ENTITY_TYPES = {
  employee: { label: 'Employee', icon: User },
  client: { label: 'Client', icon: Building2 },
  job: { label: 'Job', icon: Briefcase },
  candidate: { label: 'Candidate', icon: User },
};

export default function DocumentManagement() {
  const { user, profile, isHR, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  
  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    entityType: 'employee',
    entityId: profile?.id || 0,
    documentType: '',
    accessLevel: 'employee' as const,
    description: '',
    file: null as File | null,
  });

  // Verify form state
  const [verifyForm, setVerifyForm] = useState({
    status: 'verified' as 'verified' | 'rejected',
    rejectionReason: '',
  });

  // Queries
  const { data: documentsData, isLoading } = useQuery({
    queryKey: ['documents', entityTypeFilter, statusFilter],
    queryFn: () => documentsAPI.list({
      entityType: entityTypeFilter || undefined,
      verificationStatus: statusFilter || undefined,
      pageSize: 100,
    }),
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => employeesAPI.list({ status: 'active', pageSize: 200 }),
    enabled: isHR || isAdmin,
  });

  const { data: pendingDocsData } = useQuery({
    queryKey: ['documents-pending'],
    queryFn: () => documentsAPI.getPendingVerification(),
    enabled: isHR || isAdmin,
  });

  const { data: myDocumentsData } = useQuery({
    queryKey: ['my-documents', profile?.id],
    queryFn: () => profile?.id ? documentsAPI.getEmployeeDocuments(profile.id) : Promise.resolve({ documents: [] }),
    enabled: !!profile?.id,
  });

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: async (data: typeof uploadForm) => {
      if (!data.file) throw new Error('No file selected');
      return documentsAPI.uploadFile(data.file, {
        documentType: data.documentType,
        entityType: data.entityType,
        entityId: data.entityId,
        accessLevel: data.accessLevel,
        description: data.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['my-documents'] });
      setShowUploadDialog(false);
      resetUploadForm();
      toast({ title: 'Document uploaded', description: 'Your document has been uploaded successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { verificationStatus: 'verified' | 'rejected'; rejectionReason?: string } }) => 
      documentsAPI.verify(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['documents-pending'] });
      setShowVerifyDialog(false);
      setSelectedDocument(null);
      toast({ title: 'Document verified', description: 'Verification status updated.' });
    },
    onError: (error: any) => {
      toast({ title: 'Verification failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['my-documents'] });
      toast({ title: 'Document deleted', description: 'Document has been removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  // Filter and search documents
  const filteredDocuments = useMemo(() => {
    let docs = documentsData?.documents || [];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      docs = docs.filter(d => 
        d.fileName.toLowerCase().includes(query) ||
        d.documentType.toLowerCase().includes(query) ||
        d.description?.toLowerCase().includes(query)
      );
    }
    
    return docs;
  }, [documentsData?.documents, searchQuery]);

  const myDocuments = myDocumentsData?.documents || [];
  const pendingDocuments = pendingDocsData?.documents || [];
  const employees = employeesData?.employees || [];

  // Form helpers
  const resetUploadForm = () => {
    setUploadForm({
      entityType: 'employee',
      entityId: profile?.id || 0,
      documentType: '',
      accessLevel: 'employee',
      description: '',
      file: null,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadForm(prev => ({ ...prev, file }));
    }
  };

  const handleUpload = () => {
    if (!uploadForm.file || !uploadForm.documentType) {
      toast({ title: 'Error', description: 'Please select a file and document type.', variant: 'destructive' });
      return;
    }
    uploadMutation.mutate(uploadForm);
  };

  const handleVerify = () => {
    if (!selectedDocument) return;
    verifyMutation.mutate({
      id: selectedDocument.id,
      data: {
        verificationStatus: verifyForm.status,
        rejectionReason: verifyForm.status === 'rejected' ? verifyForm.rejectionReason : undefined,
      },
    });
  };

  const openVerifyDialog = (doc: any) => {
    setSelectedDocument(doc);
    setVerifyForm({ status: 'verified', rejectionReason: '' });
    setShowVerifyDialog(true);
  };

  const formatDocumentType = (type: string) => {
    return type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Document row component
  const DocumentRow = ({ doc, showActions = true }: { doc: any; showActions?: boolean }) => {
    const status = VERIFICATION_STATUS[doc.verificationStatus as keyof typeof VERIFICATION_STATUS];
    const accessLevel = ACCESS_LEVELS[doc.accessLevel as keyof typeof ACCESS_LEVELS];
    const entityType = ENTITY_TYPES[doc.entityType as keyof typeof ENTITY_TYPES];
    
    return (
      <TableRow key={doc.id}>
        <TableCell>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{doc.fileName}</div>
              <div className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {entityType && <entityType.icon className="h-3 w-3" />}
            <span>{formatDocumentType(doc.documentType)}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge className={accessLevel?.color || 'bg-gray-100'}>
            {accessLevel?.label || doc.accessLevel}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge className={status?.color || 'bg-gray-100'}>
            {status?.icon && <status.icon className="h-3 w-3 mr-1" />}
            {status?.label || doc.verificationStatus}
          </Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {doc.createdAt ? format(new Date(doc.createdAt), 'MMM d, yyyy') : '-'}
        </TableCell>
        {showActions && (
          <TableCell>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(documentsAPI.getDownloadUrl(doc.id), '_blank')}
              >
                <Download className="h-4 w-4" />
              </Button>
              {(isHR || isAdmin) && doc.verificationStatus === 'pending' && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openVerifyDialog(doc)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              {(isAdmin || doc.uploadedBy === profile?.id) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => deleteMutation.mutate(doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </TableCell>
        )}
      </TableRow>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FolderOpen className="h-8 w-8 text-primary" />
            Document Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Upload, manage, and verify documents
          </p>
        </div>
        <Button onClick={() => setShowUploadDialog(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Document
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">My Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myDocuments.length}</div>
          </CardContent>
        </Card>
        {(isHR || isAdmin) && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Verification</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{pendingDocuments.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{documentsData?.total || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Verified</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {filteredDocuments.filter(d => d.verificationStatus === 'verified').length}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Documents</TabsTrigger>
          <TabsTrigger value="my">My Documents</TabsTrigger>
          {(isHR || isAdmin) && (
            <TabsTrigger value="pending">
              Pending Verification
              {pendingDocuments.length > 0 && (
                <Badge variant="destructive" className="ml-2">{pendingDocuments.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Filters */}
        <div className="flex gap-4 my-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="client">Client</SelectItem>
              <SelectItem value="job">Job</SelectItem>
              <SelectItem value="candidate">Candidate</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* All Documents Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Documents</CardTitle>
              <CardDescription>View and manage all accessible documents</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No documents found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocuments.map(doc => <DocumentRow key={doc.id} doc={doc} />)
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Documents Tab */}
        <TabsContent value="my">
          <Card>
            <CardHeader>
              <CardTitle>My Documents</CardTitle>
              <CardDescription>Your uploaded documents</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        You haven't uploaded any documents yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    myDocuments.map(doc => <DocumentRow key={doc.id} doc={doc} />)
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pending Verification Tab */}
        {(isHR || isAdmin) && (
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Pending Verification
                </CardTitle>
                <CardDescription>Documents awaiting HR/Admin verification</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingDocuments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No documents pending verification
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingDocuments.map(doc => (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{doc.fileName}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatDocumentType(doc.documentType)}</TableCell>
                          <TableCell>
                            {doc.uploader ? `${doc.uploader.firstName} ${doc.uploader.lastName}` : '-'}
                          </TableCell>
                          <TableCell>
                            {doc.createdAt ? format(new Date(doc.createdAt), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => openVerifyDialog(doc)}>
                                Review
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a new document to the system</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Document Type</Label>
              <Select
                value={uploadForm.documentType}
                onValueChange={(v) => setUploadForm(prev => ({ ...prev, documentType: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES[uploadForm.entityType as keyof typeof DOCUMENT_TYPES]?.map(type => (
                    <SelectItem key={type} value={type}>{formatDocumentType(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(isHR || isAdmin) && (
              <>
                <div>
                  <Label>Entity Type</Label>
                  <Select
                    value={uploadForm.entityType}
                    onValueChange={(v) => setUploadForm(prev => ({ ...prev, entityType: v, documentType: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="job">Job</SelectItem>
                      <SelectItem value="candidate">Candidate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {uploadForm.entityType === 'employee' && (
                  <div>
                    <Label>Employee</Label>
                    <Select
                      value={uploadForm.entityId.toString()}
                      onValueChange={(v) => setUploadForm(prev => ({ ...prev, entityId: parseInt(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id.toString()}>
                            {emp.firstName} {emp.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Access Level</Label>
                  <Select
                    value={uploadForm.accessLevel}
                    onValueChange={(v: any) => setUploadForm(prev => ({ ...prev, accessLevel: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee (Self only)</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div>
              <Label>Description (Optional)</Label>
              <Textarea
                value={uploadForm.description}
                onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Add a description..."
                rows={2}
              />
            </div>

            <div>
              <Label>File</Label>
              <Input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supported: PDF, Word, Excel, Images (max 10MB)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Document</DialogTitle>
            <DialogDescription>
              Review and verify the document: {selectedDocument?.fileName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm"><strong>Type:</strong> {selectedDocument && formatDocumentType(selectedDocument.documentType)}</p>
              <p className="text-sm"><strong>Size:</strong> {formatFileSize(selectedDocument?.fileSize)}</p>
              <p className="text-sm"><strong>Description:</strong> {selectedDocument?.description || '-'}</p>
            </div>

            <div>
              <Label>Verification Status</Label>
              <Select
                value={verifyForm.status}
                onValueChange={(v: 'verified' | 'rejected') => setVerifyForm(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verified">Approve</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {verifyForm.status === 'rejected' && (
              <div>
                <Label>Rejection Reason</Label>
                <Textarea
                  value={verifyForm.rejectionReason}
                  onChange={(e) => setVerifyForm(prev => ({ ...prev, rejectionReason: e.target.value }))}
                  placeholder="Please provide a reason for rejection..."
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              onClick={() => window.open(documentsAPI.getDownloadUrl(selectedDocument?.id), '_blank')}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={handleVerify} disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
