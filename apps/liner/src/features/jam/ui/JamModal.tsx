import { useState } from "react";
import Dialog from "@/shared/ui/Dialog";
import { DialogActions, DialogButton, DialogHeader } from "@/shared/ui";
import TextInput from "@/shared/ui/TextInput";
import { showToast } from "@/shared/ui";
import { useJamStore } from "../store/jamStore";

export default function JamModal() {
  const {
    isOpen,
    closeModal,
    code,
    isHost,
    isConnecting,
    error,
    participants,
    shareUrl,
    jamDeepLink,
    createJam,
    joinJam,
    leaveJam,
  } = useJamStore();

  const [tab, setTab] = useState<"create" | "join">("create");
  const [inputCode, setInputCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      showToast.checkmark("Código copiado para a área de transferência!");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showToast.error("Não foi possível copiar o código.");
    }
  };

  const handleCopyLink = async () => {
    const linkToCopy = shareUrl || jamDeepLink;
    if (!linkToCopy) return;
    try {
      await navigator.clipboard.writeText(linkToCopy);
      setCopiedLink(true);
      showToast.checkmark("Link de convite copiado!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      showToast.error("Não foi possível copiar o link.");
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    const ok = await joinJam(inputCode);
    if (ok) {
      setInputCode("");
    }
  };

  const isConnected = Boolean(code);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? closeModal() : undefined)} maxWidth={440}>
      <div className="flex flex-col gap-[16px] px-[20px] pb-[20px]">
        <DialogHeader
          title={isConnected ? "Sessão Jam Ativa" : "Ouvir Juntos (Jam)"}
          description={
            isConnected
              ? isHost
                ? "Você é o Host. Suas músicas e ações serão sincronizadas com todos na sala."
                : "Você está conectado. As músicas estão sendo sincronizadas pelo Host."
              : "Ouça suas músicas favoritas sincronizadas com seus amigos em tempo real."
          }
        />

        {error && (
          <div className="rounded-[10px] bg-red-500/10 border border-red-500/20 px-[12px] py-[8px] text-[13px] text-red-400">
            {error}
          </div>
        )}

        {!isConnected ? (
          <>
            {/* Abas Criar / Entrar */}
            <div className="flex p-[4px] rounded-item bg-fill">
              <button
                type="button"
                onClick={() => setTab("create")}
                className={`flex-1 h-[34px] rounded-[9px] text-body font-[500] transition-all cursor-pointer border-none ${
                  tab === "create"
                    ? "bg-fill-hover text-text-primary"
                    : "bg-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                Criar Sala
              </button>
              <button
                type="button"
                onClick={() => setTab("join")}
                className={`flex-1 h-[34px] rounded-[9px] text-body font-[500] transition-all cursor-pointer border-none ${
                  tab === "join"
                    ? "bg-fill-hover text-text-primary"
                    : "bg-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                Entrar com Código
              </button>
            </div>

            {tab === "create" ? (
              <div className="flex flex-col gap-[16px] py-[6px]">
                <p className="text-[13.5px] text-text-secondary leading-relaxed">
                  Ao criar uma Jam, um código exclusivo de 6 dígitos será gerado. Compartilhe o código ou o link direto
                  com seus amigos para começarem a ouvir juntos.
                </p>
                <DialogActions className="mt-[4px]">
                  <DialogButton type="button" onClick={closeModal}>
                    Cancelar
                  </DialogButton>
                  <DialogButton
                    type="button"
                    variant="primary"
                    loading={isConnecting}
                    onClick={() => void createJam()}
                  >
                    Iniciar Jam
                  </DialogButton>
                </DialogActions>
              </div>
            ) : (
              <form onSubmit={handleJoinSubmit} className="flex flex-col gap-[16px] py-[6px]">
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[12px] uppercase font-semibold tracking-wider text-text-secondary">
                    Código da Jam (6 dígitos)
                  </label>
                  <TextInput
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="Ex: A7X9K2"
                    autoFocus
                    className="font-mono text-[16px] tracking-[0.2em] uppercase text-center"
                  />
                </div>
                <DialogActions className="mt-[4px]">
                  <DialogButton type="button" onClick={closeModal}>
                    Cancelar
                  </DialogButton>
                  <DialogButton
                    type="submit"
                    variant="primary"
                    loading={isConnecting}
                    disabled={inputCode.trim().length !== 6}
                  >
                    Entrar na Sala
                  </DialogButton>
                </DialogActions>
              </form>
            )}
          </>
        ) : (
          /* Estado Ativo da Jam */
          <div className="flex flex-col gap-[16px]">
            {/* Box com o código */}
            <div className="flex flex-col items-center justify-center p-[16px] rounded-[14px] bg-fill border border-white/[0.08]">
              <span className="text-[11px] uppercase tracking-[0.1em] text-text-secondary mb-[4px]">
                Código da Jam
              </span>
              <div className="text-[32px] font-mono font-bold tracking-[0.25em] text-primary my-[4px] pl-[0.25em]">
                {code}
              </div>
              <div className="flex items-center gap-[8px] mt-[10px] w-full">
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="flex-1 py-[8px] px-[12px] rounded-[8px] text-[13px] font-medium bg-fill-hover hover:bg-white/[0.12] transition-colors border-none text-text-primary cursor-pointer"
                >
                  {copiedCode ? "Copiado!" : "Copiar Código"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyLink()}
                  className="flex-1 py-[8px] px-[12px] rounded-[8px] text-[13px] font-medium bg-fill-hover hover:bg-white/[0.12] transition-colors border-none text-text-primary cursor-pointer"
                >
                  {copiedLink ? "Link Copiado!" : "Copiar Link"}
                </button>
              </div>
            </div>

            {/* Participantes */}
            <div className="flex flex-col gap-[8px]">
              <div className="flex items-center justify-between">
                <span className="text-[12px] uppercase font-semibold tracking-wider text-text-secondary">
                  Participantes ({participants.length})
                </span>
                <span className="inline-flex items-center gap-[6px] text-[12px] text-emerald-400 font-medium">
                  <span className="w-[7px] h-[7px] rounded-full bg-emerald-400 animate-pulse" />
                  Sincronizado
                </span>
              </div>
              <div className="max-h-[140px] overflow-y-auto flex flex-col gap-[6px] pr-[4px]">
                {participants.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between px-[10px] py-[6px] rounded-[8px] bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-[8px]">
                      <div className="w-[28px] h-[28px] rounded-full bg-white/[0.1] flex items-center justify-center text-[12px] font-bold text-text-primary">
                        {p.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-[13px] font-medium text-text-primary">
                        {p.displayName}
                      </span>
                    </div>
                    {p.isHost && (
                      <span className="text-[10.5px] uppercase font-bold tracking-wider px-[6px] py-[2px] rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                        Host
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Ações */}
            <DialogActions className="mt-[4px]">
              <DialogButton type="button" onClick={closeModal}>
                Fechar Janela
              </DialogButton>
              <DialogButton
                type="button"
                variant="danger"
                onClick={() => {
                  void leaveJam();
                  closeModal();
                }}
              >
                {isHost ? "Encerrar Jam" : "Sair da Jam"}
              </DialogButton>
            </DialogActions>
          </div>
        )}
      </div>
    </Dialog>
  );
}
