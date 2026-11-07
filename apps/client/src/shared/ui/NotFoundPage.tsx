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
      <div className="flex flex-col items-center max-w-[400px] w-full p-7 rounded-[16px] bg-[#0f0f12] border border-white/[0.07] shadow-xl">
        {/* Badge de Metadados estilo unslop */}
        <span className="font-mono text-[11px] font-medium text-text-muted bg-[#17171a] border border-white/[0.08] rounded-[6px] px-2 py-0.5 mb-5 tracking-[0.02em]">
          404 // Ausente
        </span>

        {/* Visual Acústico / Disco */}
        <div className="w-14 h-14 rounded-[12px] bg-[#17171b] border border-white/[0.07] flex items-center justify-center text-text-secondary mb-5">
          <LuDisc3 size={26} className="stroke-[1.5]" />
        </div>

        {/* Título e Subtítulo */}
        <h1 className="text-[18px] font-[600] text-text-primary tracking-[-0.01em] leading-[1.35] mb-1.5">
          Nada tocando por aqui
        </h1>
        <p className="text-[13px] text-text-secondary leading-[1.5] mb-6 max-w-[300px]">
          O caminho ou conteúdo que você tentou acessar no OFFY não existe ou foi movido.
        </p>

        {/* Ação */}
        <Button
          variant="primary"
          size="default"
          onClick={() => navigate("/")}
          className="w-full gap-2 text-[13.5px] font-[600] rounded-[8px]"
        >
          <LuHouse size={16} />
          Voltar para o Início
        </Button>

        {/* Rodapé técnico de assinatura */}
        <div className="font-mono text-[11px] text-text-muted/60 mt-6 tracking-[0.02em]">
          OFFY AUDIO CORE // 44.1kHz • 24-bit
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
