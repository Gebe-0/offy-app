import { useState } from "react";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";
import { ArrowLeftLine, EyeCloseLine, EyeLine } from "@mingcute/react";
import { CodeInput } from "@/features/jam/ui/CodeInput";
import { api } from "@/shared/api";
import { useTranslation } from "@/languages";
import { authErrorMessage } from "../store/authStore";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ForgotPasswordPanelProps {
  initialEmail: string;
  onCancel: () => void;
  onSuccess: (email: string) => void;
}

export default function ForgotPasswordPanel({
  initialEmail,
  onCancel,
  onSuccess,
}: ForgotPasswordPanelProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError(t("login.errors.email_invalid"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.forgotPassword(normalized);
      setEmail(normalized);
      setCode("");
      setStep(2);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!/^\d{6}$/.test(code)) {
      setError(t("login.forgot_code_invalid"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("login.errors.password_min_8"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("login.errors.password_mismatch"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await api.resetPassword(email.trim().toLowerCase(), code, newPassword);
      onSuccess(email.trim().toLowerCase());
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 1) {
    return (
      <form noValidate onSubmit={handleSendCode} className="mt-[18px] flex flex-col gap-[14px]">
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {t("login.forgot_step1_desc")}
        </p>
        <div className="flex flex-col gap-[6px]">
          <label className="text-[12.5px] font-[500] text-text-secondary">
            {t("login.forgot_email_label")}
          </label>
          <TextInput
            type="email"
            placeholder={t("login.forgot_email_placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            autoFocus
          />
        </div>
        {error && <p className="text-[12.5px] text-red-400">{error}</p>}
        <div className="mt-[4px] flex items-center gap-[10px]">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onCancel}
            className="w-[104px] shrink-0"
          >
            <ArrowLeftLine className="h-4 w-4" />
            <span>{t("login.btn_back")}</span>
          </Button>
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting ? t("login.forgot_sending") : t("login.forgot_send_code")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={handleReset} className="mt-[16px] flex flex-col gap-[14px]">
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        {t("login.forgot_step2_desc")}{" "}
        <strong className="text-text-primary">{email}</strong>.
      </p>

      <div className="py-[2px]">
        <CodeInput
          value={code}
          onChange={setCode}
          disabled={submitting}
          numericOnly
        />
      </div>

      <div className="flex flex-col gap-[6px]">
        <label className="text-[12.5px] font-[500] text-text-secondary">
          {t("login.forgot_new_password")}
        </label>
        <div className="relative">
          <TextInput
            type={showPassword ? "text" : "password"}
            placeholder={t("login.forgot_new_password_placeholder")}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={submitting}
            className="pr-[38px]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-[10px] top-1/2 -translate-y-1/2 border-none bg-transparent text-text-tertiary hover:text-text-primary cursor-pointer"
          >
            {showPassword ? <EyeCloseLine size={18} /> : <EyeLine size={18} />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-[6px]">
        <label className="text-[12.5px] font-[500] text-text-secondary">
          {t("login.forgot_confirm_password")}
        </label>
        <TextInput
          type={showPassword ? "text" : "password"}
          placeholder={t("login.forgot_confirm_password_placeholder")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={submitting}
        />
      </div>

      {error && <p className="text-[12.5px] text-red-400">{error}</p>}

      <div className="mt-[2px] flex items-center gap-[10px]">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={() => {
            setError("");
            setStep(1);
          }}
          className="w-[104px] shrink-0"
        >
          <ArrowLeftLine className="h-4 w-4" />
          <span>{t("login.btn_back")}</span>
        </Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? t("login.forgot_saving") : t("login.forgot_reset_btn")}
        </Button>
      </div>
    </form>
  );
}
