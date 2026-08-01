"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
type DisplayMode = "dark" | "light" | "system";
type AppLanguage = "system" | "zh-HK" | "en";
type WebSettings = {
  accentIndex: number;
  textScale: number;
  displayMode: DisplayMode;
  refreshSeconds: number;
  radius: number;
  showMapLabels: boolean;
  dataSaver: boolean;
  language: AppLanguage;
};

const pivots = ["home", "search", "nearby", "settings"] as const;
const accentOptions = ["#1ba1e2", "#e51400", "#60a917", "#f0a30a", "#00aba9", "#a200ff", "#d80073", "#a0522d"];
const enrollmentStorageKey = "queueMetroEnrollment";
const settingsStorageKey = "queueMetroSettingsV2";
const defaultSettings: WebSettings = {
  accentIndex: 2,
  textScale: 1,
  displayMode: "dark",
  refreshSeconds: 60,
  radius: 800,
  showMapLabels: true,
  dataSaver: false,
  language: "system",
};

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
  const [region, setRegion] = useState<Store["region"]>("港島");
  const [district, setDistrict] = useState("");
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<number[]>([]);
  const [accentIndex, setAccentIndex] = useState(defaultSettings.accentIndex);
  const [textScale, setTextScale] = useState(defaultSettings.textScale);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(defaultSettings.displayMode);
  const [refreshSeconds, setRefreshSeconds] = useState(defaultSettings.refreshSeconds);
  const [position, setPosition] = useState<Position | null>(null);
  const [radius, setRadius] = useState(defaultSettings.radius);
  const [showMapLabels, setShowMapLabels] = useState(defaultSettings.showMapLabels);
  const [dataSaver, setDataSaver] = useState(defaultSettings.dataSaver);
  const [language, setLanguage] = useState<AppLanguage>(defaultSettings.language);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [portalNow, setPortalNow] = useState(() => Date.now());
  const loading = useRef(false);
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try { setPins(JSON.parse(localStorage.getItem("queueMetroPins") ?? "[]") as number[]); } catch { setPins([]); }
      try {
        const saved = JSON.parse(localStorage.getItem(settingsStorageKey) ?? "null") as Partial<WebSettings> | null;
        const legacyAccent = localStorage.getItem("queueMetroAccent");
        const legacyIndex = legacyAccent ? accentOptions.indexOf(legacyAccent.toLowerCase()) : -1;
        setAccentIndex(saved?.accentIndex ?? (legacyIndex >= 0 ? legacyIndex : defaultSettings.accentIndex));
        setTextScale(saved?.textScale ?? defaultSettings.textScale);
        setDisplayMode(saved?.displayMode ?? defaultSettings.displayMode);
        setRefreshSeconds(saved?.refreshSeconds ?? defaultSettings.refreshSeconds);
        setRadius(saved?.radius ?? defaultSettings.radius);
        setShowMapLabels(saved?.showMapLabels ?? defaultSettings.showMapLabels);
        setDataSaver(saved?.dataSaver ?? defaultSettings.dataSaver);
        setLanguage(saved?.language ?? defaultSettings.language);
      } catch {
        setAccentIndex(defaultSettings.accentIndex);
      }
      setSettingsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    localStorage.setItem(settingsStorageKey, JSON.stringify({
      accentIndex, textScale, displayMode, refreshSeconds, radius, showMapLabels, dataSaver, language,
    } satisfies WebSettings));
    localStorage.removeItem("queueMetroAccent");
  }, [accentIndex, dataSaver, displayMode, language, radius, refreshSeconds, settingsReady, showMapLabels, textScale]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = displayMode === "dark" || (displayMode === "system" && media.matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.style.setProperty("--accent", accentOptions[accentIndex] ?? accentOptions[defaultSettings.accentIndex]);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [accentIndex, displayMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setPortalNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
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
    if (refreshSeconds <= 0 || dataSaver) return;
    const timer = window.setInterval(() => void loadStores(), refreshSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [dataSaver, loadStores, refreshSeconds]);

  const districts = useMemo(() => [...new Set(stores.filter((store) => store.region === region).map((store) => store.district))].sort(), [region, stores]);
  const searchStores = useMemo(() => stores.filter((store) => {
    if (store.region !== region || (!district && !query.trim())) return false;
    return (!district || store.district === district) && (!query.trim() || `${store.name} ${store.nameEn}`.toLowerCase().includes(query.trim().toLowerCase()));
  }), [district, query, region, stores]);
  const pinnedStores = useMemo(() => pins.flatMap((id) => stores.find((store) => store.id === id) ?? []), [pins, stores]);
  const nearby = useMemo(() => position ? stores.map((store) => ({ store, distance: distanceMeters(position, store) }))
    .filter((entry) => entry.distance !== null && entry.distance <= radius)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)) : [], [position, radius, stores]);
  const selectedNearbyStore = useMemo(() => nearby.find((entry) => entry.store.id === selectedStoreId) ?? null, [nearby, selectedStoreId]);
  const visible = useMemo(() => pivot === "home" ? pinnedStores : pivot === "search" ? searchStores : pivot === "nearby" ? nearby.map((entry) => entry.store) : [], [nearby, pinnedStores, pivot, searchStores]);
  const visibleIds = useMemo(() => visible.map((store) => store.id), [visible]);
  const orderedPivots = useMemo(() => {
    const start = pivots.indexOf(pivot);
    return pivots.map((_, offset) => pivots[(start + offset) % pivots.length]);
  }, [pivot]);

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
    if (refreshSeconds <= 0 || dataSaver) return;
    const timer = window.setInterval(() => void loadQueues(visibleIds), refreshSeconds * 1_000);
    return () => window.clearInterval(timer);
  }, [dataSaver, loadQueues, refreshSeconds, visibleIds]);

  const togglePin = (id: number) => {
    const next = pins.includes(id) ? pins.filter((value) => value !== id) : [...pins, id];
    setPins(next);
    localStorage.setItem("queueMetroPins", JSON.stringify(next));
  };

  const movePivot = (step: number) => {
    const current = pivots.indexOf(pivot);
    setPivot(pivots[(current + step + pivots.length) % pivots.length]);
  };

  const resetSettings = () => {
    setAccentIndex(defaultSettings.accentIndex);
    setTextScale(defaultSettings.textScale);
    setDisplayMode(defaultSettings.displayMode);
    setRefreshSeconds(defaultSettings.refreshSeconds);
    setRadius(defaultSettings.radius);
    setShowMapLabels(defaultSettings.showMapLabels);
    setDataSaver(defaultSettings.dataSaver);
    setLanguage(defaultSettings.language);
    setPins([]);
    localStorage.removeItem("queueMetroPins");
  };

  const statusText = updatedAt
    ? `上次更新 ${new Date(updatedAt).toLocaleTimeString("zh-HK")} · ${dataSaver || refreshSeconds <= 0 ? "自動更新已關閉" : `${Math.max(0, refreshSeconds - Math.floor((portalNow - updatedAt) / 1_000) % refreshSeconds)} 秒後再更新`}`
    : "正在讀取官方資料";

  return (
    <main
      className="shell"
      style={{ "--text-scale": textScale } as CSSProperties}
      onPointerDown={(event) => { swipeStart.current = event.clientX; }}
      onPointerUp={(event) => {
        if (swipeStart.current === null) return;
        const movement = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(movement) > 70) movePivot(movement < 0 ? 1 : -1);
      }}
    >
      <nav className="pivot-head" aria-label="主要頁面">
        {orderedPivots.map((item, index) => <button key={item} className={index === 0 ? "active" : ""} onClick={() => setPivot(item)}>{item}</button>)}
      </nav>
      <section className="content">
        {pivot === "home" && <>
          <div className="toolbar"><p>{statusText}</p><button className="metro-button" onClick={() => { void loadStores(); void loadQueues(pins); }}>立即更新</button></div>
          {error ? <p className="lead">{error}</p> : null}
          {pinnedStores.length ? <StoreTiles stores={pinnedStores} queues={queues} pins={pins} onTogglePin={togglePin} single /> : <div className="empty">尚未釘選分店。到 search 點擊分店 Tile 加到 home。</div>}
        </>}
        {pivot === "search" && <>
          <div className="choice-grid triple region-choices">
            {(["港島", "九龍", "新界"] as const).map((value) => <SettingChoice key={value} label={value} selected={region === value} onClick={() => { setRegion(value); setDistrict(""); }} />)}
          </div>
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋分店" aria-label="搜尋分店" /></label>
          <div className="district-strip">{districts.map((value) => <button key={value} className={district === value ? "active" : ""} onClick={() => setDistrict(value)}>{value}</button>)}</div>
          {district || query.trim() ? <StoreTiles stores={searchStores} queues={queues} pins={pins} onTogglePin={togglePin} /> : <div className="empty"><strong>選擇細分地區</strong><br/>先選擇上方地區，再點擊細分地區載入該區分店叫號。</div>}
        </>}
        {pivot === "nearby" && <>
          {!position ? <div className="nearby-permission"><div className="location-glyph">⌖</div><div className="empty"><strong>尋找附近分店</strong><br/>只要求前景定位，座標不會傳送或保存到資料服務。</div><button className="metro-button" onClick={() => navigator.geolocation.getCurrentPosition((value) => setPosition(value.coords), () => setError("無法取得定位權限"), { enableHighAccuracy: false, maximumAge: 300_000 })}>允許定位</button></div> : <>
            <div className="nearby-map" aria-label="附近分店示意地圖">
              <i className="map-road road-a"/><i className="map-road road-b"/><i className="map-route route-a"/><i className="map-route route-b"/>
              <span className="you-marker" aria-label="目前位置"/>
              {nearby.slice(0, 8).map(({ store }) => {
                const point = mapPoint(position, store, radius);
                return <button key={store.id} className={`store-marker${selectedStoreId === store.id ? " selected" : ""}`} style={point} onClick={() => setSelectedStoreId(store.id)} aria-label={store.name}><span/>{showMapLabels ? <b>{store.name}</b> : null}</button>;
              })}
              <em>{formatRadius(radius)}</em>
            </div>
            {selectedNearbyStore ? <div className="store-mini-panel"><div><strong>{selectedNearbyStore.store.name}</strong><small>{formatDistance(selectedNearbyStore.distance)} · {queues[selectedNearbyStore.store.id]?.currentNumbers?.[0] ?? "暫無叫號"}</small></div><div className="mini-wait"><strong>{selectedNearbyStore.store.waitingGroups ?? "—"}</strong><small>輪候組</small></div><button className="metro-button" onClick={() => togglePin(selectedNearbyStore.store.id)}>{pins.includes(selectedNearbyStore.store.id) ? "取消" : "釘選"}</button></div> : null}
            {nearby.length ? nearby.map(({ store, distance }) => <button className="nearby-row" key={store.id} onClick={() => setSelectedStoreId(store.id)}><span>{formatDistance(distance)}</span><div><strong>{store.name}</strong>{showMapLabels ? <small>{store.district}</small> : null}</div><b>{store.waitingGroups ?? "—"}</b></button>) : <div className="empty">指定距離內沒有分店，可在 settings 增加搜尋半徑。</div>}
          </>}
        </>}
        {pivot === "settings" && <>
          <p className="eyebrow">個人化</p>
          <section className="setting-block first"><h2>強調色</h2><div className="swatch-grid">{accentOptions.map((color, index) => <button key={color} className="accent-swatch" style={{ background: color }} aria-label={`強調色 ${index + 1}`} aria-pressed={accentIndex === index} onClick={() => setAccentIndex(index)}>{accentIndex === index ? <span/> : null}</button>)}</div></section>
          <section className="setting-block"><div className="setting-title"><h2>文字大小</h2><span>{Math.round(textScale * 100)}%</span></div><input className="range" type="range" min="0.8" max="1.4" step="0.1" value={textScale} onChange={(event) => setTextScale(Number(event.target.value))} aria-label="文字大小"/><div className="range-ends"><span>較小</span><span>較大</span></div></section>
          <section className="setting-block"><h2>顯示模式</h2><div className="choice-grid triple"><SettingChoice label="深色" selected={displayMode === "dark"} onClick={() => setDisplayMode("dark")}/><SettingChoice label="淺色" selected={displayMode === "light"} onClick={() => setDisplayMode("light")}/><SettingChoice label="系統" selected={displayMode === "system"} onClick={() => setDisplayMode("system")}/></div></section>
          <section className="setting-block"><p className="eyebrow">資料</p><h2>自動更新</h2><div className="choice-grid"><SettingChoice label="關閉" selected={refreshSeconds === 0} onClick={() => setRefreshSeconds(0)}/><SettingChoice label="每 60 秒" selected={refreshSeconds === 60} onClick={() => setRefreshSeconds(60)}/><SettingChoice label="每 2 分鐘" selected={refreshSeconds === 120} onClick={() => setRefreshSeconds(120)}/><SettingChoice label="每 5 分鐘" selected={refreshSeconds === 300} onClick={() => setRefreshSeconds(300)}/></div><ToggleSetting title="數據節省模式" subtitle="關閉自動更新，只保留手動刷新" checked={dataSaver} onChange={setDataSaver}/></section>
          <section className="setting-block"><p className="eyebrow">附近</p><div className="setting-title"><h2>搜尋半徑</h2><span>{formatRadius(radius)}</span></div><input className="range" type="range" min="200" max="5000" step="100" value={radius} onChange={(event) => setRadius(Number(event.target.value))} aria-label="附近搜尋半徑"/><ToggleSetting title="顯示地圖站名" subtitle="縮放時保留分店名稱標籤" checked={showMapLabels} onChange={setShowMapLabels}/></section>
          <section className="setting-block"><p className="eyebrow">語言</p><div className="choice-grid triple"><SettingChoice label="系統" selected={language === "system"} onClick={() => setLanguage("system")}/><SettingChoice label="繁中" selected={language === "zh-HK"} onClick={() => setLanguage("zh-HK")}/><SettingChoice label="English" selected={language === "en"} onClick={() => setLanguage("en")}/></div></section>
          <section className="setting-block"><p className="eyebrow">儲存空間</p><div className="choice-grid"><button className="metro-choice" onClick={() => { setQueues({}); setUpdatedAt(0); void loadStores(); }}>清除快取</button><button className="metro-choice" onClick={resetSettings}>重設設定</button></div></section>
          <section className="setting-block about"><h3>候位 Metro 1.2.3</h3><p>非官方資訊工具。輪候資料可能延遲，請以店內及官方服務顯示為準。定位只在本機計算附近距離。</p></section>
        </>}
      </section>
    </main>
  );
}

function SettingChoice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button className={`metro-choice${selected ? " selected" : ""}`} aria-pressed={selected} onClick={onClick}>{label}</button>;
}

function ToggleSetting({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="toggle-setting"><div><strong>{title}</strong><small>{subtitle}</small></div><button className={`metro-switch${checked ? " checked" : ""}`} role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)}><span/></button></div>;
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

function mapPoint(position: Position, store: Store, radius: number): CSSProperties {
  if (store.latitude === null || store.longitude === null) return { display: "none" };
  const latitudeMeters = (store.latitude - position.latitude) * 111_000;
  const longitudeMeters = (store.longitude - position.longitude) * 111_000 * Math.cos(position.latitude * Math.PI / 180);
  const scale = Math.max(radius, 400) * 1.25;
  return {
    left: `${Math.max(5, Math.min(95, 50 + longitudeMeters / scale * 50))}%`,
    top: `${Math.max(7, Math.min(93, 50 - latitudeMeters / scale * 50))}%`,
  };
}

function formatRadius(meters: number): string {
  return meters < 1_000 ? `${meters} 米` : `${(meters / 1_000).toFixed(1)} 公里`;
}

function formatDistance(meters: number | null): string {
  if (meters === null) return "—";
  return meters < 1_000 ? `${Math.round(meters)}m` : `${(meters / 1_000).toFixed(1)}km`;
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
