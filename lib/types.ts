/**
 * Shared types for the Roxor Lifestyle Imagery pipeline.
 * Used across the generate queue, products page, and store.
 */

export type Slot = "ls1" | "ls2" | "ls3";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type Resolution = "1K" | "2K" | "4K";

// ─── Per-slot job tracking ────────────────────────────────────────────────────

export type SlotStatus =
  | "idle"         // not yet submitted (e.g. LS2 waiting for LS1)
  | "submitted"    // taskId returned from BE, not yet polling
  | "polling"      // actively polling kie.ai status endpoint
  | "success"      // resultUrl available
  | "failed";      // kie.ai returned failure or network error

export type SlotJob = {
  taskId: string | null;
  status: SlotStatus;
  resultUrl?: string;
  failMsg?: string;
};

// ─── Companion product cutout ─────────────────────────────────────────────────

export type CompanionJob = SlotJob & {
  /** Akeneo sales code of the companion product (e.g. "BFDT1417") */
  salesCode: string;
};

// ─── Job set — one full pipeline run for a single product ────────────────────

export type JobSet = {
  /** UUID created on the FE when the job set is first submitted */
  jobSetId: string;
  /** The hero product being generated (e.g. "BALARN1405AH018") */
  salesCode: string;
  /** ISO timestamp */
  createdAt: string;
  /** Resolution used across all slots */
  resolution: Resolution;
  /** The four generation tracks */
  jobs: {
    ls1: SlotJob;
    ls2: SlotJob;   // starts as { taskId: null, status: "idle" }
    ls3: SlotJob;
    companions: CompanionJob[];
  };
};

// ─── BE response shapes ───────────────────────────────────────────────────────

/** Response from POST /generate/single */
export type SingleGenerateResponse = {
  salesCode: string;
  jobSetId: string;
  jobs: {
    ls1: Pick<SlotJob, "taskId" | "status">;
    ls2: Pick<SlotJob, "taskId" | "status">;
    ls3: Pick<SlotJob, "taskId" | "status">;
    companions: Array<{ salesCode: string; taskId: string | null; status: SlotStatus }>;
  };
};

/** Response from POST /generate/batch */
export type BatchGenerateResponse = {
  products: SingleGenerateResponse[];
};

/** Response from GET /generate/{taskId}/status */
export type JobStatusResponse = {
  state: "waiting" | "processing" | "pending" | "queued" | "success" | "fail" | string;
  taskId: string;
  resultUrl?: string;
  allUrls?: string[];
  failCode?: string;
  failMsg?: string;
};

/** Response from POST /generate/trigger-ls2 */
export type TriggerLs2Response = {
  taskId: string;
  salesCode: string;
  slot: "ls2";
};

/** Response from POST /sync/akeneo (202 — job started in background) */
export type SyncAkeneoResponse = {
  jobId: string;
  status: "DISCOVERY_RUNNING" | "DISCOVERY_COMPLETE" | "FAILED";
  totalProducts: number;
};

/** Response from GET /sync/status/{jobId} */
export type SyncStatusResponse = {
  jobId: string;
  status: "DISCOVERY_RUNNING" | "DISCOVERY_COMPLETE" | "FAILED" | string;
  totalProducts: number;
  statusReason?: string;
};
