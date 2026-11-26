import { useAuthStore } from "@/features/auth";
import { useModalStore } from "@/features/library";
import { mediaUrl } from "@/shared/api";
import { Tooltip } from "@/shared/ui";

export function SidebarProfileButton() {
  const user = useAuthStore((state) => state.user);
  const toggleSettings = useModalStore((state) => state.toggleSettings);

  const label = user?.displayName || user?.username || "Perfil";
  const initial = (label.trim()[0] || "U").toUpperCase();
  const avatarSrc = user?.avatarUrl ? mediaUrl(user.avatarUrl) : "";

  return (
    <Tooltip content={label} side="right" sideOffset={12}>
      <button
        type="button"
        onClick={toggleSettings}
        aria-label={label}
        className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.07] p-0 text-[15px] font-[600] text-text-primary cursor-pointer transition-all duration-150 hover:bg-white/[0.12] active:scale-[0.95]"
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{initial}</span>
        )}
      </button>
    </Tooltip>
  );
}
