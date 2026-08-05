/**
 * Shared contracts for SoftQraft Realtime Media.
 * Keep this package free of runtime side effects.
 */

export type SessionStatus = "ready" | "live" | "ending" | "ended";

export type AudienceMode = "hls" | "realtime" | "hybrid";

export type ParticipantRole =
  | "host"
  | "cohost"
  | "guest"
  | "realtime_viewer"
  | "agent";

export type CapabilityProfile =
  | "interactive"
  | "creator_live_webrtc"
  | "creator_live_hls"
  | "hybrid_live"
  | "recording_only"
  | "live_plus_recording";

export type EgressType =
  | "room_composite_file"
  | "room_composite_hls"
  | "room_composite_rtmp"
  | "track"
  | "participant";

export type EgressStatus =
  | "starting"
  | "active"
  | "stopping"
  | "complete"
  | "failed";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export const ERROR_CODES = {
  UNAUTHORIZED: "unauthorized",
  NOT_FOUND: "session_not_found",
  EGRESS_NOT_FOUND: "egress_not_found",
  VALIDATION: "validation_error",
  CONFLICT: "conflict",
  DEPENDENCY: "dependency_unavailable",
  QUOTA_EXCEEDED: "quota_exceeded",
  FORBIDDEN: "forbidden",
  INTERNAL: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Deployment plane for cost honesty (ADR-009).
 * - demo: product proof (may be GCP); do not claim Cloud savings
 * - economic_production: bandwidth-cheap origin ± CDN; cost claims allowed
 */
export type DeploymentPlane = "demo" | "economic_production";

/** Host egress cost class relative to LiveKit Cloud (~$0.10–0.12/GB). */
export type HostingCostClass =
  | "hyperscaler_list_egress"
  | "bandwidth_cheap"
  | "unknown";

export interface CostProfileNote {
  profile: CapabilityProfile;
  audiencePath: string;
  costNote: string;
}

/** Operator-facing cost notes for capability profiles. */
export const COST_PROFILE_NOTES: CostProfileNote[] = [
  {
    profile: "interactive",
    audiencePath: "Small WebRTC rooms",
    costNote: "Modest GB; fine on demo plane for product proof.",
  },
  {
    profile: "creator_live_webrtc",
    audiencePath: "All audience on WebRTC",
    costNote:
      "GB-dominated. Cheaper than LiveKit Cloud only on economic production plane (cheap egress).",
  },
  {
    profile: "creator_live_hls",
    audiencePath: "Audience via HLS/CDN",
    costNote: "Scale cost path; required for large passive audiences.",
  },
  {
    profile: "hybrid_live",
    audiencePath: "Stage WebRTC + crowd HLS",
    costNote: "Recommended cost product for growth beyond low hundreds concurrent.",
  },
  {
    profile: "recording_only",
    audiencePath: "File/VOD only",
    costNote: "Egress CPU + object storage; not live fan-out.",
  },
  {
    profile: "live_plus_recording",
    audiencePath: "Live + file",
    costNote: "Combine live profile cost with Echo composite minutes.",
  },
];

/**
 * Rough downstream GB proxy for WebRTC fan-out.
 * GB ≈ viewers × bitrateMbps × hours × 3600 / 8000
 */
export function estimateDownstreamGb(input: {
  viewers: number;
  bitrateMbps: number;
  hours: number;
}): number {
  const v = Math.max(0, input.viewers);
  const b = Math.max(0, input.bitrateMbps);
  const h = Math.max(0, input.hours);
  return (v * b * h * 3600) / 8000;
}
