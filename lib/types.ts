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
  /** UUID created when the job set is first submitted */
  jobSetId: string;
  /** The hero product being generated (e.g. "BALARN1405AH018") */
  salesCode: string;
  /** ISO timestamp */
  createdAt: string;
  /** Resolution used across all slots */
  resolution: Resolution;
  /**
   * Step Functions execution ARN — present for jobs started via the AWS
   * Lambda backend. Used to poll GET /generate/execution-status/{arn}.
   */
  executionArn?: string;
  /** The three generation tracks + optional companion cutouts */
  jobs: {
    ls1: SlotJob;
    ls2: SlotJob;
    ls3: SlotJob;
    companions: CompanionJob[];
  };
};

// ─── BE response shapes ───────────────────────────────────────────────────────

/**
 * Response from POST /generate/single (AWS Lambda — 202 Accepted).
 * The frontend stores executionArn in the JobSet and polls
 * GET /generate/execution-status/{executionArn} to track progress.
 */
export type SingleGenerateResponse = {
  salesCode: string;
  jobSetId: string;
  executionArn: string;
};

/**
 * Response from GET /generate/execution-status/{executionArn}.
 * Translates a Step Functions execution state into a FE-friendly shape.
 *
 * RUNNING   — pipeline still in progress; slots show "pending"
 * SUCCEEDED — all 3 slots completed; resultUrls are populated
 * FAILED    — pipeline error; error + cause fields are set
 */
export type ExecutionStatusResponse = {
  salesCode: string;
  jobSetId: string;
  executionArn: string;
  executionStatus: "RUNNING" | "SUCCEEDED" | "FAILED";
  slots: {
    ls1: { status: "pending" | "success" | "failed"; resultUrl?: string };
    ls2: { status: "pending" | "success" | "failed"; resultUrl?: string };
    ls3: { status: "pending" | "success" | "failed"; resultUrl?: string };
  };
  /** Companion cutout results — present when executionStatus is "SUCCEEDED" */
  companionCutouts?: Array<{ salesCode: string; resultUrl: string }>;
  /** Present when executionStatus is "FAILED" */
  error?: string;
  cause?: string;
};

/**
 * Response from POST /generate/batch (202 — all PENDING products queued in BE).
 * The backend scans DynamoDB for PENDING products and starts a Step Functions
 * execution for each. Returns immediately; no FE polling required.
 */
export type BatchGenerateAllResponse = {
  queued:  number;  // messages enqueued to SQS
  skipped: number;  // skipped (missing salesCode etc.)
  failed:  number;  // failed to enqueue
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
