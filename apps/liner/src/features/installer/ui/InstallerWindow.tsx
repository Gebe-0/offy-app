import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Folder2,
  CheckCircle,
  ShieldCheck,
  SettingsMinimalistic,
  UsersGroupRounded,
  User,
  MusicNote,
} from "@solar-icons/react";
import {
  CloseLine,
  MinimizeLine,
  ComputerLine,
  SparklesLine,
} from "@mingcute/react";
import logo from "@/assets/logo.svg";
import { ToggleSwitch, showToast } from "@/shared/ui";
import { LegalModal } from "@/features/auth";
import { cn } from "@/shared/lib";

export interface InstallerWindowProps {
  onFinish?: () => void;
}

export function InstallerWindow({ onFinish }: InstallerWindowProps) {
  const navigate = useNavigate();

  // Mode: single user vs all users
  const [installScope, setInstallScope] = useState<"user" | "all">("user");
  const [installPath, setInstallPath] = useState(
    "C:\\Users\\Administrator\\AppData\\Local\\Programs\\offy",
  );
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState(true);
  const [createStartMenuShortcut, setCreateStartMenuShortcut] = useState(true);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [enableTransparency, setEnableTransparency] = useState(true);

  // Installation progression state
  const [status, setStatus] = useState<"idle" | "installing" | "completed">(
    "idle",
  );
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  // Legal Modal
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<"terms" | "privacy">("terms");

  const handleStartInstallation = () => {
    setStatus("installing");
    setProgress(5);
    setStatusMessage("Inicializando assistente de instalação do OFFY...");

    // Smooth simulated step progression for a rich setup experience
    const timeline = [
      {
        pct: 25,
        msg: "Descompactando biblioteca de áudio e decodificadores lossless...",
        delay: 500,
      },
      {
        pct: 55,
        msg: "Calibrando aceleração de GPU e composição de vidro (Mica/Acrylic)...",
        delay: 1100,
      },
      {
        pct: 80,
        msg: "Registrando atalhos do sistema e protocolo offy://...",
        delay: 1800,
      },
      {
        pct: 98,
        msg: "Otimizando cache local e finalizando configuração...",
        delay: 2400,
      },
      {
        pct: 100,
        msg: "Instalação concluída com sucesso!",
        delay: 2900,
      },
    ];

    timeline.forEach(({ pct, msg, delay }) => {
      setTimeout(() => {
        setProgress(pct);
        setStatusMessage(msg);
        if (pct === 100) {
          setStatus("completed");
          try {
            localStorage.setItem("offy_setup_completed", "true");
          } catch {}
        }
      }, delay);
    });
  };

  const handleFinish = () => {
    try {
      localStorage.setItem("offy_setup_completed", "true");
    } catch {}

    if (window.linerElectron?.setSize) {
      void window.linerElectron.setSize({
        width: 1200,
        height: 780,
        resizable: true,
      });
    }

    if (onFinish) {
      onFinish();
    } else {
      navigate("/", { replace: true });
    }
  };

  const handleMinimize = () => {
    window.linerElectron?.minimize?.();
  };

  const handleClose = () => {
    window.linerElectron?.close?.();
  };

  const handleChangePath = () => {
    showToast.info("Caminho padrão recomendado para manter atualizações automáticas.");
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center p-4 select-none">
      {/* Background radial glow orbs */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-[350px] w-[350px] rounded-full bg-purple-600/20 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 h-[350px] w-[350px] rounded-full bg-indigo-600/20 blur-[130px]" />

      {/* Main Glass Installer Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex w-[780px] max-w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0e1017]/85 shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-[36px]"
      >
        {/* Top Header / Titlebar */}
        <div
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
          className="flex h-[46px] items-center justify-between border-b border-white/[0.06] px-5 select-none"
        >
          <div className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="OFFY"
              className="h-4 w-auto object-contain"
              draggable={false}
            />
            <span className="text-[13px] font-[600] tracking-tight text-white/90">
              Instalação do OFFY
            </span>
            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10.5px] font-[500] text-white/60">
              v1.0.6
            </span>
          </div>

          <div
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            className="flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={handleMinimize}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title="Minimizar"
            >
              <MinimizeLine size={14} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-red-500/80 hover:text-white"
              title="Fechar"
            >
              <CloseLine size={15} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-col p-7">
          {/* Brand & Subtitle */}
          <div className="flex items-center justify-between pb-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600/30 via-indigo-500/20 to-transparent border border-white/10 shadow-inner">
                <img
                  src={logo}
                  alt="OFFY"
                  className="h-7 w-auto object-contain filter drop-shadow-[0_2px_10px_rgba(168,85,247,0.5)]"
                  draggable={false}
                />
              </div>
              <div className="flex flex-col">
                <h1 className="text-[20px] font-[700] text-white tracking-tight">
                  Bem-vindo ao OFFY
                </h1>
                <p className="text-[13px] text-white/60">
                  Player de música de alta fidelidade, sessões Jam e interface fluida.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-emerald-400 text-[12px] font-[500]">
              <ShieldCheck size={14} />
              <span>Assinado Digitalmente</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {status === "idle" && (
              <motion.div
                key="config-step"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mt-6 flex flex-col gap-5"
              >
                {/* Installation Scope Cards (Replacing the ugly radio buttons) */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[12px] font-[600] uppercase tracking-wider text-white/50">
                    Modo de Instalação
                  </span>

                  <div className="grid grid-cols-2 gap-3.5">
                    {/* User Scope Card */}
                    <button
                      type="button"
                      onClick={() => {
                        setInstallScope("user");
                        setInstallPath(
                          "C:\\Users\\Administrator\\AppData\\Local\\Programs\\offy",
                        );
                      }}
                      className={cn(
                        "relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
                        installScope === "user"
                          ? "border-purple-500/70 bg-purple-500/10 shadow-[0_0_24px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/50"
                          : "border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg",
                              installScope === "user"
                                ? "bg-purple-500 text-white"
                                : "bg-white/10 text-white/70",
                            )}
                          >
                            <User size={15} />
                          </div>
                          <span className="text-[14px] font-[600] text-white">
                            Apenas para mim
                          </span>
                        </div>
                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10.5px] font-[600] text-purple-300">
                          Recomendado
                        </span>
                      </div>
                      <p className="text-[12px] leading-relaxed text-white/60">
                        Instalação rápida na pasta do usuário. Não requer privilégios
                        de administrador (UAC) e atualiza silenciosamente.
                      </p>
                    </button>

                    {/* All Users Scope Card */}
                    <button
                      type="button"
                      onClick={() => {
                        setInstallScope("all");
                        setInstallPath("C:\\Program Files\\OFFY");
                      }}
                      className={cn(
                        "relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
                        installScope === "all"
                          ? "border-purple-500/70 bg-purple-500/10 shadow-[0_0_24px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/50"
                          : "border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg",
                              installScope === "all"
                                ? "bg-purple-500 text-white"
                                : "bg-white/10 text-white/70",
                            )}
                          >
                            <UsersGroupRounded size={15} />
                          </div>
                          <span className="text-[14px] font-[600] text-white">
                            Todos os usuários
                          </span>
                        </div>
                      </div>
                      <p className="text-[12px] leading-relaxed text-white/60">
                        Disponibiliza o OFFY para todas as contas deste computador.
                        Requer privilégios de Administrador.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Destination folder */}
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-[600] uppercase tracking-wider text-white/50">
                    Local de Instalação
                  </span>
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <Folder2 size={16} className="text-purple-400 shrink-0" />
                      <span className="truncate text-[12.5px] font-mono text-white/80">
                        {installPath}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangePath}
                      className="ml-3 shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-[11.5px] font-[500] text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                    >
                      Alterar
                    </button>
                  </div>
                </div>

                {/* Additional Preferences */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2.5">
                      <ComputerLine size={16} className="text-white/60" />
                      <span className="text-[13px] text-white/90">
                        Criar atalho na Área de Trabalho
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={createDesktopShortcut}
                      onChange={setCreateDesktopShortcut}
                      ariaLabel="Atalho Área de Trabalho"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2.5">
                      <SparklesLine size={16} className="text-white/60" />
                      <span className="text-[13px] text-white/90">
                        Adicionar ao Menu Iniciar
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={createStartMenuShortcut}
                      onChange={setCreateStartMenuShortcut}
                      ariaLabel="Menu Iniciar"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2.5">
                      <SettingsMinimalistic size={16} className="text-white/60" />
                      <span className="text-[13px] text-white/90">
                        Iniciar com o Windows
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={startWithWindows}
                      onChange={setStartWithWindows}
                      ariaLabel="Iniciar com Windows"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2.5">
                      <MusicNote size={16} className="text-purple-400" />
                      <span className="text-[13px] text-white/90">
                        Efeitos de Vidro e Transparência
                      </span>
                    </div>
                    <ToggleSwitch
                      checked={enableTransparency}
                      onChange={setEnableTransparency}
                      ariaLabel="Efeitos de Vidro"
                    />
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-3 flex items-center justify-between pt-4 border-t border-white/[0.06]">
                  <p className="text-[11.5px] text-white/50">
                    Ao instalar, você aceita os{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setLegalTab("terms");
                        setLegalOpen(true);
                      }}
                      className="text-purple-400 underline underline-offset-2 hover:text-purple-300"
                    >
                      Termos de Serviço
                    </button>{" "}
                    e a{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setLegalTab("privacy");
                        setLegalOpen(true);
                      }}
                      className="text-purple-400 underline underline-offset-2 hover:text-purple-300"
                    >
                      Política de Privacidade
                    </button>
                    .
                  </p>

                  <button
                    type="button"
                    onClick={handleStartInstallation}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 px-6 py-2.5 text-[13.5px] font-[600] text-white shadow-[0_4px_20px_rgba(147,51,234,0.35)] transition-all hover:scale-[1.02] hover:shadow-[0_6px_25px_rgba(147,51,234,0.5)] active:scale-[0.98]"
                  >
                    <span>Instalar o OFFY</span>
                  </button>
                </div>
              </motion.div>
            )}

            {(status === "installing" || status === "completed") && (
              <motion.div
                key="progress-step"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="mt-8 flex flex-col items-center justify-center py-6 text-center"
              >
                {status === "installing" ? (
                  <div className="relative mb-6 flex h-16 w-16 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                    <img
                      src={logo}
                      alt=""
                      className="h-6 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 14 }}
                    className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_30px_rgba(52,211,153,0.3)]"
                  >
                    <CheckCircle size={36} />
                  </motion.div>
                )}

                <h2 className="text-[18px] font-[700] text-white">
                  {status === "installing"
                    ? "Instalando o OFFY..."
                    : "Instalação Concluída!"}
                </h2>
                <p className="mt-1.5 text-[13px] text-white/60 max-w-[420px]">
                  {statusMessage}
                </p>

                {/* Progress Bar Track */}
                <div className="mt-6 h-2 w-full max-w-[500px] overflow-hidden rounded-full bg-white/10 p-[1px]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>

                <span className="mt-2 text-[11px] font-mono text-white/40">
                  {progress}%
                </span>

                {status === "completed" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6"
                  >
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-8 py-3 text-[14px] font-[600] text-white shadow-[0_4px_24px_rgba(147,51,234,0.4)] transition-all hover:scale-[1.03] active:scale-[0.98]"
                    >
                      <SparklesLine size={16} />
                      <span>Abrir o OFFY Agora</span>
                    </button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Embedded Legal Modal */}
      <LegalModal
        open={legalOpen}
        initialTab={legalTab}
        onOpenChange={setLegalOpen}
      />
    </div>
  );
}

export default InstallerWindow;
