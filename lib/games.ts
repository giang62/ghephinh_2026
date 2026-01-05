export type GameId = "image-puzzle" | "click-counter";

export type GameDefinition = {
  id: GameId;
  name: string;
  description: string;
  adminHint: string;
};

export const GAMES: GameDefinition[] = [
  {
    id: "image-puzzle",
    name: "Ghép hình (kéo thả)",
    description: "Kéo 9 mảnh ghép vào đúng vị trí.",
    adminHint: "Phù hợp thi đua nhanh."
  },
  {
    id: "click-counter",
    name: "Đếm lượt bấm",
    description: "Bấm càng nhiều càng tốt trước khi hết giờ.",
    adminHint: "Dễ chơi, khởi động nhanh."
  }
];

export function isGameId(value: unknown): value is GameId {
  return value === "image-puzzle" || value === "click-counter";
}
