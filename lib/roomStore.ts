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
  stageIndex: 0 | 1;
  solved: true;
  completedMs: number;
};

export type ClickCounterResult = {
  type: "click-counter";
  stageIndex: 0;
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
  endsAtMs: number | null;
  stageCount: number;
  stageImages: string[];
  players: Player[];
  results: PlayerResult[];
  adminLastSeenAtMs: number | null;
};

export type RoomSnapshot = {
  roomId: string;
  gameId: GameId;
  status: RoomStatus;
  durationSec: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
  remainingMs: number;
  stageCount: number;
  stageImages: string[];
};

const ROOM_TTL_SEC = 6 * 60 * 60;
const DEFAULT_DURATION_SEC = 60;
const IMAGE_PUZZLE_STAGE_COUNT = 2;
const IMAGE_POOL = ["/puzzles/puzzle1.png", "/puzzles/puzzle2.png"] as const;

const ADMIN_ABSENCE_TTL_MS = 25_000;

function nowMs() {
  return Date.now();
}

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
  del: (key: string) => Promise<unknown>;
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

async function deleteRoom(roomId: string): Promise<void> {
  const redis = await getRedisByUrl();
  if (redis) {
    await redis.del(roomKey(roomId));
    return;
  }
  const kv = await getUpstashRestKv();
  if (kv) {
    await kv.del(roomKey(roomId));
    return;
  }
  getMemoryStore().rooms.delete(roomId);
}

export function clampDuration(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return DEFAULT_DURATION_SEC;
  return Math.max(10, Math.min(15 * 60, Math.round(durationSec)));
}

function sanitizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function stageCountForGame(gameId: GameId) {
  return gameId === "image-puzzle" ? IMAGE_PUZZLE_STAGE_COUNT : 1;
}

function stageImagesForGame(gameId: GameId) {
  return gameId === "image-puzzle" ? [...IMAGE_POOL] : [];
}

function ensureRoomDefaults(room: Room) {
  let changed = false;

  if (!Number.isFinite(room.durationSec)) {
    room.durationSec = DEFAULT_DURATION_SEC;
    changed = true;
  }
  room.durationSec = clampDuration(room.durationSec);

  if (room.status !== "lobby" && room.status !== "running" && room.status !== "ended") {
    room.status = "lobby";
    changed = true;
  }

  const expectedStageCount = stageCountForGame(room.gameId);
  if (!Number.isFinite(room.stageCount) || room.stageCount <= 0) {
    room.stageCount = expectedStageCount;
    changed = true;
  }
  if (room.gameId === "image-puzzle" && room.stageCount !== expectedStageCount) {
    room.stageCount = expectedStageCount;
    changed = true;
  }

  if (!Array.isArray(room.stageImages) || room.stageImages.some((x) => typeof x !== "string")) {
    room.stageImages = stageImagesForGame(room.gameId);
    changed = true;
  }
  if (room.gameId === "image-puzzle" && room.stageImages.length < IMAGE_PUZZLE_STAGE_COUNT) {
    room.stageImages = stageImagesForGame(room.gameId);
    changed = true;
  }

  if (!Array.isArray(room.players)) {
    room.players = [];
    changed = true;
  }
  if (!Array.isArray(room.results)) {
    room.results = [];
    changed = true;
  }

  if (!Number.isFinite(room.createdAtMs)) {
    room.createdAtMs = nowMs();
    changed = true;
  }

  if (room.startedAtMs !== null && !Number.isFinite(room.startedAtMs)) {
    room.startedAtMs = null;
    changed = true;
  }
  if (room.endsAtMs !== null && !Number.isFinite(room.endsAtMs)) {
    room.endsAtMs = null;
    changed = true;
  }

  if (room.adminLastSeenAtMs !== null && !Number.isFinite(room.adminLastSeenAtMs)) {
    room.adminLastSeenAtMs = nowMs();
    changed = true;
  }
  if (room.adminLastSeenAtMs === null) {
    room.adminLastSeenAtMs = nowMs();
    changed = true;
  }

  for (const r of room.results) {
    if (!r || typeof r !== "object") continue;
    if (r.result?.type === "image-puzzle") {
      if (r.result.stageIndex !== 0 && r.result.stageIndex !== 1) {
        r.result.stageIndex = 0;
        changed = true;
      }
      if (!Number.isFinite(r.result.completedMs)) {
        r.result.completedMs = 0;
        changed = true;
      }
      if (r.result.solved !== true) {
        r.result.solved = true;
        changed = true;
      }
    }
    if (r.result?.type === "click-counter") {
      if (!Number.isFinite(r.result.score)) {
        r.result.score = 0;
        changed = true;
      }
    }
  }

  return changed;
}

function isAdminAbsent(room: Room) {
  if (!room.adminLastSeenAtMs) return false;
  return nowMs() - room.adminLastSeenAtMs > ADMIN_ABSENCE_TTL_MS;
}

function getStage1End(room: Room) {
  return (room.startedAtMs ?? 0) + room.durationSec * 1000;
}

function getStage2Start(room: Room, playerId: string) {
  const stage1End = getStage1End(room);
  const stage1Result = room.results.find(
    (r) => r.playerId === playerId && r.result.type === "image-puzzle" && r.result.stageIndex === 0
  )?.result as ImagePuzzleResult | undefined;

  if (stage1Result?.solved) {
    const completedAt = (room.startedAtMs ?? 0) + stage1Result.completedMs;
    return Math.min(completedAt, stage1End);
  }
  return stage1End;
}

function getStage2End(room: Room, playerId: string) {
  return getStage2Start(room, playerId) + room.durationSec * 1000;
}

function isPlayerDone(room: Room, playerId: string) {
  if (room.gameId === "click-counter") {
    const has = room.results.some((r) => r.playerId === playerId && r.result.type === "click-counter");
    if (has) return true;
    if (!room.endsAtMs) return false;
    return nowMs() >= room.endsAtMs;
  }

  const stage2Submitted = room.results.some(
    (r) => r.playerId === playerId && r.result.type === "image-puzzle" && r.result.stageIndex === 1
  );
  if (stage2Submitted) return true;
  if (!room.startedAtMs) return false;
  return nowMs() >= getStage2End(room, playerId);
}

function maybeEndRoom(room: Room) {
  if (room.status !== "running") return false;
  if (room.endsAtMs && nowMs() >= room.endsAtMs) {
    room.status = "ended";
    return true;
  }
  if (!room.players.length) return false;
  if (room.players.every((p) => isPlayerDone(room, p.playerId))) {
    room.status = "ended";
    room.endsAtMs = nowMs();
    return true;
  }
  return false;
}

export async function createRoom(args: { gameId: GameId; durationSec?: number }) {
  assertPersistentStoreIfOnVercel();

  const roomId = randomId(6);
  const adminKey = randomId(12);
  const durationSec = clampDuration(args.durationSec ?? DEFAULT_DURATION_SEC);
  const stageCount = stageCountForGame(args.gameId);

  const room: Room = {
    roomId,
    adminKey,
    gameId: args.gameId,
    status: "lobby",
    createdAtMs: nowMs(),
    durationSec,
    startedAtMs: null,
    endsAtMs: null,
    stageCount,
    stageImages: stageImagesForGame(args.gameId),
    players: [],
    results: [],
    adminLastSeenAtMs: nowMs()
  };

  await saveRoom(room);
  return { roomId, adminKey };
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const room = await loadRoom(roomId);
  if (!room) return null;

  const normalized = ensureRoomDefaults(room);

  if (isAdminAbsent(room)) {
    await deleteRoom(roomId);
    return null;
  }

  if (maybeEndRoom(room) || normalized) await saveRoom(room);
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

export async function adminTouchRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  room.adminLastSeenAtMs = nowMs();
  await saveRoom(room);
  return room;
}

export async function adminConfigureRoom(args: { roomId: string; adminKey: string; durationSec?: number }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  if (typeof args.durationSec === "number") room.durationSec = clampDuration(args.durationSec);
  room.stageCount = stageCountForGame(room.gameId);
  room.stageImages = stageImagesForGame(room.gameId);
  room.adminLastSeenAtMs = nowMs();

  await saveRoom(room);
  return room;
}

export async function adminStartRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  room.status = "running";
  room.startedAtMs = nowMs();
  room.endsAtMs = room.startedAtMs + room.durationSec * room.stageCount * 1000;
  room.results = [];
  room.adminLastSeenAtMs = nowMs();

  await saveRoom(room);
  return room;
}

export async function adminEndRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "running") throw new Error("Phòng chưa bắt đầu");
  room.status = "ended";
  room.endsAtMs = nowMs();
  room.adminLastSeenAtMs = nowMs();
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
  room.adminLastSeenAtMs = nowMs();
  await saveRoom(room);
  return room;
}

export async function adminCloseRoom(args: { roomId: string; adminKey: string }) {
  const room = await assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  await deleteRoom(room.roomId);
}

export async function joinRoom(args: { roomId: string; name: string }) {
  assertPersistentStoreIfOnVercel();
  const room = await assertRoom(args.roomId);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  const name = sanitizeName(args.name);
  if (!name) throw new Error("Vui lòng nhập tên");

  const playerId = randomId(6);
  const token = randomId(12);
  room.players.push({ playerId, token, name, joinedAtMs: nowMs() });
  await saveRoom(room);

  return { room, playerId, token };
}

function requireRunning(room: Room) {
  if (room.status !== "running") throw new Error("Game chưa bắt đầu hoặc đã kết thúc");
  if (!room.startedAtMs || !room.endsAtMs) throw new Error("Trạng thái phòng không hợp lệ");
}

function assertStageWindow(room: Room, playerId: string, stageIndex: 0 | 1) {
  const now = nowMs();
  const startedAt = room.startedAtMs ?? 0;
  const stage1End = startedAt + room.durationSec * 1000;

  if (stageIndex === 0) {
    if (now > stage1End) throw new Error("Hết giờ ảnh 1");
    return { stageStartMs: startedAt, stageEndMs: stage1End };
  }

  const stage2Start = getStage2Start(room, playerId);
  const stage2End = stage2Start + room.durationSec * 1000;
  if (now < stage2Start) throw new Error("Chưa tới ảnh 2");
  if (now > stage2End) throw new Error("Hết giờ ảnh 2");
  return { stageStartMs: stage2Start, stageEndMs: stage2End };
}

export async function submitResult(args: {
  roomId: string;
  playerId: string;
  token: string;
  result: ImagePuzzleResult | ClickCounterResult;
}) {
  assertPersistentStoreIfOnVercel();
  const room = await assertRoom(args.roomId);
  requireRunning(room);

  const player = room.players.find((p) => p.playerId === args.playerId) ?? null;
  if (!player) throw new Error("Không tìm thấy người chơi");
  if (player.token !== args.token) throw new Error("Không có quyền");

  const now = nowMs();

  if (room.gameId === "click-counter") {
    if (args.result.type !== "click-counter") throw new Error("Kết quả không hợp lệ");
    if (room.results.some((r) => r.playerId === player.playerId && r.result.type === "click-counter")) {
      throw new Error("Bạn đã nộp rồi");
    }
    if (room.endsAtMs && now > room.endsAtMs) throw new Error("Hết giờ");

    const score = Math.max(0, Math.round(args.result.score));
    room.results.push({
      playerId: player.playerId,
      name: player.name,
      submittedAtMs: now,
      result: { type: "click-counter", stageIndex: 0, score }
    });
    if (maybeEndRoom(room)) {
      // ended
    }
    await saveRoom(room);
    return room;
  }

  if (args.result.type !== "image-puzzle") throw new Error("Kết quả không hợp lệ");
  const stageIndex = args.result.stageIndex;
  if (stageIndex !== 0 && stageIndex !== 1) throw new Error("Sai màn chơi");

  if (room.results.some((r) => r.playerId === player.playerId && r.result.type === "image-puzzle" && r.result.stageIndex === stageIndex)) {
    throw new Error("Bạn đã nộp rồi");
  }

  const window = assertStageWindow(room, player.playerId, stageIndex);

  const completedMs = Math.max(0, Math.round(args.result.completedMs));
  const maxMs = room.durationSec * 1000;
  if (completedMs > maxMs) throw new Error("Kết quả không hợp lệ");

  // Ensure stage2 completion time is relative to stage2 start window (client may compute wrongly).
  if (stageIndex === 1 && now < window.stageStartMs) throw new Error("Chưa tới ảnh 2");

  room.results.push({
    playerId: player.playerId,
    name: player.name,
    submittedAtMs: now,
    result: { type: "image-puzzle", stageIndex, solved: true, completedMs }
  });

  if (maybeEndRoom(room)) {
    // ended
  }
  await saveRoom(room);
  return room;
}

export function getRoomSnapshot(room: Room): RoomSnapshot {
  const remainingMs = room.status === "running" && room.endsAtMs ? Math.max(0, room.endsAtMs - nowMs()) : 0;
  return {
    roomId: room.roomId,
    gameId: room.gameId,
    status: room.status,
    durationSec: room.durationSec,
    startedAtMs: room.startedAtMs,
    endsAtMs: room.endsAtMs,
    remainingMs,
    stageCount: room.stageCount,
    stageImages: room.stageImages
  };
}

export function getAdminView(room: Room) {
  const snapshot = getRoomSnapshot(room);
  const players = room.players.map((p) => ({ playerId: p.playerId, name: p.name, joinedAtMs: p.joinedAtMs }));
  const results = room.results;
  const doneCount = room.players.filter((p) => isPlayerDone(room, p.playerId)).length;
  return { ...snapshot, players, results, doneCount };
}

export function getPublicPlayers(room: Room) {
  return room.players.map((p) => ({ playerId: p.playerId, name: p.name }));
}

export function parseGameId(value: unknown): GameId {
  if (!isGameId(value)) throw new Error("Game không hợp lệ");
  return value;
}

export function getPlayerStageView(room: Room, playerId: string) {
  if (room.gameId !== "image-puzzle" || room.status !== "running" || !room.startedAtMs) {
    return {
      stageIndex: 0,
      stageStartedAtMs: room.startedAtMs,
      stageEndsAtMs: room.endsAtMs,
      imageUrl: room.gameId === "image-puzzle" ? room.stageImages[0] ?? null : null,
      submittedStages: getSubmittedStages(room, playerId)
    };
  }

  const now = nowMs();
  const stage1Start = room.startedAtMs;
  const stage1End = stage1Start + room.durationSec * 1000;
  const stage2Start = getStage2Start(room, playerId);
  const stage2End = stage2Start + room.durationSec * 1000;

  const stageIndex = now < stage2Start ? 0 : now < stage2End ? 1 : 2;
  const stageStartedAtMs = stageIndex === 0 ? stage1Start : stageIndex === 1 ? stage2Start : stage2Start;
  const stageEndsAtMs = stageIndex === 0 ? stage1End : stageIndex === 1 ? stage2End : stage2End;
  const imageUrl = stageIndex === 0 ? room.stageImages[0] ?? null : room.stageImages[1] ?? null;

  return { stageIndex, stageStartedAtMs, stageEndsAtMs, imageUrl, submittedStages: getSubmittedStages(room, playerId) };
}

function getSubmittedStages(room: Room, playerId: string) {
  const stages = new Set<number>();
  for (const r of room.results) {
    if (r.playerId !== playerId) continue;
    stages.add(r.result.stageIndex);
  }
  return [...stages.values()].sort((a, b) => a - b);
}

export function getPublicLeaderboard(room: Room) {
  const snapshot = getRoomSnapshot(room);
  if (room.status === "lobby") return { ...snapshot, entries: [] as PublicLeaderboardEntry[] };

  if (room.gameId === "click-counter") {
    const byPlayer = new Map<string, ClickCounterResult>();
    for (const r of room.results) if (r.result.type === "click-counter") byPlayer.set(r.playerId, r.result);
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

  const stageCount = IMAGE_PUZZLE_STAGE_COUNT;
  const byPlayerStage = new Map<string, Map<number, ImagePuzzleResult>>();
  for (const r of room.results) {
    if (r.result.type !== "image-puzzle") continue;
    const map = byPlayerStage.get(r.playerId) ?? new Map<number, ImagePuzzleResult>();
    map.set(r.result.stageIndex, r.result);
    byPlayerStage.set(r.playerId, map);
  }

  const rows = room.players.map((p) => {
    const stages = byPlayerStage.get(p.playerId) ?? new Map<number, ImagePuzzleResult>();
    let solvedCount = 0;
    let totalMs = 0;
    let submittedAny = false;
    for (let i = 0; i < stageCount; i++) {
      const r = stages.get(i) ?? null;
      if (r) submittedAny = true;
      if (r?.solved) {
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
