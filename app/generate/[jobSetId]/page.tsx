"use client";

import { useState, useEffect, useCallback, useRef, useMemo, use } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getJobSet,
  updateSlotJob,
  updateCompanionJob,
  addImage,
} from "@/lib/store";
import type { JobSet, SlotJob, JobStatusResponse } from "@/lib/types";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
} from "lucide-react";

// ─── Poll interval ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;
const ACTIVE_STATES = new Set(["waiting", "processing", "pending", "queued"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJobStatus(taskId: string): Promise<JobStatusResponse> {
  const res = await fetch(`/api/generate/${taskId}/status`);
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

async function triggerLs2(
  salesCode: string,
  ls1Url: string,
  resolution: string
): Promise<string> {
  const res = await fetch("/api/generate/trigger-ls2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ salesCode, ls1Url, resolution }),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      (data as { detail?: string }).detail ?? `LS2 trigger failed (${res.status})`
    );
  return data.taskId as string;
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
          {job.taskId && (
            <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
              Task: {job.taskId}
            </p>
          )}
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
  const [jobSet, setJobSet] = useState<JobSet | null>(null);
  // Use a ref so the LS2 trigger guard doesn't cause extra re-renders
  const ls2TriggeredRef = useRef(false);

  // Re-read localStorage and update state (called from async contexts only)
  const reload = useCallback(() => {
    const fresh = getJobSet(jobSetId);
    setJobSet(fresh);
    return fresh;
  }, [jobSetId]);

  // Initial load — read jobSetId directly, not via reload(), to avoid setState-in-effect
  useEffect(() => {
    setJobSet(getJobSet(jobSetId));
  }, [jobSetId]);

  // Derive "all main slots done" from jobSet without a separate state
  const allMainDone = useMemo(
    () =>
      jobSet != null &&
      jobSet.jobs.ls1.status === "success" &&
      jobSet.jobs.ls2.status === "success" &&
      jobSet.jobs.ls3.status === "success",
    [jobSet]
  );

  // ── Poll all active task IDs ──────────────────────────────────────────────

  useEffect(() => {
    if (!jobSet) return;

    const interval = setInterval(async () => {
      const current = getJobSet(jobSetId);
      if (!current) return;

      // Collect all slots + companions that need polling
      type PollTarget =
        | { kind: "slot"; slot: "ls1" | "ls2" | "ls3"; job: SlotJob }
        | { kind: "companion"; salesCode: string; job: SlotJob };

      const targets: PollTarget[] = [];

      (["ls1", "ls2", "ls3"] as const).forEach((slot) => {
        const job = current.jobs[slot];
        if (job.taskId && (job.status === "submitted" || job.status === "polling")) {
          targets.push({ kind: "slot", slot, job });
        }
      });

      current.jobs.companions.forEach((c) => {
        if (c.taskId && (c.status === "submitted" || c.status === "polling")) {
          targets.push({ kind: "companion", salesCode: c.salesCode, job: c });
        }
      });

      if (targets.length === 0) {
        clearInterval(interval);
        return;
      }

      // Poll each in parallel
      await Promise.allSettled(
        targets.map(async (target) => {
          try {
            const statusRes = await fetchJobStatus(target.job.taskId!);
            const state = statusRes.state;

            if (state === "success" && statusRes.resultUrl) {
              if (target.kind === "slot") {
                updateSlotJob(jobSetId, target.slot, {
                  status: "success",
                  resultUrl: statusRes.resultUrl,
                });
              } else {
                updateCompanionJob(jobSetId, target.salesCode, {
                  status: "success",
                  resultUrl: statusRes.resultUrl,
                });
              }
            } else if (state === "fail") {
              if (target.kind === "slot") {
                updateSlotJob(jobSetId, target.slot, {
                  status: "failed",
                  failMsg: statusRes.failMsg ?? "Generation failed",
                });
              } else {
                updateCompanionJob(jobSetId, target.salesCode, {
                  status: "failed",
                  failMsg: statusRes.failMsg ?? "Generation failed",
                });
              }
            } else if (ACTIVE_STATES.has(state)) {
              // Still running — mark as polling if not already
              if (target.kind === "slot" && target.job.status === "submitted") {
                updateSlotJob(jobSetId, target.slot, { status: "polling" });
              }
            }
          } catch {
            // Transient network error — keep polling
          }
        })
      );

      reload();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobSet, jobSetId, reload]);

  // ── Auto-trigger LS2 when LS1 succeeds ───────────────────────────────────

  useEffect(() => {
    if (!jobSet || ls2TriggeredRef.current) return;
    const ls1 = jobSet.jobs.ls1;
    const ls2 = jobSet.jobs.ls2;

    if (ls1.status === "success" && ls1.resultUrl && ls2.status === "idle") {
      // Mark as triggered before the async call to prevent double-submission
      ls2TriggeredRef.current = true;

      triggerLs2(jobSet.salesCode, ls1.resultUrl, jobSet.resolution)
        .then((taskId) => {
          updateSlotJob(jobSetId, "ls2", { taskId, status: "submitted" });
          reload();
        })
        .catch((err) => {
          updateSlotJob(jobSetId, "ls2", {
            status: "failed",
            failMsg: err instanceof Error ? err.message : "LS2 trigger failed",
          });
          reload();
        });
    }
  }, [jobSet, jobSetId, reload]);

  // ── Mark product as GENERATED in DynamoDB when all slots succeed ─────────
  // Use a ref so the call fires exactly once even if allMainDone stays true
  // across multiple re-renders (e.g. after localStorage reloads).
  const completedMarkedRef = useRef(false);

  useEffect(() => {
    if (!allMainDone || !jobSet || completedMarkedRef.current) return;
    completedMarkedRef.current = true;

    fetch("/api/generate/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salesCode: jobSet.salesCode }),
    }).catch((err) => {
      // Best-effort — log but never surface to the user
      console.warn("mark complete failed:", err);
    });
  }, [allMainDone, jobSet]);

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
      <div className="flex items-center gap-3">
        <Link
          href="/generate"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h2 className="text-xl font-semibold tracking-tight font-mono">
            {jobSet.salesCode}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Started {new Date(jobSet.createdAt).toLocaleString()} · {jobSet.resolution}
          </p>
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
            subtitle="Close-up hero shot — portrait 3:4 (auto-triggered after LS1)"
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

      {/* Companion cutouts */}
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
