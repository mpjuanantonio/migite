import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderResult, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { createQueryClient } from "@/api/client";
import { I18nProvider } from "@/i18n/context";
import { routes } from "@/router";

export type RenderAppResult = RenderResult & {
  readonly router: ReturnType<typeof createMemoryRouter>;
};

export const renderApp = (
  path: string,
  client: QueryClient = createQueryClient(),
): RenderAppResult => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <I18nProvider>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
  return { ...result, router };
};

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const noContentResponse = (): Response => new Response(null, { status: 204 });

export const sesionResponse = (autenticado: boolean, setupRequerido?: boolean): Response =>
  jsonResponse({ autenticado, ...(setupRequerido === undefined ? {} : { setupRequerido }) });

export const errorResponse = (codigo: string, mensaje: string, status: number): Response =>
  jsonResponse({ error: { codigo, mensaje } }, status);
