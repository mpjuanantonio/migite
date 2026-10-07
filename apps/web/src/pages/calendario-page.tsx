import { CalendarDays } from "lucide-react";
import { PlaceholderPage } from "@/components/page/placeholder-page";

export const CalendarioPage = () => (
  <PlaceholderPage
    titleKey="page.calendario.title"
    descriptionKey="page.calendario.description"
    emptyKey="page.calendario.empty"
    icon={CalendarDays}
  />
);
