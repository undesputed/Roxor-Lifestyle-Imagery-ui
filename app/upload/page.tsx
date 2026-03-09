"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type UploadStatus = "idle" | "uploading" | "done" | "failed";

function UploadForm() {
  const searchParams = useSearchParams();
  const [salesCode, setSalesCode] = useState(searchParams.get("salesCode") ?? "");
  const [slot, setSlot] = useState(searchParams.get("slot") ?? "ls1");
  const [sourceUrl, setSourceUrl] = useState(searchParams.get("url") ?? "");
  const [brand, setBrand] = useState("Balterley");
  const [family, setFamily] = useState("Vanity Basin Units");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<{ name?: string; cdnUrl?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetName = salesCode ? `${salesCode.toUpperCase()}_${slot}.jpg` : "";
  const canSubmit = salesCode.trim() !== "" && sourceUrl.trim() !== "";

  async function handleUpload() {
    setStatus("uploading");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesCode: salesCode.toUpperCase(), slot, sourceUrl, brand, family }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Upload failed");
      setResult({ name: data.name, cdnUrl: data.cdnUrl });
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("failed");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Upload</h2>
        <p className="text-muted-foreground mt-1">
          Push an approved lifestyle image to Scaleflex DAM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Upload Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Sales Code</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. BALARN1405AH017"
              value={salesCode}
              onChange={(e) => setSalesCode(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Slot</label>
            <div className="flex gap-2">
              {["ls1", "ls2", "ls3"].map((s) => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  className={`px-4 py-2 rounded-md text-sm border font-mono transition-colors ${
                    slot === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Image URL</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://... (kie.ai result URL or local path)"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Brand</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Family</label>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              />
            </div>
          </div>

          {targetName && (
            <div className="rounded-md bg-muted px-4 py-3 text-sm">
              <span className="text-muted-foreground">Target filename: </span>
              <span className="font-mono font-medium">{targetName}</span>
            </div>
          )}

          <Button onClick={handleUpload} disabled={!canSubmit || status === "uploading"}>
            {status === "uploading" ? "Uploading..." : "Upload to Scaleflex"}
          </Button>
        </CardContent>
      </Card>

      {status === "done" && result && (
        <Card className="border-green-200">
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-600 text-white">Uploaded</Badge>
              <span className="text-sm font-medium">{result.name}</span>
            </div>
            {result.cdnUrl && (
              <p className="text-sm text-muted-foreground break-all">
                CDN: <a href={result.cdnUrl} target="_blank" rel="noreferrer" className="underline">{result.cdnUrl}</a>
              </p>
            )}
            <p className="text-xs text-muted-foreground">Scaleflex will sync this asset to Akeneo automatically.</p>
          </CardContent>
        </Card>
      )}

      {status === "failed" && error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-medium">Upload failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadForm />
    </Suspense>
  );
}
