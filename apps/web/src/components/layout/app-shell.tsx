import {
  AlarmClock,
  CalendarDays,
  FileText,
  Folder,
  LayoutList,
  LogOut,
  type LucideIcon,
  NotebookPen,
  Search,
  Shapes,
} from "lucide-react";
import { type ReactNode, useId, useMemo } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCerrarSesion, useTipos } from "@/api/hooks";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { esTipoSistema } from "@/lib/tipos";
import { cn } from "@/lib/utils";

type Section = {
  readonly to: string;
  readonly labelKey: AppTranslationKey;
  readonly icon: LucideIcon;
};

const SECCION_NOTAS: readonly Section[] = [
  { to: "/notas", labelKey: "nav.notas", icon: NotebookPen },
];

const SECCION_PRODUCTIVIDAD: readonly Section[] = [
  { to: "/tareas", labelKey: "nav.tareas", icon: LayoutList },
  { to: "/recordatorios", labelKey: "nav.recordatorios", icon: AlarmClock },
  { to: "/calendario", labelKey: "nav.calendario", icon: CalendarDays },
  { to: "/proyectos", labelKey: "nav.proyectos", icon: Folder },
];

const SECCION_GESTION: readonly Section[] = [
  { to: "/tipos", labelKey: "nav.tipos", icon: Shapes },
  { to: "/buscar", labelKey: "nav.buscar", icon: Search },
];

const ESTILO_GRUPO = "px-3 pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase";

type EnlaceNavProps = {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly children: ReactNode;
};

const EnlaceNav = ({ to, icon: Icon, children }: EnlaceNavProps) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      cn(
        "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )
    }
  >
    {({ isActive }) => (
      <>
        {isActive ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sidebar-primary"
          />
        ) : null}
        <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
        <span>{children}</span>
      </>
    )}
  </NavLink>
);

export const AppShell = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cerrarSesion = useCerrarSesion();
  const tipos = useTipos();
  const idGrupoNotas = useId();
  const idGrupoProductividad = useId();

  const tiposProductividad = useMemo(
    () =>
      (tipos.data ?? []).filter((tipo) => {
        const config = tipo.presentacion;
        return (
          !esTipoSistema(tipo.id) && config?.seccion === "productividad" && config.visible !== false
        );
      }),
    [tipos.data],
  );

  const handleLogout = () => {
    cerrarSesion.mutate(undefined, {
      onSuccess: () => navigate("/login", { replace: true }),
    });
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:shadow-sheet focus:ring-2 focus:ring-ring"
      >
        {t("shell.skipToContent")}
      </a>
      <aside className="flex flex-col border-b border-sidebar-border bg-sidebar lg:border-r lg:border-b-0">
        <header className="flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <BrandMark className="size-7 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg leading-tight font-semibold tracking-tight">
                {t("app.name")}
              </p>
              <p className="truncate text-xs text-muted-foreground">{t("shell.brandTagline")}</p>
            </div>
            <LanguageSwitcher />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              {t("shell.sessionActive")}
            </span>
            <div className="flex items-center gap-1">
              <ThemeSwitcher />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleLogout}
                disabled={cerrarSesion.isPending}
                className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut aria-hidden="true" />
                {cerrarSesion.isPending ? t("shell.loggingOut") : t("shell.logout")}
              </Button>
            </div>
          </div>
        </header>
        <nav
          aria-label={t("shell.mainNav")}
          className="flex flex-col gap-4 px-3 pb-3 lg:flex-1 lg:pb-4"
        >
          <div className="flex flex-col gap-1">
            <h2 id={idGrupoNotas} className={ESTILO_GRUPO}>
              {t("shell.navGroupNotas")}
            </h2>
            <ul aria-labelledby={idGrupoNotas} className="flex flex-col gap-1">
              {SECCION_NOTAS.map((section) => (
                <li key={section.to}>
                  <EnlaceNav to={section.to} icon={section.icon}>
                    {t(section.labelKey)}
                  </EnlaceNav>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-1">
            <h2 id={idGrupoProductividad} className={ESTILO_GRUPO}>
              {t("shell.navGroupProductividad")}
            </h2>
            <ul aria-labelledby={idGrupoProductividad} className="flex flex-col gap-1">
              {SECCION_PRODUCTIVIDAD.map((section) => (
                <li key={section.to}>
                  <EnlaceNav to={section.to} icon={section.icon}>
                    {t(section.labelKey)}
                  </EnlaceNav>
                </li>
              ))}
              {tiposProductividad.map((tipo) => (
                <li key={tipo.id}>
                  <EnlaceNav to={`/tipo/${encodeURIComponent(tipo.id)}`} icon={FileText}>
                    {tipo.nombre}
                  </EnlaceNav>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-sidebar-border pt-3 lg:mt-auto">
            <ul className="flex flex-col gap-1">
              {SECCION_GESTION.map((section) => (
                <li key={section.to}>
                  <EnlaceNav to={section.to} icon={section.icon}>
                    {t(section.labelKey)}
                  </EnlaceNav>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>
      <main id="contenido" tabIndex={-1} className="px-5 py-8 lg:px-10 lg:py-10">
        <div className="mx-auto w-full max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
