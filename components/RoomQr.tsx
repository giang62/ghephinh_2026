"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export function RoomQr({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");

  const normalized = useMemo(() => url.trim(), [url]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!normalized) return;
      const out = await QRCode.toDataURL(normalized, { margin: 1, width: 220 });
      if (!cancelled) setDataUrl(out);
    }
    run().catch(() => setDataUrl(""));
    return () => {
      cancelled = true;
    };
  }, [normalized]);

  if (!normalized) return null;
  if (!dataUrl) return <div className="pill">Đang tạo QR…</div>;

  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="Mã QR tham gia" src={dataUrl} style={{ width: 220, height: 220, borderRadius: 12 }} />;
}
