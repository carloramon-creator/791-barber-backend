export default function HealthCheck() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-8 font-sans bg-slate-900 text-white">
            <h1 className="text-4xl font-bold mb-4">791 Barber Backend</h1>
            <p className="text-slate-400 text-lg">Status: Operacional</p>
            <div className="mt-8 p-4 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-sm font-mono">API Multi-tenant - Next.js 15 + Supabase</p>
            </div>
        </div>
    );
}
