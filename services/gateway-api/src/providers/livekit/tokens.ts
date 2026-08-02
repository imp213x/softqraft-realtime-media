import { AccessToken, type VideoGrant } from "livekit-server-sdk";
import type { ParticipantRole } from "@softqraft/shared";
import type { GatewayConfig } from "../../config.js";

export interface MintTokenInput {
  identity: string;
  name?: string;
  roomName: string;
  role: ParticipantRole;
  ttlSeconds?: number;
  attributes?: Record<string, string>;
}

export interface MintedToken {
  token: string;
  identity: string;
  role: ParticipantRole;
  expiresAt: string;
  realtimeUrl: string;
}

function grantForRole(role: ParticipantRole): VideoGrant {
  switch (role) {
    case "host":
    case "cohost":
      return {
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
        roomRecord: role === "host",
      };
    case "guest":
      return {
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      };
    case "agent":
      return {
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        hidden: true,
      };
    case "realtime_viewer":
    default:
      return {
        roomJoin: true,
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
      };
  }
}

export async function mintParticipantToken(
  config: GatewayConfig,
  input: MintTokenInput,
): Promise<MintedToken> {
  const ttl = Math.max(
    60,
    Math.min(
      86_400,
      input.ttlSeconds ?? config.defaultTokenTtlSeconds,
    ),
  );

  const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: input.identity,
    name: input.name ?? input.identity,
    ttl,
    attributes: input.attributes,
  });

  at.addGrant({
    room: input.roomName,
    ...grantForRole(input.role),
  });

  const token = await at.toJwt();
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  return {
    token,
    identity: input.identity,
    role: input.role,
    expiresAt,
    realtimeUrl: config.realtimeUrl,
  };
}
