import { t } from "@migite/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");

if (container === null) {
  throw new Error(t("web.contenedorNoEncontrado"));
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
