import { useState, useEffect, useRef } from "react";
import { detectUserLocation, fetchKelurahan, fetchOpenMeteo, fetchTma, fetchNearbyKelurahan, type WeatherData, type UserLocation, type NearbyKelurahan } from "./weather";
import {
  Pengguna, Perangkat, LanggananNotifikasi, Notifikasi, Wilayah, DataCuaca, AmbangRisiko, LevelRisiko, Rekomendasi, PersiapanDini, InformasiModel,
} from './uml';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ── Data ──────────────────────────────────────────────────────────────────────



const PREPARATION: Record<string, { checks: string[]; shelters: { nama: string; kapasitas: string; jarak: string }[] }> = {
  "Risiko Rendah": {
    checks: [
      "Pantau prakiraan cuaca Open-Meteo secara berkala",
      "Simpan nomor darurat BPBD di ponsel Anda",
      "Periksa saluran air sekitar rumah agar tidak tersumbat",
    ],
    shelters: [
      { nama: "Balai RW 04 Bausasran", kapasitas: "80 orang", jarak: "350 m" },
      { nama: "SDN Prawirodirjan 1", kapasitas: "200 orang", jarak: "600 m" },
    ],
  },
  "Risiko Sedang": {
    checks: [
      "Pantau peringatan risiko setiap 2–3 jam sekali",
      "Amankan dokumen penting (KTP, KK, ijazah, surat berharga) dalam wadah kedap air",
      "Siapkan tas siaga darurat berisi obat, senter, dan pakaian ganti",
      "Pindahkan barang elektronik dan perabot ke tempat lebih tinggi",
      "Informasikan kondisi ini kepada anggota keluarga dan tetangga terdekat",
    ],
    shelters: [
      { nama: "Gedung DPRD Kota Yogyakarta", kapasitas: "300 orang", jarak: "1.2 km" },
      { nama: "SMP N 5 Yogyakarta", kapasitas: "250 orang", jarak: "800 m" },
      { nama: "Masjid Gedhe Kauman", kapasitas: "500 orang", jarak: "1.5 km" },
    ],
  },
  "Risiko Tinggi": {
    checks: [
      "SEGERA evakuasi ke titik kumpul terdekat — jangan tunggu air naik",
      "Matikan listrik dan gas sebelum meninggalkan rumah",
      "Bawa tas siaga, dokumen penting, dan obat-obatan rutin",
      "Jangan menerobos genangan air >30 cm dengan kendaraan",
      "Hubungi BPBD Kota Yogyakarta: ☎ 0274-555-858",
      "Bantu tetangga lansia dan anak-anak dalam proses evakuasi",
    ],
    shelters: [
      { nama: "Stadion Mandala Krida", kapasitas: "2.000 orang", jarak: "2.1 km" },
      { nama: "GOR Among Rogo", kapasitas: "1.500 orang", jarak: "1.8 km" },
      { nama: "Balai Kota Yogyakarta", kapasitas: "400 orang", jarak: "1.3 km" },
      { nama: "SMK N 2 Yogyakarta", kapasitas: "350 orang", jarak: "900 m" },
    ],
  },
};

const RISK_TABS = ["Risiko Rendah", "Risiko Sedang", "Risiko Tinggi"] as const;

const NOTIFIKASI_INIT: { id: number; level: string; judul: string; pesan: string; waktu: string; dibaca: boolean; signature?: string }[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusPill(status: string) {
  if (status === "Bahaya") return "bg-red-900/80 text-red-300 border border-red-700/50";
  if (status === "Siaga") return "bg-amber-900/70 text-amber-300 border border-amber-700/40";
  if (status === "Waspada") return "bg-blue-900/70 text-blue-300 border border-blue-700/40";
  return "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40";
}

function notifBar(level: string) {
  if (level === "Bahaya") return "bg-red-500";
  if (level === "Siaga") return "bg-amber-500";
  return "bg-blue-500";
}

function barColor(mm: number) {
  if (mm >= 45) return "#f59e0b";
  if (mm >= 20) return "#60a5fa";
  return "#374151";
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function DonutRisk({ pct }: { pct: number }) {
  const r = 60;
  const cx = 80;
  const cy = 80;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1f2937" strokeWidth={18} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={18}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#f1f5f9" fontSize={26} fontWeight={700} fontFamily="Inter,sans-serif">
        {pct}%
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize={11} fontFamily="Inter,sans-serif">
        skor risiko
      </text>
    </svg>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<typeof RISK_TABS[number]>("Risiko Sedang");
  const [checks, setChecks] = useState<Record<string, boolean[]>>({
    "Risiko Rendah": [false, false, false],
    "Risiko Sedang": [false, false, false, false, false],
    "Risiko Tinggi": [false, false, false, false, false, false],
  });
  const [notifs, setNotifs] = useState(NOTIFIKASI_INIT);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifSettings, setNotifSettings] = useState({
    bahaya: true,
    siaga: true,
    pengungsian: false,
  });
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [kelurahan, setKelurahan] = useState("Mendeteksi lokasi...");
  const [nearbyKelurahan, setNearbyKelurahan] = useState<NearbyKelurahan[]>([]);
  const [tma, setTma] = useState<{ station: string; tma: number; unit: string; observedAt: string | null; source: string } | null>(null);
  const [dataError, setDataError] = useState("");
  const [riskLevel, setRiskLevel] = useState("Aman");
  const [riskScore, setRiskScore] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Objek domain mengikuti Class Diagram UML. React hanya menjadi lapisan UI.
  const pengguna = useRef(new Pengguna("USR-001")).current;
  const perangkat = useRef(new Perangkat("DEV-001", "Browser", navigator.userAgent, "")).current;
  const langganan = useRef(new LanggananNotifikasi("SUB-001")).current;
  const domainNotif = useRef(new Notifikasi("NOTIF-001", langganan.idLangganan, "", "")).current;
  const domainCuaca = useRef(new DataCuaca("CUACA-001", "AUTO")).current;
  const levelRisiko = useRef(new LevelRisiko("RISK-001")).current;

  const loadData = async () => {
    try {
      setDataError("");
      const location = await detectUserLocation();
      setUserLocation(location);

      // Data utama tidak bergantung pada TMA. Jika sumber TMA gagal,
      // aplikasi tetap menampilkan data cuaca tanpa membuat nilai TMA palsu.
      const [weatherData, wilayah, nearby] = await Promise.all([
        domainCuaca.ambilDataDariAPI(location.latitude, location.longitude),
        fetchKelurahan(location.latitude, location.longitude),
        fetchNearbyKelurahan(location.latitude, location.longitude),
      ]);

      pengguna.aturLokasi(wilayah);
      domainCuaca.simpanData(weatherData);
      levelRisiko.hitungLevelRisiko(domainCuaca);
      setRiskLevel(levelRisiko.lihatRisiko());
      setRiskScore(levelRisiko.skorRisiko);
      setWeather(weatherData);
      setKelurahan(wilayah);
      setNearbyKelurahan(nearby);

      try {
        const tmaData = await fetchTma();
        setTma(tmaData);
      } catch {
        setTma(null);
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Gagal mengambil data");
    }
  };

  useEffect(() => {
    loadData();
    const t = setInterval(() => {
      setTime(new Date());
      loadData();
    }, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifs.filter(n => !n.dibaca).length;

  function toggleCheck(tab: string, i: number) {
    setChecks(prev => {
      const arr = [...prev[tab]];
      arr[i] = !arr[i];
      return { ...prev, [tab]: arr };
    });
  }

  function dismissNotif(id: number) {
    setNotifs(n => n.filter(x => x.id !== id));
  }

  function markRead(id: number) {
    setNotifs(n => n.map(x => x.id === id ? { ...x, dibaca: true } : x));
  }

  const prepData = PREPARATION[activeTab];
  const hourlyPrediction = weather?.hourly ?? [];
  const currentRain = weather?.current.precipitation ?? 0;
  const peakRain = hourlyPrediction.length ? Math.max(...hourlyPrediction.map(x => x.mm)) : 0;
  // Indikator risiko otomatis berdasarkan data Open-Meteo pada titik dashboard.
  // Ini adalah indikator aplikasi, bukan status resmi BPBD/BBWS.
  const rainProb = weather?.current.precipitationProbability ?? 0;
  const riskPct = riskScore || Math.min(95, Math.round(Math.min(100, currentRain * 8 + peakRain * 1.2 + rainProb * 0.25)));
  const riskLabel = riskLevel || "Aman";
  const riskBg = riskLabel === "Bahaya" ? "#7f1d1d" : riskLabel === "Siaga" ? "#78350f" : riskLabel === "Waspada" ? "#1e3a8a" : "#064e3b";
  const riskColor = riskLabel === "Bahaya" ? "#fca5a5" : riskLabel === "Siaga" ? "#fbbf24" : riskLabel === "Waspada" ? "#93c5fd" : "#6ee7b7";

  // Notifikasi dibuat dari data API terbaru, bukan data statis.
  useEffect(() => {
    if (!weather) return;
    const enabled = riskLabel === "Bahaya" ? notifSettings.bahaya : (riskLabel === "Siaga" || riskLabel === "Waspada") ? notifSettings.siaga : false;
    if (!enabled) return;

    const nowLabel = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    const peakText = `${peakRain.toFixed(1)} mm/jam`;
    const title = riskLabel === "Bahaya"
      ? "Indikator Risiko Bahaya"
      : riskLabel === "Siaga"
        ? "Indikator Risiko Siaga"
        : "Indikator Risiko Waspada";
    const message = `Open-Meteo: hujan saat ini ${currentRain.toFixed(1)} mm, probabilitas ${Math.round(rainProb)}%, dan puncak prakiraan 12 jam ${peakText}.`;
    const signature = `${riskLabel}|${currentRain.toFixed(1)}|${Math.round(rainProb)}|${peakRain.toFixed(1)}`;

    pengguna.aturNotifikasi(true)
    langganan.aktifkan()
    domainNotif.judul = title
    domainNotif.pesan = message
    domainNotif.waktuKirim = new Date()
    domainNotif.buatNotifikasi()
    setNotifs(prev => {
      const latest = prev[0];
      if (latest?.signature === signature) return prev;
      const item = { id: Date.now(), level: riskLabel, judul: title, pesan: message, waktu: nowLabel, dibaca: false, signature };
      domainNotif.kirimNotifikasi()
      return [item, ...prev].slice(0, 20);
    });
  }, [weather, riskLabel, currentRain, rainProb, peakRain, notifSettings.bahaya, notifSettings.siaga]);

  return (
    <div className="min-h-full" style={{ background: "#0b0f1a" }}>
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 xl:px-8 py-3 xl:py-4" style={{ background: "#0b0f1a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: "rgba(96,165,250,0.2)" }}>
            🌧
          </div>
          <span className="text-xl font-bold tracking-tight">SIAPBANJIR</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)", color: "#cbd5e1" }}>
            <span>📍</span>
            <span>{kelurahan}</span>
          </div>
          <div className="relative" ref={panelRef}>
            <button
              onClick={() => setShowNotifPanel(v => !v)}
              className="relative w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.07)" }}
            >
              <span className="text-lg">🔔</span>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center bg-red-500 text-white blink">
                  {unread}
                </span>
              )}
            </button>

            {/* Notification dropdown */}
            {showNotifPanel && (
              <div className="absolute right-0 top-12 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden slide-in" style={{ background: "#161d2e", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="font-semibold text-sm">Notifikasi</span>
                  {unread > 0 && <span className="text-xs text-amber-400">{unread} baru</span>}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-center text-sm py-8" style={{ color: "#64748b" }}>Tidak ada notifikasi</p>
                  ) : notifs.map(n => (
                    <div key={n.id} className={`relative flex gap-3 px-4 py-3 transition-colors ${n.dibaca ? "opacity-50" : ""}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${notifBar(n.level)}`} />
                      <div className="flex-1 min-w-0 pl-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold truncate" style={{ color: n.level === "Bahaya" ? "#f87171" : n.level === "Siaga" ? "#fbbf24" : "#60a5fa" }}>
                            {n.level}
                          </span>
                          {!n.dibaca && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                        </div>
                        <p className="text-xs font-medium truncate" style={{ color: "#e2e8f0" }}>{n.judul}</p>
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#64748b" }}>{n.pesan}</p>
                        <p className="text-xs mt-1" style={{ color: "#475569" }}>{n.waktu} WIB</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {!n.dibaca && (
                          <button onClick={() => markRead(n.id)} className="text-xs px-2 py-0.5 rounded transition-colors hover:text-blue-300" style={{ color: "#64748b" }}>✓</button>
                        )}
                        <button onClick={() => dismissNotif(n.id)} className="text-xs px-2 py-0.5 rounded transition-colors hover:text-red-400" style={{ color: "#475569" }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-[1440px] mx-auto px-5 lg:px-8 py-6 xl:py-7 grid grid-cols-1 lg:grid-cols-2 gap-5 xl:gap-6 [&>div:nth-of-type(1)]:h-full [&>div:nth-of-type(2)]:h-full [&>div:nth-of-type(3)]:h-full [&>div:nth-of-type(4)]:h-full [&>section]:lg:col-span-2 [&>p:last-child]:lg:col-span-2">

        {/* RISK CARD */}
        <div className="rounded-2xl p-5 xl:p-6" style={{ background: "#161d2e" }}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Donut */}
            <div className="flex flex-col items-center shrink-0">
              <DonutRisk pct={riskPct} />
              <span className="mt-1 px-4 py-1 rounded-full text-sm font-semibold" style={{ background: riskBg, color: riskColor }}>
                {riskLabel}
              </span>
            </div>
            {/* Stats grid */}
            <div className="flex-1 grid grid-cols-2 gap-y-5 gap-x-4 w-full">
              {[
                { label: "Curah hujan saat ini", value: currentRain.toFixed(1), unit: "mm" },
                { label: "Prediksi puncak 6 jam", value: peakRain.toFixed(1), unit: "mm" },
                { label: "Tinggi muka air sungai", value: tma ? tma.tma.toFixed(2) : "—", unit: "m" },
                { label: "Kelembaban tanah", value: weather ? `${Math.round(weather.current.soilMoisture * 100)}` : "—", unit: "%" },
              ].map(s => (
                <div key={s.label}>
                  <p className="text-xs mb-1" style={{ color: "#94a3b8" }}>{s.label}</p>
                  <p className="text-2xl font-bold leading-none">
                    {s.value}
                    <span className="text-sm font-normal ml-1" style={{ color: "#94a3b8" }}>{s.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BAR CHART */}
        <div className="rounded-2xl p-5 xl:p-6" style={{ background: "#161d2e" }}>
          <p className="font-semibold mb-4">Prediksi intensitas 12 jam ke depan</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={hourlyPrediction} barCategoryGap="20%">
              <XAxis dataKey="jam" tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={false}
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#f1f5f9", fontSize: 12 }}
                formatter={(v: number) => [`${v} mm/jam`, "Curah hujan"]}
              />
              <Bar dataKey="mm" radius={[4, 4, 0, 0]}>
                {hourlyPrediction.map((d, i) => (
                  <Cell key={i} fill={barColor(d.mm)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-5 mt-3">
            {[
              { color: "#f59e0b", label: "Tinggi (≥45 mm)" },
              { color: "#60a5fa", label: "Sedang (20–44 mm)" },
              { color: "#374151", label: "Rendah (<20 mm)" },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                <span className="text-xs" style={{ color: "#64748b" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* STATUS WILAYAH */}
        <div>
          <p className="font-semibold mb-3">Status wilayah terdampak</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: "#161d2e" }}>
            <div className="px-5 py-4">
              {nearbyKelurahan.length > 0 ? nearbyKelurahan.map((wilayah, index) => (
                <div key={`${wilayah.name}-${index}`} className="py-3 border-t border-slate-800 first:border-t-0 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold block truncate">{wilayah.name}</span>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{
                      background: wilayah.risk === "Bahaya" ? "rgba(239,68,68,0.16)" : wilayah.risk === "Siaga" ? "rgba(245,158,11,0.16)" : wilayah.risk === "Waspada" ? "rgba(96,165,250,0.16)" : "rgba(52,211,153,0.14)",
                      color: wilayah.risk === "Bahaya" ? "#fca5a5" : wilayah.risk === "Siaga" ? "#fbbf24" : wilayah.risk === "Waspada" ? "#93c5fd" : "#6ee7b7",
                    }}
                  >
                    {wilayah.risk}
                  </span>
                </div>
              )) : (
                <div className="py-4 text-sm" style={{ color: "#64748b" }}>{kelurahan}</div>
              )}
            </div>
          </div>
        </div>

        {/* LANGKAH PERSIAPAN DINI */}
        <div>
          <p className="font-semibold mb-3">Langkah persiapan dini</p>
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "#161d2e" }}>
            <p className="text-sm" style={{ color: "#64748b" }}>
              Rekomendasi tindakan otomatis, menyesuaikan tingkat risiko wilayah Anda saat ini.
            </p>

            {/* Tabs */}
            <div className="grid grid-cols-3 rounded-xl overflow-hidden" style={{ background: "#0f1623" }}>
              {RISK_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="py-2.5 text-xs font-medium transition-all duration-200"
                  style={{
                    background: activeTab === tab ? "#78350f" : "transparent",
                    color: activeTab === tab ? "#fbbf24" : "#64748b",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Checklist */}
            <div className="space-y-3">
              {prepData.checks.map((item, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer group">
                  <button
                    onClick={() => toggleCheck(activeTab, i)}
                    className="mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: checks[activeTab][i] ? "#f59e0b" : "transparent",
                      border: `1.5px solid ${checks[activeTab][i] ? "#f59e0b" : "#78350f"}`,
                    }}
                  >
                    {checks[activeTab][i] && <span className="text-black text-xs font-bold">✓</span>}
                  </button>
                  <span
                    className="text-sm leading-relaxed transition-colors"
                    style={{ color: checks[activeTab][i] ? "#64748b" : "#e2e8f0", textDecoration: checks[activeTab][i] ? "line-through" : "none" }}
                  >
                    {item}
                  </span>
                </label>
              ))}
            </div>

            {/* Titik Pengungsian */}
            <div className="mt-2 rounded-xl p-4" style={{ background: "#0f1623", border: "1px solid rgba(245,158,11,0.2)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🏕</span>
                <p className="text-sm font-semibold" style={{ color: "#fbbf24" }}>Titik Pengungsian Terdekat</p>
              </div>
              <div className="space-y-2.5">
                {prepData.shelters.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs shrink-0" style={{ color: "#f59e0b" }}>📍</span>
                      <p className="text-sm truncate" style={{ color: "#e2e8f0" }}>{s.nama}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs" style={{ color: "#64748b" }}>{s.kapasitas}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                        {s.jarak}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: "#475569" }}>
                * Kapasitas berdasarkan data BPBD Kota Yogyakarta. Hubungi ☎ 0274-555-858 untuk info terkini.
              </p>
            </div>
          </div>
        </div>

        {/* PUSAT PENGATURAN NOTIFIKASI BAHAYA */}
        <section className="rounded-2xl p-5" style={{ background: "#161d2e", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="font-semibold text-base">Pusat Pengaturan Notifikasi Bahaya</p>
              <p className="text-xs mt-1" style={{ color: "#64748b" }}>Sesuaikan kanal peringatan bencana banjir instan langsung ke perangkat seluler Anda.</p>
            </div>
            <span className="shrink-0 text-[10px] font-semibold px-3 py-1.5 rounded-full" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}>
              • Notifikasi Aktif
            </span>
          </div>

          <div className="space-y-3">
            {[
              { key: "bahaya", title: "Peringatan Bahaya Tinggi (Bahaya)", desc: "Dapatkan notifikasi saat indikator risiko SiapBanjir mencapai status Bahaya berdasarkan data cuaca terbaru.", icon: "🔔" },
              { key: "siaga", title: "Peringatan Siaga & Waspada", desc: "Informasi indikator Siaga/Waspada berdasarkan curah hujan, prakiraan, dan data TMA SIH3.", icon: "🔔" },
              { key: "pengungsian", title: "Update Titik Pengungsian", desc: "Belum terhubung ke sumber data posko/pengungsian realtime.", icon: "🔕" },
            ].map((item) => {
              const enabled = notifSettings[item.key as keyof typeof notifSettings];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setNotifSettings(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-4 text-left transition-all"
                  style={{
                    background: "#111827",
                    border: `1px solid ${enabled ? "rgba(16,185,129,0.75)" : "rgba(255,255,255,0.07)"}`,
                  }}
                  aria-pressed={enabled}
                >
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: enabled ? "rgba(16,185,129,0.12)" : "rgba(71,85,105,0.25)", color: enabled ? "#10b981" : "#64748b" }}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold" style={{ color: "#e2e8f0" }}>{item.title}</span>
                    <span className="block text-xs mt-1 leading-relaxed" style={{ color: "#64748b" }}>{item.desc}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="hidden sm:block text-[10px] font-semibold" style={{ color: enabled ? "#10b981" : "#64748b" }}>{enabled ? "MENERIMA" : "TIDAK MENERIMA"}</span>
                    <span className="relative w-10 h-6 rounded-full transition-colors" style={{ background: enabled ? "#10b981" : "#334155" }}>
                      <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: enabled ? "22px" : "4px" }} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* INFORMASI TAMBAHAN */}
        

        {/* FOOTER */}
      

        {/* Update timestamp */}
        <div className="lg:col-span-2 pb-6 text-center space-y-1">
          <p className="text-xs" style={{ color: dataError ? "#f87171" : "#334155" }}>
            {dataError ? dataError : `Data diperbarui pukul ${time.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB`}
          </p>
          {tma && <p className="text-[11px]" style={{ color: "#475569" }}>TMA: {tma.station} · {tma.observedAt ?? "waktu pengamatan tersedia di SIH3"}</p>}
          <p className="text-[11px]" style={{ color: "#334155" }}>Sumber cuaca: Open-Meteo · Sumber TMA: SIH3 BBWS Serayu Opak</p>
        </div>
      </main>
    </div>
  );
}
