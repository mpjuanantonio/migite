import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/context";

type TituloEditableProps = {
  readonly titulo: string;
  readonly onRenombrar: (titulo: string) => void;
};

export const TituloEditable = ({ titulo, onRenombrar }: TituloEditableProps) => {
  const { t } = useI18n();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(titulo);
  const confirmado = useRef(false);
  const recuperarFoco = useRef(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) {
      campoRef.current?.focus();
      return;
    }
    if (recuperarFoco.current) {
      recuperarFoco.current = false;
      botonRef.current?.focus();
    }
  }, [editando]);

  const empezar = () => {
    setBorrador(titulo);
    confirmado.current = false;
    setEditando(true);
  };

  const confirmar = (restaurarFoco: boolean) => {
    if (confirmado.current) {
      return;
    }
    confirmado.current = true;
    recuperarFoco.current = restaurarFoco;
    setEditando(false);
    const limpio = borrador.trim();
    if (limpio === "" || limpio === titulo) {
      setBorrador(titulo);
      return;
    }
    onRenombrar(limpio);
  };

  const cancelar = () => {
    confirmado.current = true;
    recuperarFoco.current = true;
    setBorrador(titulo);
    setEditando(false);
  };

  if (!editando) {
    return (
      <h1 className="font-heading text-display font-medium break-words">
        <button
          ref={botonRef}
          type="button"
          className="-mx-2 cursor-text rounded-sm px-2 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={empezar}
        >
          {titulo}
        </button>
      </h1>
    );
  }

  return (
    <input
      ref={campoRef}
      aria-label={t("page.objeto.titleEditLabel")}
      className="w-full rounded-sm border-b border-border/70 bg-transparent pb-0.5 font-heading text-display font-medium break-words focus:border-ring focus:outline-none"
      onBlur={() => confirmar(false)}
      onChange={(evento) => setBorrador(evento.target.value)}
      onFocus={(evento) => evento.currentTarget.select()}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          confirmar(true);
        } else if (evento.key === "Escape") {
          evento.preventDefault();
          cancelar();
        }
      }}
      value={borrador}
    />
  );
};
