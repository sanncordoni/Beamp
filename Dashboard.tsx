"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { animate } from "animejs";

type Status = {
  running: boolean;
  ready: boolean;
  map: string | null;
  mods: boolean | null;
  players: string[];
  idleMinutes: number;
  offline?: boolean;
  error?: string;
};
type MapItem = { id: string; label: string };
type ModItem = { name: string; mb: number; enabled: boolean };
type Stats = {
  sessions: number;
  peak: number;
  hours: number;
  top: { name: string; minutes: number; sessions: number }[];
};
type Phase = "checking" | "unreachable" | "offline" | "starting" | "online";

const ADDRESS = process.env.NEXT_PUBLIC_SERVER_ADDRESS ?? "tu-ip:30814";

const label: Record<Phase, string> = {
  checking: "Comprobando",
  unreachable: "Sin conexión con el anfitrión",
  offline: "Apagado",
  starting: "Encendiendo, puede tardar un minuto",
  online: "Encendido, ya podés entrar",
};
const dot: Record<Phase, string> = {
  checking: "bg-zinc-300",
  unreachable: "bg-red-500",
  offline: "bg-zinc-400",
  starting: "bg-amber-500",
  online: "bg-emerald-500",
};

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api/agent/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return res.json().catch(() => ({ error: "Respuesta inválida" }));
}

const card = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";
const input =
  "min-w-0 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";

export default function Dashboard({ isAdmin }: { isAdmin: boolean }) {
  const [st, setSt] = useState<Status | null>(null);
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [mods, setMods] = useState<ModItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [map, setMap] = useState("");
  const [useMods, setUseMods] = useState(true);
  const [msg, setMsg] = useState("");
  const [newMap, setNewMap] = useState({ id: "", label: "" });
  const [copied, setCopied] = useState(false);
  const ring = useRef<HTMLSpanElement>(null);

  const refresh = useCallback(async () => {
    const s = await api<Status>("status");
    setSt(s);
    if (!s.offline) {
      const t = await api<Stats>("stats");
      if (typeof t.sessions === "number") setStats(t);
    }
  }, []);

  const loadLists = useCallback(async () => {
    const [m, d] = await Promise.all([api<MapItem[]>("maps"), api<ModItem[]>("mods")]);
    if (Array.isArray(m)) {
      setMaps(m);
      setMap((cur) => cur || m[0]?.id || "");
    }
    if (Array.isArray(d)) setMods(d);
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, st?.running ? 5000 : 12000);
    return () => clearInterval(id);
  }, [refresh, st?.running]);

  const phase: Phase = !st
    ? "checking"
    : st.offline
      ? "unreachable"
      : st.running
        ? st.ready
          ? "online"
          : "starting"
        : "offline";

  // Anime.js: onda que sale del punto de estado
  useEffect(() => {
    const el = ring.current;
    if (!el || phase === "offline" || phase === "checking" || phase === "unreachable") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anim = animate(el, {
      scale: [1, 2.6],
      opacity: [0.45, 0],
      duration: phase === "starting" ? 900 : 1800,
      ease: "outQuad",
      loop: true,
    });
    return () => {
      anim.revert();
    };
  }, [phase]);

  async function start() {
    setMsg("");
    const r = await api<{ error?: string }>("start", "POST", { map, mods: useMods });
    if (r.error) setMsg(r.error);
    else refresh();
  }
  async function stop() {
    await api("stop", "POST", {});
    refresh();
  }
  async function addMap() {
    const r = await api<MapItem[] | { error: string }>("maps", "POST", newMap);
    if (Array.isArray(r)) {
      setMaps(r);
      setNewMap({ id: "", label: "" });
      setMsg("");
    } else setMsg(r.error);
  }
  async function removeMap(id: string) {
    const r = await api<MapItem[]>(`maps?id=${encodeURIComponent(id)}`, "DELETE");
    if (Array.isArray(r)) {
      setMaps(r);
      setMap((cur) => (r.some((m) => m.id === cur) ? cur : r[0]?.id ?? ""));
    }
  }
  async function toggleMod(m: ModItem) {
    const r = await api<ModItem[]>("mods", "POST", { name: m.name, enabled: !m.enabled });
    if (Array.isArray(r)) setMods(r);
  }
  async function copy() {
    await navigator.clipboard.writeText(ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Estado */}
      <div className={card}>
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span ref={ring} className={`absolute inset-0 rounded-full ${dot[phase]}`} />
            <span className={`relative h-3 w-3 rounded-full ${dot[phase]}`} />
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="font-medium"
            >
              {label[phase]}
            </motion.p>
          </AnimatePresence>
        </div>

        <button
          onClick={copy}
          aria-label="Copiar dirección del servidor"
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-sm transition hover:border-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <span>{ADDRESS}</span>
          <span className="text-xs text-zinc-500">{copied ? "Copiada" : "Copiar"}</span>
        </button>

        {st?.running && (
          <p className="mt-4 text-sm text-zinc-600">
            Mapa {st.map}, {st.mods ? "con mods" : "sin mods"}.{" "}
            {st.players.length
              ? `Jugando: ${st.players.join(", ")}.`
              : `Se apaga solo tras ${st.idleMinutes} min sin jugadores.`}
          </p>
        )}
      </div>

      {/* Lanzador */}
      {phase === "offline" && (
        <div className={card}>
          <h2 className="font-semibold">Encender el servidor</h2>
          <div className="mt-4 grid gap-3">
            <select value={map} onChange={(e) => setMap(e.target.value)} className={input}>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="flex rounded-xl bg-zinc-100 p-1">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setUseMods(v)}
                  className="relative flex-1 rounded-lg px-3 py-2 text-sm"
                >
                  {useMods === v && (
                    <motion.span
                      layoutId="seg"
                      className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    />
                  )}
                  <span className="relative">{v ? "Con mods" : "Sin mods"}</span>
                </button>
              ))}
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={start}
              disabled={!map}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              Encender servidor
            </motion.button>
            {msg && <p className="text-sm text-red-600">{msg}</p>}
          </div>
        </div>
      )}

      {/* Estadísticas */}
      {stats && (
        <div className={card}>
          <h2 className="font-semibold">Estadísticas</h2>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">Sesiones</dt>
              <dd className="text-xl font-semibold">{stats.sessions}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Máximo a la vez</dt>
              <dd className="text-xl font-semibold">{stats.peak}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Horas jugadas</dt>
              <dd className="text-xl font-semibold">{stats.hours.toFixed(1)}</dd>
            </div>
          </dl>
          {stats.top.length > 0 && (
            <ul className="mt-4 divide-y divide-zinc-100 text-sm">
              {stats.top.map((p) => (
                <li key={p.name} className="flex justify-between py-2">
                  <span>{p.name}</span>
                  <span className="text-zinc-500">
                    {(p.minutes / 60).toFixed(1)} h en {p.sessions} sesiones
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Admin */}
      {isAdmin && (
        <div className={`${card} space-y-6`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Panel de admin</h2>
            {st?.running && (
              <button
                onClick={stop}
                className="rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Apagar servidor
              </button>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium">Mapas</h3>
            <ul className="mt-2 divide-y divide-zinc-100 text-sm">
              {maps.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2">
                  <span>
                    {m.label} <span className="font-mono text-xs text-zinc-400">{m.id}</span>
                  </span>
                  <button onClick={() => removeMap(m.id)} className="text-zinc-500 hover:text-red-600">
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <input
                value={newMap.id}
                onChange={(e) => setNewMap({ ...newMap, id: e.target.value })}
                placeholder="Carpeta del nivel"
                className={`${input} flex-1`}
              />
              <input
                value={newMap.label}
                onChange={(e) => setNewMap({ ...newMap, label: e.target.value })}
                placeholder="Nombre visible"
                className={`${input} flex-1`}
              />
              <button onClick={addMap} className="rounded-xl bg-zinc-900 px-3 text-sm text-white">
                Agregar
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium">Mods disponibles con &quot;Con mods&quot;</h3>
            {mods.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                No hay .zip en la carpeta mods-library del anfitrión.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100 text-sm">
                {mods.map((m) => (
                  <li key={m.name} className="flex items-center justify-between py-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={m.enabled} onChange={() => toggleMod(m)} />
                      {m.name}
                    </label>
                    <span className="text-zinc-500">{m.mb} MB</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
