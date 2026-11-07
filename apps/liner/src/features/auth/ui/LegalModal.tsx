import { useState, useEffect } from "react";
import Dialog from "@/shared/ui/Dialog";
import { DialogActions, DialogButton, DialogHeader } from "@/shared/ui";
import { useTranslation } from "@/languages";

export interface LegalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: "terms" | "privacy";
}

export default function LegalModal({
  open,
  onOpenChange,
  initialTab = "terms",
}: LegalModalProps) {
  const { locale } = useTranslation();
  const isPt = locale === "pt";
  const [tab, setTab] = useState<"terms" | "privacy">(initialTab);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidth={540}
      zIndex={250}
    >
      <div className="flex flex-col gap-[14px] px-[20px] pb-[20px]">
        <DialogHeader
          title={
            isPt
              ? tab === "terms"
                ? "Termos de Serviço"
                : "Política de Privacidade"
              : tab === "terms"
                ? "Terms of Service"
                : "Privacy Policy"
          }
          description={
            isPt
              ? "Informações legais, direitos do usuário e política de dados do OFFY."
              : "Legal information, user rights, and data policies for OFFY."
          }
        />

        {/* Abas Alternadoras */}
        <div className="flex p-[3px] rounded-item bg-fill">
          <button
            type="button"
            onClick={() => setTab("terms")}
            className={`flex-1 h-[32px] rounded-[8px] text-[13px] font-[500] transition-all cursor-pointer border-none ${
              tab === "terms"
                ? "bg-fill-hover text-text-primary font-semibold shadow-xs"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {isPt ? "Termos de Serviço" : "Terms of Service"}
          </button>
          <button
            type="button"
            onClick={() => setTab("privacy")}
            className={`flex-1 h-[32px] rounded-[8px] text-[13px] font-[500] transition-all cursor-pointer border-none ${
              tab === "privacy"
                ? "bg-fill-hover text-text-primary font-semibold shadow-xs"
                : "bg-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {isPt ? "Política de Privacidade" : "Privacy Policy"}
          </button>
        </div>

        {/* Conteúdo rolável com texto legal */}
        <div className="max-h-[380px] overflow-y-auto pr-[8px] flex flex-col gap-[14px] text-[12.5px] leading-relaxed text-text-secondary">
          {tab === "terms" ? (
            isPt ? (
              // Termos de Serviço em Português
              <>
                <div className="rounded-[10px] bg-fill p-[10px] text-[11.5px] text-text-tertiary">
                  <strong>Última atualização:</strong> Novembro de 2026 • <strong>Projeto:</strong> Equipe OFFY (Software Independente) • <strong>Contato:</strong> gabrielpereirarufino.g@gmail.com
                </div>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">1. Aceitação dos Termos e Elegibilidade</h4>
                  <p className="m-0">
                    Ao criar uma conta, instalar, acessar ou utilizar o aplicativo OFFY (&ldquo;Aplicativo&rdquo; ou &ldquo;Serviço&rdquo;), você declara ter lido, compreendido e concordado com estes Termos de Serviço. O uso deste software é permitido exclusivamente a indivíduos com no mínimo 13 (treze) anos de idade completos.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">2. Natureza do Serviço e Isenção de Conteúdo de Terceiros</h4>
                  <p className="m-0">
                    O OFFY é um software cliente de código aberto / independente projetado como reprodutor e navegador de mídias para uso estritamente pessoal e não comercial.
                  </p>
                  <p className="m-0">
                    <strong>O OFFY NÃO hospeda, não armazena, não copia, não faz upload e não comercializa arquivos de mídia, faixas de áudio ou músicas protegidas por direitos autorais em seus servidores.</strong>
                  </p>
                  <p className="m-0">
                    Todos os fluxos de áudio, metadados, títulos, nomes de artistas e capas exibidos são acessados a partir de provedores e APIs públicas de terceiros (como YouTube e fontes abertas na internet). Quaisquer marcas registradas, títulos e direitos autorais pertencem exclusivamente aos seus respectivos titulares e detentores legais.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">3. Notificações de Violação de Direitos Autorais (DMCA)</h4>
                  <p className="m-0">
                    Respeitamos integralmente os direitos de propriedade intelectual. Caso você seja detentor de direitos autorais ou representante legal e identifique que qualquer referência a metadados deva ser revisada, envie uma notificação para <strong>gabrielpereirarufino.g@gmail.com</strong> contendo a identificação da obra e comprovação de titularidade. Agiremos prontamente para verificar e mitigar qualquer apontamento.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">4. Isenção de Garantias e Limitação de Responsabilidade (&ldquo;AS IS&rdquo;)</h4>
                  <p className="m-0">
                    O software é disponibilizado &ldquo;no estado em que se encontra&rdquo; (&ldquo;AS IS&rdquo;) e &ldquo;conforme disponível&rdquo;, sem garantias de qualquer natureza, expressas ou implícitas, incluindo, mas não se limitando a garantias de comercialização, adequação a uma finalidade específica ou funcionamento ininterrupto.
                  </p>
                  <p className="m-0">
                    Em nenhuma circunstância os desenvolvedores ou mantenedores do projeto OFFY serão responsáveis por quaisquer danos diretos, indiretos, incidentais, especiais, consequenciais ou punitivos decorrentes do uso ou da incapacidade de uso do software, indisponibilidade temporária de servidores ou perdas de dados.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">5. Uso Permitido e Conduta do Usuário</h4>
                  <p className="m-0">
                    Você concorda em utilizar o Serviço exclusivamente para fins lícitos e pessoais. É expressamente vedado: (a) tentar violar, burlar ou sobrecarregar a infraestrutura dos servidores; (b) realizar ataques de negação de serviço (DoS/DDoS); (c) revender ou explorar comercialmente o acesso à API do OFFY; ou (d) utilizar o software para qualquer finalidade contrária à legislação vigente.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">6. Alterações dos Termos</h4>
                  <p className="m-0">
                    Os mantenedores do projeto reservam-se o direito de atualizar estes Termos a qualquer momento para refletir melhorias técnicas, novas funcionalidades ou exigências legais. O uso continuado do aplicativo após eventuais atualizações constitui sua aceitação plena dos novos termos.
                  </p>
                </section>
              </>
            ) : (
              // Terms of Service in English
              <>
                <div className="rounded-[10px] bg-fill p-[10px] text-[11.5px] text-text-tertiary">
                  <strong>Last Updated:</strong> November 2026 • <strong>Project:</strong> OFFY Team (Independent Software Project) • <strong>Contact:</strong> gabrielpereirarufino.g@gmail.com
                </div>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">1. Acceptance of Terms & Eligibility</h4>
                  <p className="m-0">
                    By downloading, installing, registering, or using the OFFY application (&ldquo;Service&rdquo; or &ldquo;App&rdquo;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service. You must be at least 13 years of age to use this software.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">2. Service Nature & Third-Party Content Disclaimer</h4>
                  <p className="m-0">
                    OFFY is an independent client-side media browser and player engineered strictly for individual, personal, and non-commercial purposes.
                  </p>
                  <p className="m-0">
                    <strong>OFFY DOES NOT host, store, copy, upload, or commercialize any copyrighted audio files, media tracks, or music files on its servers.</strong>
                  </p>
                  <p className="m-0">
                    All audio streams, metadata, artist names, titles, and cover art displayed in the application are retrieved directly from publicly available third-party services and APIs (including YouTube and public web sources). All trademarks, logos, audio content, and copyrights belong entirely to their respective owners.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">3. Copyright Infringement & DMCA Takedown Notices</h4>
                  <p className="m-0">
                    We fully respect the intellectual property rights of copyright holders. If you are a copyright owner or authorized representative and believe any metadata or links in OFFY should be removed or blocked, please send a written notification to <strong>gabrielpereirarufino.g@gmail.com</strong> with identification of the copyrighted work and proof of ownership. We will process and address legitimate notices promptly.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">4. Disclaimer of Warranties & Limitation of Liability (&ldquo;AS IS&rdquo;)</h4>
                  <p className="m-0">
                    The software is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any kind, whether express, statutory, or implied, including warranties of merchantability, fitness for a particular purpose, uninterrupted uptime, or non-infringement.
                  </p>
                  <p className="m-0">
                    To the maximum extent permitted by applicable law, in no event shall the authors, maintainers, or contributors of OFFY be liable for any direct, indirect, incidental, consequential, special, or exemplary damages, including data loss, hardware issues, or server downtime arising out of the use or inability to use the software.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">5. Prohibited Uses & User Conduct</h4>
                  <p className="m-0">
                    You agree to use OFFY strictly for lawful personal purposes. You agree not to: (a) attempt to breach, disrupt, or overload the backend servers; (b) conduct denial-of-service (DoS/DDoS) attacks; (c) commercially exploit or resell access to the OFFY API; or (d) reverse engineer the software for malicious or unauthorized activities.
                  </p>
                </section>

                <section className="flex flex-col gap-[4px]">
                  <h4 className="text-[13.5px] font-semibold text-text-primary m-0">6. Modifications to Terms</h4>
                  <p className="m-0">
                    We reserve the right to amend these Terms at any time to reflect operational, architectural, or legal updates. Your continued use of the application constitutes acceptance of any modified terms.
                  </p>
                </section>
              </>
            )
          ) : isPt ? (
            // Política de Privacidade em Português (LGPD)
            <>
              <div className="rounded-[10px] bg-fill p-[10px] text-[11.5px] text-text-tertiary">
                <strong>Última atualização:</strong> Novembro de 2026 • <strong>Conformidade:</strong> Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018) • <strong>Contato DPO/Encarregado:</strong> gabrielpereirarufino.g@gmail.com
              </div>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">1. Compromisso com a sua Privacidade</h4>
                <p className="m-0">
                  Esta Política de Privacidade descreve como o OFFY coleta, armazena e protege as informações dos usuários, em total conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD).
                </p>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">2. Quais Dados Coletamos</h4>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px]">
                  <li><strong>Dados de Conta:</strong> Endereço de e-mail e nome de exibição escolhido no momento do cadastro.</li>
                  <li><strong>Credenciais de Acesso:</strong> Senhas são armazenadas exclusivamente através de funções de hash criptográfico irreversível (nunca em texto simples).</li>
                  <li><strong>Preferências e Biblioteca:</strong> Lista de faixas curtidas, playlists criadas pelo usuário e histórico recente de reprodução, armazenados com a única finalidade de permitir a sincronização entre seus dispositivos.</li>
                  <li><strong>Dados Técnicos Mínimos:</strong> Endereço IP e identificadores de sessão temporários estritamente necessários para viabilizar conexões de rede e diagnóstico de estabilidade.</li>
                </ul>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">3. Finalidade do Tratamento</h4>
                <p className="m-0">
                  Os dados pessoais coletados possuem propósitos estritos:
                </p>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px]">
                  <li>Autenticar sua conta e permitir o acesso seguro aos seus dados;</li>
                  <li>Sincronizar suas playlists e faixas salvas na nuvem;</li>
                  <li>Viabilizar a sincronização colaborativa em tempo real no recurso Jam (&ldquo;Ouvir Juntos&rdquo;);</li>
                  <li>Prevenir abusos e ataques automatizados contra a infraestrutura do serviço.</li>
                </ul>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">4. Não Compartilhamento e Não Comercialização</h4>
                <p className="m-0">
                  <strong>Nós NUNCA vendemos, alugamos, compartilhamos ou comercializamos seus dados pessoais</strong> com corretores de dados, empresas de marketing ou redes de anúncios publicitários de qualquer espécie. O OFFY não possui fins de monetização por venda de dados de usuários.
                </p>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">5. Seus Direitos (LGPD Art. 18) e Exclusão de Conta</h4>
                <p className="m-0">
                  Em conformidade com o artigo 18 da LGPD, você possui o direito de:
                </p>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px]">
                  <li>Confirmar a existência de tratamento e acessar seus dados cadastrais;</li>
                  <li>Corrigir dados incompletos ou desatualizados;</li>
                  <li><strong>Solicitar a exclusão definitiva</strong> de sua conta e de todos os dados a ela vinculados (playlists, histórico e credenciais).</li>
                </ul>
                <p className="m-0">
                  Para exercer qualquer desses direitos, basta enviar uma mensagem a partir do e-mail cadastrado para <strong>gabrielpereirarufino.g@gmail.com</strong> com o assunto &ldquo;LGPD - Exclusão de Conta&rdquo;. Todos os dados serão permanentemente excluídos do banco de dados em até 72 horas úteis.
                </p>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">6. Segurança da Informação</h4>
                <p className="m-0">
                  Implementamos padrões modernos de segurança técnica, incluindo comunicações totalmente criptografadas via HTTPS/TLS com certificados confiáveis e proteção contra injeções e ataques de força bruta.
                </p>
              </section>
            </>
          ) : (
            // Privacy Policy in English (GDPR / Global)
            <>
              <div className="rounded-[10px] bg-fill p-[10px] text-[11.5px] text-text-tertiary">
                <strong>Last Updated:</strong> November 2026 • <strong>Compliance:</strong> General Data Protection Regulation (GDPR) & Global Privacy Standards • <strong>Contact:</strong> gabrielpereirarufino.g@gmail.com
              </div>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">1. Our Commitment to Privacy</h4>
                <p className="m-0">
                  This Privacy Policy explains how OFFY collects, uses, and safeguards your personal data when you interact with our application and backend infrastructure.
                </p>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">2. Information We Collect</h4>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px]">
                  <li><strong>Account Data:</strong> Your email address and chosen display name created during registration.</li>
                  <li><strong>Security Credentials:</strong> Passwords are cryptographically salted and hashed using irreversible algorithms. Plaintext passwords are never stored or logged.</li>
                  <li><strong>Library & Preferences:</strong> User-created playlists, saved/liked tracks, and playback history saved solely to synchronize your library across your devices.</li>
                  <li><strong>Network Telemetry:</strong> Minimal technical information (such as IP address) required for HTTP/TLS connections and network health diagnostics.</li>
                </ul>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">3. Purpose of Processing</h4>
                <p className="m-0">
                  Your data is processed strictly for the following operational necessities:
                </p>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px]">
                  <li>To authenticate you and safeguard your user session;</li>
                  <li>To sync playlists and user preferences across your authorized devices;</li>
                  <li>To power real-time collaborative listening sessions (Jam mode);</li>
                  <li>To protect our infrastructure against bot attacks, scraping, and abusive traffic.</li>
                </ul>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">4. Zero Sale or Third-Party Data Sharing</h4>
                <p className="m-0">
                  <strong>We do NOT sell, rent, monetize, or trade your personal data</strong> to advertisers, data brokers, or marketing firms under any circumstances. OFFY is an independent project with no ad-tracking or commercial profiling incentives.
                </p>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">5. Your Data Rights & Account Erasure (Right to be Forgotten)</h4>
                <p className="m-0">
                  Regardless of your country of residence, you retain full rights regarding your data:
                </p>
                <ul className="m-0 pl-[18px] flex flex-col gap-[3px]">
                  <li>The right to inspect what personal details are linked to your profile;</li>
                  <li>The right to request data rectifications;</li>
                  <li><strong>The right to complete account erasure:</strong> You may request the permanent deletion of your account and all associated playlists/history at any time.</li>
                </ul>
                <p className="m-0">
                  To request full account deletion, email <strong>gabrielpereirarufino.g@gmail.com</strong> from your registered email address with the subject &ldquo;Account Deletion Request&rdquo;. All associated records will be permanently purged within 72 business hours.
                </p>
              </section>

              <section className="flex flex-col gap-[4px]">
                <h4 className="text-[13.5px] font-semibold text-text-primary m-0">6. Technical Security</h4>
                <p className="m-0">
                  We employ industry-standard encryption protocols (TLS/HTTPS with trusted certificates), encrypted access tokens, and security policies to prevent unauthorized access or disclosure of your account information.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Botão de Fechar */}
        <DialogActions className="mt-[4px]">
          <DialogButton
            type="button"
            variant="primary"
            onClick={() => onOpenChange(false)}
          >
            {isPt ? "Entendido e Fechar" : "Understood & Close"}
          </DialogButton>
        </DialogActions>
      </div>
    </Dialog>
  );
}
