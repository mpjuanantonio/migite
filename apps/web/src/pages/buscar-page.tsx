import { Search } from "lucide-react";
import { PlaceholderPage } from "@/components/page/placeholder-page";

export const BuscarPage = () => (
  <PlaceholderPage
    titleKey="page.buscar.title"
    descriptionKey="page.buscar.description"
    emptyKey="page.buscar.empty"
    icon={Search}
  />
);
