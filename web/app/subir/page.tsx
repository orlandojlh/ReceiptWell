"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Mensajes de espera — el análisis tarda ~20-40s, la espera debe sentirse viva
const ESTADOS_ESPERA = [
  "Leyendo tu boleta…",
  "Identificando productos…",
  "Clasificando según NOVA…",
  "Calculando tu gasto real…",
  "Armando tu plan de mejora…",
  "Casi listo…",
];

type Estado =
  | { tipo: "idle" }
  | { tipo: "preview"; file: File; previewUrl: string }
  | { tipo: "analizando"; mensajeIdx: number }
  | { tipo: "error"; mensaje: string; rechazado?: boolean }
  | { tipo: "duplicado"; reportId: string | null }
  | { tipo: "limite" };

const ACCEPTED_TYPES = "image/*,application/pdf";

export default function SubirPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "idle" });

  const handleFile = useCallback((file: File) => {
    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : "";
    setEstado({ tipo: "preview", file, previewUrl });
  }, []);

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function analizar() {
    if (estado.tipo !== "preview") return;

    // Iniciar ciclo de mensajes
    let idx = 0;
    setEstado({ tipo: "analizando", mensajeIdx: 0 });
    timerRef.current = setInterval(() => {
      idx = Math.min(idx + 1, ESTADOS_ESPERA.length - 1);
      setEstado({ tipo: "analizando", mensajeIdx: idx });
    }, 5000);

    const formData = new FormData();
    formData.append("imagen", estado.file);

    try {
      const res = await fetch("/api/analizar", { method: "POST", body: formData });
      const data = await res.json() as {
        reportId?: string;
        duplicado?: boolean;
        mensaje?: string;
        error?: string;
        rechazado?: boolean;
        motivo?: string;
        limit_reached?: boolean;
      };

      if (timerRef.current) clearInterval(timerRef.current);

      if (res.ok) {
        if (data.duplicado) {
          setEstado({ tipo: "duplicado", reportId: data.reportId ?? null });
        } else if (data.reportId) {
          router.push(`/reporte/${data.reportId}`);
        }
      } else if (res.status === 402 && data.limit_reached) {
        setEstado({ tipo: "limite" });
      } else {
        setEstado({
          tipo: "error",
          mensaje: data.error ?? "Ocurrió un error inesperado.",
          rechazado: data.rechazado,
        });
      }
    } catch {
      if (timerRef.current) clearInterval(timerRef.current);
      setEstado({
        tipo: "error",
        mensaje: "Error de conexión. Revisa tu internet e intenta de nuevo.",
      });
    }
  }

  function reiniciar() {
    if (estado.tipo === "preview") URL.revokeObjectURL(estado.previewUrl);
    setEstado({ tipo: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (estado.tipo === "analizando") {
    return <PantallaEspera mensaje={ESTADOS_ESPERA[estado.mensajeIdx]} />;
  }

  if (estado.tipo === "duplicado") {
    return (
      <div className="flex flex-col items-center gap-6 pt-12 text-center">
        <div className="text-5xl">📋</div>
        <h1 className="text-xl font-bold">Ya analizamos esta boleta</h1>
        <p className="text-gray-500 text-sm">No gastaremos cuota de IA en algo que ya tienes.</p>
        <div className="flex flex-col gap-3 w-full">
          {estado.reportId && (
            <button
              onClick={() => router.push(`/reporte/${estado.reportId}`)}
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
            >
              Ver reporte anterior
            </button>
          )}
          <button
            onClick={reiniciar}
            className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-medium"
          >
            Subir otra boleta
          </button>
        </div>
      </div>
    );
  }

  if (estado.tipo === "limite") {
    return (
      <div className="flex flex-col items-center gap-6 pt-12 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="text-xl font-bold">Límite del mes alcanzado</h1>
        <p className="text-gray-500 text-sm max-w-xs">
          Ya usaste tus 2 boletas gratis de este mes. Mejora tu plan para seguir analizando sin límites.
        </p>
        <div className="flex flex-col gap-3 w-full">
          <button
            onClick={() => router.push("/upgrade")}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
          >
            Ver planes
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-medium"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (estado.tipo === "error") {
    return (
      <div className="flex flex-col items-center gap-6 pt-12 text-center">
        <div className="text-5xl">{estado.rechazado ? "🤔" : "⚠️"}</div>
        <h1 className="text-xl font-bold">
          {estado.rechazado ? "No pudimos leer esta boleta" : "Algo salió mal"}
        </h1>
        <p className="text-gray-500 text-sm max-w-xs">{estado.mensaje}</p>
        <button
          onClick={reiniciar}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold"
        >
          Intentar con otra boleta
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-center">Sube tu boleta</h1>

      {estado.tipo === "idle" ? (
        <DropZone
          inputRef={inputRef}
          onDrop={onDrop}
          onInputChange={onInputChange}
          accept={ACCEPTED_TYPES}
        />
      ) : (
        <Preview
          file={estado.file}
          previewUrl={estado.previewUrl}
          onCambiar={reiniciar}
        />
      )}

      {estado.tipo === "preview" && (
        <button
          onClick={analizar}
          className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-700 transition-colors shadow-sm active:scale-95"
        >
          Analizar mi boleta
        </button>
      )}

      <p className="text-xs text-center text-gray-400">
        JPG, PNG, WEBP, HEIC o PDF · Máx 10 MB
      </p>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function PantallaEspera({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
        <div className="absolute inset-0 rounded-full border-4 border-t-emerald-600 animate-spin" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-xl font-semibold text-gray-800 min-h-[2rem] transition-all duration-500">
          {mensaje}
        </p>
        <p className="text-sm text-gray-400">Esto tarda entre 20 y 40 segundos</p>
      </div>
    </div>
  );
}

function DropZone({
  inputRef,
  onDrop,
  onInputChange,
  accept,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  accept: string;
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { setDragging(false); onDrop(e); }}
      onClick={() => inputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center gap-4 p-10 rounded-3xl border-2 border-dashed cursor-pointer transition-colors
        ${dragging ? "border-emerald-500 bg-emerald-50" : "border-gray-300 bg-white hover:border-emerald-400 hover:bg-gray-50"}
      `}
    >
      <div className="text-5xl">📷</div>
      <div className="text-center">
        <p className="font-semibold text-gray-800">Toca para abrir la cámara</p>
        <p className="text-sm text-gray-500 mt-1">o arrastra una foto aquí</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture="environment"
        onChange={onInputChange}
        className="hidden"
      />
    </div>
  );
}

function Preview({
  file,
  previewUrl,
  onCambiar,
}: {
  file: File;
  previewUrl: string;
  onCambiar: () => void;
}) {
  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-white">
      {previewUrl ? (
        <div className="relative w-full aspect-[3/4]">
          <Image
            src={previewUrl}
            alt="Vista previa de la boleta"
            fill
            className="object-contain"
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 p-5">
          <div className="text-3xl">📄</div>
          <div>
            <p className="font-medium text-gray-800 truncate max-w-[200px]">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onCambiar(); }}
        className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-gray-700 text-sm px-3 py-1 rounded-full border border-gray-300 shadow-sm hover:bg-white"
      >
        Cambiar
      </button>
    </div>
  );
}
