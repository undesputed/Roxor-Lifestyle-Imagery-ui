"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  loadImages,
  addImage,
  updateImageStatus,
  deleteImage,
  findApprovedLs1Url,
  type GeneratedImage,
  type ReviewStatus,
  type Slot,
} from "@/lib/store";

// ── Types ────────────────────────────────────────────────────────────────────

type RerunState =
  | { phase: "idle" }
  | { phase: "open"; resolution: "1K" | "2K" | "4K"; ls1Url: string }
  | { phase: "submitting" }
  | { phase: "polling"; taskId: string; elapsed: number }
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

// ── Rerun panel (inline generation) ──────────────────────────────────────────

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
  const [resolution, setResolution] = useState<"1K" | "2K" | "4K">("1K");
  const [ls1Url, setLs1Url] = useState(() =>
    slot === "ls2" ? (findApprovedLs1Url(salesCode) ?? "") : ""
  );
  const [state, setState] = useState<RerunState>({ phase: "idle" });

  const isActive = state.phase === "submitting" || state.phase === "polling" || state.phase === "done";
  const canSubmit = !isActive && (slot !== "ls2" || ls1Url.trim() !== "");

  async function handleGenerate() {
    setState({ phase: "submitting" });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesCode,
          slot,
          resolution,
          ls1Url: ls1Url || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Generation failed");
      setState({ phase: "polling", taskId: data.taskId, elapsed: 0 });
    } catch (e: unknown) {
      setState({ phase: "failed", error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  // Poll every 10s when in polling phase
  useEffect(() => {
    if (state.phase !== "polling") return;
    const interval = setInterval(async () => {
      setState((s) =>
        s.phase === "polling" ? { ...s, elapsed: s.elapsed + 10 } : s
      );
      try {
        const res = await fetch(`/api/generate/${state.taskId}/status`);
        const data = await res.json();
        if (data.state === "success" && data.resultUrl) {
          addImage({ salesCode, slot, url: data.resultUrl });
          setState({ phase: "done" });
          clearInterval(interval);
          setTimeout(onDone, 800);
        } else if (data.state === "fail") {
          setState({ phase: "failed", error: data.failMsg ?? "Generation failed" });
          clearInterval(interval);
        }
      } catch {
        // keep polling on transient error
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [state, salesCode, slot, onDone]);

  return (
    <div className="mt-3 rounded-lg border bg-muted/50 p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Rerun — {slot.toUpperCase()} · {salesCode}
      </p>

      {/* ls1 URL input for ls2 */}
      {slot === "ls2" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium">LS1 Wide Shot URL</label>
          {ls1Url && (
            <p className="text-[11px] text-green-600 dark:text-green-400">
              Auto-filled from approved LS1
            </p>
          )}
          <input
            className="w-full rounded-md border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://... (LS1 image URL)"
            value={ls1Url}
            onChange={(e) => setLs1Url(e.target.value)}
            disabled={state.phase !== "idle"}
          />
        </div>
      )}

      {/* Resolution */}
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

      {/* Status */}
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
        <p className="text-xs text-green-600 dark:text-green-400 font-medium">Done — new image added to queue</p>
      )}
      {state.phase === "failed" && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!canSubmit}
          className="text-xs"
        >
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

// ── Image card ────────────────────────────────────────────────────────────────

function ImageCard({
  img,
  onChange,
}: {
  img: GeneratedImage;
  onChange: () => void;
}) {
  const [rerunOpen, setRerunOpen] = useState(false);

  function handleStatus(status: ReviewStatus) {
    updateImageStatus(img.id, status);
    onChange();
  }

  function handleDelete() {
    deleteImage(img.id);
    onChange();
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={`${img.salesCode} ${img.slot}`}
        className="w-full aspect-square object-cover"
      />

      <div className="p-3 space-y-3">
        {/* Meta row */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{img.generatedAt}</span>
          <Badge variant="outline" className={cn("text-[11px]", STATUS_BADGE[img.status].className)}>
            {STATUS_BADGE[img.status].label}
          </Badge>
        </div>

        {/* Primary actions */}
        {img.status === "pending" && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="flex-1 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleStatus("approved")}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => handleStatus("rejected")}
            >
              Reject
            </Button>
          </div>
        )}

        {img.status === "approved" && (
          <a
            href={`/upload?salesCode=${img.salesCode}&slot=${img.slot}&url=${encodeURIComponent(img.url)}`}
            className={cn(buttonVariants({ size: "sm" }), "w-full justify-center text-xs")}
          >
            Upload to Scaleflex
          </a>
        )}

        {/* Secondary actions row */}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => setRerunOpen((v) => !v)}
          >
            {rerunOpen ? "Cancel Rerun" : "Rerun"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
          >
            Remove
          </Button>
        </div>

        {/* Inline rerun panel */}
        {rerunOpen && (
          <RerunPanel
            salesCode={img.salesCode}
            slot={img.slot}
            onDone={() => { setRerunOpen(false); onChange(); }}
            onCancel={() => setRerunOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── Product group ─────────────────────────────────────────────────────────────

function ProductGroup({
  salesCode,
  images,
  onChange,
}: {
  salesCode: string;
  images: GeneratedImage[];
  onChange: () => void;
}) {
  const slots: Slot[] = ["ls1", "ls2", "ls3"];
  const bySlot = (slot: Slot) => images.filter((i) => i.slot === slot);

  return (
    <div className="space-y-4">
      {/* Product header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold">{salesCode}</span>
          <Badge variant="secondary" className="text-xs">
            {images.length} image{images.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <a
          href={`/generate?salesCode=${salesCode}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
        >
          + New Generation
        </a>
      </div>

      {/* Slots */}
      {slots.map((slot) => {
        const slotImages = bySlot(slot);
        if (slotImages.length === 0) return null;
        return (
          <div key={slot} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {slot}
              </span>
              <span className="text-xs text-muted-foreground">— {SLOT_LABEL[slot]}</span>
              <span className="text-xs text-muted-foreground">· {slotImages.length} version{slotImages.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {slotImages.map((img) => (
                <ImageCard key={img.id} img={img} onChange={onChange} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const [images, setImages] = useState<GeneratedImage[]>([]);

  const refresh = useCallback(() => setImages(loadImages()), []);

  useEffect(() => { refresh(); }, [refresh]);

  // Group by salesCode, preserving insertion order
  const groups = images.reduce<Record<string, GeneratedImage[]>>((acc, img) => {
    if (!acc[img.salesCode]) acc[img.salesCode] = [];
    acc[img.salesCode].push(img);
    return acc;
  }, {});

  const pendingCount = images.filter((i) => i.status === "pending").length;
  const approvedCount = images.filter((i) => i.status === "approved").length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review</h2>
          <p className="text-muted-foreground mt-1">
            Approve or reject generated images. Rerun to get a new version.
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
            <a href="/generate" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Go to Generate
            </a>
          </CardContent>
        </Card>
      )}

      {/* Product groups */}
      {Object.entries(groups).map(([salesCode, groupImages]) => (
        <div key={salesCode} className="border rounded-xl p-5 space-y-5">
          <ProductGroup
            salesCode={salesCode}
            images={groupImages}
            onChange={refresh}
          />
        </div>
      ))}
    </div>
  );
}
