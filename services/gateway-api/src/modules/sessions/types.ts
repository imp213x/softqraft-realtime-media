import type {
  AudienceMode,
  CapabilityProfile,
  EgressStatus,
  EgressType,
  SessionStatus,
} from "@softqraft/shared";

export interface SessionRecord {
  sessionId: string;
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
  idempotencyKey?: string;
  createdAt: string;
  endedAt: string | null;
}

export interface EgressJobRecord {
  egressId: string;
  sessionId: string;
  type: EgressType;
  status: EgressStatus;
  filepath?: string;
  playback: { hlsUrl: string | null };
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPublicSession(session: SessionRecord) {
  return {
    sessionId: session.sessionId,
    externalId: session.externalId,
    roomName: session.roomName,
    status: session.status,
    profile: session.profile,
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
    playback: job.playback,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
