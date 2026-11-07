import { useState, useEffect, useCallback } from "react";
import {
  CheckLine,
  Copy2Line,
  ExternalLinkLine,
  InformationLine,
  Refresh1Line,
  SpotifyFill,
} from "@mingcute/react";
import Dialog from "@/shared/ui/Dialog";
import { DialogActions, DialogButton, DialogHeader } from "@/shared/ui";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import {
  cancelSpotifyBrowserLogin,
  isSpotifySignedIn,
  onSpotifyAuthChanged,
  openSpotifyBrowserLogin,
  signInWithSpotify,
  signInWithSpotifyCookie,
} from "@/shared/spotify";

interface SpotifyLoginModalProps {
  open: boolean;
  onClose: () => void;
}

const ONE_CLICK_SCRIPT = `fetch("http://127.0.0.1:43829/auth?cookie=" + encodeURIComponent(document.cookie.match(/sp_dc=([^;]+)/)?.[1] || "")).then(r => r.json()).then(console.log);`;

export default function SpotifyLoginModal({
  open,
  onClose,
}: SpotifyLoginModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [cookieInput, setCookieInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When modal opens, launch the default system browser and start local loopback listener
  useEffect(() => {
    if (!open) return;
    setCookieInput("");
    setErrorMessage(null);
    setCopied(false);

    void openSpotifyBrowserLogin();

    const unsubscribe = onSpotifyAuthChanged(() => {
      if (isSpotifySignedIn()) {
        toast("Spotify conectado com sucesso!", "checkmark");
        onClose();
      }
    });

    return () => {
      unsubscribe();
      void cancelSpotifyBrowserLogin();
    };
  }, [open, onClose, toast]);

  const handleReopenBrowser = async () => {
    setErrorMessage(null);
    await openSpotifyBrowserLogin();
    toast("Navegador aberto novamente", "checkmark");
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(ONE_CLICK_SCRIPT);
      setCopied(true);
      toast("Comando copiado para a área de transferência!", "checkmark");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Não foi possível copiar automaticamente", "error");
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setCookieInput(text.trim());
        setErrorMessage(null);
      }
    } catch {
      // clipboard access not permitted
    }
  };

  const handleConnectWithCookie = async () => {
    if (!cookieInput.trim()) return;
    setSubmitting(true);
    setErrorMessage(null);

    const result = await signInWithSpotifyCookie(cookieInput.trim());
    setSubmitting(false);

    if (result.success) {
      toast("Spotify conectado com sucesso!", "checkmark");
      onClose();
    } else {
      setErrorMessage(
        result.error || "Cookie inválido. Verifique se copiou corretamente.",
      );
    }
  };

  const handleEmbeddedLogin = async () => {
    setErrorMessage(null);
    setSubmitting(true);
    const result = await signInWithSpotify();
    setSubmitting(false);

    if (result.success) {
      toast("Spotify conectado com sucesso!", "checkmark");
      onClose();
    } else if (!result.cancelled && result.error) {
      setErrorMessage(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => !val && onClose()}
      maxWidth={520}
      className="p-[20px] flex flex-col gap-[16px]"
    >
      <DialogHeader
        title={
          <div className="flex items-center gap-[10px]">
            <SpotifyFill size={24} className="text-[#1DB954]" />
            <span>Conectar Spotify pelo Navegador</span>
          </div>
        }
        description="Abrimos o Spotify no seu navegador padrão para você entrar na sua conta com segurança."
      />

      <div className="flex flex-col gap-[14px]">
        {/* Browser indicator bar */}
        <div className="flex items-center justify-between px-[14px] py-[10px] rounded-item bg-fill/60 border border-border/40 text-[13px]">
          <span className="text-text-secondary">
            Navegador padrão iniciado no Spotify
          </span>
          <button
            type="button"
            onClick={handleReopenBrowser}
            className="flex items-center gap-[5px] text-text-primary hover:text-[#1DB954] font-medium transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            <ExternalLinkLine size={15} />
            <span>Reabrir navegador</span>
          </button>
        </div>

        {/* Method 1: 1-Click command */}
        <div className="flex flex-col gap-[8px] p-[12px] rounded-item bg-bg-elevated/40 border border-border/30">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text-primary">
              Método 1: Comando rápido (1 clique)
            </span>
            <button
              type="button"
              onClick={handleCopyScript}
              className="flex items-center gap-[4px] px-[10px] py-[4px] rounded-item bg-fill hover:bg-fill-hover text-[12px] font-medium text-text-primary transition-colors cursor-pointer border-none"
            >
              {copied ? (
                <>
                  <CheckLine size={14} className="text-[#1DB954]" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy2Line size={14} />
                  <span>Copiar comando</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[12px] text-text-tertiary leading-[1.4]">
            No Spotify aberto no navegador, pressione{" "}
            <kbd className="px-[5px] py-[1px] rounded bg-fill font-mono text-[11px] text-text-primary">
              F12
            </kbd>
            , vá até a aba <strong>Console</strong>, cole o comando e aperte{" "}
            <strong>Enter</strong>. O OFFY conectará instantaneamente!
          </p>
        </div>

        {/* Method 2: Paste sp_dc cookie */}
        <div className="flex flex-col gap-[8px] p-[12px] rounded-item bg-bg-elevated/40 border border-border/30">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text-primary">
              Método 2: Ou cole o cookie sp_dc
            </span>
            <button
              type="button"
              onClick={() => setShowManualGuide((v) => !v)}
              className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors cursor-pointer bg-transparent border-none p-0 flex items-center gap-[3px]"
            >
              <InformationLine size={14} />
              <span>{showManualGuide ? "Ocultar ajuda" : "Onde acho?"}</span>
            </button>
          </div>

          {showManualGuide && (
            <div className="text-[12px] text-text-secondary bg-fill/40 p-[10px] rounded-item leading-[1.45] border border-border/20">
              Pressione <strong>F12</strong> no Spotify &rarr; aba{" "}
              <strong>Aplicativo</strong> (ou Storage) &rarr;{" "}
              <strong>Cookies</strong> &rarr; <code>open.spotify.com</code>{" "}
              &rarr; copie o valor do cookie <code>sp_dc</code>.
            </div>
          )}

          <div className="flex items-center gap-[8px]">
            <input
              type="text"
              value={cookieInput}
              onChange={(e) => {
                setCookieInput(e.target.value);
                setErrorMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConnectWithCookie();
              }}
              placeholder="Cole o cookie sp_dc ou valor aqui..."
              className="flex-1 h-[36px] px-[12px] rounded-item bg-fill border border-border/40 text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-primary/40"
            />
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              className="h-[36px] px-[12px] rounded-item bg-fill hover:bg-fill-hover text-[12px] font-medium text-text-primary transition-colors cursor-pointer border-none shrink-0"
            >
              Colar
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="text-[12.5px] text-red-400 bg-red-500/10 border border-red-500/20 px-[12px] py-[8px] rounded-item">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-between pt-[4px]">
          <button
            type="button"
            onClick={handleEmbeddedLogin}
            disabled={submitting}
            className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors cursor-pointer bg-transparent border-none p-0 underline underline-offset-2"
          >
            Prefere entrar em janela interna?
          </button>
        </div>
      </div>

      <DialogActions className="mt-[8px]">
        <DialogButton variant="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </DialogButton>
        <DialogButton
          variant="primary"
          onClick={handleConnectWithCookie}
          disabled={!cookieInput.trim() || submitting}
          loading={submitting}
        >
          {submitting ? "Validando..." : "Conectar"}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}
