/**
 * Shared contracts for Clatters Media Platform.
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

export type EgressType =
  | "room_composite_hls"
  | "room_composite_mp4"
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
  INTERNAL: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
