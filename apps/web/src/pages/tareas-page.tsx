import { LayoutList } from "lucide-react";
import { PlaceholderPage } from "@/components/page/placeholder-page";

export const TareasPage = () => (
  <PlaceholderPage
    titleKey="page.tareas.title"
    descriptionKey="page.tareas.description"
    emptyKey="page.tareas.empty"
    icon={LayoutList}
  />
);
