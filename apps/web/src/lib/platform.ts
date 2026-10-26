import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import type { AdminStudio, AdminSummary, StudioBilling } from "@coach/shared";
import { api } from "./api";

export const billingQuery = queryOptions({ queryKey: ["studio", "billing"], queryFn: () => api<StudioBilling>("/studio/billing"), staleTime: 60_000 });
export const adminStudiosQuery = queryOptions({ queryKey: ["admin", "studios"], queryFn: () => api<AdminStudio[]>("/admin/studios"), staleTime: 0 });
export const adminSummaryQuery = queryOptions({ queryKey: ["admin", "summary"], queryFn: () => api<z.infer<typeof AdminSummary>>("/admin/summary"), staleTime: 0 });

/** Días que quedan hasta una fecha (redondeando hacia arriba: «queda 1 día» hasta el último momento). */
export const daysLeft = (iso: string | null, now = Date.now()) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 86_400_000)) : null);
