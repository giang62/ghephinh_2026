import { isGameId, type GameId } from "@/lib/games";
import { randomId } from "@/lib/ids";

export type RoomStatus = "lobby" | "running" | "ended";

export type Player = {
  playerId: string;
  name: string;
  token: string;
  joinedAtMs: number;
};

export type ImagePuzzleResult = {
  type: "image-puzzle";
  solved: boolean;
  completedMs: number | null;
};

export type ClickCounterResult = {
  type: "click-counter";
  score: number;
};

export type PlayerResult = {
  playerId: string;
  name: string;
  submittedAtMs: number;
  result: ImagePuzzleResult | ClickCounterResult;
};

export type PublicLeaderboardEntry = {
  playerId: string;
  name: string;
  submitted: boolean;
  label: string;
  rank: number | null;
};

export type Room = {
  roomId: string;
  adminKey: string;
  gameId: GameId;
  status: RoomStatus;
  createdAtMs: number;
  durationSec: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  imageUrl: string | null;
  players: Player[];
  results: PlayerResult[];
};

function nowMs() {
  return Date.now();
}

const DEFAULT_DURATION_SEC = 60;
const DEFAULT_PUZZLE_IMAGE = "/puzzles/puzzle1.png";
const ROOM_TTL_SEC = 6 * 60 * 60;

function isRedisUrlConfigured() {
  return Boolean(process.env.REDIS_URL);
}

function isUpstashRestConfigured() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return Boolean(url && token);
}

function assertPersistentStoreIfOnVercel() {
  if (!process.env.VERCEL) return;
  if (!isRedisUrlConfigured() && !isUpstashRestConfigured()) {
    throw new Error(
      "Deploy Vercel cần Redis để lưu phòng. Hãy cấu hình REDIS_URL (Redis serverless) hoặc KV_REST_API_URL/KV_REST_API_TOKEN (Upstash REST / Vercel KV)."
    );
  }
}

type RedisClient = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
};

let redisPromise: Promise<RedisClient> | null = null;
async function getRedisByUrl(): Promise<RedisClient | null> {
  if (!isRedisUrlConfigured()) return null;
  if (!redisPromise) {
    redisPromise = import("redis").then(async (m) => {
      const client = m.createClient({ url: process.env.REDIS_URL });
      client.on("error", () => {});
      await client.connect();
      return client as unknown as RedisClient;
    });
  }
  return redisPromise;
}

let kvPromise: Promise<any> | null = null;
async function getUpstashRestKv() {
  if (!isUpstashRestConfigured()) return null;

  // @vercel/kv expects KV_* env vars; map from Upstash vars if needed.
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
  }
  if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  if (!kvPromise) kvPromise = import("@vercel/kv").then((m) => m.kv);
  return kvPromise;
}

type MemoryStore = {
  rooms: Map<string, Room>;
};

function getMemoryStore(): MemoryStore {
  const globalWithStore = globalThis as typeof globalThis & {
    __gameghephinhMemoryStore?: MemoryStore;
  };
  if (!globalWithStore.__gameghephinhMemoryStore) {
    globalWithStore.__gameghephinhMemoryStore = { rooms: new Map() };
  }
  return globalWithStore.__gameghephinhMemoryStore;
}

function roomKey(roomId: string) {
  return `room:${roomId}`;
}

async function loadRoom(roomId: string): Promise<Room | null> {
  const redis = await getRedisByUrl();
  if (redis) {
    const raw = await redis.get(roomKey(roomId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Room;
    } catch {
      return null;
    }
  }

  const kv = await getUpstashRestKv();
  if (kv) {
    const raw = await kv.get(roomKey(roomId));
    if (typeof raw !== "string") return null;
    try {
      return JSON.parse(raw) as Room;
    } catch {
      return null;
    }
  }

  return getMemoryStore().rooms.get(roomId) ?? null;
}

async function saveRoom(room: Room): Promise<void> {
  const raw = JSON.stringify(room);

  const redis = await getRedisByUrl();
  if (redis) {
    await redis.set(roomKey(room.roomId), raw, { EX: ROOM_TTL_SEC });
    return;
  }

  const kv = await getUpstashRestKv();
  if (kv) {
    await kv.set(roomKey(room.roomId), raw, { ex: ROOM_TTL_SEC });
    return;
  }

  getMemoryStore().rooms.set(room.roomId, room);
}

function maybeEndRoom(room: Room) {
  if (room.status !== "running") return false;
  if (!room.endsAtMs) return false;
  if (nowMs() >= room.endsAtMs) {
    room.status = "ended";
    return true;
  }
  return false;
}

function maybeAutoEndIfAllSubmitted(room: Room) {
  if (room.status !== "running") return false;
  if (!room.players.length) return false;
  if (room.results.length >= room.players.length) {
    room.status = "ended";
    room.endsAtMs = nowMs();
    return true;
  }
  return false;
}

export function clampDuration(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return DEFAULT_DURATION_SEC;
  return Math.max(10, Math.min(15 * 60, Math.round(durationSec)));
}

function sanitizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

export async function createRoom(args: {
  gameId: GameId;
  durationSec?: number;
  imageUrl?: string | null;
}) {
  assertPersistentStoreIfOnVercel();
  const roomId = randomId(6);
  const adminKey = randomId(12);
  const durationSec = clampDuration(args.durationSec ?? DEFAULT_DURATION_SEC);

  const room: Room = {
    roomId,
    adminKey,
    gameId: args.gameId,
    status: "lobby",
    createdAtMs: nowMs(),
    durationSec,
    startedAtMs: null,
    endsAtMs: null,
    imageUrl: args.gameId === "image-puzzle" ? (args.imageUrl ?? DEFAULT_PUZZLE_IMAGE) : null,
    players: [],
    results: []
  };

  await saveRoom(room);
  return { roomId, adminKey };
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const room = await loadRoom(roomId);
  if (!room) return null;
  if (maybeEndRoom(room)) await saveRoom(room);
  return room;
}

export async function assertRoom(roomId: string): Promise<Room> {
  const room = await getRoom(roomId);
  if (room) return room;

  if (process.env.VERCEL && !isRedisUrlConfigured() && !isUpstashRestConfigured()) {
    throw new Error("Không tìm thấy phòng. Deploy Vercel cần Redis để lưu phòng (Preview/Production đều cần).");
  }
  throw new Error("Không tìm thấy phòng");
}

export function assertAdmin(room: Room, adminKey: string) {
  if (!adminKey || adminKey !== room.adminKey) throw new Error("Không có quyền");
}

export async function adminConfigureRoom(args: {
  roomId: string;
  adminKey: string;
  durationSec?: number;
  imageUrl?: string | null;
}) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  if (typeof args.durationSec === "number") room.durationSec = clampDuration(args.durationSec);
  if (room.gameId === "image-puzzle" && typeof args.imageUrl !== "undefined") {
    room.imageUrl = args.imageUrl ?? DEFAULT_PUZZLE_IMAGE;
  }

  await saveRoom(room);
  return room;
}

export async function adminStartRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  room.status = "running";
  room.startedAtMs = nowMs();
  room.endsAtMs = room.startedAtMs + room.durationSec * 1000;
  room.results = [];
  await saveRoom(room);
  return room;
}

export async function joinRoom(args: { roomId: string; name: string }) {
  assertPersistentStoreIfOnVercel();
  const room = await assertRoom(args.roomId);
  if (maybeEndRoom(room)) await saveRoom(room);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  const name = sanitizeName(args.name);
  if (!name) throw new Error("Vui lòng nhập tên");

  const playerId = randomId(6);
  const token = randomId(12);
  const player: Player = { playerId, name, token, joinedAtMs: nowMs() };
  room.players.push(player);
  await saveRoom(room);

  return { room, playerId, token };
}

export async function submitResult(args: {
  roomId: string;
  playerId: string;
  token: string;
  result: ImagePuzzleResult | ClickCounterResult;
}) {
  assertPersistentStoreIfOnVercel();
  const room = await assertRoom(args.roomId);
  if (maybeEndRoom(room)) await saveRoom(room);

  const player = room.players.find((p) => p.playerId === args.playerId) ?? null;
  if (!player) throw new Error("Không tìm thấy người chơi");
  if (player.token !== args.token) throw new Error("Không có quyền");

  if (room.status === "lobby") throw new Error("Game chưa bắt đầu");

  const normalized = normalizeResult(room.gameId, args.result);
  const record: PlayerResult = {
    playerId: player.playerId,
    name: player.name,
    submittedAtMs: nowMs(),
    result: normalized
  };

  const idx = room.results.findIndex((r) => r.playerId === player.playerId);
  if (idx >= 0) room.results[idx] = record;
  else room.results.push(record);

  maybeAutoEndIfAllSubmitted(room);
  await saveRoom(room);
  return room;
}

function normalizeResult(
  roomGameId: GameId,
  result: ImagePuzzleResult | ClickCounterResult
): ImagePuzzleResult | ClickCounterResult {
  if (roomGameId === "image-puzzle") {
    if (result.type !== "image-puzzle") throw new Error("Kết quả không hợp lệ");
    const solved = Boolean(result.solved);
    const completedMs =
      solved && Number.isFinite(result.completedMs) ? Math.max(0, Math.round(result.completedMs ?? 0)) : null;
    return { type: "image-puzzle", solved, completedMs };
  }
  if (roomGameId === "click-counter") {
    if (result.type !== "click-counter") throw new Error("Kết quả không hợp lệ");
    const score = Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0;
    return { type: "click-counter", score };
  }
  throw new Error("Game không hợp lệ");
}

export function getRoomSnapshot(room: Room) {
  const now = nowMs();
  const remainingMs = room.status === "running" && room.endsAtMs ? Math.max(0, room.endsAtMs - now) : 0;

  return {
    roomId: room.roomId,
    gameId: room.gameId,
    status: room.status,
    durationSec: room.durationSec,
    startedAtMs: room.startedAtMs,
    endsAtMs: room.endsAtMs,
    remainingMs,
    imageUrl: room.imageUrl
  };
}

export function getAdminView(room: Room) {
  const snapshot = getRoomSnapshot(room);
  const players = room.players.map((p) => ({ playerId: p.playerId, name: p.name, joinedAtMs: p.joinedAtMs }));
  const results = room.results;
  return { ...snapshot, players, results };
}

export function getPublicPlayers(room: Room) {
  return room.players.map((p) => ({ playerId: p.playerId, name: p.name }));
}

export function parseGameId(value: unknown): GameId {
  if (!isGameId(value)) throw new Error("Game không hợp lệ");
  return value;
}

export function getPublicLeaderboard(room: Room) {
  const snapshot = getRoomSnapshot(room);
  if (room.status === "lobby") {
    return { ...snapshot, entries: [] as PublicLeaderboardEntry[] };
  }

  const resultsByPlayer = new Map(room.results.map((r) => [r.playerId, r.result]));
  const rows = room.players.map((p) => ({ playerId: p.playerId, name: p.name, result: resultsByPlayer.get(p.playerId) ?? null }));

  const sorted =
    room.gameId === "click-counter"
      ? rows.sort((a, b) => {
          const as = a.result?.type === "click-counter" ? a.result.score : -1;
          const bs = b.result?.type === "click-counter" ? b.result.score : -1;
          return bs - as;
        })
      : rows.sort((a, b) => {
          const as = a.result?.type === "image-puzzle" && a.result.solved ? 1 : 0;
          const bs = b.result?.type === "image-puzzle" && b.result.solved ? 1 : 0;
          if (bs !== as) return bs - as;
          const at = a.result?.type === "image-puzzle" ? a.result.completedMs ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
          const bt = b.result?.type === "image-puzzle" ? b.result.completedMs ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
          return at - bt;
        });

  const entries: PublicLeaderboardEntry[] = sorted.map((row, idx) => {
    const submitted = Boolean(row.result);
    const label =
      room.gameId === "click-counter"
        ? row.result?.type === "click-counter"
          ? `${row.result.score} lần`
          : snapshot.status === "ended"
            ? "Chưa nộp"
            : "—"
        : row.result?.type === "image-puzzle"
          ? row.result.solved
            ? `${Math.round((row.result.completedMs ?? 0) / 1000)}s`
            : "Chưa xong"
          : snapshot.status === "ended"
            ? "Chưa nộp"
            : "—";

    const rank = idx + 1;
    return { playerId: row.playerId, name: row.name, submitted, label, rank };
  });

  return { ...snapshot, entries };
}

export async function adminEndRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "running") throw new Error("Phòng chưa bắt đầu");
  room.status = "ended";
  room.endsAtMs = nowMs();
  await saveRoom(room);
  return room;
}

export async function adminRestartRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  room.status = "lobby";
  room.startedAtMs = null;
  room.endsAtMs = null;
  room.results = [];
  await saveRoom(room);
  return room;
}
