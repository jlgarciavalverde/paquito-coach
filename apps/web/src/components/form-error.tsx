export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-[5px] border-plate-red bg-plate-red-soft px-3.5 py-2.5 text-sm text-ink">
      {message}
    </p>
  );
}
