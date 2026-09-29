import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, UsersThree } from "@phosphor-icons/react";
import { Avatar } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Checkbox, TextArea, TextField } from "../components/ui/field";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, Stat } from "../components/ui/surface";
import { Dialog } from "../components/ui/dialog";
import { CopyField } from "../components/ui/copy-field";
import { Skeleton } from "../components/ui/spinner";
import { TabPanel, Tabs } from "../components/ui/tabs";
import { useToast } from "../components/ui/toast";
import { StatusBadge } from "../components/clients/status-badge";
import { ThemeCard } from "../components/account-settings";
import { FormError } from "../components/form-error";

/** Galería del sistema de diseño (no enlazada desde la app). Referencia visual para humanos y agentes. */
export const Route = createFileRoute("/galeria")({
  component: Gallery,
});

const SWATCHES = ["paper", "surface", "surface-2", "surface-3", "ink", "ink-2", "ink-3", "line", "line-strong", "accent", "accent-soft", "clay", "clay-soft", "success", "warning", "danger"];

function Gallery() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("a");
  const toast = useToast();
  return (
    <main className="paper-grain min-h-dvh px-4 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <PageHeader overline="Sistema de diseño" title="Galería" description="Todos los componentes base con sus variantes. Úsalos siempre en lugar de estilos sueltos." actions={<Button icon={<Plus size={17} weight="bold" />}>Acción</Button>} />

        <section>
          <SectionTitle>Color</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SWATCHES.map((s) => (
              <div key={s} className="overflow-hidden rounded-[12px] border border-line">
                <div className="h-14" style={{ background: `var(--${s})` }} />
                <p className="bg-surface px-3 py-2 text-[12px] text-ink-2">--{s}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Tipografía</SectionTitle>
          <Card className="flex flex-col gap-3 p-6">
            <p className="font-display text-[56px] leading-none">Instrument Serif 56</p>
            <p className="font-display text-[40px] leading-none">Título de página 40–48</p>
            <p className="font-display text-[24px]">Título de sección 24</p>
            <p className="text-[15px]">Texto base Instrument Sans 15 — cómodo de leer en móvil y escritorio.</p>
            <p className="text-[13px] text-ink-2">Texto secundario 13</p>
            <p className="text-[12px] font-medium tracking-[0.14em] text-ink-3 uppercase">Sobretítulo 12</p>
          </Card>
        </section>

        <section>
          <SectionTitle>Botones</SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primario</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="soft">Suave</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="danger">Peligro</Button>
            <Button loading>Cargando</Button>
            <Button size="sm">Pequeño</Button>
            <Button size="lg">Grande</Button>
            <Button onClick={() => toast("Guardado")}>Toast</Button>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              Diálogo
            </Button>
          </div>
        </section>

        <section>
          <SectionTitle>Etiquetas y avatares</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            {(["neutral", "accent", "clay", "success", "warning", "danger"] as const).map((t) => (
              <Badge key={t} tone={t} dot>
                {t}
              </Badge>
            ))}
            {(["active", "pending", "invited", "no_account", "archived"] as const).map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {["Lucía Martínez", "Pepe Gómez", "Ana Ruiz", "Iker López", "Marta Sanz", "Juan Pérez"].map((n) => (
              <Avatar key={n} name={n} />
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col gap-4 p-6">
            <SectionTitle>Formularios</SectionTitle>
            <TextField label="Nombre" placeholder="Escribe…" />
            <TextField label="Con ayuda" hint="Texto de ayuda" aside="Opcional" />
            <TextField label="Con error" error="Este campo es obligatorio" />
            <TextArea label="Área de texto" />
            <Checkbox label="Acepto" description="Descripción del consentimiento" />
            <FormError message="Mensaje de error de formulario" />
            <CopyField value="https://ejemplo.redgarverde.com/registro?invitacion=abc" label="Enlace" />
          </Card>
          <div className="flex flex-col gap-6">
            <Card className="grid grid-cols-2 gap-6 p-6">
              <Stat label="Activos" value={12} hint="Con cuenta" />
              <Stat label="Pendientes" value={3} />
            </Card>
            <ThemeCard />
            <Card className="flex flex-col gap-2 p-6">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5" />
              <Skeleton className="h-5 w-3/4" />
            </Card>
          </div>
        </section>

        <section>
          <Tabs value={tab} onValueChange={setTab} items={[{ value: "a", label: "Pestaña A" }, { value: "b", label: "Pestaña B" }]}>
            <TabPanel value="a">Contenido A</TabPanel>
            <TabPanel value="b">Contenido B</TabPanel>
          </Tabs>
          <EmptyState icon={<UsersThree size={22} />} title="Estado vacío" action={<Button>Acción principal</Button>}>
            Explica qué falta y cuál es el siguiente paso.
          </EmptyState>
        </section>
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="Diálogo" description="En móvil sale como hoja desde abajo." footer={<Button onClick={() => setOpen(false)}>Vale</Button>}>
        <p className="text-ink-2">Contenido del diálogo.</p>
      </Dialog>
    </main>
  );
}
