import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lo que puede hacer cualquiera sin iniciar sesión
const PUBLIC = ["GET status", "GET maps", "GET mods", "GET stats", "POST start"];

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;

  if (!PUBLIC.includes(`${req.method} ${path[0]}`)) {
    const session = await auth();
    const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
    if (!isAdmin) return Response.json({ error: "Solo para admins" }, { status: 403 });
  }

  const search = new URL(req.url).search;
  const hasBody = req.method === "POST";
  const res = await fetch(`${process.env.AGENT_URL}/${path.join("/")}${search}`, {
    method: req.method,
    headers: {
      authorization: `Bearer ${process.env.AGENT_TOKEN}`,
      "content-type": "application/json",
    },
    body: hasBody ? await req.text() : undefined,
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  }).catch(() => null);

  if (!res) return Response.json({ error: "Sin conexión con el anfitrión", offline: true }, { status: 502 });
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json" } });
}

export { proxy as GET, proxy as POST, proxy as DELETE };
