"use client";

import { useState, useEffect, useRef, useMemo, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { JobSet, SlotJob, ExecutionStatusResponse, SingleGenerateResponse, Resolution } from "@/lib/types";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  RotateCcw,
} from "lucide-react";

// ─── Poll interval ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

// ─── Backend job shape ────────────────────────────────────────────────────────

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

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchExecutionStatus(executionArn: string): Promise<ExecutionStatusResponse> {
  const encoded = encodeURIComponent(executionArn);
  const res = await fetch(`/api/generate/execution-status/${encoded}`);
  if (!res.ok) throw new Error(`Execution status check failed (${res.status})`);
  return res.json();
}

async function fetchJobFromBackend(jobSetId: string): Promise<JobSet | null> {
  const res = await fetch("/api/generate/jobs");
  if (!res.ok) return null;
  const data: { jobs: BackendJob[] } = await res.json();
  const found = data.jobs.find(j => j.jobSetId === jobSetId);
  return found ? backendJobToJobSet(found) : null;
}

// ─── Slot status icon ─────────────────────────────────────────────────────────

function SlotIcon({ status }: { status: SlotJob["status"] }) {
  if (status === "success")  return <CheckCircle className="size-4 text-green-500 shrink-0" />;
  if (status === "failed")   return <XCircle className="size-4 text-red-500 shrink-0" />;
  if (status === "polling" || status === "submitted")
    return <Loader2 className="size-4 text-blue-500 shrink-0 animate-spin" />;
  return <Clock className="size-4 text-muted-foreground/40 shrink-0" />;
}

function slotLabel(status: SlotJob["status"]): string {
  return { idle: "Waiting", submitted: "Submitted", polling: "Generating…", success: "Done", failed: "Failed" }[status];
}

// ─── Slot card ────────────────────────────────────────────────────────────────

function SlotCard({ title, subtitle, job }: { title: string; subtitle: string; job: SlotJob }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 bg-card">
      <div className="flex items-start gap-3">
        <SlotIcon status={job.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{title}</span>
            <Badge variant="outline" className="text-xs">{slotLabel(job.status)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          {job.failMsg && <p className="text-xs text-destructive mt-1">{job.failMsg}</p>}
        </div>
      </div>

      {job.status === "success" && job.resultUrl && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={job.resultUrl} alt={title} className="w-full rounded-md border object-cover max-h-72" />
          <a href={job.resultUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Open full image <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {(job.status === "polling" || job.status === "submitted") && (
        <Skeleton className="w-full h-40 rounded-md" />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GenerateDetailPage({ params }: { params: Promise<{ jobSetId: string }> }) {
  const { jobSetId }  = use(params);
  const router        = useRouter();
  const [jobSet,       setJobSet]       = useState<JobSet | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [isRerunning,  setIsRerunning]  = useState(false);
  const [rerunError,   setRerunError]   = useState<string | null>(null);

  // Ref so polling closure always reads the latest jobSet without re-creating the interval
  const jobSetRef = useRef<JobSet | null>(null);
  jobSetRef.current = jobSet;

  // ── Initial load from DynamoDB ──────────────────────────────────────────────
  useEffect(() => {
    fetchJobFromBackend(jobSetId).then(found => {
      setJobSet(found);
      setLoading(false);
    });
  }, [jobSetId]);

  const allMainDone = useMemo(() =>
    jobSet != null &&
    jobSet.jobs.ls1.status === "success" &&
    jobSet.jobs.ls2.status === "success" &&
    jobSet.jobs.ls3.status === "success",
  [jobSet]);

  // ── Poll Step Functions execution status ───────────────────────────────────
  useEffect(() => {
    if (!jobSet?.executionArn) return;

    const j = jobSet.jobs;
    const alreadyDone =
      (j.ls1.status === "success" && j.ls2.status === "success" && j.ls3.status === "success") ||
      j.ls1.status === "failed" || j.ls2.status === "failed" || j.ls3.status === "failed";
    if (alreadyDone) return;

    const interval = setInterval(async () => {
      const current = jobSetRef.current;
      if (!current?.executionArn) { clearInterval(interval); return; }

      const jobs = current.jobs;
      const settled =
        (jobs.ls1.status === "success" && jobs.ls2.status === "success" && jobs.ls3.status === "success") ||
        jobs.ls1.status === "failed" || jobs.ls2.status === "failed" || jobs.ls3.status === "failed";
      if (settled) { clearInterval(interval); return; }

      try {
        const res = await fetchExecutionStatus(current.executionArn);

        if (res.executionStatus === "SUCCEEDED") {
          setJobSet(prev => prev ? { ...prev, jobs: { ...prev.jobs,
            ls1: { taskId: null, status: "success", resultUrl: res.slots.ls1.resultUrl ?? "" },
            ls2: { taskId: null, status: "success", resultUrl: res.slots.ls2.resultUrl ?? "" },
            ls3: { taskId: null, status: "success", resultUrl: res.slots.ls3.resultUrl ?? "" },
          }} : prev);
          clearInterval(interval);
        } else if (res.executionStatus === "FAILED") {
          const failMsg = res.cause ?? res.error ?? "Pipeline failed";
          setJobSet(prev => prev ? { ...prev, jobs: { ...prev.jobs,
            ls1: { taskId: null, status: "failed", failMsg },
            ls2: { taskId: null, status: "failed", failMsg },
            ls3: { taskId: null, status: "failed", failMsg },
          }} : prev);
          clearInterval(interval);
        }
        // RUNNING — keep polling
      } catch { /* transient error — keep polling */ }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobSet?.executionArn]); // only restarts if executionArn changes (e.g. after re-run)

  // ── Re-run ─────────────────────────────────────────────────────────────────
  async function handleRerun() {
    if (!jobSet) return;
    setIsRerunning(true);
    setRerunError(null);
    try {
      const res = await fetch("/api/generate/single", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ salesCode: jobSet.salesCode, resolution: jobSet.resolution }),
      });
      const data: SingleGenerateResponse = await res.json();
      if (!res.ok) throw new Error((data as { detail?: string }).detail ?? `Re-run failed (${res.status})`);
      router.push(`/generate/${data.jobSetId}`);
    } catch (e: unknown) {
      setRerunError(e instanceof Error ? e.message : "Re-run failed");
      setIsRerunning(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!jobSet) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-muted-foreground text-sm">Job not found.</p>
        <Link href="/generate" className="mt-4 inline-block">
          <Button variant="outline" size="sm">Back to Queue</Button>
        </Link>
      </div>
    );
  }

  const polling = jobSet.jobs.ls1.status === "polling" || jobSet.jobs.ls2.status === "polling" || jobSet.jobs.ls3.status === "polling";
  const hasFailed = jobSet.jobs.ls1.status === "failed" || jobSet.jobs.ls2.status === "failed" || jobSet.jobs.ls3.status === "failed";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link + header */}
      <div className="flex items-start gap-3">
        <Link href="/generate" className="text-muted-foreground hover:text-foreground transition-colors mt-1">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight font-mono">{jobSet.salesCode}</h2>
            {(polling || hasFailed) && (
              <Button size="sm" variant="outline" onClick={handleRerun} disabled={isRerunning} className="gap-1.5 h-7 text-xs">
                {isRerunning ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                {isRerunning ? "Starting…" : "Re-run"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Started {new Date(jobSet.createdAt).toLocaleString()} · {jobSet.resolution}
          </p>
          {jobSet.executionArn && (
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate">{jobSet.executionArn}</p>
          )}
          {rerunError && (
            <p className="text-xs text-destructive mt-1">
              Re-run failed: {rerunError} —{" "}
              <button onClick={() => setRerunError(null)} className="underline">dismiss</button>
            </p>
          )}
        </div>
      </div>

      {/* Main slots */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Lifestyle Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SlotCard title="LS1" subtitle="Wide room shot — landscape 4:3"                                       job={jobSet.jobs.ls1} />
          <SlotCard title="LS2" subtitle="Close-up hero shot — portrait 3:4 (submitted after LS1 by pipeline)" job={jobSet.jobs.ls2} />
          <SlotCard title="LS3" subtitle="Medium angled vignette — square 1:1"                                  job={jobSet.jobs.ls3} />
        </CardContent>
      </Card>

      {/* Go to review when all done */}
      {allMainDone && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 px-4 py-3">
          <CheckCircle className="size-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 dark:text-green-200 flex-1">All 3 lifestyle images are ready.</p>
          <Link href="/review">
            <Button size="sm">Go to Review →</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
