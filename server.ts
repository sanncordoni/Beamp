import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.env.BEAM_DIR ?? process.cwd();
const EXE =
  process.env.BEAM_EXE ?? (process.platform === "win32" ? "BeamMP-Server.exe" : "./BeamMP-Server");
const TOKEN = process.env.AGENT_TOKEN ?? "";
const IDLE_MIN = Number(process.env.IDLE_MINUTES ?? 10);
const CLIENT = path.join(ROOT, "Resources", "Client");
const LIB = path.join(ROOT, "mods-library"); // acá van TODOS tus .zip
const CONF = path.join(ROOT, "ServerConfig.toml");
const DB = path.join(ROOT, "agent-state.json");

type Player = { sessions: number; minutes: number };
type State = {
  maps: { id: string; label: string }[];
  enabledMods: string[];
  stats: { sessions: number; peak: number; players: Record<string, Player> };
};

const state: State = fs.existsSync(DB)
  ? JSON.parse(fs.readFileSync(DB, "utf8"))
  : { maps: [{ id: "italy", label: "Italia" }], enabledMods: [], stats: { sessions: 0, peak: 0, players: {} } };
const save = () => fs.writeFileSync(DB, JSON.stringify(state, null, 2));

let child: ReturnType<typeof spawn> | null = null;
let ready = false;
let map: string | null = null;
let withMods: boolean | null = null;
let idleSince = Date.now();
const online = new Map<string, number>();

function leave(name: string) {
  const since = online.get(name);
  if (since === undefined) return;
  online.delete(name);
  const p = (state.stats.players[name] ??= { sessions: 0, minutes: 0 });
  p.minutes += (Date.now() - since) / 60000;
  if (!online.size) idleSince = Date.now();
  save();
}

function onLine(line: string) {
  if (line.includes("ALL SYSTEMS STARTED")) {
    ready = true;
    idleSince = Date.now();
  }
  let m = line.match(/Assigned ID \d+ to (.+?)\s*$/);
  if (m) {
    online.set(m[1], Date.now());
    const p = (state.stats.players[m[1]] ??= { sessions: 0, minutes: 0 });
    p.sessions++;
    state.stats.sessions++;
    state.stats.peak = Math.max(state.stats.peak, online.size);
    save();
    return;
  }
  m = line.match(/\[INFO\] (.+) Connection Terminated/);
  if (m) leave(m[1]);
}

function start(mapId: string, mods: boolean) {
  if (child) throw new Error("El servidor ya está encendido");
  if (!state.maps.some((m) => m.id === mapId)) throw new Error("Mapa no permitido");

  // Solo cambia el nombre del nivel dentro de Map = "/levels/<nombre>/info.json"
  const conf = fs
    .readFileSync(CONF, "utf8")
    .replace(/Map = "\/levels\/[^/"]+\/info\.json"/, `Map = "/levels/${mapId}/info.json"`);
  fs.writeFileSync(CONF, conf);

  // Resources/Client queda vacío (sin mods) o con enlaces a los mods habilitados
  fs.mkdirSync(CLIENT, { recursive: true });
  for (const f of fs.readdirSync(CLIENT)) {
    if (fs.existsSync(path.join(LIB, f))) fs.unlinkSync(path.join(CLIENT, f));
  }
  if (mods) {
    for (const f of state.enabledMods) {
      const src = path.join(LIB, f);
      const dst = path.join(CLIENT, f);
      if (!fs.existsSync(src)) continue;
      try {
        fs.linkSync(src, dst);
      } catch {
        fs.copyFileSync(src, dst);
      }
    }
  }

  map = mapId;
  withMods = mods;
  ready = false;
  online.clear();
  idleSince = Date.now();

  const proc = spawn(EXE, [], { cwd: ROOT });
  child = proc;
  let buf = "";
  proc.stdout?.on("data", (d) => {
    buf += d;
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(onLine);
  });
  const end = () => {
    for (const n of [...online.keys()]) leave(n);
    child = null;
    ready = false;
    map = null;
    withMods = null;
  };
  proc.on("exit", end);
  proc.on("error", end);
}

function stop() {
  const c = child;
  if (!c) return;
  c.stdin?.write("exit\n");
  setTimeout(() => c.kill(), 5000);
}

// Apagado automático: sin jugadores durante IDLE_MINUTES
setInterval(() => {
  if (child && ready && !online.size && Date.now() - idleSince > IDLE_MIN * 60000) stop();
}, 30000);

const listMods = () =>
  fs.existsSync(LIB)
    ? fs
        .readdirSync(LIB)
        .filter((f) => f.endsWith(".zip"))
        .map((f) => ({
          name: f,
          mb: Math.round(fs.statSync(path.join(LIB, f)).size / 1e6),
          enabled: state.enabledMods.includes(f),
        }))
    : [];

const send = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    if (!TOKEN || req.headers.authorization !== `Bearer ${TOKEN}`) {
      return send(res, 401, { error: "No autorizado" });
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      let raw = "";
      for await (const c of req) raw += c;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        /* cuerpo vacío */
      }
    }
    try {
      switch (`${req.method} ${url.pathname}`) {
        case "GET /status":
          return send(res, 200, {
            running: !!child,
            ready,
            map,
            mods: withMods,
            players: [...online.keys()],
            idleMinutes: IDLE_MIN,
          });
        case "POST /start":
          start(String(body.map), Boolean(body.mods));
          return send(res, 200, { ok: true });
        case "POST /stop":
          stop();
          return send(res, 200, { ok: true });
        case "GET /maps":
          return send(res, 200, state.maps);
        case "POST /maps": {
          const id = String(body.id ?? "");
          if (!/^[a-z0-9_]+$/i.test(id)) throw new Error("ID de mapa inválido");
          if (!state.maps.some((m) => m.id === id)) {
            state.maps.push({ id, label: String(body.label || id) });
          }
          save();
          return send(res, 200, state.maps);
        }
        case "DELETE /maps":
          state.maps = state.maps.filter((m) => m.id !== url.searchParams.get("id"));
          save();
          return send(res, 200, state.maps);
        case "GET /mods":
          return send(res, 200, listMods());
        case "POST /mods": {
          const name = String(body.name ?? "");
          if (path.basename(name) !== name) throw new Error("Nombre inválido");
          state.enabledMods = body.enabled
            ? [...new Set([...state.enabledMods, name])]
            : state.enabledMods.filter((x) => x !== name);
          save();
          return send(res, 200, listMods());
        }
        case "GET /stats": {
          const all = Object.entries(state.stats.players).map(([name, p]) => ({ name, ...p }));
          return send(res, 200, {
            sessions: state.stats.sessions,
            peak: state.stats.peak,
            hours: all.reduce((s, p) => s + p.minutes, 0) / 60,
            top: all.sort((a, b) => b.minutes - a.minutes).slice(0, 5),
          });
        }
      }
      send(res, 404, { error: "No existe" });
    } catch (e) {
      send(res, 400, { error: (e as Error).message });
    }
  })
  .listen(Number(process.env.AGENT_PORT ?? 8787), "127.0.0.1");
