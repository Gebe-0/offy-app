import { memo } from "react";
import { SidebarNavItems } from "./SidebarNavItems";
import { SidebarJamButton } from "./SidebarJamButton";
import { SidebarSettingsButton } from "./SidebarSettingsButton";
import { SidebarShortcuts } from "./SidebarShortcuts";
import { SidebarProfileButton } from "./SidebarProfileButton";
import { cn } from "@/shared/lib";

export interface SidebarProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
}

function Sidebar({ searchOpen, onSearchToggle }: SidebarProps) {
  return (
    <div
      className={cn(
        "h-full w-[58px] rounded-item flex flex-col overflow-hidden border-none bg-bg-glass backdrop-blur-[20px]",
      )}
    >
      <nav className="relative shrink-0 flex flex-col items-center gap-[18px] pt-[16px]">
        <SidebarNavItems
          searchOpen={searchOpen}
          onSearchToggle={onSearchToggle}
        />
        <SidebarSettingsButton />
      </nav>

      <SidebarShortcuts />

      <div className="pt-[10px] pb-[14px] shrink-0 flex flex-col justify-center items-center gap-[14px]">
        <SidebarJamButton />
        <SidebarProfileButton />
      </div>
    </div>
  );
}

export default memo(Sidebar);
