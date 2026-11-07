import { useState } from "react";
import { SpotifyFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { cn } from "@/shared/lib";
import { AccountCard, accountCardActionClassName } from "@/shared/ui";
import { AppImage } from "@/features/covers";
import { useSpotifyAccount } from "../hooks/useSpotifyAccount";

export default function SpotifyAccountCard() {
  const { t } = useTranslation();
  const { signedIn, account, loading, signIn, signOut } = useSpotifyAccount();
  const [inAction, setInAction] = useState(false);

  const handleSignIn = async () => {
    setInAction(true);
    await signIn();
    setInAction(false);
  };

  const handleSignOut = async () => {
    setInAction(true);
    await signOut();
    setInAction(false);
  };

  const title = signedIn
    ? (account?.name ?? "")
    : t("settings.spotify.signed_out_title") || "Não conectado";
  const subtitle = signedIn
    ? (account?.email ??
      (account?.product
        ? `Spotify ${account.product.charAt(0).toUpperCase() + account.product.slice(1)}`
        : "Conectado"))
    : t("settings.spotify.signed_out_description") ||
      "Conecte sua conta do Spotify para sincronizar playlists e curtidas";

  return (
    <AccountCard
      media={
        account?.photoUrl ? (
          <AppImage src={account.photoUrl} alt="" fill />
        ) : undefined
      }
      placeholderIcon={<SpotifyFill size={24} />}
      title={title}
      subtitle={subtitle}
      loading={loading || inAction}
      action={
        signedIn ? (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={inAction}
            className={cn(
              accountCardActionClassName,
              "bg-text-primary/70 text-bg-primary/85 hover:bg-text-primary/85",
            )}
          >
            {t("settings.spotify.sign_out") || "Desconectar"}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSignIn}
            disabled={inAction}
            className={cn(
              accountCardActionClassName,
              "bg-text-primary/85 text-bg-primary hover:bg-text-primary",
            )}
          >
            {t("settings.spotify.sign_in") || "Entrar"}
          </button>
        )
      }
    />
  );
}
