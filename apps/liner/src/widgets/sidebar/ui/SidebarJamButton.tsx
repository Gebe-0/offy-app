import { GroupLine } from "@mingcute/react";
import { useJamStore } from "@/features/jam";
import { Tooltip } from "@/shared/ui";
import { cn } from "@/shared/lib";

export function SidebarJamButton() {
  const jamCode = useJamStore((state) => state.code);
  const participants = useJamStore((state) => state.participants);
  const openJamModal = useJamStore((state) => state.openModal);

  const count = participants.length;
  const tooltipLabel = jamCode
    ? `Jam Ativa: ${jamCode}${count > 1 ? ` (${count} ouvindo juntos)` : ""}`
    : "Ouvir Juntos (Jam)";

  return (
    <Tooltip content={tooltipLabel} side="right" sideOffset={12}>
      <button
        type="button"
        aria-label={tooltipLabel}
        aria-pressed={Boolean(jamCode)}
        onClick={openJamModal}
        className="group relative inline-flex items-center justify-center bg-transparent border-0 p-0 cursor-pointer active:scale-[0.96] transition-transform duration-100"
      >
        <div className="relative">
          <GroupLine
            size={26}
            className={cn(
              "relative z-10 transition-opacity duration-150 ease-out",
              jamCode
                ? "text-emerald-400 opacity-100"
                : "text-text-primary opacity-55 group-hover:opacity-90",
            )}
          />
          {jamCode && count > 1 ? (
            <span className="absolute -top-1.5 -right-2 px-[4px] min-w-[15px] h-[15px] rounded-full bg-emerald-400 text-black text-[9.5px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(52,211,153,0.55)] select-none">
              {count}
            </span>
          ) : jamCode ? (
            <span className="absolute -top-1 -right-1 w-[7px] h-[7px] rounded-full bg-emerald-400 animate-pulse" />
          ) : null}
        </div>
      </button>
    </Tooltip>
  );
}
