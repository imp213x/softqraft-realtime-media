import {
  EgressClient,
  RoomServiceClient,
} from "livekit-server-sdk";
import type { GatewayConfig } from "../../config.js";

export interface LiveKitClients {
  rooms: RoomServiceClient;
  egress: EgressClient;
}

export function createLiveKitClients(config: GatewayConfig): LiveKitClients {
  const { livekitUrl, livekitApiKey, livekitApiSecret } = config;
  return {
    rooms: new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret),
    egress: new EgressClient(livekitUrl, livekitApiKey, livekitApiSecret),
  };
}

export async function probeLiveKit(
  clients: LiveKitClients,
): Promise<boolean> {
  try {
    await clients.rooms.listRooms();
    return true;
  } catch {
    return false;
  }
}
