import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ExternalLink, FileText, Loader2 } from "lucide-react";
import mammoth from "mammoth";
import { Document, Page, pdfjs } from "react-pdf";
import * as XLSX from "xlsx";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type CompletionMode = "video_end" | "watch_percent" | "document_scroll" | "manual";

export type TrackedContentProgress = {
  scrollPercent?: number;
  watchPercent?: number;
  watchSeconds?: number;
  completed?: boolean;
};

interface TrackedContentViewerProps {
  title: string;
  sourceUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  textContent?: string | null;
  completionMode?: CompletionMode;
  completionThresholdPercent?: number | null;
  className?: string;
  onProgress?: (progress: TrackedContentProgress) => void;
  onTrackingSupportChange?: (supported: boolean) => void;
}

type RenderMode =
  | "empty"
  | "text"
  | "pdf"
  | "html"
  | "spreadsheet"
  | "iframe"
  | "native-video"
  | "embedded-video";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];
const PDF_EXTENSIONS = [".pdf"];
const WORD_EXTENSIONS = [".doc", ".docx"];
const SPREADSHEET_EXTENSIONS = [".xls", ".xlsx", ".csv"];
const TEXT_EXTENSIONS = [".txt", ".md", ".rtf"];

const getSourceExtension = (sourceUrl?: string | null, fileName?: string | null) => {
  const candidate = fileName || sourceUrl || "";
  const normalized = candidate.split("?")[0].toLowerCase();
  const extensionIndex = normalized.lastIndexOf(".");
  return extensionIndex >= 0 ? normalized.slice(extensionIndex) : "";
};

const resolveVideoEmbedUrl = (value: string | null | undefined) => {
  if (!value) return null;

  try {
    const url = new URL(value);

    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.replace(/^\/+/, "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/embed/${videoId}`;

      const pathSegments = url.pathname.split("/").filter(Boolean);
      if (pathSegments[0] === "shorts" && pathSegments[1]) {
        return `https://www.youtube.com/embed/${pathSegments[1]}`;
      }
    }

    if (url.hostname.includes("vimeo.com")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://player.vimeo.com/video/${videoId}` : null;
    }
  } catch {
    return null;
  }

  return null;
};

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value * 100) / 100;
};

export default function TrackedContentViewer({
  title,
  sourceUrl,
  fileName,
  mimeType,
  textContent,
  completionMode = "manual",
  completionThresholdPercent,
  className,
  onProgress,
  onTrackingSupportChange,
}: TrackedContentViewerProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pdfWidthRef = useRef<HTMLDivElement | null>(null);
  const lastReportedScrollPercentRef = useRef(0);
  const lastReportedWatchPercentRef = useRef(0);
  const [pageWidth, setPageWidth] = useState(720);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [htmlContent, setHtmlContent] = useState("");
  const [spreadsheetSheets, setSpreadsheetSheets] = useState<Array<{ name: string; html: string }>>([]);
  const [textDocumentContent, setTextDocumentContent] = useState("");
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);

  const extension = useMemo(() => getSourceExtension(sourceUrl, fileName), [fileName, sourceUrl]);
  const embedUrl = useMemo(() => resolveVideoEmbedUrl(sourceUrl), [sourceUrl]);
  const isNativeVideo =
    Boolean(sourceUrl) &&
    !embedUrl &&
    (mimeType?.startsWith("video/") || VIDEO_EXTENSIONS.includes(extension));
  const isPdf = PDF_EXTENSIONS.includes(extension) || mimeType === "application/pdf";
  const isWord =
    WORD_EXTENSIONS.includes(extension) ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword";
  const isSpreadsheet =
    SPREADSHEET_EXTENSIONS.includes(extension) ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv";
  const isTextDocument =
    TEXT_EXTENSIONS.includes(extension) ||
    mimeType?.startsWith("text/") ||
    mimeType === "application/rtf";

  const renderMode: RenderMode = useMemo(() => {
    if (isNativeVideo) return "native-video";
    if (embedUrl) return "embedded-video";
    if (textContent) return "text";
    if (!sourceUrl) return "empty";
    if (pdfFailed) return "iframe";
    if (isPdf) return "pdf";
    if (htmlContent) return "html";
    if (spreadsheetSheets.length > 0) return "spreadsheet";
    if (textDocumentContent) return "text";
    return "iframe";
  }, [
    embedUrl,
    htmlContent,
    isNativeVideo,
    isPdf,
    pdfFailed,
    sourceUrl,
    spreadsheetSheets.length,
    textContent,
    textDocumentContent,
  ]);

  const trackingSupported =
    renderMode === "pdf" ||
    renderMode === "html" ||
    renderMode === "spreadsheet" ||
    renderMode === "text" ||
    renderMode === "native-video";
  const documentRenderReady =
    (renderMode === "pdf" && pdfPageCount > 0) ||
    (renderMode === "html" && Boolean(htmlContent)) ||
    (renderMode === "spreadsheet" && spreadsheetSheets.length > 0) ||
    (renderMode === "text" && Boolean(textContent || textDocumentContent));

  useEffect(() => {
    onTrackingSupportChange?.(trackingSupported);
  }, [onTrackingSupportChange, trackingSupported]);

  useEffect(() => {
    lastReportedScrollPercentRef.current = 0;
    lastReportedWatchPercentRef.current = 0;
  }, [sourceUrl, textContent, completionMode]);

  useEffect(() => {
    if (!pdfWidthRef.current) return;

    const updateWidth = () => {
      const nextWidth = Math.max(320, Math.min(900, pdfWidthRef.current?.clientWidth || 720) - 24);
      setPageWidth(nextWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(pdfWidthRef.current);

    return () => observer.disconnect();
  }, [renderMode]);

  useEffect(() => {
    let cancelled = false;

    setHtmlContent("");
    setSpreadsheetSheets([]);
    setTextDocumentContent("");
    setDocumentError(null);
    setDocumentLoading(false);
    setPdfFailed(false);
    setPdfPageCount(0);

    if (textContent || !sourceUrl || isPdf || isNativeVideo || embedUrl) {
      return () => {
        cancelled = true;
      };
    }

    const loadRenderableDocument = async () => {
      try {
        setDocumentLoading(true);
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`Unable to load ${title}`);
        }

        if (isWord) {
          const arrayBuffer = await response.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (cancelled) return;
          startTransition(() => {
            setHtmlContent(result.value || "<p>No preview content is available.</p>");
          });
          return;
        }

        if (isSpreadsheet) {
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const nextSheets = workbook.SheetNames.map((sheetName) => ({
            name: sheetName,
            html: XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]),
          }));
          if (cancelled) return;
          startTransition(() => {
            setSpreadsheetSheets(nextSheets);
          });
          return;
        }

        if (isTextDocument) {
          const nextText = await response.text();
          if (cancelled) return;
          startTransition(() => {
            setTextDocumentContent(nextText);
          });
          return;
        }
      } catch (error: any) {
        if (!cancelled) {
          setDocumentError(error?.message || "Preview is not available for this document.");
        }
      } finally {
        if (!cancelled) {
          setDocumentLoading(false);
        }
      }
    };

    void loadRenderableDocument();

    return () => {
      cancelled = true;
    };
  }, [
    embedUrl,
    isNativeVideo,
    isPdf,
    isSpreadsheet,
    isTextDocument,
    isWord,
    sourceUrl,
    textContent,
    title,
  ]);

  const emitDocumentProgress = (nextScrollPercent: number) => {
    if (!onProgress) return;
    const normalized = clampPercent(nextScrollPercent);
    const lastReported = lastReportedScrollPercentRef.current;
    if (normalized <= lastReported) return;
    if (normalized < 100 && normalized - lastReported < 10) return;

    lastReportedScrollPercentRef.current = normalized;
    onProgress({
      scrollPercent: normalized,
      completed: completionMode === "document_scroll" && normalized >= 100,
    });
  };

  const emitVideoProgress = (watchPercent: number, watchSeconds: number, completed = false) => {
    if (!onProgress) return;

    const normalizedPercent = clampPercent(watchPercent);
    const lastReported = lastReportedWatchPercentRef.current;
    const completionTarget =
      completionMode === "watch_percent" ? completionThresholdPercent ?? 95 : 95;

    const shouldReport =
      completed ||
      normalizedPercent >= 100 ||
      normalizedPercent >= completionTarget ||
      normalizedPercent - lastReported >= 10;

    if (!shouldReport || normalizedPercent <= lastReported) return;

    lastReportedWatchPercentRef.current = normalizedPercent;
    onProgress({
      watchPercent: normalizedPercent,
      watchSeconds,
      completed:
        completed ||
        (completionMode === "watch_percent" && normalizedPercent >= completionTarget) ||
        (completionMode === "video_end" && normalizedPercent >= 95),
    });
  };

  const handleScrollableContent = () => {
    const element = contentRef.current;
    if (!element || !trackingSupported || renderMode === "native-video") return;
    if (!documentRenderReady) return;

    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
      emitDocumentProgress(100);
      return;
    }

    emitDocumentProgress((element.scrollTop / maxScroll) * 100);
  };

  useEffect(() => {
    if (!documentRenderReady) {
      return;
    }

    const frame = window.requestAnimationFrame(() => handleScrollableContent());
    return () => window.cancelAnimationFrame(frame);
  }, [documentRenderReady, handleScrollableContent]);

  const shellClassName = className ? `h-full ${className}` : "h-full";

  return (
    <div className={shellClassName}>
      {renderMode === "empty" ? (
        <div className="flex h-full items-center justify-center gap-2 rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          No preview is available.
        </div>
      ) : renderMode === "native-video" && sourceUrl ? (
        <video
          controls
          src={sourceUrl}
          className="h-full w-full rounded-lg border bg-black"
          onTimeUpdate={(event) => {
            const element = event.currentTarget;
            if (!Number.isFinite(element.duration) || element.duration <= 0) return;
            emitVideoProgress(
              (element.currentTime / element.duration) * 100,
              Math.floor(element.currentTime)
            );
          }}
          onEnded={(event) => {
            const element = event.currentTarget;
            emitVideoProgress(100, Math.floor(element.duration || element.currentTime || 0), true);
          }}
        />
      ) : renderMode === "embedded-video" && embedUrl ? (
        <div className="space-y-3">
          <iframe
            src={embedUrl}
            title={title}
            className="h-[420px] w-full rounded-lg border"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            External video embeds cannot report watch completion automatically in this workspace.
          </div>
        </div>
      ) : (
        <div
          ref={contentRef}
          className="h-full overflow-y-auto rounded-lg border bg-background"
          onScroll={handleScrollableContent}
        >
          {documentLoading ? (
            <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading document...
            </div>
          ) : renderMode === "pdf" && sourceUrl ? (
            <div ref={pdfWidthRef} className="space-y-4 p-4">
              <Document
                file={sourceUrl}
                loading={
                  <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rendering PDF...
                  </div>
                }
                onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
                onLoadError={(error) => {
                  setDocumentError(error?.message || "Unable to render the PDF preview.");
                  setPdfFailed(true);
                }}
              >
                {Array.from({ length: pdfPageCount }, (_, index) => (
                  <Page
                    key={`${title}-page-${index + 1}`}
                    pageNumber={index + 1}
                    width={pageWidth}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    className="mx-auto overflow-hidden rounded-lg border bg-white shadow-sm"
                  />
                ))}
              </Document>
            </div>
          ) : renderMode === "html" ? (
            <div
              className="prose prose-slate max-w-none p-6"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          ) : renderMode === "spreadsheet" ? (
            <div className="space-y-6 p-6">
              {spreadsheetSheets.map((sheet) => (
                <section key={sheet.name} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{sheet.name}</h3>
                  </div>
                  <div
                    className="overflow-x-auto rounded-lg border bg-white p-3 text-sm"
                    dangerouslySetInnerHTML={{ __html: sheet.html }}
                  />
                </section>
              ))}
            </div>
          ) : renderMode === "text" ? (
            <pre className="whitespace-pre-wrap p-6 font-sans text-sm leading-6 text-slate-800">
              {textContent || textDocumentContent}
            </pre>
          ) : sourceUrl ? (
            <div className="space-y-3 p-4">
              <iframe src={sourceUrl} title={title} className="h-[520px] w-full rounded-lg border" />
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="space-y-2">
                    <p>{documentError || "This file type is shown in fallback preview mode."}</p>
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
                    >
                      Open in a new tab
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
