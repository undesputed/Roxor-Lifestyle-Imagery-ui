"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deriveJobSetStatus, addImage, loadImages, type Slot } from "@/lib/store";
import type { JobSet, SingleGenerateResponse, ExecutionStatusResponse, Resolution } from "@/lib/types";
import { Trash2, ChevronRight, Zap, Clock, Search, X, RotateCcw, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Backend job shape (from GET /generate/jobs) ──────────────────────────────

type BackendJob = {
  jobSetId:         string;
  salesCode:        string;
  executionArn:     string | null;
  createdAt:        string;
  resolution:       string;
  generationStatus: string;
  ls1ResultUrl?:    string | null;
  ls2ResultUrl?:    string | null;
  ls3ResultUrl?:    string | null;
};

function backendJobToJobSet(j: BackendJob): JobSet {
  const isGenerated = j.generationStatus === "GENERATED";
  const isFailed    = j.generationStatus === "FAILED";
  return {
    jobSetId:     j.jobSetId,
    salesCode:    j.salesCode,
    createdAt:    j.createdAt || new Date().toISOString(),
    resolution:   (j.resolution as Resolution) ?? "2K",
    executionArn: j.executionArn ?? undefined,
    jobs: {
      ls1: isGenerated && j.ls1ResultUrl
        ? { taskId: null, status: "success" as const, resultUrl: j.ls1ResultUrl }
        : isFailed ? { taskId: null, status: "failed" as const }
        : { taskId: null, status: "polling" as const },
      ls2: isGenerated && j.ls2ResultUrl
        ? { taskId: null, status: "success" as const, resultUrl: j.ls2ResultUrl }
        : isFailed ? { taskId: null, status: "failed" as const }
        : { taskId: null, status: "polling" as const },
      ls3: isGenerated && j.ls3ResultUrl
        ? { taskId: null, status: "success" as const, resultUrl: j.ls3ResultUrl }
        : isFailed ? { taskId: null, status: "failed" as const }
        : { taskId: null, status: "polling" as const },
      companions: [],
    },
  };
}

// ─── Dismissed job IDs (persisted so deletes survive refresh) ─────────────────

const DISMISSED_KEY = "roxor_dismissed_jobs";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type OverallStatus = ReturnType<typeof deriveJobSetStatus>;

const STATUS_LABEL: Record<OverallStatus, string> = {
  complete:    "Complete",
  failed:      "Failed",
  in_progress: "In Progress",
  idle:        "Queued",
};

const STATUS_VARIANT: Record<OverallStatus, string> = {
  complete:    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200",
  failed:      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200 animate-pulse",
  idle:        "bg-muted text-muted-foreground",
};

// ─── Duration helpers ─────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function ElapsedTimer({ createdAt, status }: { createdAt: string; status: OverallStatus }) {
  const startMs = new Date(createdAt).getTime();
  const [elapsed, setElapsed] = useState(() => Date.now() - startMs);

  useEffect(() => {
    if (status !== "in_progress") return;
    const interval = setInterval(() => setElapsed(Date.now() - startMs), 1000);
    return () => clearInterval(interval);
  }, [startMs, status]);

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-mono tabular-nums",
      status === "in_progress" ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
    )}>
      <Clock className="size-3 shrink-0" />
      {formatDuration(elapsed)}
    </span>
  );
}

// ─── Slot progress dots ───────────────────────────────────────────────────────

function SlotDots({ jobSet }: { jobSet: JobSet }) {
  const slots = [
    { label: "LS1", job: jobSet.jobs.ls1 },
    { label: "LS2", job: jobSet.jobs.ls2 },
    { label: "LS3", job: jobSet.jobs.ls3 },
  ] as const;

  return (
    <div className="flex items-center gap-1.5">
      {slots.map(({ label, job }) => {
        const color =
          job.status === "success"  ? "bg-green-500" :
          job.status === "failed"   ? "bg-red-500" :
          job.status === "polling" || job.status === "submitted"
            ? "bg-blue-400 animate-pulse"
            : "bg-muted-foreground/20";
        return (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <div className={`size-2.5 rounded-full ${color}`} />
            <span className="text-[9px] text-muted-foreground font-mono">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Zap className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">No generations yet</h3>
      <p className="text-muted-foreground text-sm mt-1 max-w-xs">
        Go to the Products page, select products, and click{" "}
        <strong>Batch Generate</strong> — or use the{" "}
        <strong>Generate</strong> button on any product row.
      </p>
      <Link href="/products" className="mt-4">
        <Button variant="outline" size="sm">Go to Products</Button>
      </Link>
    </div>
  );
}

// ─── Queue row ────────────────────────────────────────────────────────────────

function QueueRow({
  jobSet,
  isRerunning,
  onDelete,
  onRerun,
}: {
  jobSet:      JobSet;
  isRerunning: boolean;
  onDelete:    (id: string) => void;
  onRerun:     (jobSet: JobSet) => void;
}) {
  const overallStatus  = deriveJobSetStatus(jobSet);
  const createdAt      = new Date(jobSet.createdAt);
  const timeAgo        = formatTimeAgo(createdAt);
  const companionCount = jobSet.jobs.companions.length;
  const companionsDone = jobSet.jobs.companions.filter((c) => c.status === "success").length;

  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group",
      isRerunning && "opacity-60 pointer-events-none"
    )}>
      <SlotDots jobSet={jobSet} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{jobSet.salesCode}</span>
          <Badge variant="outline" className={`text-xs ${STATUS_VARIANT[overallStatus]}`}>
            {STATUS_LABEL[overallStatus]}
          </Badge>
          <span className="text-xs text-muted-foreground">{jobSet.resolution}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-xs text-muted-foreground">
            Started {timeAgo}
            {companionCount > 0 && <> · {companionsDone}/{companionCount} companions done</>}
          </p>
          <ElapsedTimer createdAt={jobSet.createdAt} status={overallStatus} />
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.preventDefault(); onRerun(jobSet); }}
          disabled={isRerunning}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors opacity-0 group-hover:opacity-100",
            overallStatus === "failed"      ? "text-destructive hover:bg-destructive/10" :
            overallStatus === "in_progress" ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950" :
            "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title={overallStatus === "failed" ? "Re-run — start a fresh execution" : "Re-run"}
        >
          {isRerunning ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          <span className="hidden sm:inline">{isRerunning ? "Starting…" : "Re-run"}</span>
        </button>

        <button
          onClick={(e) => { e.preventDefault(); onDelete(jobSet.jobSetId); }}
          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove from queue"
        >
          <Trash2 className="size-3.5" />
        </button>

        <Link
          href={`/generate/${jobSet.jobSetId}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1"
        >
          View <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

function Pagination({ total, page, onPage }: { total: number; page: number; onPage: (p: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
      <span>
        {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pageCount}</span>
        <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === pageCount} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [jobSets,   setJobSets]   = useState<JobSet[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "in_progress" | "complete" | "failed">("all");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [page,         setPage]         = useState(1);
  const [rerunningId,  setRerunningId]  = useState<string | null>(null);
  const [rerunError,   setRerunError]   = useState<string | null>(null);

  // Dismissed job IDs — only stored as IDs in localStorage to keep deletes across refreshes
  const dismissedRef = useRef<Set<string>>(new Set());
  useEffect(() => { dismissedRef.current = loadDismissed(); }, []);

  // ── Fetch jobs from DynamoDB ───────────────────────────────────────────────
  const fetchAndUpdate = useCallback(async () => {
    try {
      const res = await fetch("/api/generate/jobs");
      if (!res.ok) return;
      const data: { jobs: BackendJob[] } = await res.json();

      // Filter out dismissed jobs
      const visible = data.jobs.filter(j => !dismissedRef.current.has(j.jobSetId));
      const mapped  = visible.map(backendJobToJobSet);

      // Push any GENERATED jobs to the review localStorage queue (deduplicated by URL).
      // This ensures images appear in Review even when the user never opened the Review page
      // while polling was active.
      const existingReviewUrls = new Set(loadImages().map(img => img.url));
      visible.forEach(j => {
        if (j.generationStatus === "GENERATED") {
          (["ls1", "ls2", "ls3"] as Slot[]).forEach(slot => {
            const url = j[`${slot}ResultUrl` as keyof typeof j] as string | null | undefined;
            if (url && !existingReviewUrls.has(url)) {
              addImage({ salesCode: j.salesCode, slot, url });
              existingReviewUrls.add(url);
            }
          });
        }
      });

      // For GENERATING jobs with executionArn, also poll Step Functions for slot-level dots
      const running = mapped.filter(s => s.executionArn && deriveJobSetStatus(s) === "in_progress");
      if (running.length > 0) {
        const execResults = await Promise.allSettled(
          running.map(async js => {
            const encoded = encodeURIComponent(js.executionArn!);
            const r = await fetch(`/api/generate/execution-status/${encoded}`);
            if (!r.ok) return null;
            const d: ExecutionStatusResponse = await r.json();
            return { jobSetId: js.jobSetId, salesCode: js.salesCode, exec: d };
          })
        );
        const execMap = new Map<string, { salesCode: string; exec: ExecutionStatusResponse }>();
        execResults.forEach(r => {
          if (r.status === "fulfilled" && r.value) execMap.set(r.value.jobSetId, { salesCode: r.value.salesCode, exec: r.value.exec });
        });
        mapped.forEach((js, i) => {
          const entry = execMap.get(js.jobSetId);
          if (!entry) return;
          const { exec } = entry;
          if (exec.executionStatus === "SUCCEEDED") {
            // Push images to review queue (deduplicated by URL)
            (["ls1", "ls2", "ls3"] as Slot[]).forEach(slot => {
              const url = exec.slots[slot]?.resultUrl;
              if (url && !existingReviewUrls.has(url)) {
                addImage({ salesCode: js.salesCode, slot, url });
                existingReviewUrls.add(url);
              }
            });
            mapped[i] = { ...js, jobs: { ...js.jobs,
              ls1: { taskId: null, status: "success", resultUrl: exec.slots.ls1.resultUrl },
              ls2: { taskId: null, status: "success", resultUrl: exec.slots.ls2.resultUrl },
              ls3: { taskId: null, status: "success", resultUrl: exec.slots.ls3.resultUrl },
            }};
          } else if (exec.executionStatus === "FAILED") {
            const failMsg = exec.cause ?? exec.error ?? "Pipeline failed";
            mapped[i] = { ...js, jobs: { ...js.jobs,
              ls1: { taskId: null, status: "failed", failMsg },
              ls2: { taskId: null, status: "failed", failMsg },
              ls3: { taskId: null, status: "failed", failMsg },
            }};
          }
        });
      }

      setJobSets(mapped);
    } catch { /* network error — keep showing last known state */ }
    finally { setLoading(false); }
  }, []);

  // Initial fetch + 30s poll
  useEffect(() => {
    fetchAndUpdate();
    const id = setInterval(fetchAndUpdate, 30_000);
    return () => clearInterval(id);
  }, [fetchAndUpdate]);

  // ── Delete ────────────────────────────────────────────────────────────────

  function handleDelete(id: string) {
    dismissedRef.current = new Set([...dismissedRef.current, id]);
    saveDismissed(dismissedRef.current);
    setJobSets(prev => prev.filter(s => s.jobSetId !== id));
  }

  // ── Re-run ────────────────────────────────────────────────────────────────

  async function handleRerun(jobSet: JobSet) {
    setRerunningId(jobSet.jobSetId);
    setRerunError(null);
    try {
      const res = await fetch("/api/generate/single", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ salesCode: jobSet.salesCode, resolution: jobSet.resolution }),
      });
      const data: SingleGenerateResponse = await res.json();
      if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Re-run failed (${res.status})`);

      // Dismiss old job so it doesn't reappear before DynamoDB updates
      dismissedRef.current = new Set([...dismissedRef.current, jobSet.jobSetId]);
      saveDismissed(dismissedRef.current);
      await fetchAndUpdate();
    } catch (e: unknown) {
      setRerunError(e instanceof Error ? e.message : "Re-run failed");
    } finally {
      setRerunningId(null);
    }
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const afterStatus = statusFilter === "all"
    ? jobSets
    : jobSets.filter(s => deriveJobSetStatus(s) === statusFilter);

  const afterSearch = searchQuery.trim()
    ? afterStatus.filter(s => s.salesCode.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : afterStatus;

  const totalFiltered = afterSearch.length;
  const safePage      = Math.min(page, Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE)));
  const pageSlice     = afterSearch.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = {
    all:         jobSets.length,
    in_progress: jobSets.filter(s => deriveJobSetStatus(s) === "in_progress").length,
    complete:    jobSets.filter(s => deriveJobSetStatus(s) === "complete").length,
    failed:      jobSets.filter(s => deriveJobSetStatus(s) === "failed").length,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Generation Queue</h2>
          <p className="text-muted-foreground mt-1">Track all active and completed generation jobs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={fetchAndUpdate} className="gap-1.5">
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          {jobSets.length > 0 && (
            <Link href="/products">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Zap className="size-3.5" /> New Generation
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Re-run error banner */}
      {rerunError && (
        <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>Re-run failed: {rerunError}</span>
          <button onClick={() => setRerunError(null)} className="ml-4 underline opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {jobSets.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Status filter tabs + search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 flex-wrap">
              {(["all", "in_progress", "complete", "failed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setStatusFilter(f); setPage(1); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm transition-colors",
                    statusFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
                  {counts[f] > 0 && <span className="ml-1 text-xs opacity-70">({counts[f]})</span>}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder="Search sales code…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Queue list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                {totalFiltered} job{totalFiltered !== 1 ? "s" : ""}
                {(statusFilter !== "all" || searchQuery) && (
                  <span className="ml-1 font-normal text-muted-foreground">(filtered from {jobSets.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {totalFiltered === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No jobs match this filter.</p>
              ) : (
                <>
                  {pageSlice.map(set => (
                    <QueueRow
                      key={set.jobSetId}
                      jobSet={set}
                      isRerunning={rerunningId === set.jobSetId}
                      onDelete={handleDelete}
                      onRerun={handleRerun}
                    />
                  ))}
                  <Pagination total={totalFiltered} page={safePage} onPage={setPage} />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
