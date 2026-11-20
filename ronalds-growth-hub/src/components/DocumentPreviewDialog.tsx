import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import documentsAPI from "@/lib/api/documents";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  documentId?: number | null;
  filePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  description?: string;
}

const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

const resolveDocumentUrl = (filePath?: string | null) => {
  if (!filePath) return null;
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    return filePath;
  }
  const normalizedPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  return `${baseUrl}${normalizedPath}`;
};

const isImageFile = (fileName?: string | null, mimeType?: string | null, filePath?: string | null) => {
  if (mimeType?.startsWith("image/")) return true;
  const value = `${fileName || ""} ${filePath || ""}`.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some((ext) =>
    value.includes(ext)
  );
};

const createDownloadName = (title: string, fileName?: string | null) => {
  if (fileName && fileName.trim()) return fileName.trim();
  const sanitized = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized ? `${sanitized}.pdf` : "document";
};

export default function DocumentPreviewDialog({
  open,
  onOpenChange,
  title,
  documentId,
  filePath,
  fileName,
  mimeType,
  description,
}: DocumentPreviewDialogProps) {
  const fallbackUrl = useMemo(() => resolveDocumentUrl(filePath), [filePath]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!documentId) {
      setSignedUrl(null);
      return () => {
        cancelled = true;
      };
    }
    documentsAPI
      .getAccessUrl(documentId)
      .then((response) => {
        if (!cancelled) setSignedUrl(response.url);
      })
      .catch(() => {
        if (!cancelled) setSignedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const resolvedUrl = signedUrl || fallbackUrl;
  const previewSandbox = filePath?.startsWith("http://") || filePath?.startsWith("https://")
    ? "allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
    : undefined;
  const imagePreview = isImageFile(fileName, mimeType, filePath);

  const handleDownload = () => {
    if (!resolvedUrl) return;
    const link = document.createElement("a");
    link.href = resolvedUrl;
    link.download = createDownloadName(title, fileName);
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[96vw] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Preview the document here. Download is available if you need a copy."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end border-b pb-3">
          <Button variant="outline" onClick={handleDownload} disabled={!resolvedUrl}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
          {!resolvedUrl ? (
            <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              No document preview is available.
            </div>
          ) : imagePreview ? (
            <div className="flex h-full items-center justify-center overflow-auto bg-muted/20 p-6">
              <img
                src={resolvedUrl}
                alt={title}
                className="max-h-full w-auto rounded-md object-contain shadow-sm"
              />
            </div>
          ) : (
            <iframe
              key={`${title}-${resolvedUrl}`}
              src={resolvedUrl}
              title={title}
              className="h-full w-full border-0"
              sandbox={previewSandbox}
            />
          )}
        </div>

        {fileName && (
          <p className="text-xs text-muted-foreground">File: {fileName}</p>
        )}

        {resolvedUrl && (filePath?.startsWith("http://") || filePath?.startsWith("https://")) && (
          <p className="text-xs text-muted-foreground">
            Some external document URLs may block embedded preview. If that happens, use Download.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
