import { useEffect, useState } from "react";

/** Aviso fijo cuando el dispositivo se queda sin conexión (y desaparece solo al volver). */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    // Por si la red se cayó entre el primer render y este efecto (el evento ya habría pasado).
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => (window.removeEventListener("online", on), window.removeEventListener("offline", off));
  }, []);
  if (online) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[70] bg-ink px-4 py-2 text-center text-sm text-paper">
      Sin conexión. Lo que hagas ahora no se guardará hasta que vuelva internet.
    </div>
  );
}
