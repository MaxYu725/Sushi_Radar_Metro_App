"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserIdentity, type BrowserIdentity } from "@/lib/browser-identity";

type GateState = "checking" | "pending" | "allowed" | "authorized" | "blocked" | "expired" | "cancelled" | "cooldown" | "error";
type Enrollment = { requestId: string; pollToken: string; qr: string; expiresAt: number };
type StoredEnrollment = Enrollment & { deviceId: string };
type Store = {
  id: number; name: string; nameEn: string; district: string; region: "港島" | "九龍" | "新界";
  latitude: number | null; longitude: number | null; waitingGroups: number | null; isOpen: boolean | null;
};
type Queue = { storeId: number; currentNumbers: string[]; fetchedAt: number; stale?: boolean };
type Position = { latitude: number; longitude: number };

const pivots = ["home", "search", "nearby", "settings"] as const;
const accentOptions = ["#60b414", "#249fca", "#e51b00", "#ef9700", "#00aaa8", "#a800f0", "#dd0078"];
const enrollmentStorageKey = "queueMetroEnrollment";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json() as T & { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { code: payload.code, status: response.status });
  return payload;
}

export function QueueMetroWeb() {
  const [gate, setGate] = useState<GateState>("checking");
  const [identity, setIdentity] = useState<BrowserIdentity | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);

  const createSession = useCallback(async (id: BrowserIdentity) => {
    await api("/api/web/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(id),
    });
    localStorage.removeItem(enrollmentStorageKey);
    setGate("authorized");
  }, []);

  const requestEnrollment = useCallback(async (id: BrowserIdentity) => {
    setGate("checking");
    setMessage("");
    try {
      const result = await api<Enrollment & { state: GateState; retryAfter?: number }>("/api/enrollment/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...id, userAgent: navigator.userAgent }),
      });
      if (result.state === "allowed") return createSession(id);
      localStorage.setItem(enrollmentStorageKey, JSON.stringify({
        deviceId: id.deviceId,
        requestId: result.requestId,
        pollToken: result.pollToken,
        qr: result.qr,
        expiresAt: result.expiresAt,
      } satisfies StoredEnrollment));
      setEnrollment(result);
      setGate("pending");
    } catch (error) {
      const failure = error as Error & { code?: string; status?: number };
      if (failure.code === "device_blocked") setGate("blocked");
      else if (failure.status === 429) setGate("cooldown");
      else setGate("error");
      setMessage(failure.message);
      if (failure.code === "device_blocked") localStorage.removeItem(enrollmentStorageKey);
    }
  }, [createSession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await api<{ authorized: boolean }>("/api/web/state");
        if (cancelled) return;
        if (state.authorized) return setGate("authorized");
        const id = await browserIdentity();
        if (cancelled) return;
        setIdentity(id);
        try {
          await createSession(id);
        } catch {
          const saved = readStoredEnrollment();
          if (saved?.deviceId === id.deviceId && saved.expiresAt > Date.now()) {
            setEnrollment(saved);
            setGate("pending");
          } else {
            localStorage.removeItem(enrollmentStorageKey);
            await requestEnrollment(id);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setGate("error");
          setMessage(error instanceof Error ? error.message : "初始化失敗");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [createSession, requestEnrollment]);

  useEffect(() => {
    if (!enrollment?.qr) return;
    void QRCode.toDataURL(enrollment.qr, { width: 720, margin: 1, errorCorrectionLevel: "M", color: { dark: "#050505", light: "#ffffff" } })
      .then(setQrImage)
      .catch(() => setMessage("無法產生 QR 圖像"));
  }, [enrollment]);

  useEffect(() => {
    if (gate !== "pending" || !enrollment || !identity) return;
    const poll = window.setInterval(() => {
      void api<{ state: GateState; note?: string }>("/api/enrollment/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: enrollment.requestId, pollToken: enrollment.pollToken }),
      }).then(async (result) => {
        if (result.state === "allowed") await createSession(identity);
        else if (result.state !== "pending") {
          localStorage.removeItem(enrollmentStorageKey);
          setGate(result.state);
          setMessage(result.note ?? "");
        }
      }).catch((error) => setMessage(error instanceof Error ? error.message : "狀態查詢失敗"));
    }, 4_000);
    return () => window.clearInterval(poll);
  }, [createSession, enrollment, gate, identity]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (gate === "authorized") return <AuthorizedPortal />;
  const seconds = enrollment ? Math.max(0, Math.ceil((enrollment.expiresAt - now) / 1000)) : 0;
  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">private access</p>
        <h1>候位 Metro</h1>
        <p className="lead">此網頁只供獲批裝置查閱。授權狀態不會依賴可偽造的裝置型號，而會綁定這個瀏覽器保存的隨機身分。</p>
        {gate === "checking" && <Status title="正在檢查裝置…" text="首次使用會建立一個待管理員批准的申請。" />}
        {gate === "pending" && (
          <>
            <h2>請由管理員掃描</h2>
            <p className="lead">Android 管理頁可使用相機，亦可從相簿選取別人傳來的截圖。</p>
            <div className="qr-wrap">{qrImage ? <Image unoptimized width={720} height={720} src={qrImage} alt="限時裝置授權 QR code" /> : null}</div>
            <p className="countdown">{now === 0 ? "--:--" : seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "已過期"}</p>
            <p className="fine-print">QR 只包含一次性申請代碼，5 分鐘後失效；它不包含壽司郎資料、管理員私鑰或瀏覽器密鑰。</p>
          </>
        )}
        {gate === "blocked" && <Status blocked title="此瀏覽器身分已封鎖" text="此身分不會再產生 QR。清除瀏覽器資料只會成為新的未授權身分，仍須管理員另行批准。" />}
        {gate === "cancelled" && <Status title="管理員已取消" text="60 秒後可重新產生申請。" />}
        {gate === "expired" && <Status title="QR 已過期" text="可重新建立一個新的 5 分鐘申請。" />}
        {gate === "cooldown" && <Status title="暫時不能重新申請" text="請稍候約 60 秒，以免重複產生大量申請。" />}
        {gate === "error" && <Status blocked title="暫時無法連線" text={message || "請稍後重試。"} />}
        {message && gate === "pending" ? <p className="fine-print">{message}</p> : null}
        {identity && ["expired", "cancelled", "cooldown", "error"].includes(gate) ? (
          <button className="metro-button" onClick={() => void requestEnrollment(identity)}>重新檢查／申請</button>
        ) : null}
      </section>
    </main>
  );
}

function Status({ title, text, blocked = false }: { title: string; text: string; blocked?: boolean }) {
  return <div className={`status-panel${blocked ? " blocked" : ""}`}><strong>{title}</strong><p>{text}</p></div>;
}

function AuthorizedPortal() {
  const [pivot, setPivot] = useState<(typeof pivots)[number]>("home");
  const [stores, setStores] = useState<Store[]>([]);
  const [queues, setQueues] = useState<Record<number, Queue>>({});
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(0);
  const [region, setRegion] = useState<Store["region"]>("九龍");
  const [district, setDistrict] = useState("");
  const [pins, setPins] = useState<number[]>([]);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const [position, setPosition] = useState<Position | null>(null);
  const [radius, setRadius] = useState(1_500);
  const loading = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      try { setPins(JSON.parse(localStorage.getItem("queueMetroPins") ?? "[]") as number[]); } catch { setPins([]); }
    });
    const savedAccent = localStorage.getItem("queueMetroAccent") ?? accentOptions[0];
    document.documentElement.style.setProperty("--accent", savedAccent);
  }, []);

  const loadStores = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const result = await api<{ stores: Store[]; fetchedAt: number }>("/api/queue/stores");
      setStores(result.stores);
      setUpdatedAt(result.fetchedAt);
      setError("");
    } catch (failure) {
      if ((failure as { status?: number }).status === 401) return window.location.reload();
      setError(failure instanceof Error ? failure.message : "讀取失敗");
    } finally { loading.current = false; }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStores(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStores]);
  useEffect(() => {
    if (refreshSeconds <= 0) return;
    const timer = window.setInterval(() => void loadStores(), refreshSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [loadStores, refreshSeconds]);

  const districts = useMemo(() => [...new Set(stores.filter((store) => store.region === region).map((store) => store.district))].sort(), [region, stores]);
  const searchStores = useMemo(() => stores.filter((store) => store.region === region && (!district || store.district === district)), [district, region, stores]);
  const pinnedStores = useMemo(() => pins.flatMap((id) => stores.find((store) => store.id === id) ?? []), [pins, stores]);
  const nearby = useMemo(() => position ? stores.map((store) => ({ store, distance: distanceMeters(position, store) }))
    .filter((entry) => entry.distance !== null && entry.distance <= radius)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)) : [], [position, radius, stores]);
  const visible = useMemo(() => pivot === "home" ? pinnedStores : pivot === "search" ? searchStores : pivot === "nearby" ? nearby.map((entry) => entry.store) : [], [nearby, pinnedStores, pivot, searchStores]);
  const visibleIds = useMemo(() => visible.map((store) => store.id), [visible]);

  const loadQueues = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const result = await api<{ queues: Queue[] }>(`/api/queue/status?ids=${ids.slice(0, 20).join(",")}`);
      setQueues((current) => ({ ...current, ...Object.fromEntries(result.queues.map((queue) => [queue.storeId, queue])) }));
    } catch (failure) {
      if ((failure as { status?: number }).status === 401) return window.location.reload();
      setError(failure instanceof Error ? failure.message : "叫號讀取失敗");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadQueues(visibleIds), 0);
    return () => window.clearTimeout(timer);
  }, [loadQueues, visibleIds]);
  useEffect(() => {
    if (refreshSeconds <= 0) return;
    const timer = window.setInterval(() => void loadQueues(visibleIds), refreshSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [loadQueues, refreshSeconds, visibleIds]);

  const togglePin = (id: number) => {
    const next = pins.includes(id) ? pins.filter((value) => value !== id) : [...pins, id];
    setPins(next);
    localStorage.setItem("queueMetroPins", JSON.stringify(next));
  };

  return (
    <main className="shell">
      <nav className="pivot-head" aria-label="主要頁面">
        {pivots.map((item) => <button key={item} className={pivot === item ? "active" : ""} onClick={() => setPivot(item)}>{item}</button>)}
      </nav>
      <section className="content">
        {pivot === "home" && <>
          <div className="toolbar"><p>{updatedAt ? `上次更新 ${new Date(updatedAt).toLocaleTimeString("zh-HK")}` : "正在讀取官方資料"}</p><button className="metro-button" onClick={() => { void loadStores(); void loadQueues(pins); }}>立即更新</button></div>
          {error ? <p className="lead">{error}</p> : null}
          {pinnedStores.length ? <StoreTiles stores={pinnedStores} queues={queues} pins={pins} onTogglePin={togglePin} single /> : <div className="empty">尚未釘選分店。到 search 點擊分店 Tile 加到 home。</div>}
        </>}
        {pivot === "search" && <>
          <p className="eyebrow">district directory</p>
          <div className="filters">
            <select className="metro-select" value={region} onChange={(event) => { setRegion(event.target.value as Store["region"]); setDistrict(""); }} aria-label="地區">
              {(["港島", "九龍", "新界"] as const).map((value) => <option key={value}>{value}</option>)}
            </select>
            <select className="metro-select" value={district} onChange={(event) => setDistrict(event.target.value)} aria-label="分區">
              <option value="">全部細區</option>{districts.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <StoreTiles stores={searchStores} queues={queues} pins={pins} onTogglePin={togglePin} />
        </>}
        {pivot === "nearby" && <>
          <div className="toolbar"><p>搜尋半徑 {radius >= 1_000 ? `${(radius / 1_000).toFixed(1)} 公里` : `${radius} 米`}</p><button className="metro-button primary" onClick={() => navigator.geolocation.getCurrentPosition((value) => setPosition(value.coords), () => setError("無法取得定位權限"), { enableHighAccuracy: false, maximumAge: 300_000 })}>取得位置</button></div>
          <input className="range" type="range" min="200" max="5000" step="100" value={radius} onChange={(event) => setRadius(Number(event.target.value))} aria-label="附近搜尋半徑" />
          {!position ? <div className="empty">定位只在此裝置計算距離，不會儲存在伺服器。</div> : nearby.length ? nearby.map(({ store, distance }) => <div className="nearby-row" key={store.id}><div><strong>{store.name}</strong><br/><small>{store.district}</small></div><span>{distance && distance < 1000 ? `${Math.round(distance)} m` : `${((distance ?? 0) / 1000).toFixed(1)} km`}</span></div>) : <div className="empty">指定距離內沒有分店。</div>}
        </>}
        {pivot === "settings" && <>
          <p className="eyebrow">personalisation</p>
          <div className="setting"><h3>強調色</h3><div className="filters">{accentOptions.map((color) => <button key={color} className="metro-button" style={{ background: color, minHeight: 48 }} aria-label={`強調色 ${color}`} onClick={() => { document.documentElement.style.setProperty("--accent", color); localStorage.setItem("queueMetroAccent", color); }} />)}</div></div>
          <div className="setting"><h3>自動更新</h3><select className="metro-select" value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value))}><option value="0">關閉</option><option value="60">每 60 秒</option><option value="120">每 2 分鐘</option><option value="300">每 5 分鐘</option></select></div>
          <div className="setting"><h3>裝置類型</h3><p>{/Android/u.test(navigator.userAgent) ? "Android 瀏覽器" : "網頁瀏覽器"}（只作介面提示，不作安全判斷）</p></div>
          <div className="setting"><h3>資料與私隱</h3><p>排隊資料直接來自香港壽司郎服務並設 60 秒快取。瀏覽器只保存隨機身分、釘選項目和外觀設定；定位不會上傳。</p></div>
          <div className="setting"><h3>候位 Metro 1.2.2</h3><p>非官方資訊工具。輪候資料可能延遲，請以店內及官方服務顯示為準。</p></div>
        </>}
      </section>
    </main>
  );
}

function StoreTiles({ stores, queues, pins, onTogglePin, single = false }: { stores: Store[]; queues: Record<number, Queue>; pins: number[]; onTogglePin: (id: number) => void; single?: boolean }) {
  return <div className={`tiles${single ? " single" : ""}`}>{stores.map((store) => {
    const queue = queues[store.id];
    const latest = queue?.currentNumbers?.join(" · ") || "—";
    return <button className="tile" key={store.id} onClick={() => onTogglePin(store.id)} title={pins.includes(store.id) ? "點擊取消釘選" : "點擊釘選到 home"}>
      <h3>{store.name}</h3><p className="district">{store.district} · {pins.includes(store.id) ? "已釘選" : "點按釘選"}</p>
      <div className="numbers"><div><strong>{store.waitingGroups ?? "—"}</strong><br/><small>輪候組數</small></div><span>最新叫號<br/>{latest}</span></div>
    </button>;
  })}</div>;
}

function distanceMeters(position: Position, store: Store): number | null {
  if (store.latitude === null || store.longitude === null) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(store.latitude - position.latitude);
  const dLon = radians(store.longitude - position.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(position.latitude)) * Math.cos(radians(store.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function readStoredEnrollment(): StoredEnrollment | null {
  try {
    return JSON.parse(localStorage.getItem(enrollmentStorageKey) ?? "null") as StoredEnrollment | null;
  } catch {
    return null;
  }
}
