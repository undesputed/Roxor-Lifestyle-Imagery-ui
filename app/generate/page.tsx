"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { addImage } from "@/lib/store";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

type Slot = "ls1" | "ls2" | "ls3";
type Resolution = "1K" | "2K" | "4K";
type JobStatus = "idle" | "submitting" | "polling" | "done" | "failed";

const SLOT_LABELS: Record<Slot, string> = {
  ls1: "Wide Room Shot",
  ls2: "Close-up Hero",
  ls3: "Detail / Vignette",
};

function GenerateForm() {
  const searchParams = useSearchParams();
  const [salesCode, setSalesCode] = useState(searchParams.get("salesCode") ?? "");
  const [slot, setSlot] = useState<Slot>("ls1");
  const [resolution, setResolution] = useState<Resolution>("2K");
  const [ls1Url, setLs1Url] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);

  // Prompt customisation
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [heroColour, setHeroColour] = useState("");
  const [heroWidth, setHeroWidth] = useState("");
  const [heroHeight, setHeroHeight] = useState("");
  const [roomStyle, setRoomStyle] = useState("");
  const [tileStyle, setTileStyle] = useState("");
  const [extraStyling, setExtraStyling] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  const canSubmit = salesCode.trim() !== "" && (slot !== "ls2" || ls1Url.trim() !== "");

  async function handleGenerate() {
    setStatus("submitting");
    setError(null);
    setResultUrl(null);
    setTaskId(null);
    setPollCount(0);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesCode: salesCode.toUpperCase(),
          slot,
          resolution,
          ls1Url: ls1Url || null,
          extras: {
            heroColour: heroColour.trim() || null,
            heroWidth: heroWidth ? parseInt(heroWidth) : null,
            heroHeight: heroHeight ? parseInt(heroHeight) : null,
            roomStyle: roomStyle.trim() || null,
            tileStyle: tileStyle.trim() || null,
            extraStyling: extraStyling.trim() || null,
            customNotes: customNotes.trim() || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Generation failed");
      setTaskId(data.taskId);
      setStatus("polling");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("failed");
    }
  }

  // Poll for result every 10s
  useEffect(() => {
    if (status !== "polling" || !taskId) return;
    const interval = setInterval(async () => {
      setPollCount((n) => n + 1);
      try {
        const res = await fetch(`/api/generate/${taskId}/status`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setError((errData as { detail?: string }).detail ?? `Status check failed (${res.status})`);
          setStatus("failed");
          clearInterval(interval);
          return;
        }
        const data = await res.json();

        if (data.state === "success" && data.resultUrl) {
          setResultUrl(data.resultUrl);
          setStatus("done");
          addImage({ salesCode: salesCode.toUpperCase(), slot, url: data.resultUrl });
          clearInterval(interval);
        } else if (data.state === "fail") {
          setError(data.failMsg ?? "Generation failed");
          setStatus("failed");
          clearInterval(interval);
        } else if (data.state && !["waiting", "processing", "pending", "queued"].includes(data.state)) {
          setError(`Unexpected generation state: ${data.state}`);
          setStatus("failed");
          clearInterval(interval);
        }
      } catch {
        // keep polling on transient network error
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [status, taskId, salesCode, slot]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Generate</h2>
        <p className="text-muted-foreground mt-1">
          Submit a product to kie.ai Nano Banana Pro for lifestyle image generation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Job Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Sales Code */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sales Code</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. BALARN1405AH017"
              value={salesCode}
              onChange={(e) => setSalesCode(e.target.value.toUpperCase())}
            />
          </div>

          {/* Slot */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Lifestyle Slot</label>
            <div className="flex gap-2 flex-wrap">
              {(["ls1", "ls2", "ls3"] as Slot[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                    slot === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="font-mono text-xs">{s.toUpperCase()}</span>
                  <span className="ml-2">{SLOT_LABELS[s]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ls1 URL — only required for ls2 */}
          {slot === "ls2" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                LS1 Wide Shot URL <span className="text-destructive">*</span>
              </label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://... (URL of the generated ls1 image)"
                value={ls1Url}
                onChange={(e) => setLs1Url(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Required so the AI can match the room from the wide shot.</p>
            </div>
          )}

          {/* Resolution */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Resolution</label>
            <div className="flex gap-2">
              {(["1K", "2K", "4K"] as Resolution[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                    resolution === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Higher resolution uses more kie.ai credits.</p>
          </div>

          {/* Customise Prompt */}
          <div className="border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExtrasOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              <span>Customise Prompt</span>
              {extrasOpen ? <ChevronUpIcon className="size-4 text-muted-foreground" /> : <ChevronDownIcon className="size-4 text-muted-foreground" />}
            </button>

            {extrasOpen && (
              <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  These fields are merged into the base prompt. Leave blank to use the default.
                </p>

                {/* Hero description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Product Description</label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. matt black gloss floor-standing vanity with chrome bar handles and white basin"
                    value={heroColour}
                    onChange={(e) => setHeroColour(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Overrides the default product colour and finish description.</p>
                </div>

                {/* Dimensions */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Product Dimensions (mm)</label>
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Width</span>
                      <input
                        type="number"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="810"
                        value={heroWidth}
                        onChange={(e) => setHeroWidth(e.target.value)}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">Height</span>
                      <input
                        type="number"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="840"
                        value={heroHeight}
                        onChange={(e) => setHeroHeight(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* LS1-specific fields */}
                {slot === "ls1" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Room Style</label>
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="e.g. contemporary minimalist, industrial loft, coastal, traditional"
                        value={roomStyle}
                        onChange={(e) => setRoomStyle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Wall & Floor Tiles</label>
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="e.g. dark charcoal large-format matte porcelain, herringbone white metro tile"
                        value={tileStyle}
                        onChange={(e) => setTileStyle(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* Extra scene elements */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Extra Scene Elements</label>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. add a freestanding bath on the back wall, replace towel rail with a radiator"
                    value={extraStyling}
                    onChange={(e) => setExtraStyling(e.target.value)}
                  />
                </div>

                {/* Custom notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Additional Notes</label>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    placeholder="Any additional instructions appended to the end of the prompt…"
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!canSubmit || status === "submitting" || status === "polling"}
          >
            {status === "submitting"
              ? "Submitting..."
              : status === "polling"
              ? `Generating... (${pollCount * 10}s)`
              : "Generate Image"}
          </Button>
        </CardContent>
      </Card>

      {/* Polling state */}
      {status === "polling" && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Generating</Badge>
              <span className="text-sm text-muted-foreground">
                kie.ai is processing your image (~60–100s at 1K)
              </span>
            </div>
            <Skeleton className="w-full aspect-square rounded-md" />
          </CardContent>
        </Card>
      )}

      {/* Done */}
      {status === "done" && resultUrl && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Generated Image</CardTitle>
              <Badge className="bg-green-600 text-white">Done</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultUrl} alt="Generated lifestyle image" className="w-full rounded-md border" />
            <p className="text-xs text-muted-foreground">
              Image saved to the Review queue automatically.
            </p>
            <div className="flex gap-2">
              <a
                href="/review"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Go to Review
              </a>
              <a
                href={resultUrl}
                download
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Download
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed */}
      {status === "failed" && error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">Generation failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-3 text-sm underline text-muted-foreground"
            >
              Try again
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense>
      <GenerateForm />
    </Suspense>
  );
}
