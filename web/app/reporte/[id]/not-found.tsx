import Link from "next/link";

export default function ReporteNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="text-5xl">🤷</div>
      <div>
        <h1 className="text-xl font-bold text-gray-800">Reporte no encontrado</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xs">
          Este reporte no existe o no tienes acceso a él.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="px-6 py-3 rounded-2xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
