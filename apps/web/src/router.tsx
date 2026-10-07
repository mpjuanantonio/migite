import { useEffect } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  type RouteObject,
  useNavigate,
} from "react-router-dom";
import { setUnauthorizedHandler } from "@/api/api";
import { AppShell } from "@/components/layout/app-shell";
import { BuscarPage } from "@/pages/buscar-page";
import { CalendarioPage } from "@/pages/calendario-page";
import { LoginPage } from "@/pages/login-page";
import { NotasPage } from "@/pages/notas-page";
import { ObjetoPage } from "@/pages/objeto-page";
import { ProyectosPage } from "@/pages/proyectos-page";
import { TareasPage } from "@/pages/tareas-page";
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

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        path: "/",
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/notas" replace /> },
          { path: "notas", element: <NotasPage /> },
          { path: "objetos/:id", element: <ObjetoPage /> },
          { path: "tareas", element: <TareasPage /> },
          { path: "calendario", element: <CalendarioPage /> },
          { path: "proyectos", element: <ProyectosPage /> },
          { path: "tipos", element: <TiposPage /> },
          { path: "buscar", element: <BuscarPage /> },
          { path: "*", element: <Navigate to="/notas" replace /> },
        ],
      },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
