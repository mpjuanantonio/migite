import { type ReactNode, useEffect } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { setUnauthorizedHandler } from "@/api/api";
import { useSesion } from "@/api/hooks";
import { AppShell } from "@/components/layout/app-shell";
import { BuscarPage } from "@/pages/buscar-page";
import { CalendarioPage } from "@/pages/calendario-page";
import { ChatPage } from "@/pages/chat-page";
import { LoginPage, readLoginDestino } from "@/pages/login-page";
import { MemoriaPage } from "@/pages/memoria-page";
import { NotasPage } from "@/pages/notas-page";
import { ObjetoPage } from "@/pages/objeto-page";
import { ProyectoPage } from "@/pages/proyecto-page";
import { ProyectosPage } from "@/pages/proyectos-page";
import { RecordatoriosPage } from "@/pages/recordatorios-page";
import { SetupPage } from "@/pages/setup-page";
import { TareasPage } from "@/pages/tareas-page";
import { TipoNuevoPage } from "@/pages/tipo-nuevo-page";
import { TipoObjetosPage } from "@/pages/tipo-objetos-page";
import { TipoPage } from "@/pages/tipo-page";
import { TiposPage } from "@/pages/tipos-page";

const UnauthorizedBridge = () => {
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => navigate("/login", { replace: true }));
    return () => setUnauthorizedHandler(undefined);
  }, [navigate]);

  return null;
};

const RootLayout = () => (
  <>
    <UnauthorizedBridge />
    <Outlet />
  </>
);

const RequireSesion = ({ children }: { readonly children: ReactNode }) => {
  const { data, isPending } = useSesion();
  const location = useLocation();

  if (isPending) {
    return null;
  }

  if (data?.autenticado !== true) {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }

  return children;
};

const OnlyGuest = () => {
  const { data, isPending } = useSesion();
  const location = useLocation();

  if (isPending) {
    return null;
  }

  if (data?.autenticado === true) {
    return <Navigate to={readLoginDestino(location.state)} replace />;
  }

  return data?.setupRequerido === true ? <SetupPage /> : <LoginPage />;
};

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <OnlyGuest /> },
      {
        path: "/",
        element: (
          <RequireSesion>
            <AppShell />
          </RequireSesion>
        ),
        children: [
          { index: true, element: <Navigate to="/notas" replace /> },
          { path: "notas", element: <NotasPage /> },
          { path: "objetos/:id", element: <ObjetoPage /> },
          { path: "tareas", element: <TareasPage /> },
          { path: "recordatorios", element: <RecordatoriosPage /> },
          { path: "calendario", element: <CalendarioPage /> },
          { path: "proyectos", element: <ProyectosPage /> },
          { path: "proyectos/:id", element: <ProyectoPage /> },
          { path: "chat", element: <ChatPage /> },
          { path: "memoria", element: <MemoriaPage /> },
          { path: "tipo/:id", element: <TipoObjetosPage /> },
          { path: "tipos", element: <TiposPage /> },
          { path: "tipos/nuevo", element: <TipoNuevoPage /> },
          { path: "tipos/:id", element: <TipoPage /> },
          { path: "buscar", element: <BuscarPage /> },
          { path: "*", element: <Navigate to="/notas" replace /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
