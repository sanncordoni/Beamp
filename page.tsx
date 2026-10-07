import Dashboard from "@/components/Dashboard";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);

  return (
    <main className="min-h-screen bg-[#F6F7F9] px-5 py-12 text-[#12151C]">
      <div className="mx-auto max-w-xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">Con Luka</h1>
            <p className="mt-2 text-zinc-600">Servidor freeroam de BeamNG.drive para el grupo.</p>
          </div>
          {session ? (
            <a href="/api/auth/signout" className="text-sm text-zinc-500 hover:text-zinc-900">
              Salir{isAdmin ? " (admin)" : ""}
            </a>
          ) : (
            <a href="/api/auth/signin" className="text-sm text-zinc-500 hover:text-zinc-900">
              Admin
            </a>
          )}
        </div>

        <div className="mt-8">
          <Dashboard isAdmin={isAdmin} />
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Cómo entrar</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-700">
            <li>Encendé el servidor desde esta página y esperá a que diga &quot;Encendido&quot;.</li>
            <li>En BeamNG.drive, andá a Multijugador y elegí conexión directa con la dirección de arriba.</li>
            <li>Si el servidor tiene mods, se descargan solos la primera vez.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
