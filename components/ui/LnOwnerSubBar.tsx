"use client";

import { usePathname } from "next/navigation";
import { LnSubBar } from "./Shell";

/**
 * LnOwnerSubBar — derives breadcrumbs from the current pathname
 * for the owner portal (app/(app)/...).
 *
 * Presentational only. No data fetching.
 */

type Crumb = { key: string; label: string; href?: string; active?: boolean };

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === "/inicio" || pathname.startsWith("/inicio/")) {
    if (pathname === "/inicio") {
      return [{ key: "inicio", label: "Inicio", active: true }];
    }
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "sub", label: pathname.split("/").pop() ?? "", active: true },
    ];
  }

  if (pathname === "/mis-mascotas") {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "mascotas", label: "Mis Mascotas", active: true },
    ];
  }

  if (pathname.startsWith("/mis-mascotas/")) {
    const parts = pathname.split("/").filter(Boolean);
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "mascotas", label: "Mis Mascotas", href: "/mis-mascotas" },
      { key: "pet", label: parts[1] ?? "", active: true },
    ];
  }

  if (pathname === "/mis-turnos" || pathname.startsWith("/mis-turnos/")) {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "turnos", label: "Turnos", active: true },
    ];
  }

  if (pathname === "/notificaciones" || pathname.startsWith("/notificaciones/")) {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "notificaciones", label: "Notificaciones", active: true },
    ];
  }

  if (pathname === "/cuenta" || pathname.startsWith("/cuenta/")) {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "cuenta", label: "Tu cuenta", active: true },
    ];
  }

  if (pathname.startsWith("/adoptar")) {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "adoptar", label: "Adopciones", active: true },
    ];
  }

  if (pathname.startsWith("/denuncias")) {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "denuncias", label: "Denuncias", active: true },
    ];
  }

  if (pathname.startsWith("/transferencias")) {
    return [
      { key: "inicio", label: "Inicio", href: "/inicio" },
      { key: "transferencias", label: "Transferencias", active: true },
    ];
  }

  // Fallback: show the last path segment as the active crumb
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ key: "root", label: "Inicio", active: true }];
  return [
    { key: "inicio", label: "Inicio", href: "/inicio" },
    { key: "current", label: segments[segments.length - 1], active: true },
  ];
}

export function LnOwnerSubBar() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);
  return <LnSubBar breadcrumbs={crumbs} />;
}
