import {
  AlarmClock,
  CalendarDays,
  Folder,
  LayoutList,
  LogOut,
  type LucideIcon,
  NotebookPen,
  Search,
  Shapes,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCerrarSesion } from "@/api/hooks";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { cn } from "@/lib/utils";

type Section = {
  readonly to: string;
  readonly labelKey: AppTranslationKey;
  readonly icon: LucideIcon;
};

const sections: readonly Section[] = [
  { to: "/notas", labelKey: "nav.notas", icon: NotebookPen },
  { to: "/tareas", labelKey: "nav.tareas", icon: LayoutList },
  { to: "/recordatorios", labelKey: "nav.recordatorios", icon: AlarmClock },
  { to: "/calendario", labelKey: "nav.calendario", icon: CalendarDays },
  { to: "/proyectos", labelKey: "nav.proyectos", icon: Folder },
  { to: "/tipos", labelKey: "nav.tipos", icon: Shapes },
  { to: "/buscar", labelKey: "nav.buscar", icon: Search },
];

export const AppShell = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cerrarSesion = useCerrarSesion();

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
        </header>
        <nav aria-label={t("shell.mainNav")} className="lg:flex-1">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-4">
            {sections.map((section) => (
              <li key={section.to} className="shrink-0 lg:shrink">
                <NavLink
                  to={section.to}
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
                      <section.icon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                        strokeWidth={1.75}
                      />
                      <span>{t(section.labelKey)}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
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
