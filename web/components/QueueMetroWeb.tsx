"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { browserIdentity, type BrowserIdentity } from "@/lib/browser-identity";
import { NearbyMap } from "@/components/NearbyMap";

type GateState = "checking" | "pending" | "allowed" | "authorized" | "blocked" | "expired" | "cancelled" | "cooldown" | "error";
type Enrollment = { requestId: string; pollToken: string; qr: string; expiresAt: number };
type StoredEnrollment = Enrollment & { deviceId: string };
type Store = {
  id: number; name: string; nameEn: string; district: string; region: "港島" | "九龍" | "新界";
  address: string; latitude: number | null; longitude: number | null; waitingGroups: number | null; isOpen: boolean | null;
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

type ToastNotice = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const pivots = ["home", "search", "nearby", "settings"] as const;
const accentOptions = ["#1ba1e2", "#e51400", "#60a917", "#f0a30a", "#00aba9", "#a200ff", "#d80073", "#a0522d"];
const enrollmentStorageKey = "queueMetroEnrollment";
const settingsStorageKey = "queueMetroSettingsV2";
const onboardingStorageKey = "sushiRadarOnboardingV1";
const onboardingSteps = [
  { icon: "↔", title: "左右滑動切換", text: "在頁面空白位置左右滑動，便可循環切換 home、search、nearby 與 settings。" },
  { icon: "▣", title: "點按展開，長按釘選", text: "點一下分店 Tile 查看地址；長按 Tile 再選擇釘選，即可放到 home。" },
  { icon: "⌖", title: "尋找附近分店", text: "在 nearby 允許定位後，可拖動真實地圖、調整搜尋半徑及查看分店距離。" },
  { icon: "✓", title: "隨時掌握輪候情況", text: "home 每 60 秒自動更新，也可按「立即更新」。釘選操作完成後會顯示確認提示。" },
] as const;
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
        <h1>Sushi Radar</h1>
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
  const [radiusPreview, setRadiusPreview] = useState(defaultSettings.radius);
  const [showMapLabels, setShowMapLabels] = useState(defaultSettings.showMapLabels);
  const [dataSaver, setDataSaver] = useState(defaultSettings.dataSaver);
  const [language, setLanguage] = useState<AppLanguage>(defaultSettings.language);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const [portalNow, setPortalNow] = useState(() => Date.now());
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const [transitionKey, setTransitionKey] = useState(0);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
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
        const savedRadius = saved?.radius ?? defaultSettings.radius;
        setRadius(savedRadius);
        setRadiusPreview(savedRadius);
        setShowMapLabels(saved?.showMapLabels ?? defaultSettings.showMapLabels);
        setDataSaver(saved?.dataSaver ?? defaultSettings.dataSaver);
        setLanguage(saved?.language ?? defaultSettings.language);
      } catch {
        setAccentIndex(defaultSettings.accentIndex);
      }
      setOnboardingOpen(localStorage.getItem(onboardingStorageKey) !== "complete");
      setSettingsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 3_600);
    return () => window.clearTimeout(timer);
  }, [toast]);

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
    .filter((entry) => entry.distance !== null && entry.distance <= radiusPreview)
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)) : [], [position, radiusPreview, stores]);
  const committedNearbyStores = useMemo(() => position ? stores.filter((store) => {
    const distance = distanceMeters(position, store);
    return distance !== null && distance <= radius;
  }) : [], [position, radius, stores]);
  const selectedNearbyStore = useMemo(() => nearby.find((entry) => entry.store.id === selectedStoreId) ?? null, [nearby, selectedStoreId]);
  const visible = useMemo(() => pivot === "home" ? pinnedStores : pivot === "search" ? searchStores : pivot === "nearby" ? committedNearbyStores : [], [committedNearbyStores, pinnedStores, pivot, searchStores]);
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

  const goToPivot = (nextPivot: (typeof pivots)[number], forcedDirection?: 1 | -1) => {
    if (nextPivot === pivot) return;
    const current = pivots.indexOf(pivot);
    const next = pivots.indexOf(nextPivot);
    const clockwise = (next - current + pivots.length) % pivots.length;
    setTransitionDirection(forcedDirection ?? (clockwise <= pivots.length / 2 ? 1 : -1));
    setTransitionKey((value) => value + 1);
    setPivot(nextPivot);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const togglePin = (id: number) => {
    const wasPinned = pins.includes(id);
    const next = wasPinned ? pins.filter((value) => value !== id) : [...pins, id];
    const storeName = stores.find((store) => store.id === id)?.name ?? "分店";
    setPins(next);
    localStorage.setItem("queueMetroPins", JSON.stringify(next));
    if ("vibrate" in navigator) navigator.vibrate(12);
    setToast({
      id: Date.now(),
      message: wasPinned ? `已取消釘選「${storeName}」` : `已把「${storeName}」釘選到 home`,
      actionLabel: wasPinned || pivot === "home" ? undefined : "前往 home",
      onAction: wasPinned || pivot === "home" ? undefined : () => goToPivot("home", 1),
    });
  };

  const movePivot = (step: number) => {
    const current = pivots.indexOf(pivot);
    goToPivot(pivots[(current + step + pivots.length) % pivots.length], step > 0 ? 1 : -1);
  };

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(onboardingStorageKey, "complete");
    setOnboardingOpen(false);
    setOnboardingStep(0);
  }, []);

  const resetSettings = () => {
    setAccentIndex(defaultSettings.accentIndex);
    setTextScale(defaultSettings.textScale);
    setDisplayMode(defaultSettings.displayMode);
    setRefreshSeconds(defaultSettings.refreshSeconds);
    setRadius(defaultSettings.radius);
    setRadiusPreview(defaultSettings.radius);
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
      onContextMenu={(event) => {
        if (!(event.target as HTMLElement).closest("input, textarea")) event.preventDefault();
      }}
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-swipe], input, textarea, select")) return;
        swipeStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (swipeStart.current === null) return;
        const movement = event.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(movement) > 70) movePivot(movement < 0 ? 1 : -1);
      }}
      onPointerCancel={() => { swipeStart.current = null; }}
    >
      <nav key={`head-${transitionKey}`} className={`pivot-head pivot-${transitionDirection > 0 ? "forward" : "backward"}`} aria-label="主要頁面">
        {orderedPivots.map((item, index) => <button key={item} className={index === 0 ? "active" : ""} onClick={() => goToPivot(item)}>{item}</button>)}
      </nav>
      <section key={`${pivot}-${transitionKey}`} className={`content pivot-page pivot-${transitionDirection > 0 ? "forward" : "backward"}`}>
        {pivot === "home" && <>
          <div className="toolbar"><p>{statusText}</p><button className="metro-button" onClick={() => { void loadStores(); void loadQueues(pins); }}>立即更新</button></div>
          {error ? <p className="lead">{error}</p> : null}
          {pinnedStores.length ? <StoreTiles stores={pinnedStores} queues={queues} pins={pins} onTogglePin={togglePin} single variant="home" /> : <div className="empty">尚未釘選分店。到 search 長按分店 Tile 加到 home。</div>}
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
            <NearbyMap
              position={position}
              stores={nearby.map(({ store }) => store)}
              selectedStore={selectedNearbyStore?.store ?? null}
              selectedDistance={selectedNearbyStore?.distance ?? null}
              radius={radiusPreview}
              accent={accentOptions[accentIndex] ?? accentOptions[defaultSettings.accentIndex]}
              showLabels={showMapLabels}
              onSelectStore={setSelectedStoreId}
            />
            <section className="nearby-radius">
              <div className="setting-title"><h2>搜尋半徑</h2><span>{formatRadius(radiusPreview)}</span></div>
              <input
                className="range"
                type="range"
                min="200"
                max="5000"
                step="100"
                value={radiusPreview}
                onChange={(event) => setRadiusPreview(Number(event.target.value))}
                onPointerUp={() => setRadius(radiusPreview)}
                onKeyUp={() => setRadius(radiusPreview)}
                onBlur={() => setRadius(radiusPreview)}
                aria-label="附近搜尋半徑"
              />
              <div className="range-ends"><span>200 米</span><span>5 公里</span></div>
            </section>
            {selectedNearbyStore ? <div className="store-mini-panel"><div><strong>{selectedNearbyStore.store.name}</strong><small>{selectedNearbyStore.store.address || `${selectedNearbyStore.store.district} · 地址資料暫缺`}</small><small className="latest-call">最新叫號：{queues[selectedNearbyStore.store.id]?.currentNumbers?.[0] ?? "暫無叫號"}</small></div><div className="mini-wait"><strong>{selectedNearbyStore.store.waitingGroups ?? "—"}</strong><small>輪候組</small></div><button className="metro-button" onClick={() => togglePin(selectedNearbyStore.store.id)}>{pins.includes(selectedNearbyStore.store.id) ? "取消" : "釘選"}</button></div> : null}
            {nearby.length ? nearby.map(({ store, distance }) => <button className={`nearby-row${selectedStoreId === store.id ? " selected" : ""}`} key={store.id} onClick={() => setSelectedStoreId(store.id)}><span>{formatDistance(distance)}</span><div><strong>{store.name}</strong>{showMapLabels ? <small>{store.address || store.district}</small> : null}</div><b>{store.waitingGroups ?? "—"}</b></button>) : <div className="empty">指定距離內沒有分店，可增加上方搜尋半徑。</div>}
          </>}
        </>}
        {pivot === "settings" && <>
          <p className="eyebrow">個人化</p>
          <section className="setting-block first"><h2>強調色</h2><div className="swatch-grid">{accentOptions.map((color, index) => <button key={color} className="accent-swatch" style={{ background: color }} aria-label={`強調色 ${index + 1}`} aria-pressed={accentIndex === index} onClick={() => setAccentIndex(index)}>{accentIndex === index ? <span/> : null}</button>)}</div></section>
          <section className="setting-block"><div className="setting-title"><h2>文字大小</h2><span>{Math.round(textScale * 100)}%</span></div><input className="range" type="range" min="0.8" max="1.4" step="0.1" value={textScale} onChange={(event) => setTextScale(Number(event.target.value))} aria-label="文字大小"/><div className="range-ends"><span>較小</span><span>較大</span></div></section>
          <section className="setting-block"><h2>顯示模式</h2><div className="choice-grid triple"><SettingChoice label="深色" selected={displayMode === "dark"} onClick={() => setDisplayMode("dark")}/><SettingChoice label="淺色" selected={displayMode === "light"} onClick={() => setDisplayMode("light")}/><SettingChoice label="系統" selected={displayMode === "system"} onClick={() => setDisplayMode("system")}/></div></section>
          <section className="setting-block"><p className="eyebrow">資料</p><h2>自動更新</h2><div className="choice-grid"><SettingChoice label="關閉" selected={refreshSeconds === 0} onClick={() => setRefreshSeconds(0)}/><SettingChoice label="每 60 秒" selected={refreshSeconds === 60} onClick={() => setRefreshSeconds(60)}/><SettingChoice label="每 2 分鐘" selected={refreshSeconds === 120} onClick={() => setRefreshSeconds(120)}/><SettingChoice label="每 5 分鐘" selected={refreshSeconds === 300} onClick={() => setRefreshSeconds(300)}/></div><ToggleSetting title="數據節省模式" subtitle="關閉自動更新，只保留手動刷新" checked={dataSaver} onChange={setDataSaver}/></section>
          <section className="setting-block"><p className="eyebrow">地圖</p><ToggleSetting title="顯示地圖站名" subtitle="縮放時保留分店名稱標籤" checked={showMapLabels} onChange={setShowMapLabels}/></section>
          <section className="setting-block"><p className="eyebrow">語言</p><div className="choice-grid triple"><SettingChoice label="系統" selected={language === "system"} onClick={() => setLanguage("system")}/><SettingChoice label="繁中" selected={language === "zh-HK"} onClick={() => setLanguage("zh-HK")}/><SettingChoice label="English" selected={language === "en"} onClick={() => setLanguage("en")}/></div></section>
          <section className="setting-block"><p className="eyebrow">儲存空間</p><div className="choice-grid"><button className="metro-choice" onClick={() => { setQueues({}); setUpdatedAt(0); void loadStores(); }}>清除快取</button><button className="metro-choice" onClick={resetSettings}>重設設定</button><button className="metro-choice" onClick={() => { setOnboardingStep(0); setOnboardingOpen(true); }}>功能介紹</button></div></section>
          <section className="setting-block about"><h3>Sushi Radar Web 1.4.1</h3><p>非官方資訊工具。輪候資料可能延遲，請以店內及官方服務顯示為準。定位只在本機計算附近距離；地圖底圖由第三方服務載入。</p></section>
        </>}
      </section>
      {toast ? <Toast notice={toast} onDismiss={() => setToast(null)} /> : null}
      {onboardingOpen ? (
        <Onboarding
          step={onboardingStep}
          onBack={() => setOnboardingStep((value) => Math.max(0, value - 1))}
          onNext={() => onboardingStep === onboardingSteps.length - 1 ? completeOnboarding() : setOnboardingStep((value) => value + 1)}
          onSkip={completeOnboarding}
        />
      ) : null}
    </main>
  );
}

function Toast({ notice, onDismiss }: { notice: ToastNotice; onDismiss: () => void }) {
  return (
    <div className="toast" role="status" aria-live="polite">
      <span aria-hidden="true">✓</span>
      <p>{notice.message}</p>
      {notice.actionLabel ? <button onClick={() => { notice.onAction?.(); onDismiss(); }}>{notice.actionLabel}</button> : null}
      <button className="toast-close" aria-label="關閉提示" onClick={onDismiss}>×</button>
    </div>
  );
}

function Onboarding({ step, onBack, onNext, onSkip }: { step: number; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const current = onboardingSteps[step];
  const nextButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    nextButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onSkip(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onSkip, step]);

  return (
    <div className="onboarding-backdrop" role="presentation">
      <section className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button className="onboarding-skip" onClick={onSkip}>略過</button>
        <div key={step} className="onboarding-slide">
          <span className="onboarding-icon" aria-hidden="true">{current.icon}</span>
          <p className="eyebrow">功能介紹 · {step + 1}/{onboardingSteps.length}</p>
          <h2 id="onboarding-title">{current.title}</h2>
          <p>{current.text}</p>
        </div>
        <div className="onboarding-progress" aria-hidden="true">{onboardingSteps.map((_, index) => <span key={index} className={index === step ? "active" : ""} />)}</div>
        <div className="onboarding-actions">
          <button className="metro-button" disabled={step === 0} onClick={onBack}>上一步</button>
          <button ref={nextButton} className="metro-button primary" onClick={onNext}>{step === onboardingSteps.length - 1 ? "開始使用" : "下一步"}</button>
        </div>
      </section>
    </div>
  );
}

function SettingChoice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button className={`metro-choice${selected ? " selected" : ""}`} aria-pressed={selected} onClick={onClick}>{label}</button>;
}

function ToggleSetting({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="toggle-setting"><div><strong>{title}</strong><small>{subtitle}</small></div><button className={`metro-switch${checked ? " checked" : ""}`} role="switch" aria-checked={checked} aria-label={title} onClick={() => onChange(!checked)}><span/></button></div>;
}

function StoreTiles({ stores, queues, pins, onTogglePin, single = false, variant = "search" }: { stores: Store[]; queues: Record<number, Queue>; pins: number[]; onTogglePin: (id: number) => void; single?: boolean; variant?: "home" | "search" }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressClickId = useRef<number | null>(null);
  const pressStart = useRef<{ id: number; x: number; y: number } | null>(null);

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    pressStart.current = null;
  };

  useEffect(() => () => cancelLongPress(), []);

  const openMenu = (id: number) => {
    suppressClickId.current = id;
    setMenuId(id);
    window.setTimeout(() => {
      if (suppressClickId.current === id) suppressClickId.current = null;
    }, 900);
  };

  const startLongPress = (event: ReactPointerEvent, id: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelLongPress();
    pressStart.current = { id, x: event.clientX, y: event.clientY };
    longPressTimer.current = window.setTimeout(() => openMenu(id), 600);
  };

  const moveLongPress = (event: ReactPointerEvent, id: number) => {
    const start = pressStart.current;
    if (!start || start.id !== id) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelLongPress();
  };

  const toggleExpanded = (id: number) => {
    if (suppressClickId.current === id) {
      suppressClickId.current = null;
      return;
    }
    setMenuId(null);
    setExpandedId((current) => current === id ? null : id);
  };

  const handleKey = (event: ReactKeyboardEvent, id: number) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openMenu(id);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpanded(id);
    }
  };

  return <div className={`tiles${single ? " single" : ""}`}>{stores.map((store, index) => {
    const queue = queues[store.id];
    const latest = queue?.currentNumbers?.join(" · ") || "—";
    const currentNumber = queue?.currentNumbers?.[0] ?? "—";
    const otherNumbers = queue
      ? queue.currentNumbers.slice(1).join("  ") || "沒有其他叫號"
      : "暫時沒有叫號資料";
    const expanded = expandedId === store.id;
    const pinned = pins.includes(store.id);
    return <div className="tile-wrap" key={store.id}>
      <div
        className={`tile${expanded ? " expanded" : ""}`}
        style={{ ...tilePattern(store.id), "--tile-delay": `${Math.min(index, 8) * 34}ms` } as CSSProperties}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${store.name}，點按展開，長按${pinned ? "取消釘選" : "釘選到 home"}`}
        title={`點擊展開；長按${pinned ? "取消釘選" : "釘選到 home"}`}
        onClick={() => toggleExpanded(store.id)}
        onKeyDown={(event) => handleKey(event, store.id)}
        onPointerDown={(event) => startLongPress(event, store.id)}
        onPointerMove={(event) => moveLongPress(event, store.id)}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onDragStart={(event) => event.preventDefault()}
        onContextMenu={(event) => { event.preventDefault(); openMenu(store.id); }}
      >
        <h3>{store.name}</h3><p className="district">{store.district}{pinned && variant !== "home" ? " · 已釘選" : ""}</p>
        {variant === "home" ? (
          <>
            <div className="numbers home-numbers">
              <div><strong>{currentNumber}</strong><small>現正叫號</small></div>
              <div className="home-wait"><strong>{store.waitingGroups ?? "—"}</strong><small>輪候組數</small></div>
            </div>
            {expanded ? <div className="home-tile-detail"><span>{otherNumbers}</span><span>{formatQueueTime(queue)}</span></div> : null}
          </>
        ) : (
          <>
            <div className="numbers"><div><strong>{store.waitingGroups ?? "—"}</strong><br/><small>輪候組數</small></div><span>最新叫號<br/>{latest}</span></div>
            {expanded ? <div className="tile-detail"><span>{store.address || "地址資料暫缺"}</span><span>{store.isOpen === false ? "目前休息" : queue?.stale ? "顯示快取資料" : "已展開"}</span></div> : null}
          </>
        )}
      </div>
      {menuId === store.id ? <div className="tile-menu" role="menu">
        <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); onTogglePin(store.id); setMenuId(null); }}>{pinned ? "取消釘選" : "釘選到 home"}</button>
        <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); setMenuId(null); }}>取消</button>
      </div> : null}
    </div>;
  })}</div>;
}

function formatQueueTime(queue: Queue | undefined): string {
  if (!queue) return "尚未更新";
  const time = new Intl.DateTimeFormat("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false }).format(queue.fetchedAt);
  return `${time} 更新`;
}

function tilePattern(id: number): CSSProperties {
  const variants = [
    ["64%", "-32%", "-8%", "68%", "17deg"],
    ["-26%", "34%", "54%", "18%", "-12deg"],
    ["42%", "-48%", "-18%", "66%", "28deg"],
    ["8%", "52%", "62%", "-8%", "42deg"],
  ];
  const [shapeX, shapeY, barX, barY, rotation] = variants[Math.abs(id) % variants.length];
  return {
    "--shape-x": shapeX,
    "--shape-y": shapeY,
    "--bar-x": barX,
    "--bar-y": barY,
    "--shape-rotation": rotation,
  } as CSSProperties;
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
