import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { queryClient } from "@/api/client";
import { I18nProvider } from "@/i18n/context";
import { createAppRouter } from "@/router";

const router = createAppRouter();

export const App = () => (
  <I18nProvider>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </I18nProvider>
);
