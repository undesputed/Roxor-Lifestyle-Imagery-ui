"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DownloadIcon, EyeIcon } from "lucide-react";
import {
  loadImages,
  addImage,
  updateImageStatus,
  deleteImage,
  type GeneratedImage,
  type ReviewStatus,
  type Slot,
} from "@/lib/store";
import type { ExecutionStatusResponse } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

type RerunState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "polling"; executionArn: string; elapsed: number }
  | { phase: "done" }
  | { phase: "failed"; error: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOT_LABEL: Record<Slot, string> = {
  ls1: "Wide Room Shot",
  ls2: "Close-up Hero",
  ls3: "Detail / Vignette",
};

const STATUS_BADGE: Record<ReviewStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" },
};

// ── Rerun panel ───────────────────────────────────────────────────────────────

function RerunPanel({
  salesCode,
  slot,
  onDone,
  onCancel,
}: {
  salesCode: string;
  slot: Slot;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("2K");
  const [state, setState] = useState<RerunState>({ phase: "idle" });

  const isActive = state.phase === "submitting" || state.phase === "polling" || state.phase === "done";

  async function handleGenerate() {
    setState({ phase: "submitting" });
    try {
      const res = await fetch("/api/generate/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesCode, resolution }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Generation failed");
      setState({ phase: "polling", executionArn: data.executionArn, elapsed: 0 });
    } catch (e: unknown) {
      setState({ phase: "failed", error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  useEffect(() => {
    if (state.phase !== "polling") return;
    const { executionArn } = state;
    const interval = setInterval(async () => {
      setState((s) => s.phase === "polling" ? { ...s, elapsed: s.elapsed + 10 } : s);
      try {
        const encoded = encodeURIComponent(executionArn);
        const res = await fetch(`/api/generate/execution-status/${encoded}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setState({ phase: "failed", error: (errData as { detail?: string }).detail ?? `Status check failed (${res.status})` });
          clearInterval(interval);
          return;
        }
        const data: ExecutionStatusResponse = await res.json();
        if (data.executionStatus === "SUCCEEDED") {
          // Add all slots that completed to localStorage
          (["ls1", "ls2", "ls3"] as Slot[]).forEach((s) => {
            const slotData = data.slots[s];
            if (slotData?.resultUrl) {
              addImage({ salesCode, slot: s, url: slotData.resultUrl });
            }
          });
          setState({ phase: "done" });
          clearInterval(interval);
          setTimeout(onDone, 800);
        } else if (data.executionStatus === "FAILED") {
          setState({ phase: "failed", error: data.error ?? data.cause ?? "Generation failed" });
          clearInterval(interval);
        }
      } catch {
        // keep polling on transient network error
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [state, salesCode, onDone]);

  return (
    <div className="rounded-lg border bg-muted/50 p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Rerun — {slot.toUpperCase()} · {salesCode}
      </p>

      <p className="text-[11px] text-muted-foreground">
        Starts a new pipeline execution for all 3 slots (LS1 → LS2 → LS3). All results will be added to the review queue.
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium">Resolution</label>
        <div className="flex gap-2">
          {(["1K", "2K", "4K"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setResolution(r)}
              disabled={state.phase !== "idle"}
              className={cn(
                "px-3 py-1 rounded text-xs border transition-colors",
                resolution === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {state.phase === "polling" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">Generating</Badge>
            <span className="text-xs text-muted-foreground">{state.elapsed}s elapsed…</span>
          </div>
          <Skeleton className="w-full h-2 rounded" />
        </div>
      )}
      {state.phase === "done" && (
        <p className="text-xs text-green-600 dark:text-green-400 font-medium">Done — new images added to review queue</p>
      )}
      {state.phase === "failed" && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleGenerate} disabled={isActive} className="text-xs">
          {state.phase === "submitting" ? "Submitting…" : "Generate"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={state.phase === "submitting" || state.phase === "polling"}
          className="text-xs"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Preview dialog ─────────────────────────────────────────────────────────────

function PreviewDialog({
  img,
  open,
  onOpenChange,
  onChange,
}: {
  img: GeneratedImage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: () => void;
}) {
  const [rerunOpen, setRerunOpen] = useState(false);
  // Track last-seen img.id to reset rerun panel when image changes (during render, not in effect)
  const [lastImgId, setLastImgId] = useState<string | undefined>(undefined);
  if (img?.id !== lastImgId) {
    setLastImgId(img?.id);
    setRerunOpen(false);
  }

  if (!img) return null;

  function handleStatus(status: ReviewStatus) {
    if (!img) return;
    updateImageStatus(img.id, status);
    onChange();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono">{img.salesCode}</span>
            <span className="text-muted-foreground font-normal">—</span>
            <span className="font-mono uppercase text-sm">{img.slot}</span>
            <span className="text-muted-foreground font-normal text-sm">{SLOT_LABEL[img.slot]}</span>
            <Badge variant="outline" className={cn("ml-auto text-[11px]", STATUS_BADGE[img.status].className)}>
              {STATUS_BADGE[img.status].label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.url}
          alt={`${img.salesCode} ${img.slot}`}
          className="w-full rounded-lg object-cover"
        />

        <p className="text-xs text-muted-foreground">Generated {img.generatedAt}</p>

        {/* Rerun panel */}
        {rerunOpen && (
          <RerunPanel
            salesCode={img.salesCode}
            slot={img.slot}
            onDone={() => { setRerunOpen(false); onChange(); onOpenChange(false); }}
            onCancel={() => setRerunOpen(false)}
          />
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {img.status === "pending" && (
            <>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleStatus("approved")}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => handleStatus("rejected")}
              >
                Reject
              </Button>
            </>
          )}
          {img.status === "approved" && (
            <a
              href={`/upload?salesCode=${img.salesCode}&slot=${img.slot}&url=${encodeURIComponent(img.url)}`}
              className={cn(buttonVariants(), "flex-1 justify-center")}
            >
              Upload to Scaleflex
            </a>
          )}
          <Button
            variant="outline"
            className="text-xs"
            onClick={() => {
              const a = document.createElement("a");
              a.href = `/api/download?url=${encodeURIComponent(img.url)}&filename=${img.salesCode}-${img.slot}.png`;
              a.click();
            }}
          >
            <DownloadIcon className="size-3.5 mr-1.5" />
            Download
          </Button>
          <Button
            variant="outline"
            className="text-xs"
            onClick={() => setRerunOpen((v) => !v)}
          >
            {rerunOpen ? "Cancel Rerun" : "Rerun"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── List row ──────────────────────────────────────────────────────────────────

function ImageRow({
  img,
  onPreview,
  onChange,
}: {
  img: GeneratedImage;
  onPreview: (img: GeneratedImage) => void;
  onChange: () => void;
}) {
  function handleStatus(status: ReviewStatus, e: React.MouseEvent) {
    e.stopPropagation();
    updateImageStatus(img.id, status);
    onChange();
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteImage(img.id);
    onChange();
  }

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    const a = document.createElement("a");
    a.href = `/api/download?url=${encodeURIComponent(img.url)}&filename=${img.salesCode}-${img.slot}.png`;
    a.click();
  }

  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
      onClick={() => onPreview(img)}
    >
      <td className="py-3 px-4 font-mono text-sm font-semibold">{img.salesCode}</td>
      <td className="py-3 px-4 text-xs">
        <span className="font-mono uppercase font-medium">{img.slot}</span>
        <span className="text-muted-foreground ml-1.5">— {SLOT_LABEL[img.slot]}</span>
      </td>
      <td className="py-3 px-4">
        <Badge variant="outline" className={cn("text-[11px]", STATUS_BADGE[img.status].className)}>
          {STATUS_BADGE[img.status].label}
        </Badge>
      </td>
      <td className="py-3 px-4 text-xs text-muted-foreground">{img.generatedAt}</td>
      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onPreview(img); }}
            title="Preview"
          >
            <EyeIcon className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleDownload}
            title="Download"
          >
            <DownloadIcon className="size-3.5" />
          </Button>
          {img.status === "pending" && (
            <>
              <Button
                size="sm"
                className="text-xs h-7 bg-green-600 hover:bg-green-700 text-white"
                onClick={(e) => handleStatus("approved", e)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={(e) => handleStatus("rejected", e)}
              >
                Reject
              </Button>
            </>
          )}
          {img.status === "approved" && (
            <a
              href={`/upload?salesCode=${img.salesCode}&slot=${img.slot}&url=${encodeURIComponent(img.url)}`}
              className={cn(buttonVariants({ size: "sm" }), "text-xs h-7")}
              onClick={(e) => e.stopPropagation()}
            >
              Upload
            </a>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  // Lazy init reads localStorage once on mount (client-side only)
  const [images, setImages] = useState<GeneratedImage[]>(() => {
    if (typeof window === "undefined") return [];
    return loadImages();
  });
  // Track the ID of the selected image; derive the object from images so it stays in sync
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = images.find((i) => i.id === previewId) ?? null;
  const [previewOpen, setPreviewOpen] = useState(false);

  const refresh = useCallback(() => setImages(loadImages()), []);

  // ── Sync completed jobs from backend (multi-user support) ─────────────────
  // On mount, fetch all GENERATED products from DynamoDB. For any result URL
  // not already in localStorage, add it to the review queue so images generated
  // by other users/browsers appear here automatically.
  useEffect(() => {
    async function syncGeneratedFromBackend() {
      try {
        const res = await fetch("/api/generate/jobs");
        if (!res.ok) return;
        const data: {
          jobs: Array<{
            salesCode:        string;
            generationStatus: string;
            ls1ResultUrl?:    string | null;
            ls2ResultUrl?:    string | null;
            ls3ResultUrl?:    string | null;
          }>;
        } = await res.json();

        const generated = data.jobs.filter((j) => j.generationStatus === "GENERATED");
        if (generated.length === 0) return;

        // Build a set of existing URLs to avoid duplicates
        const existing    = loadImages();
        const existingUrls = new Set(existing.map((img) => img.url));

        let added = false;
        for (const job of generated) {
          const slots: Array<{ slot: Slot; url: string | null | undefined }> = [
            { slot: "ls1", url: job.ls1ResultUrl },
            { slot: "ls2", url: job.ls2ResultUrl },
            { slot: "ls3", url: job.ls3ResultUrl },
          ];
          for (const { slot, url } of slots) {
            if (url && !existingUrls.has(url)) {
              addImage({ salesCode: job.salesCode, slot, url });
              existingUrls.add(url); // prevent re-adding within this loop
              added = true;
            }
          }
        }

        if (added) refresh();
      } catch {
        // Network unavailable — localStorage is the fallback
      }
    }

    syncGeneratedFromBackend();
  }, [refresh]); // only on mount

  function openPreview(img: GeneratedImage) {
    setPreviewId(img.id);
    setPreviewOpen(true);
  }

  const pendingCount = images.filter((i) => i.status === "pending").length;
  const approvedCount = images.filter((i) => i.status === "approved").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review</h2>
          <p className="text-muted-foreground mt-1">
            Click a row to preview. Approve or reject from the list or the preview.
          </p>
        </div>
        {images.length > 0 && (
          <div className="flex gap-2 text-sm text-muted-foreground">
            <span>{pendingCount} pending</span>
            <span>·</span>
            <span>{approvedCount} approved</span>
          </div>
        )}
      </div>

      {/* Empty state */}
      {images.length === 0 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-muted-foreground">No images in the review queue yet.</p>
            <Link href="/generate" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Go to Generate
            </Link>
          </CardContent>
        </Card>
      )}

      {/* List */}
      {images.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 px-4 text-left font-medium">Sales Code</th>
                <th className="py-2.5 px-4 text-left font-medium">Slot</th>
                <th className="py-2.5 px-4 text-left font-medium">Status</th>
                <th className="py-2.5 px-4 text-left font-medium">Date</th>
                <th className="py-2.5 px-4 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {images.map((img) => (
                <ImageRow
                  key={img.id}
                  img={img}
                  onPreview={openPreview}
                  onChange={refresh}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview dialog */}
      <PreviewDialog
        img={preview}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onChange={refresh}
      />
    </div>
  );
}
