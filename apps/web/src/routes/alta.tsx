import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { slugify, type Me, type SlugCheck } from "@coach/shared";
import type { z } from "zod";
import { AuthLayout } from "../components/auth-layout";
import { FormError } from "../components/form-error";
import { Button } from "../components/ui/button";
import { Checkbox, TextField } from "../components/ui/field";
import { api } from "../lib/api";
import { homeFor, meQuery } from "../lib/auth";
import { platformQuery } from "../lib/public";
import { useSubmit } from "../lib/use-form";

/** Alta de un entrenador: crea su estudio en prueba y entra directamente. */
export const Route = createFileRoute("/alta")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: homeFor(me) });
    const p = await context.queryClient.ensureQueryData(platformQuery);
    if (!p.signupOpen) throw redirect({ to: "/acceso" });
    return { platform: p };
  },
  component: Signup,
});

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Signup() {
  const { platform } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({ studioName: "", slug: "", name: "", email: "", password: "", acceptTerms: false, website: "" });
  // La dirección se propone a partir del nombre hasta que la persona la toca.
  const [slugTouched, setSlugTouched] = useState(false);
  const slug = slugTouched ? f.slug : f.studioName.trim() ? slugify(f.studioName) : "";
  const checked = useDebounced(slug, 350);
  const check = useQuery({
    queryKey: ["slug", checked],
    enabled: checked.length >= 3,
    queryFn: () => api<z.infer<typeof SlugCheck>>(`/auth/slug/${encodeURIComponent(checked)}`),
    staleTime: 10_000,
  });
  const slugError = slug.length > 0 && slug.length < 3 ? "Al menos 3 caracteres" : check.data && check.data.slug === slug && !check.data.available ? check.data.reason : null;

  const { pending, error, onSubmit } = useSubmit(
    () => api<Me>("/auth/signup", { body: { ...f, slug } }),
    (me) => {
      qc.setQueryData(meQuery.queryKey, me);
      void navigate({ to: "/coach" });
    },
  );

  return (
    <AuthLayout
      title="Crea tu estudio"
      subtitle={`${platform.trialDays} días gratis con todo incluido. No hace falta tarjeta.`}
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/acceso" className="font-medium text-primary underline-offset-4 hover:underline">
            Entra aquí
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Nombre del estudio" hint="Es el nombre que verán tus clientes en la app." autoComplete="organization" value={f.studioName} onChange={(e) => setF({ ...f, studioName: e.target.value })} />
        <TextField
          label="Dirección de tu página"
          hint={slug && !slugError ? `Tu página quedará en ${window.location.host}/e/${slug}` : "Solo letras sin tilde, números y guiones."}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={slug}
          error={slugError}
          onChange={(e) => {
            setSlugTouched(true);
            setF({ ...f, slug: e.target.value.toLowerCase() });
          }}
        />
        <TextField label="Tu nombre y apellidos" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField label="Correo electrónico" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Contraseña" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres." value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {/* Campo trampa: invisible para las personas. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Web
            <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
          </label>
        </div>
        <Checkbox
          checked={f.acceptTerms}
          onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })}
          label="Acepto las condiciones del servicio y el encargo de tratamiento de los datos de mis clientes"
          description={
            <Link to="/condiciones" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
              Leer las condiciones
            </Link>
          }
        />
        <FormError message={error} />
        <Button type="submit" size="lg" loading={pending} disabled={!f.acceptTerms || Boolean(slugError) || !slug} className="mt-2">
          Crear mi estudio
        </Button>
      </form>
    </AuthLayout>
  );
}
