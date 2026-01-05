import Link from "next/link";
import { AdminRoomClient } from "@/components/admin/AdminRoomClient";

export default async function AdminRoomPage({
  params,
  searchParams
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomId } = await params;
  const sp = await searchParams;
  const keyFromUrl = typeof sp.key === "string" ? sp.key : "";

  return (
    <main className="container">
      <div className="grid" style={{ gap: 16 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div className="grid" style={{ gap: 6 }}>
            <div className="row">
              <h1 className="title" style={{ margin: 0 }}>
                Quản trò · Phòng <span className="mono">{roomId}</span>
              </h1>
            </div>
            <div className="subtitle">Chia sẻ link/QR để mọi người tham gia, rồi bấm Bắt đầu.</div>
          </div>
          <Link className="btn" href="/">
            ← Danh sách game
          </Link>
        </header>

        <AdminRoomClient roomId={roomId} keyFromUrl={keyFromUrl} />
      </div>
    </main>
  );
}
