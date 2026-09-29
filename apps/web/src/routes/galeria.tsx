import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, IconButton } from "../components/ui/button";
import { Checkbox, Select, TextArea, TextField } from "../components/ui/field";
import { BlockTitle, EmptyNote, HealthAlert, Monogram, ObjectCard, PageTitle, PlateMark, RecordRow, RecordSheet, Tray } from "../components/ui/layout";
import { Dialog, SidePanel } from "../components/ui/dialog";
import { CopyField } from "../components/ui/copy-field";
import { Skeleton } from "../components/ui/spinner";
import { TabPanel, Tabs } from "../components/ui/tabs";
import { useToast } from "../components/ui/toast";
import { StatusMark } from "../components/clients/status-mark";
import { ThemeSetting } from "../components/account-settings";
import { FormError } from "../components/form-error";
import { BarbellMark, LoadedBarbell } from "../components/brand";
import { ItemSpec } from "../components/training/prescription";
import { X } from "@phosphor-icons/react";

/** Galería del sistema de diseño (no enlazada desde la app). Referencia visual para humanos y agentes. */
export const Route = createFileRoute("/galeria")({
  component: Gallery,
});

const SWATCHES = ["paper", "tray", "tray-2", "ink", "ink-2", "ink-3", "rule", "rule-strong", "primary", "primary-soft", "plate-red", "plate-red-soft", "plate-yellow", "plate-green", "plate-green-soft"];

function Gallery() {
  const [dialog, setDialog] = useState(false);
  const [panel, setPanel] = useState(false);
  const [tab, setTab] = useState("a");
  const toast = useToast();
  return (
    <main className="px-4 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-14">
        <PageTitle title="Galería del sistema de diseño" lead="Las piezas base con sus variantes. Se usan siempre estas en lugar de estilos sueltos (ver docs/diseno.md)." actions={<Button>Acción principal</Button>} />

        <section>
          <BlockTitle>Color</BlockTitle>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {SWATCHES.map((s) => (
              <div key={s}>
                <div className="h-12 rounded-[var(--radius-control)] border border-rule" style={{ background: `var(--${s})` }} />
                <p className="mt-1 text-[12.5px] text-ink-2">{s}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <BlockTitle>Tipografía</BlockTitle>
          <div className="flex flex-col gap-2">
            <p className="font-wide text-[38px] leading-tight">Titular ancho 34–38</p>
            <p className="font-wide text-[19px]">Título de bloque 19</p>
            <p>Texto 15. Programación de fuerza y readaptación para cada cliente, semana a semana.</p>
            <p className="text-[13.5px] text-ink-2">Secundario 13,5</p>
            <p className="font-narrow text-[28px]">4 × 6 @ 82,5 kg  RPE 8  2:30</p>
          </div>
        </section>

        <section>
          <BlockTitle>Marca</BlockTitle>
          <div className="flex items-center gap-6">
            <BarbellMark className="h-12 w-16" />
            <Tray className="w-full max-w-md overflow-hidden">
              <LoadedBarbell className="w-full" />
            </Tray>
          </div>
        </section>

        <section>
          <BlockTitle>Acciones</BlockTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primaria</Button>
            <Button variant="secondary">Secundaria</Button>
            <Button variant="quiet">Discreta</Button>
            <Button variant="danger">Quitar</Button>
            <Button loading>Guardando</Button>
            <Button size="sm">Pequeña</Button>
            <Button size="lg">Grande</Button>
            <IconButton label="Cerrar">
              <X size={18} />
            </IconButton>
            <Button variant="secondary" onClick={() => toast("Guardado")}>
              Aviso
            </Button>
            <Button variant="secondary" onClick={() => setDialog(true)}>
              Diálogo
            </Button>
            <Button variant="secondary" onClick={() => setPanel(true)}>
              Hoja lateral
            </Button>
          </div>
        </section>

        <section>
          <BlockTitle>Estados (marcas de disco)</BlockTitle>
          <div className="flex flex-wrap gap-5">
            <PlateMark tone="blue">Programado</PlateMark>
            <PlateMark tone="green">Hecho</PlateMark>
            <PlateMark tone="yellow">Hoy</PlateMark>
            <PlateMark tone="red">Sin registrar</PlateMark>
            <PlateMark tone="white">Sin cuenta</PlateMark>
            <PlateMark tone="grey">Archivado</PlateMark>
          </div>
          <div className="mt-3 flex flex-wrap gap-5">
            {(["active", "pending", "invited", "no_account", "archived"] as const).map((s) => (
              <StatusMark key={s} status={s} />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            {["Lucía Martínez", "Pepe Gómez", "Ana Ruiz"].map((n) => (
              <Monogram key={n} name={n} />
            ))}
          </div>
        </section>

        <section className="grid gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <BlockTitle>Campos</BlockTitle>
            <TextField label="Nombre" placeholder="Escribe…" />
            <TextField label="Con ayuda" hint="Texto de ayuda" aside="opcional" />
            <TextField label="Con error" error="Escribe un nombre" />
            <Select label="Selector">
              <option>Cuádriceps</option>
            </Select>
            <TextArea label="Área de texto" />
            <Checkbox label="Acepto" description="Descripción del consentimiento" />
            <FormError message="Mensaje de error de formulario" />
            <CopyField value="https://paquito.redgarverde.com/registro?invitacion=abc" label="Enlace" />
          </div>
          <div className="flex flex-col gap-8">
            <HealthAlert>Tendinopatía rotuliana derecha. Evitar impacto y sentadilla profunda con carga.</HealthAlert>
            <ObjectCard className="p-4">
              <p className="font-medium">Sentadilla trasera</p>
              <ItemSpec it={{ id: "x", exerciseId: "x", exerciseName: "", sets: 4, reps: "6", load: "80 kg", effort: "RIR 2", tempo: "31X1", restSec: 150, notes: "", group: null }} />
            </ObjectCard>
            <ThemeSetting />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5" />
            </div>
          </div>
        </section>

        <section>
          <BlockTitle>Ficha (etiqueta y dato)</BlockTitle>
          <RecordSheet>
            <RecordRow label="Objetivo">Volver a correr tras plastia de LCA</RecordRow>
            <RecordRow label="Lesiones" hint="Dato de salud">
              Rotura LCA rodilla izquierda (2025)
            </RecordRow>
          </RecordSheet>
        </section>

        <section>
          <Tabs value={tab} onValueChange={setTab} items={[{ value: "a", label: "Pestaña A" }, { value: "b", label: "Pestaña B" }]}>
            <TabPanel value="a">
              <EmptyNote action={<Button>Crear la primera</Button>}>Todavía no hay nada aquí. Explica qué falta y cuál es el siguiente paso.</EmptyNote>
            </TabPanel>
            <TabPanel value="b">Contenido B</TabPanel>
          </Tabs>
        </section>
      </div>
      <Dialog open={dialog} onOpenChange={setDialog} title="Diálogo" description="Para confirmar algo breve." footer={<Button onClick={() => setDialog(false)}>Vale</Button>}>
        <p className="text-ink-2">Contenido del diálogo.</p>
      </Dialog>
      <SidePanel open={panel} onOpenChange={setPanel} title="Hoja lateral" description="Crear o editar sin perder la lista de fondo." footer={<Button onClick={() => setPanel(false)}>Guardar</Button>}>
        <TextField label="Campo" />
      </SidePanel>
    </main>
  );
}
