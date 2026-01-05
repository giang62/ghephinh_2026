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
  stageIndex: number;
  solved: boolean;
  completedMs: number | null;
};

export type ClickCounterResult = {
  type: "click-counter";
  stageIndex: number;
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
  rank: number;
};

export type Room = {
  roomId: string;
  adminKey: string;
  gameId: GameId;
  status: RoomStatus;
  createdAtMs: number;
  durationSec: number;
  startedAtMs: number | null;
  stageIndex: number;
  stageCount: number;
  stageStartedAtMs: number | null;
  endsAtMs: number | null;
  imageUrl: string | null;
  stageImages: string[];
  players: Player[];
  results: PlayerResult[];
};

function nowMs() {
  return Date.now();
}

const DEFAULT_DURATION_SEC = 60;
const DEFAULT_PUZZLE_IMAGE = "/puzzles/puzzle1.png";
const ROOM_TTL_SEC = 6 * 60 * 60;
const IMAGE_PUZZLE_STAGE_COUNT = 2;
const IMAGE_POOL = ["/puzzles/puzzle1.png", "/puzzles/puzzle2.png"] as const;

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

function isImagePuzzle(room: Room) {
  return room.gameId === "image-puzzle";
}

function startStage(room: Room, stageIndex: number, atMs: number) {
  room.stageIndex = stageIndex;
  room.stageStartedAtMs = atMs;
  room.endsAtMs = atMs + room.durationSec * 1000;
}

function endRoomNow(room: Room, atMs: number) {
  room.status = "ended";
  room.endsAtMs = atMs;
}

function advanceStage(room: Room, atMs: number) {
  if (!isImagePuzzle(room)) {
    endRoomNow(room, atMs);
    return;
  }
  const nextStage = room.stageIndex + 1;
  if (nextStage >= room.stageCount) {
    endRoomNow(room, atMs);
    return;
  }
  startStage(room, nextStage, atMs);
}

function stageSubmissions(room: Room, stageIndex: number) {
  const keys = new Set<string>();
  for (const r of room.results) {
    const idx = r.result.stageIndex;
    if (idx === stageIndex) keys.add(`${r.playerId}:${idx}`);
  }
  return keys.size;
}

function maybeAdvanceImagePuzzle(room: Room) {
  if (!isImagePuzzle(room)) return false;
  if (room.status !== "running") return false;
  if (!room.stageStartedAtMs || !room.endsAtMs) return false;
  const atMs = nowMs();

  if (atMs >= room.endsAtMs) {
    advanceStage(room, atMs);
    return true;
  }

  if (room.players.length && stageSubmissions(room, room.stageIndex) >= room.players.length) {
    advanceStage(room, atMs);
    return true;
  }

  return false;
}

function maybeEndClickCounter(room: Room) {
  if (room.gameId !== "click-counter") return false;
  if (room.status !== "running") return false;
  if (!room.endsAtMs) return false;
  if (nowMs() >= room.endsAtMs) {
    room.status = "ended";
    return true;
  }
  if (room.players.length && stageSubmissions(room, 0) >= room.players.length) {
    endRoomNow(room, nowMs());
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

function computeStageImages(first: string | null) {
  const firstImg = (first && IMAGE_POOL.includes(first as any) ? first : DEFAULT_PUZZLE_IMAGE) as string;
  const secondImg = IMAGE_POOL.find((x) => x !== firstImg) ?? "/puzzles/puzzle2.png";
  return [firstImg, secondImg];
}

export async function createRoom(args: { gameId: GameId; durationSec?: number; imageUrl?: string | null }) {
  assertPersistentStoreIfOnVercel();
  const roomId = randomId(6);
  const adminKey = randomId(12);
  const durationSec = clampDuration(args.durationSec ?? DEFAULT_DURATION_SEC);
  const stageCount = args.gameId === "image-puzzle" ? IMAGE_PUZZLE_STAGE_COUNT : 1;

  const room: Room = {
    roomId,
    adminKey,
    gameId: args.gameId,
    status: "lobby",
    createdAtMs: nowMs(),
    durationSec,
    startedAtMs: null,
    stageIndex: 0,
    stageCount,
    stageStartedAtMs: null,
    endsAtMs: null,
    imageUrl: args.gameId === "image-puzzle" ? (args.imageUrl ?? DEFAULT_PUZZLE_IMAGE) : null,
    stageImages: args.gameId === "image-puzzle" ? computeStageImages(args.imageUrl ?? null) : [],
    players: [],
    results: []
  };

  await saveRoom(room);
  return { roomId, adminKey };
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const room = await loadRoom(roomId);
  if (!room) return null;

  let changed = false;
  if (maybeAdvanceImagePuzzle(room)) changed = true;
  if (maybeEndClickCounter(room)) changed = true;
  if (changed) await saveRoom(room);

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
    room.stageImages = computeStageImages(room.imageUrl);
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
  room.results = [];

  if (isImagePuzzle(room)) {
    room.stageCount = IMAGE_PUZZLE_STAGE_COUNT;
    room.stageImages = computeStageImages(room.imageUrl);
  } else {
    room.stageCount = 1;
  }

  startStage(room, 0, room.startedAtMs);
  await saveRoom(room);
  return room;
}

export async function joinRoom(args: { roomId: string; name: string }) {
  assertPersistentStoreIfOnVercel();
  const room = await assertRoom(args.roomId);
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

function normalizeResult(room: Room, result: ImagePuzzleResult | ClickCounterResult): ImagePuzzleResult | ClickCounterResult {
  if (room.gameId === "image-puzzle") {
    if (result.type !== "image-puzzle") throw new Error("Kết quả không hợp lệ");
    const stageIndex = Number(result.stageIndex);
    if (!Number.isFinite(stageIndex) || stageIndex < 0 || stageIndex >= room.stageCount) throw new Error("Sai màn chơi");
    const solved = Boolean(result.solved);
    const completedMs =
      solved && Number.isFinite(result.completedMs) ? Math.max(0, Math.round(result.completedMs ?? 0)) : null;
    return { type: "image-puzzle", stageIndex, solved, completedMs };
  }

  if (room.gameId === "click-counter") {
    if (result.type !== "click-counter") throw new Error("Kết quả không hợp lệ");
    const score = Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0;
    return { type: "click-counter", stageIndex: 0, score };
  }

  throw new Error("Game không hợp lệ");
}

export async function submitResult(args: {
  roomId: string;
  playerId: string;
  token: string;
  result: ImagePuzzleResult | ClickCounterResult;
}) {
  assertPersistentStoreIfOnVercel();
  const room = await assertRoom(args.roomId);

  const player = room.players.find((p) => p.playerId === args.playerId) ?? null;
  if (!player) throw new Error("Không tìm thấy người chơi");
  if (player.token !== args.token) throw new Error("Không có quyền");
  if (room.status !== "running") throw new Error("Game chưa bắt đầu hoặc đã kết thúc");

  const normalized = normalizeResult(room, args.result);
  if (normalized.stageIndex !== room.stageIndex) throw new Error("Đã qua màn này");

  const record: PlayerResult = {
    playerId: player.playerId,
    name: player.name,
    submittedAtMs: nowMs(),
    result: normalized
  };

  const idx = room.results.findIndex((r) => r.playerId === player.playerId && r.result.stageIndex === normalized.stageIndex);
  if (idx >= 0) room.results[idx] = record;
  else room.results.push(record);

  const advanced = maybeAdvanceImagePuzzle(room) || maybeEndClickCounter(room);
  if (advanced) {
    // stage/room updated
  }

  await saveRoom(room);
  return room;
}

export function getRoomSnapshot(room: Room) {
  const now = nowMs();
  const remainingMs = room.status === "running" && room.endsAtMs ? Math.max(0, room.endsAtMs - now) : 0;
  const currentImage =
    room.gameId === "image-puzzle" && room.status !== "lobby" ? room.stageImages[room.stageIndex] ?? null : null;

  return {
    roomId: room.roomId,
    gameId: room.gameId,
    status: room.status,
    durationSec: room.durationSec,
    startedAtMs: room.startedAtMs,
    stageIndex: room.stageIndex,
    stageCount: room.stageCount,
    stageStartedAtMs: room.stageStartedAtMs,
    endsAtMs: room.endsAtMs,
    remainingMs,
    imageUrl: currentImage
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
  if (room.status === "lobby") return { ...snapshot, entries: [] as PublicLeaderboardEntry[] };

  if (room.gameId === "click-counter") {
    const byPlayer = new Map<string, ClickCounterResult>();
    for (const r of room.results) {
      if (r.result.type === "click-counter") byPlayer.set(r.playerId, r.result);
    }
    const rows = room.players.map((p) => ({ playerId: p.playerId, name: p.name, result: byPlayer.get(p.playerId) ?? null }));
    rows.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1));
    const entries = rows.map((row, idx) => ({
      playerId: row.playerId,
      name: row.name,
      submitted: Boolean(row.result),
      label: row.result ? `${row.result.score} lần` : snapshot.status === "ended" ? "Chưa nộp" : "—",
      rank: idx + 1
    }));
    return { ...snapshot, entries };
  }

  const stageCount = room.stageCount || IMAGE_PUZZLE_STAGE_COUNT;
  const stageByPlayer = new Map<string, Map<number, ImagePuzzleResult>>();
  for (const r of room.results) {
    if (r.result.type !== "image-puzzle") continue;
    const map = stageByPlayer.get(r.playerId) ?? new Map<number, ImagePuzzleResult>();
    map.set(r.result.stageIndex, r.result);
    stageByPlayer.set(r.playerId, map);
  }

  const rows = room.players.map((p) => {
    const stages = stageByPlayer.get(p.playerId) ?? new Map<number, ImagePuzzleResult>();
    let solvedCount = 0;
    let totalMs = 0;
    let submittedAny = false;
    for (let i = 0; i < stageCount; i++) {
      const r = stages.get(i) ?? null;
      if (r) submittedAny = true;
      if (r?.solved && typeof r.completedMs === "number") {
        solvedCount += 1;
        totalMs += r.completedMs;
      }
    }
    return { playerId: p.playerId, name: p.name, solvedCount, totalMs, submittedAny };
  });

  rows.sort((a, b) => {
    if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
    return a.totalMs - b.totalMs;
  });

  const entries = rows.map((row, idx) => {
    const label =
      row.solvedCount === 0
        ? `0/${stageCount}`
        : row.solvedCount === stageCount
          ? `${stageCount}/${stageCount} · ${Math.round(row.totalMs / 1000)}s`
          : `${row.solvedCount}/${stageCount} · ${Math.round(row.totalMs / 1000)}s`;
    return { playerId: row.playerId, name: row.name, submitted: row.submittedAny, label, rank: idx + 1 };
  });

  return { ...snapshot, entries };
}

export async function adminEndRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "running") throw new Error("Phòng chưa bắt đầu");
  endRoomNow(room, nowMs());
  await saveRoom(room);
  return room;
}

export async function adminRestartRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  room.status = "lobby";
  room.startedAtMs = null;
  room.stageIndex = 0;
  room.stageCount = room.gameId === "image-puzzle" ? IMAGE_PUZZLE_STAGE_COUNT : 1;
  room.stageStartedAtMs = null;
  room.endsAtMs = null;
  room.results = [];
  await saveRoom(room);
  return room;
}

