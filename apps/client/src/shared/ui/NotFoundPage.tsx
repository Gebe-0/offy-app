import { useNavigate } from "react-router-dom";
import { LuDisc3, LuHouse } from "react-icons/lu";
import Button from "./Button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div
      role="region"
      aria-label="404 - Página não encontrada"
      className="flex flex-col items-center justify-center min-h-[70vh] h-full w-full p-6 text-center select-none"
    >
      <div className="flex flex-col items-center max-w-[420px] w-full p-8 md:p-10 rounded-2xl bg-bg-primary/60 border border-border-primary/40 shadow-2xl backdrop-blur-md">
        {/* Disc Icon */}
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-text-secondary mb-5 shadow-sm">
          <LuDisc3 size={30} className="stroke-[1.6]" />
        </div>

        {/* 404 Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-white/[0.05] text-text-secondary border border-white/[0.08] mb-4">
          404 • Não encontrado
        </div>

        {/* Title & Description */}
        <h1 className="text-xl md:text-2xl font-bold text-text-primary tracking-tight mb-2">
          Nada tocando por aqui
        </h1>
        <p className="text-sm text-text-secondary leading-relaxed mb-6 max-w-[340px]">
          O caminho ou conteúdo que você tentou acessar no OFFY não existe ou foi movido.
        </p>

        {/* Navigation Action */}
        <Button
          variant="primary"
          size="default"
          onClick={() => navigate("/")}
          className="gap-2 px-6"
        >
          <LuHouse size={16} />
          Voltar para o Início
        </Button>
      </div>
    </div>
  );
}

export default NotFoundPage;
