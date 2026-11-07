import { Book2, QuestionCircle } from "@solar-icons/react";
import { showToast } from "@/shared/ui";
import { useTranslation } from "@/languages";

export function AboutTabLinks() {
  const { t } = useTranslation();

  const handleOpenDocs = () => {
    const url = "https://github.com/Gebe-0/offy-app/blob/main/DOCUMENTATION.md";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenSupport = () => {
    void navigator.clipboard?.writeText("@arlw_").catch(() => {});
    showToast.checkmark("Discord copiado: @arlw_! Abrindo suporte...");
    const url =
      "https://github.com/Gebe-0/offy-app/blob/main/DOCUMENTATION.md#10-suporte-e-comunidade";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex items-center gap-[10px] flex-wrap">
      <button
        type="button"
        onClick={handleOpenDocs}
        className="inline-flex items-center gap-[7px] px-[13px] py-[8px] rounded-item bg-fill hover:bg-fill-hover border border-border-white-alpha-14 text-[13px] font-[500] text-text-primary cursor-pointer transition-colors"
      >
        <Book2 size={16} className="text-text-secondary" />
        <span>{t("settings.docs") || "Documentação"}</span>
      </button>

      <button
        type="button"
        onClick={handleOpenSupport}
        className="inline-flex items-center gap-[7px] px-[13px] py-[8px] rounded-item bg-fill hover:bg-fill-hover border border-border-white-alpha-14 text-[13px] font-[500] text-text-primary cursor-pointer transition-colors"
      >
        <QuestionCircle size={16} className="text-[#5865F2]" />
        <span>
          {t("settings.support") || "Suporte"}:{" "}
          <strong className="text-[#939aff] font-mono">@arlw_</strong>
        </span>
      </button>
    </div>
  );
}
