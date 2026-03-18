"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SingleGenerateResponse, SyncAkeneoResponse, SyncStatusResponse, BatchGenerateAllResponse } from "@/lib/types";
import { RefreshCw, Zap, CheckSquare, Square, Loader2, Play } from "lucide-react";

type GenerationStatus = "PENDING" | "GENERATING" | "GENERATED";

type Product = {
  identifier: string;
  family: string;
  title: string;
  colour: string;
  hasCutout: boolean;
  hasLifestyle1: boolean;
  hasLifestyle2: boolean;
  hasLifestyle3: boolean;
  generationStatus: GenerationStatus;
};

type ApiResponse = {
  count: number;
  products: Product[];
};

// ─── Banner for sync / batch feedback ────────────────────────────────────────

type BannerState =
  | { type: "idle" }
  | { type: "loading"; message: string }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

function Banner({ state, onDismiss }: { state: BannerState; onDismiss: () => void }) {
  if (state.type === "idle") return null;

  const styles: Record<string, string> = {
    loading: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:text-green-200",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
  };

  return (
    <div className={cn("flex items-center justify-between rounded-md border px-4 py-3 text-sm", styles[state.type])}>
      <span>{state.message}</span>
      {state.type !== "loading" && (
        <button onClick={onDismiss} className="ml-4 underline opacity-70 hover:opacity-100">
          Dismiss
        </button>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ProductSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ─── Pipeline status badge ───────────────────────────────────────────────────

const PIPELINE_BADGE: Record<GenerationStatus, { label: string; className: string }> = {
  PENDING:    { label: "Not started", className: "text-muted-foreground border-muted-foreground/30" },
  GENERATING: { label: "Generating",  className: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:text-blue-300 animate-pulse" },
  GENERATED:  { label: "Generated",   className: "text-green-600 border-green-300 bg-green-50 dark:bg-green-950 dark:text-green-300" },
};

function PipelineBadge({ status }: { status: GenerationStatus }) {
  const { label, className } = PIPELINE_BADGE[status] ?? PIPELINE_BADGE.PENDING;
  return (
    <Badge variant="outline" className={cn("text-xs", className)}>
      {label}
    </Badge>
  );
}

// ─── Product table ────────────────────────────────────────────────────────────

function ProductTable({
  products,
  showGenerateButton,
  selectable,
  selectedCodes,
  onToggleSelect,
  onGenerate,
  generatingCode,
}: {
  products: Product[];
  showGenerateButton?: boolean;
  selectable?: boolean;
  selectedCodes?: Set<string>;
  onToggleSelect?: (code: string) => void;
  onGenerate?: (salesCode: string) => void;
  generatingCode?: string | null;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(products.length / pageSize));
  // Clamp page so it never exceeds the current page count (auto-resets when products change)
  const safePage = Math.min(page, pageCount);

  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, products.length);
  const paginatedProducts = products.slice(startIndex, endIndex);

  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No products found.</p>;
  }

  const allPageSelected =
    selectable &&
    selectedCodes &&
    paginatedProducts.every((p) => selectedCodes.has(p.identifier));

  function handleToggleAll() {
    if (!onToggleSelect) return;
    if (allPageSelected) {
      paginatedProducts.forEach((p) => onToggleSelect(p.identifier));
    } else {
      paginatedProducts
        .filter((p) => !selectedCodes?.has(p.identifier))
        .forEach((p) => onToggleSelect(p.identifier));
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead className="w-10">
                <button onClick={handleToggleAll} className="flex items-center text-muted-foreground hover:text-foreground">
                  {allPageSelected ? (
                    <CheckSquare className="size-4" />
                  ) : (
                    <Square className="size-4" />
                  )}
                </button>
              </TableHead>
            )}
            <TableHead>Sales Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Family</TableHead>
            <TableHead>Colour</TableHead>
            <TableHead>Cutout</TableHead>
            <TableHead>Lifestyle</TableHead>
            <TableHead>Pipeline</TableHead>
            {showGenerateButton && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedProducts.map((product) => {
            const hasAnyLifestyle =
              product.hasLifestyle1 || product.hasLifestyle2 || product.hasLifestyle3;
            const isSelected = selectedCodes?.has(product.identifier) ?? false;

            return (
              <TableRow
                key={product.identifier}
                className={cn(isSelected && "bg-muted/40")}
              >
                {selectable && (
                  <TableCell>
                    <button
                      onClick={() => onToggleSelect?.(product.identifier)}
                      className="flex items-center text-muted-foreground hover:text-foreground"
                    >
                      {isSelected ? (
                        <CheckSquare className="size-4 text-primary" />
                      ) : (
                        <Square className="size-4" />
                      )}
                    </button>
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs">{product.identifier}</TableCell>
                <TableCell className="text-sm max-w-xs truncate">{product.title || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">{product.family}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                  {product.colour || "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      product.hasCutout
                        ? "text-green-600 border-green-200"
                        : "text-muted-foreground"
                    )}
                  >
                    {product.hasCutout ? "Yes" : "No"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      hasAnyLifestyle
                        ? "text-green-600 border-green-200"
                        : "text-red-600 border-red-200"
                    )}
                  >
                    {hasAnyLifestyle ? "Has images" : "Missing"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <PipelineBadge status={product.generationStatus} />
                </TableCell>
                {showGenerateButton && (
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={generatingCode != null}
                      onClick={() => onGenerate?.(product.identifier)}
                      className="gap-1.5 min-w-[90px]"
                    >
                      {generatingCode === product.identifier ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <Zap className="size-3.5" />
                          Generate
                        </>
                      )}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {products.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {startIndex + 1}–{endIndex} of {products.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>Page {safePage} of {pageCount}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={safePage === pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

type StatusFilter = "all" | "PENDING" | "GENERATING" | "GENERATED";

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all:        "All",
  PENDING:    "Not Generated",
  GENERATING: "Generating",
  GENERATED:  "Generated",
};

function filterProducts(products: Product[], query: string, statusFilter: StatusFilter) {
  let filtered = products;

  if (statusFilter !== "all") {
    filtered = filtered.filter((p) => p.generationStatus === statusFilter);
  }

  const trimmed = query.trim();
  if (!trimmed) return filtered;
  const q = trimmed.toLowerCase();
  return filtered.filter((product) =>
    [product.identifier, product.title, product.family, product.colour]
      .map((v) => (v ?? "").toLowerCase())
      .some((v) => v.includes(q))
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const router = useRouter();

  const [missingProducts, setMissingProducts] = useState<Product[]>([]);
  const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
  const [loadingMissing, setLoadingMissing] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [errorMissing, setErrorMissing] = useState<string | null>(null);
  const [errorCandidates, setErrorCandidates] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Selection state (only for Missing Lifestyle tab)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  // Single-generate loading state (tracks which product is currently being submitted)
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);

  // Sync + batch feedback banners
  const [syncBanner, setSyncBanner] = useState<BannerState>({ type: "idle" });
  const [batchBanner, setBatchBanner] = useState<BannerState>({ type: "idle" });
  const [processAllBanner, setProcessAllBanner] = useState<BannerState>({ type: "idle" });

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchMissing = useCallback(async () => {
    setLoadingMissing(true);
    setErrorMissing(null);
    try {
      const res = await fetch("/api/products/missing-lifestyle");
      const data: ApiResponse = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { detail?: string }).detail ?? `Request failed (${res.status})`
        );
      setMissingProducts(data.products);
    } catch (e: unknown) {
      setErrorMissing(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingMissing(false);
    }
  }, []);

  // Silent background poll — only refreshes generationStatus on existing rows.
  // Does not show the loading skeleton, reset pagination, or clear selection.
  const refreshGenerationStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/products/missing-lifestyle");
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setMissingProducts((prev) => {
        const statusMap = new Map(
          data.products.map((p) => [p.identifier, p.generationStatus])
        );
        return prev.map((p) => ({
          ...p,
          generationStatus: statusMap.get(p.identifier) ?? p.generationStatus,
        }));
      });
    } catch {
      // silent — transient errors are fine for background polls
    }
  }, []);

  const fetchCandidates = useCallback(async () => {
    setLoadingCandidates(true);
    setErrorCandidates(null);
    try {
      const res = await fetch("/api/products/candidates");
      const data: ApiResponse = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { detail?: string }).detail ?? `Request failed (${res.status})`
        );
      setCandidateProducts(data.products);
    } catch (e: unknown) {
      setErrorCandidates(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    fetchMissing();
  }, [fetchMissing]);

  // While any product is GENERATING, silently poll every 15 s to refresh
  // the Pipeline badge. Uses refreshGenerationStatus (not fetchMissing) so
  // the table, pagination, and selection are never disrupted.
  useEffect(() => {
    const hasGenerating = missingProducts.some(
      (p) => p.generationStatus === "GENERATING"
    );
    if (!hasGenerating) return;

    const interval = setInterval(refreshGenerationStatus, 15_000);
    return () => clearInterval(interval);
  }, [missingProducts, refreshGenerationStatus]);

  // ── Sync from Akeneo ─────────────────────────────────────────────────────

  async function handleSync() {
    setSyncBanner({ type: "loading", message: "Sync started — fetching products from Akeneo (this takes ~30 s)…" });
    try {
      // POST returns immediately (202) with a jobId; actual work runs in background
      const res = await fetch("/api/sync/akeneo", { method: "POST" });
      const data: SyncAkeneoResponse = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { detail?: string }).detail ?? `Sync failed (${res.status})`
        );

      const { jobId } = data;

      // Poll GET /sync/status/{jobId} every 3 s until complete or failed
      const result = await new Promise<SyncStatusResponse>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const sr = await fetch(`/api/sync/status/${jobId}`);
            const sd: SyncStatusResponse = await sr.json();
            if (sd.status === "DISCOVERY_COMPLETE") {
              clearInterval(poll);
              resolve(sd);
            } else if (sd.status === "FAILED") {
              clearInterval(poll);
              reject(new Error(sd.statusReason ?? "Sync failed on the server"));
            }
            // else still DISCOVERY_RUNNING — keep polling
          } catch {
            // transient network error — keep polling
          }
        }, 3000);

        // Safety timeout after 3 minutes
        setTimeout(() => {
          clearInterval(poll);
          reject(new Error("Sync timed out after 3 minutes"));
        }, 180_000);
      });

      setSyncBanner({
        type: "success",
        message: `Sync complete — ${result.totalProducts} products saved to DynamoDB (job ${jobId}).`,
      });
      setSelectedCodes(new Set()); // clear selection when the product list changes
      await fetchMissing();
    } catch (e: unknown) {
      setSyncBanner({
        type: "error",
        message: e instanceof Error ? e.message : "Sync failed",
      });
    }
  }

  // ── Single generate ──────────────────────────────────────────────────────

  async function handleSingleGenerate(salesCode: string) {
    if (generatingCode) return;
    setGeneratingCode(salesCode);
    try {
      const res = await fetch("/api/generate/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesCode, resolution: "2K" }),
      });
      const data: SingleGenerateResponse = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { detail?: string }).detail ?? `Generate failed (${res.status})`
        );

      router.push(`/generate/${data.jobSetId}`);
    } catch (e: unknown) {
      setBatchBanner({
        type: "error",
        message: `Generate failed for ${salesCode}: ${e instanceof Error ? e.message : "Unknown error"}`,
      });
    } finally {
      setGeneratingCode(null);
    }
  }

  // ── Batch generate ───────────────────────────────────────────────────────
  // Calls POST /generate/single once per product in parallel.
  // Each call starts an independent Step Functions execution.

  async function handleBatchGenerate() {
    if (selectedCodes.size < 2) return;
    const codes = Array.from(selectedCodes);
    setBatchBanner({
      type: "loading",
      message: `Submitting ${codes.length} products for generation…`,
    });

    const results = await Promise.allSettled(
      codes.map(async (salesCode) => {
        const res = await fetch("/api/generate/single", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ salesCode, resolution: "2K" }),
        });
        const data: SingleGenerateResponse = await res.json();
        if (!res.ok)
          throw new Error(
            (data as { detail?: string }).detail ?? `Generate failed (${res.status})`
          );
        return data;
      })
    );

    let succeeded = 0;
    let failed = 0;

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        succeeded++;
      } else {
        failed++;
      }
    });

    if (failed === 0) {
      setBatchBanner({
        type: "success",
        message: `${succeeded} products queued. Check the Generate page to track progress.`,
      });
    } else if (succeeded > 0) {
      setBatchBanner({
        type: "success",
        message: `${succeeded} queued, ${failed} failed to submit. Check the Generate page.`,
      });
    } else {
      setBatchBanner({
        type: "error",
        message: `All ${failed} submissions failed. Please try again.`,
      });
    }

    setSelectedCodes(new Set());
  }

  // ── Process all ungenerated (runs entirely in BE) ─────────────────────────
  // Calls POST /generate/batch — the Lambda scans DynamoDB for all PENDING
  // products and fires a Step Functions execution for each. Returns immediately.

  async function handleProcessAll() {
    const pendingCount = missingProducts.filter(
      (p) => p.generationStatus === "PENDING"
    ).length;
    if (pendingCount === 0) return;

    setProcessAllBanner({
      type: "loading",
      message: `Queuing ${pendingCount} ungenerated product${pendingCount !== 1 ? "s" : ""} for generation…`,
    });

    try {
      const res = await fetch("/api/generate/batch", { method: "POST" });
      const data: BatchGenerateAllResponse = await res.json();
      if (!res.ok)
        throw new Error(
          (data as { detail?: string }).detail ?? `Process All failed (${res.status})`
        );

      const parts: string[] = [];
      if (data.queued  > 0) parts.push(`${data.queued} queued`);
      if (data.skipped > 0) parts.push(`${data.skipped} skipped`);
      if (data.failed  > 0) parts.push(`${data.failed} failed to enqueue`);

      setProcessAllBanner({
        type: data.failed > 0 && data.queued === 0 ? "error" : "success",
        message: `${parts.join(", ")}. Check the Generate page to monitor progress.`,
      });

      // Silently refresh statuses so PENDING badges flip to GENERATING
      await refreshGenerationStatus();
    } catch (e: unknown) {
      setProcessAllBanner({
        type: "error",
        message: e instanceof Error ? e.message : "Process All failed",
      });
    }
  }

  // ── Selection helpers ────────────────────────────────────────────────────

  function handleToggleSelect(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  const filteredMissingProducts = filterProducts(missingProducts, filterQuery, statusFilter);
  const filteredCandidateProducts = filterProducts(candidateProducts, filterQuery, "all");

  const pendingCount    = missingProducts.filter((p) => p.generationStatus === "PENDING").length;
  const generatingCount = missingProducts.filter((p) => p.generationStatus === "GENERATING").length;
  const generatedCount  = missingProducts.filter((p) => p.generationStatus === "GENERATED").length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Balterley products from Akeneo PIM.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Batch Generate — only active when 2+ selected */}
          {selectedCodes.size > 0 && (
            <Button
              size="sm"
              onClick={handleBatchGenerate}
              disabled={selectedCodes.size < 2 || batchBanner.type === "loading"}
              className="gap-1.5"
            >
              <Zap className="size-3.5" />
              {selectedCodes.size < 2
                ? "Select 2+ to batch generate"
                : `Batch Generate (${selectedCodes.size})`}
            </Button>
          )}

          {/* Process All — queues every PENDING product via BE */}
          <Button
            size="sm"
            onClick={handleProcessAll}
            disabled={pendingCount === 0 || processAllBanner.type === "loading"}
            className="gap-1.5"
          >
            {processAllBanner.type === "loading" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {pendingCount > 0 ? `Process All (${pendingCount})` : "Process All"}
          </Button>

          {/* Refresh from DB */}
          <Button
            onClick={fetchMissing}
            variant="outline"
            size="sm"
            disabled={loadingMissing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loadingMissing && "animate-spin")} />
            Refresh
          </Button>

          {/* Sync from Akeneo → DynamoDB */}
          <Button
            onClick={handleSync}
            variant="outline"
            size="sm"
            disabled={syncBanner.type === "loading"}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", syncBanner.type === "loading" && "animate-spin")} />
            Sync from Akeneo
          </Button>
        </div>
      </div>

      {/* Banners */}
      {syncBanner.type !== "idle" && (
        <Banner state={syncBanner} onDismiss={() => setSyncBanner({ type: "idle" })} />
      )}
      {batchBanner.type !== "idle" && (
        <Banner state={batchBanner} onDismiss={() => setBatchBanner({ type: "idle" })} />
      )}
      {processAllBanner.type !== "idle" && (
        <Banner state={processAllBanner} onDismiss={() => setProcessAllBanner({ type: "idle" })} />
      )}

      {/* Selected count hint */}
      {selectedCodes.size > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedCodes.size} product{selectedCodes.size !== 1 ? "s" : ""} selected.{" "}
          {selectedCodes.size < 2 && "Select at least 2 to enable batch generate."}
          <button
            onClick={() => setSelectedCodes(new Set())}
            className="ml-2 underline"
          >
            Clear selection
          </button>
        </p>
      )}

      {/* Tabs */}
      <Tabs defaultValue="missing">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="missing">
              Missing Lifestyle
              {missingProducts.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {missingProducts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="candidates"
              onClick={() => {
                if (candidateProducts.length === 0) fetchCandidates();
              }}
            >
              Dark Grey Candidates
              {candidateProducts.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {candidateProducts.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Filter by sales code, title, family, or colour…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>

        {/* Missing Lifestyle tab — has checkboxes */}
        <TabsContent value="missing" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-sm font-semibold">
                  Products with cutout images but no lifestyle imagery
                </CardTitle>
                {/* Status filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["all", "PENDING", "GENERATING", "GENERATED"] as StatusFilter[]).map((f) => {
                    const count =
                      f === "all"        ? missingProducts.length  :
                      f === "PENDING"    ? pendingCount            :
                      f === "GENERATING" ? generatingCount         :
                                          generatedCount;
                    return (
                      <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          statusFilter === f
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {STATUS_FILTER_LABELS[f]}
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                          statusFilter === f ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMissing && <ProductSkeleton />}
              {errorMissing && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorMissing}
                  <button onClick={fetchMissing} className="ml-3 underline">
                    Retry
                  </button>
                </div>
              )}
              {!loadingMissing && !errorMissing && (
                <ProductTable
                  products={filteredMissingProducts}
                  showGenerateButton
                  selectable
                  selectedCodes={selectedCodes}
                  onToggleSelect={handleToggleSelect}
                  onGenerate={handleSingleGenerate}
                  generatingCode={generatingCode}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dark Grey Candidates tab — no checkboxes (read-only reference) */}
        <TabsContent value="candidates" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Dark grey Balterley products with cutouts — good scene candidates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCandidates && <ProductSkeleton />}
              {errorCandidates && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorCandidates}
                  <button onClick={fetchCandidates} className="ml-3 underline">
                    Retry
                  </button>
                </div>
              )}
              {!loadingCandidates && !errorCandidates && (
                <ProductTable
                  products={filteredCandidateProducts}
                  showGenerateButton
                  onGenerate={handleSingleGenerate}
                  generatingCode={generatingCode}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
