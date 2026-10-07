import { Folder } from "lucide-react";
import { PlaceholderPage } from "@/components/page/placeholder-page";

export const ProyectosPage = () => (
  <PlaceholderPage
    titleKey="page.proyectos.title"
    descriptionKey="page.proyectos.description"
    emptyKey="page.proyectos.empty"
    icon={Folder}
  />
);
