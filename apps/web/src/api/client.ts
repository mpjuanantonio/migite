import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status === 401) && failureCount < 2,
      },
    },
  });

export const queryClient = createQueryClient();
