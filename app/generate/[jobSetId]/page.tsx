"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getJobSet,
  updateSlotJob,
  addImage,
  deleteJobSet,
  addJobSet,
} from "@/lib/store";
import type { JobSet, SlotJob, ExecutionStatusResponse, SingleGenerateResponse } from "@/lib/types";
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

// ─── API helper ───────────────────────────────────────────────────────────────

async function fetchExecutionStatus(
  executionArn: string
): Promise<ExecutionStatusResponse> {
  // API Gateway expects the ARN URL-encoded in the path segment
  const encoded = encodeURIComponent(executionArn);
  const res = await fetch(`/api/generate/execution-status/${encoded}`);
  if (!res.ok) throw new Error(`Execution status check failed (${res.status})`);
  return res.json();
}

// ─── Slot status icon ─────────────────────────────────────────────────────────

function SlotIcon({ status }: { status: SlotJob["status"] }) {
  if (status === "success")
    return <CheckCircle className="size-4 text-green-500 shrink-0" />;
  if (status === "failed")
    return <XCircle className="size-4 text-red-500 shrink-0" />;
  if (status === "polling" || status === "submitted")
    return <Loader2 className="size-4 text-blue-500 shrink-0 animate-spin" />;
  return <Clock className="size-4 text-muted-foreground/40 shrink-0" />;
}

function slotLabel(status: SlotJob["status"]): string {
  const labels: Record<SlotJob["status"], string> = {
    idle: "Waiting",
    submitted: "Submitted",
    polling: "Generating…",
    success: "Done",
    failed: "Failed",
  };
  return labels[status];
}

// ─── Slot card ────────────────────────────────────────────────────────────────

function SlotCard({
  title,
  subtitle,
  job,
}: {
  title: string;
  subtitle: string;
  job: SlotJob;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 bg-card">
      <div className="flex items-start gap-3">
        <SlotIcon status={job.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{title}</span>
            <Badge variant="outline" className="text-xs">
              {slotLabel(job.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          {job.failMsg && (
            <p className="text-xs text-destructive mt-1">{job.failMsg}</p>
          )}
        </div>
      </div>

      {/* Result image */}
      {job.status === "success" && job.resultUrl && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.resultUrl}
            alt={title}
            className="w-full rounded-md border object-cover max-h-72"
          />
          <a
            href={job.resultUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open full image <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {/* Polling skeleton */}
      {(job.status === "polling" || job.status === "submitted") && (
        <Skeleton className="w-full h-40 rounded-md" />
      )}
    </div>
  );
}

// ─── Companion card ───────────────────────────────────────────────────────────

function CompanionCard({ companion }: { companion: JobSet["jobs"]["companions"][0] }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 bg-card">
      <SlotIcon status={companion.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold">{companion.salesCode}</span>
          <Badge variant="outline" className="text-xs">
            {slotLabel(companion.status)}
          </Badge>
        </div>
        {companion.taskId && (
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
            {companion.taskId}
          </p>
        )}
      </div>
      {companion.status === "success" && companion.resultUrl && (
        <div className="shrink-0 w-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={companion.resultUrl}
            alt={companion.salesCode}
            className="w-16 h-16 rounded border object-cover"
          />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GenerateDetailPage({
  params,
}: {
  params: Promise<{ jobSetId: string }>;
}) {
  const { jobSetId } = use(params);
  const router = useRouter();
  const [jobSet, setJobSet]       = useState<JobSet | null>(null);
  const [isRerunning, setIsRerunning] = useState(false);
  const [rerunError,  setRerunError]  = useState<string | null>(null);

  // Re-read localStorage and refresh state (only called from async contexts)
  const reload = useCallback(() => {
    const fresh = getJobSet(jobSetId);
    setJobSet(fresh);
    return fresh;
  }, [jobSetId]);

  // Initial load
  useEffect(() => {
    setJobSet(getJobSet(jobSetId));
  }, [jobSetId]);

  // Derive "all main slots done" without a separate state variable
  const allMainDone = useMemo(
    () =>
      jobSet != null &&
      jobSet.jobs.ls1.status === "success" &&
      jobSet.jobs.ls2.status === "success" &&
      jobSet.jobs.ls3.status === "success",
    [jobSet]
  );

  // ── Poll Step Functions execution status ──────────────────────────────────
  //
  // Rather than polling kie.ai task IDs individually (the old FastAPI model),
  // we poll GET /generate/execution-status/{executionArn} which queries
  // DescribeExecution on Step Functions.
  //
  // Step Functions runs the full pipeline internally:
  //   LS1 + LS3 in parallel → LS2 after LS1 succeeds → DynamoDB mark GENERATED
  //
  // The response is one of:
  //   RUNNING   — still processing; keep polling
  //   SUCCEEDED — all 3 result URLs present; update slots and stop
  //   FAILED    — mark all slots failed with the error cause; stop

  useEffect(() => {
    if (!jobSet || !jobSet.executionArn) return;

    // If all slots already settled (e.g. page loaded from a completed run),
    // there is nothing to poll.
    const j = jobSet.jobs;
    const alreadyDone =
      (j.ls1.status === "success" &&
        j.ls2.status === "success" &&
        j.ls3.status === "success") ||
      j.ls1.status === "failed" ||
      j.ls2.status === "failed" ||
      j.ls3.status === "failed";

    if (alreadyDone) return;

    const interval = setInterval(async () => {
      // Always read fresh state from localStorage to avoid stale closures
      const current = getJobSet(jobSetId);
      if (!current || !current.executionArn) {
        clearInterval(interval);
        return;
      }

      // Stop if settled since the last tick
      const jobs = current.jobs;
      const settled =
        (jobs.ls1.status === "success" &&
          jobs.ls2.status === "success" &&
          jobs.ls3.status === "success") ||
        jobs.ls1.status === "failed" ||
        jobs.ls2.status === "failed" ||
        jobs.ls3.status === "failed";

      if (settled) {
        clearInterval(interval);
        return;
      }

      try {
        const res = await fetchExecutionStatus(current.executionArn);

        if (res.executionStatus === "SUCCEEDED") {
          // All 3 slots completed — write result URLs and stop
          (["ls1", "ls2", "ls3"] as const).forEach((slot) => {
            updateSlotJob(jobSetId, slot, {
              status: "success",
              resultUrl: res.slots[slot].resultUrl ?? "",
            });
          });
          clearInterval(interval);
        } else if (res.executionStatus === "FAILED") {
          // Pipeline failed — mark all slots so the UI shows the error
          const failMsg = res.cause ?? res.error ?? "Pipeline failed";
          (["ls1", "ls2", "ls3"] as const).forEach((slot) => {
            updateSlotJob(jobSetId, slot, {
              status: "failed",
              failMsg,
            });
          });
          clearInterval(interval);
        }
        // executionStatus === "RUNNING" — keep polling, no state updates needed
      } catch {
        // Transient network error — keep polling
      }

      reload();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobSet, jobSetId, reload]);

  // ── Re-run ────────────────────────────────────────────────────────────────
  // Starts a fresh Step Functions execution for the same product.
  // Removes the current JobSet from localStorage and navigates to the new one.

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
      if (!res.ok)
        throw new Error((data as { detail?: string }).detail ?? `Re-run failed (${res.status})`);

      // Replace old entry and navigate to the new job
      deleteJobSet(jobSet.jobSetId);
      addJobSet({
        jobSetId:     data.jobSetId,
        salesCode:    data.salesCode,
        createdAt:    new Date().toISOString(),
        resolution:   jobSet.resolution,
        executionArn: data.executionArn,
        jobs: {
          ls1:        { taskId: null, status: "polling" },
          ls2:        { taskId: null, status: "polling" },
          ls3:        { taskId: null, status: "polling" },
          companions: [],
        },
      });
      router.push(`/generate/${data.jobSetId}`);
    } catch (e: unknown) {
      setRerunError(e instanceof Error ? e.message : "Re-run failed");
      setIsRerunning(false);
    }
  }

  // ── Send all 3 slots to the Review queue ─────────────────────────────────

  function handleSendToReview() {
    if (!jobSet) return;
    const { ls1, ls2, ls3 } = jobSet.jobs;
    (
      [
        { slot: "ls1" as const, job: ls1 },
        { slot: "ls2" as const, job: ls2 },
        { slot: "ls3" as const, job: ls3 },
      ] as const
    ).forEach(({ slot, job }) => {
      if (job.status === "success" && job.resultUrl) {
        addImage({ salesCode: jobSet.salesCode, slot, url: job.resultUrl });
      }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!jobSet) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-muted-foreground text-sm">Job not found.</p>
        <Link href="/generate" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Back to Queue
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link + header */}
      <div className="flex items-start gap-3">
        <Link
          href="/generate"
          className="text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold tracking-tight font-mono">
              {jobSet.salesCode}
            </h2>
            {/* Re-run button — shown for failed or in-progress jobs */}
            {(jobSet.jobs.ls1.status === "failed" ||
              jobSet.jobs.ls2.status === "failed" ||
              jobSet.jobs.ls3.status === "failed" ||
              jobSet.jobs.ls1.status === "polling" ||
              jobSet.jobs.ls2.status === "polling" ||
              jobSet.jobs.ls3.status === "polling") && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRerun}
                disabled={isRerunning}
                className="gap-1.5 h-7 text-xs"
              >
                {isRerunning ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RotateCcw className="size-3" />
                )}
                {isRerunning ? "Starting…" : "Re-run"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Started {new Date(jobSet.createdAt).toLocaleString()} · {jobSet.resolution}
          </p>
          {/* Show execution ARN for debugging / traceability */}
          {jobSet.executionArn && (
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5 truncate">
              {jobSet.executionArn}
            </p>
          )}
          {/* Re-run error */}
          {rerunError && (
            <p className="text-xs text-destructive mt-1">
              Re-run failed: {rerunError} —{" "}
              <button onClick={() => setRerunError(null)} className="underline">
                dismiss
              </button>
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
          <SlotCard
            title="LS1"
            subtitle="Wide room shot — landscape 4:3"
            job={jobSet.jobs.ls1}
          />
          <SlotCard
            title="LS2"
            subtitle="Close-up hero shot — portrait 3:4 (submitted after LS1 by the pipeline)"
            job={jobSet.jobs.ls2}
          />
          <SlotCard
            title="LS3"
            subtitle="Medium angled vignette — square 1:1"
            job={jobSet.jobs.ls3}
          />
        </CardContent>
      </Card>

      {/* Send to review */}
      {allMainDone && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 px-4 py-3">
          <CheckCircle className="size-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-800 dark:text-green-200 flex-1">
            All 3 lifestyle images are ready.
          </p>
          <Link href="/review" onClick={handleSendToReview}>
            <Button size="sm">Go to Review →</Button>
          </Link>
        </div>
      )}

      {/* Companion cutouts (legacy FastAPI jobs only — not used in AWS pipeline) */}
      {jobSet.jobs.companions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Companion Product Cutouts
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {jobSet.jobs.companions.filter((c) => c.status === "success").length}/
                {jobSet.jobs.companions.length} done · documentation only
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobSet.jobs.companions.map((companion) => (
              <CompanionCard key={companion.salesCode} companion={companion} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
