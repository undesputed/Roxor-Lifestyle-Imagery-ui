"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadJobSets, deriveJobSetStatus, deleteJobSet } from "@/lib/store";
import type { JobSet } from "@/lib/types";
import { Trash2, ChevronRight, Zap } from "lucide-react";

// ─── Status badge ─────────────────────────────────────────────────────────────

type OverallStatus = ReturnType<typeof deriveJobSetStatus>;

const STATUS_LABEL: Record<OverallStatus, string> = {
  complete: "Complete",
  failed: "Failed",
  in_progress: "In Progress",
  idle: "Queued",
};

const STATUS_VARIANT: Record<OverallStatus, string> = {
  complete: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200",
  idle: "bg-muted text-muted-foreground",
};

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
          job.status === "success"
            ? "bg-green-500"
            : job.status === "failed"
            ? "bg-red-500"
            : job.status === "polling" || job.status === "submitted"
            ? "bg-blue-400 animate-pulse"
            : "bg-muted-foreground/20"; // idle / not yet started

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
        <Button variant="outline" size="sm">
          Go to Products
        </Button>
      </Link>
    </div>
  );
}

// ─── Queue row ────────────────────────────────────────────────────────────────

function QueueRow({
  jobSet,
  onDelete,
}: {
  jobSet: JobSet;
  onDelete: (id: string) => void;
}) {
  const overallStatus = deriveJobSetStatus(jobSet);
  const createdAt = new Date(jobSet.createdAt);
  const timeAgo = formatTimeAgo(createdAt);
  const companionCount = jobSet.jobs.companions.length;
  const companionsDone = jobSet.jobs.companions.filter(
    (c) => c.status === "success"
  ).length;

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group">
      {/* Slot progress dots */}
      <SlotDots jobSet={jobSet} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-semibold">{jobSet.salesCode}</span>
          <Badge
            variant="outline"
            className={`text-xs ${STATUS_VARIANT[overallStatus]}`}
          >
            {STATUS_LABEL[overallStatus]}
          </Badge>
          <span className="text-xs text-muted-foreground">{jobSet.resolution}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Started {timeAgo}
          {companionCount > 0 && (
            <> · {companionsDone}/{companionCount} companions done</>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete(jobSet.jobSetId);
          }}
          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove from queue"
        >
          <Trash2 className="size-3.5" />
        </button>
        <Link
          href={`/generate/${jobSet.jobSetId}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View details
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  // Lazy initializer reads localStorage exactly once on mount (client-side only)
  const [jobSets, setJobSets] = useState<JobSet[]>(() => {
    if (typeof window === "undefined") return [];
    return loadJobSets();
  });
  const [filter, setFilter] = useState<"all" | "in_progress" | "complete" | "failed">(
    "all"
  );

  function handleDelete(id: string) {
    deleteJobSet(id);
    setJobSets(loadJobSets());
  }

  const filtered =
    filter === "all"
      ? jobSets
      : jobSets.filter((s) => deriveJobSetStatus(s) === filter);

  const counts = {
    all: jobSets.length,
    in_progress: jobSets.filter((s) => deriveJobSetStatus(s) === "in_progress").length,
    complete: jobSets.filter((s) => deriveJobSetStatus(s) === "complete").length,
    failed: jobSets.filter((s) => deriveJobSetStatus(s) === "failed").length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Generation Queue</h2>
          <p className="text-muted-foreground mt-1">
            Track all active and completed generation jobs.
          </p>
        </div>
        {jobSets.length > 0 && (
          <Link href="/products">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Zap className="size-3.5" />
              New Generation
            </Button>
          </Link>
        )}
      </div>

      {jobSets.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {(["all", "in_progress", "complete", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f === "all"
                  ? "All"
                  : f === "in_progress"
                  ? "In Progress"
                  : f.charAt(0).toUpperCase() + f.slice(1)}{" "}
                {counts[f] > 0 && (
                  <span className="ml-1 text-xs opacity-70">({counts[f]})</span>
                )}
              </button>
            ))}
          </div>

          {/* Queue list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                {filtered.length} job{filtered.length !== 1 ? "s" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No jobs match this filter.
                </p>
              ) : (
                filtered.map((set) => (
                  <QueueRow key={set.jobSetId} jobSet={set} onDelete={handleDelete} />
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
