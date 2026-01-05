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
  players: Map<string, Player>;
  results: Map<string, PlayerResult>;
};

type Store = {
  rooms: Map<string, Room>;
};

function getStore(): Store {
  const globalWithStore = globalThis as typeof globalThis & {
    __gameghephinhStore?: Store;
  };
  if (!globalWithStore.__gameghephinhStore) {
    globalWithStore.__gameghephinhStore = { rooms: new Map() };
  }
  return globalWithStore.__gameghephinhStore;
}

function nowMs() {
  return Date.now();
}

const DEFAULT_DURATION_SEC = 60;
const DEFAULT_PUZZLE_IMAGE = "/puzzles/puzzle1.png";

function maybeEndRoom(room: Room) {
  if (room.status !== "running") return;
  if (!room.endsAtMs) return;
  if (nowMs() >= room.endsAtMs) {
    room.status = "ended";
  }
}

export function createRoom(args: {
  gameId: GameId;
  durationSec?: number;
  imageUrl?: string | null;
}) {
  const store = getStore();
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
    players: new Map(),
    results: new Map()
  };

  store.rooms.set(roomId, room);
  return { roomId, adminKey };
}

export function getRoom(roomId: string): Room | null {
  const room = getStore().rooms.get(roomId) ?? null;
  if (room) maybeEndRoom(room);
  return room;
}

export function assertRoom(roomId: string): Room {
  const room = getRoom(roomId);
  if (!room) throw new Error("Không tìm thấy phòng");
  return room;
}

export function assertAdmin(room: Room, adminKey: string) {
  if (!adminKey || adminKey !== room.adminKey) throw new Error("Không có quyền");
}

export function clampDuration(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return DEFAULT_DURATION_SEC;
  return Math.max(10, Math.min(15 * 60, Math.round(durationSec)));
}

export function adminConfigureRoom(args: {
  roomId: string;
  adminKey: string;
  durationSec?: number;
  imageUrl?: string | null;
}) {
  const room = assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  if (typeof args.durationSec === "number") room.durationSec = clampDuration(args.durationSec);
  if (room.gameId === "image-puzzle" && typeof args.imageUrl !== "undefined") {
    room.imageUrl = args.imageUrl ?? DEFAULT_PUZZLE_IMAGE;
  }

  return room;
}

export function adminStartRoom(args: { roomId: string; adminKey: string }) {
  const room = assertRoom(args.roomId);
  assertAdmin(room, args.adminKey);
  if (room.status !== "lobby") throw new Error("Phòng đã bắt đầu");

  room.status = "running";
  room.startedAtMs = nowMs();
  room.endsAtMs = room.startedAtMs + room.durationSec * 1000;
  room.results.clear();
  return room;
}

export function joinRoom(args: { roomId: string; name: string }) {
  const room = assertRoom(args.roomId);
  maybeEndRoom(room);
  if (room.status === "ended") throw new Error("Phòng đã kết thúc");

  const name = sanitizeName(args.name);
  if (!name) throw new Error("Vui lòng nhập tên");

  const playerId = randomId(6);
  const token = randomId(12);
  const player: Player = { playerId, name, token, joinedAtMs: nowMs() };
  room.players.set(playerId, player);

  return { room, playerId, token };
}

export function submitResult(args: {
  roomId: string;
  playerId: string;
  token: string;
  result: ImagePuzzleResult | ClickCounterResult;
}) {
  const room = assertRoom(args.roomId);
  maybeEndRoom(room);

  const player = room.players.get(args.playerId);
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

  room.results.set(player.playerId, record);
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

function sanitizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function getRoomSnapshot(room: Room) {
  maybeEndRoom(room);
  const now = nowMs();
  const remainingMs =
    room.status === "running" && room.endsAtMs ? Math.max(0, room.endsAtMs - now) : 0;

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
  const players = [...room.players.values()].map((p) => ({
    playerId: p.playerId,
    name: p.name,
    joinedAtMs: p.joinedAtMs
  }));
  const results = [...room.results.values()];
  return { ...snapshot, players, results };
}

export function getPublicPlayers(room: Room) {
  return [...room.players.values()].map((p) => ({ playerId: p.playerId, name: p.name }));
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

  const players = [...room.players.values()];
  const resultsByPlayer = new Map(room.results);

  const rows = players.map((p) => {
    const r = resultsByPlayer.get(p.playerId) ?? null;
    return { playerId: p.playerId, name: p.name, result: r?.result ?? null };
  });

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

    const rank = submitted ? idx + 1 : null;
    return { playerId: row.playerId, name: row.name, submitted, label, rank };
  });

  return { ...snapshot, entries };
}
