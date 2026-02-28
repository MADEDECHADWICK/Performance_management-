import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageLoaderProps {
  message?: string;
  minHeightClassName?: string;
  className?: string;
}

const PageLoader = ({
  message = "Loading...",
  minHeightClassName = "min-h-[400px]",
  className,
}: PageLoaderProps) => {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-2xl",
        minHeightClassName,
        className
      )}
    >
      <div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl border border-border/70 bg-background/85 p-5 shadow-[0_16px_45px_-22px_rgba(2,6,23,0.55)] backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="relative h-11 w-11 shrink-0">
            <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
            <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary animate-spin" />
            <span className="absolute inset-2 rounded-full bg-primary/12" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{message}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:240ms]" />
            </div>
          </div>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-1.5 rounded-full bg-muted animate-pulse" />
          <div className="h-1.5 rounded-full bg-muted animate-pulse [animation-delay:100ms]" />
          <div className="h-1.5 rounded-full bg-muted animate-pulse [animation-delay:200ms]" />
        </div>
      </div>
    </div>
  );
};

export default PageLoader;
