import { NotebookPen } from "lucide-react";
import { PlaceholderPage } from "@/components/page/placeholder-page";

export const NotasPage = () => (
  <PlaceholderPage
    titleKey="page.notas.title"
    descriptionKey="page.notas.description"
    emptyKey="page.notas.empty"
    icon={NotebookPen}
  />
);
