import type {
  AudienceMode,
  CapabilityProfile,
  EgressStatus,
  EgressType,
  SessionStatus,
} from "@softqraft/shared";

export interface SessionRecord {
  sessionId: string;
  /** Owning tenant (null = legacy unscoped key) */
  tenantId: string | null;
  externalId: string | null;
  roomName: string;
  status: SessionStatus;
  profile: CapabilityProfile;
  audienceMode: AudienceMode;
  realtime: { url: string };
  playback: {
    status: "pending" | "ready" | "unavailable";
    hlsUrl: string | null;
  };
  metadata: Record<string, unknown>;
  /** Room cap; used for usage GB proxy only (not measured viewers). */
  maxParticipants: number;
  idempotencyKey?: string;
  createdAt: string;
  endedAt: string | null;
}

export interface EgressJobRecord {
  egressId: string;
  sessionId: string;
  tenantId: string | null;
  type: EgressType;
  status: EgressStatus;
  filepath?: string;
  /** HLS object key prefix when type is room_composite_hls */
  hlsPrefix?: string;
  playback: { hlsUrl: string | null };
  error: string | null;
  createdAt: string;
  updatedAt: string;
  /** Whether quota counter was incremented (for terminal release) */
  quotaHeld?: boolean;
}

export function toPublicSession(session: SessionRecord) {
  return {
    sessionId: session.sessionId,
    tenantId: session.tenantId,
    externalId: session.externalId,
    roomName: session.roomName,
    status: session.status,
    profile: session.profile,
    audienceMode: session.audienceMode,
    realtime: session.realtime,
    playback: session.playback,
    metadata: session.metadata,
    createdAt: session.createdAt,
    endedAt: session.endedAt,
  };
}

export function toPublicEgress(job: EgressJobRecord) {
  return {
    egressId: job.egressId,
    sessionId: job.sessionId,
    type: job.type,
    status: job.status,
    /** Object key / path for file egress (consumers build public URL). */
    filepath: job.filepath ?? null,
    playback: job.playback,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
