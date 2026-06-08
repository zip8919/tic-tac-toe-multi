import { DurableObject } from "cloudflare:workers";
import { GameMode } from "./types";

interface RoomEntry {
  gameId: string;
  mode: GameMode;
  playerCount: number;
  status: string;
  createdAt: number;
}

const STORAGE_KEY = "rooms";

export class Registry extends DurableObject {
  async register(gameId: string, mode: GameMode): Promise<void> {
    const rooms = await this.loadRooms();
    rooms.set(gameId, {
      gameId,
      mode,
      playerCount: 1,
      status: "waiting",
      createdAt: Date.now(),
    });
    await this.saveRooms(rooms);
  }

  async update(gameId: string, playerCount: number, status: string): Promise<void> {
    const rooms = await this.loadRooms();
    const entry = rooms.get(gameId);
    if (entry) {
      entry.playerCount = playerCount;
      entry.status = status;
      entry.createdAt = Date.now(); // 刷新时间戳，防止 TTL 误清理
      await this.saveRooms(rooms);
    }
  }

  async deregister(gameId: string): Promise<void> {
    const rooms = await this.loadRooms();
    rooms.delete(gameId);
    await this.saveRooms(rooms);
  }

  async list(): Promise<RoomEntry[]> {
    const rooms = await this.loadRooms();
    return Array.from(rooms.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(gameId: string): Promise<RoomEntry | null> {
    const rooms = await this.loadRooms();
    return rooms.get(gameId) || null;
  }

  private async loadRooms(): Promise<Map<string, RoomEntry>> {
    const data = await this.ctx.storage.get<RoomEntry[]>(STORAGE_KEY);
    if (!data) return new Map();
    return new Map(Object.entries(data));
  }

  private async saveRooms(rooms: Map<string, RoomEntry>): Promise<void> {
    const obj: Record<string, RoomEntry> = {};
    for (const [key, value] of rooms) {
      obj[key] = value;
    }
    await this.ctx.storage.put(STORAGE_KEY, obj);
  }
}
