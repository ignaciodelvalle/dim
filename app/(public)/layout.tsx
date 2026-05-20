import { AppFooter, AppHeader } from "@/components/poncho";

/**
 * Layout para páginas públicas e institucionales:
 * envuelve children con AppHeader (cinta argentina + nav) y AppFooter (links + CC).
 *
 * Las áreas de usuario autenticado (libreta, casos, denuncias propias) van bajo
 * el route group `(app)` con su propio layout y no usan este shell.
 *
 * El estado activo del nav se resuelve client-side con usePathname() — no
 * necesita middleware ni headers().
 */

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
      <AppFooter />
    </div>
  );
}
