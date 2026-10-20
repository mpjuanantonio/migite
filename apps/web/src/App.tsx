import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "@/api/client";
import { I18nProvider } from "@/i18n/context";
import { createAppRouter } from "@/router";
import { TemaProvider } from "@/theme/context";

const router = createAppRouter();

export const App = () => (
  <I18nProvider>
    <TemaProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TemaProvider>
  </I18nProvider>
);
