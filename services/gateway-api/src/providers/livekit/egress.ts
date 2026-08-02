import {
  EncodedFileOutput,
  EncodedFileType,
  EncodingOptionsPreset,
  S3Upload,
  SegmentedFileOutput,
  SegmentedFileProtocol,
  type EgressInfo,
} from "livekit-server-sdk";
import type { GatewayConfig } from "../../config.js";
import type { LiveKitClients } from "./client.js";
import { HttpError } from "../../lib/auth.js";
import { ERROR_CODES } from "@softqraft/shared";

export interface StartRoomCompositeFileInput {
  roomName: string;
  filepath: string;
}

export interface StartRoomCompositeHlsInput {
  roomName: string;
  /** Object key prefix directory, e.g. hls/ext/sess_abc */
  filenamePrefix: string;
  playlistName?: string;
  livePlaylistName?: string;
  segmentDurationSeconds?: number;
}

function requireS3(config: GatewayConfig) {
  if (!config.s3) {
    throw new HttpError(
      503,
      ERROR_CODES.DEPENDENCY,
      "S3 recording storage is not configured",
    );
  }
  return config.s3;
}

export function renderKeyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  // LiveKit substitutes {time} at egress runtime when left in path
  return out;
}

export function sanitizePathSegment(value: string, fallback = "x"): string {
  const cleaned = String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  return cleaned || fallback;
}

function buildS3Upload(config: GatewayConfig): S3Upload {
  const s3 = requireS3(config);
  return new S3Upload({
    accessKey: s3.accessKey,
    secret: s3.secretKey,
    bucket: s3.bucket,
    region: s3.region,
    endpoint: s3.endpoint,
    forcePathStyle: s3.forcePathStyle,
  });
}

/**
 * Public playback URL for HLS live playlist.
 * Prefers CDN_PUBLIC_BASE_URL when set.
 */
export function buildHlsPlaybackUrl(
  config: GatewayConfig,
  filenamePrefix: string,
  livePlaylistName = "live.m3u8",
): string | null {
  const base = (config.cdnPublicBaseUrl || config.hlsPublicBaseUrl || "").replace(
    /\/$/,
    "",
  );
  if (!base) return null;
  const prefix = filenamePrefix.replace(/^\/+|\/+$/g, "");
  return `${base}/${prefix}/${livePlaylistName}`;
}

export async function startRoomCompositeFile(
  clients: LiveKitClients,
  config: GatewayConfig,
  input: StartRoomCompositeFileInput,
): Promise<EgressInfo> {
  const s3Upload = buildS3Upload(config);

  const fileOutput = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: input.filepath,
    disableManifest: true,
    output: {
      case: "s3",
      value: s3Upload,
    },
  });

  return clients.egress.startRoomCompositeEgress(
    input.roomName,
    { file: fileOutput },
    {
      layout: "speaker",
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    },
  );
}

/**
 * Room composite → HLS segments + live playlist on object storage (ADR-008 / Phase 3b).
 */
export async function startRoomCompositeHls(
  clients: LiveKitClients,
  config: GatewayConfig,
  input: StartRoomCompositeHlsInput,
): Promise<EgressInfo> {
  const s3Upload = buildS3Upload(config);
  const prefix = input.filenamePrefix.replace(/\/+$/g, "");
  const playlistName = input.playlistName ?? "playlist.m3u8";
  const livePlaylistName = input.livePlaylistName ?? "live.m3u8";
  const segmentDuration = Math.max(
    1,
    Math.min(10, input.segmentDurationSeconds ?? 2),
  );

  const segments = new SegmentedFileOutput({
    protocol: SegmentedFileProtocol.HLS_PROTOCOL,
    filenamePrefix: `${prefix}/segment`,
    playlistName,
    livePlaylistName,
    segmentDuration,
    output: {
      case: "s3",
      value: s3Upload,
    },
  });

  return clients.egress.startRoomCompositeEgress(
    input.roomName,
    { segments },
    {
      layout: "speaker",
      encodingOptions: EncodingOptionsPreset.H264_720P_30,
    },
  );
}

export async function stopEgressJob(
  clients: LiveKitClients,
  egressId: string,
): Promise<EgressInfo> {
  return clients.egress.stopEgress(egressId);
}

export async function listEgressForRoom(
  clients: LiveKitClients,
  roomName: string,
): Promise<EgressInfo[]> {
  return clients.egress.listEgress({ roomName });
}

export async function getEgress(
  clients: LiveKitClients,
  egressId: string,
): Promise<EgressInfo | undefined> {
  const list = await clients.egress.listEgress({ egressId });
  return list[0];
}

export function mapEgressStatus(
  info: EgressInfo | undefined,
): "starting" | "active" | "stopping" | "complete" | "failed" {
  const status = info?.status;
  // EgressStatus enum: STARTING=0, ACTIVE=1, ENDING=2, COMPLETE=3, FAILED=4, ABORTED=5, LIMIT_REACHED=6
  if (status === undefined || status === null) return "starting";
  const n = Number(status);
  if (n === 0) return "starting";
  if (n === 1) return "active";
  if (n === 2) return "stopping";
  if (n === 3) return "complete";
  return "failed";
}

export function isTerminalEgressStatus(status: string): boolean {
  return status === "complete" || status === "failed";
}
