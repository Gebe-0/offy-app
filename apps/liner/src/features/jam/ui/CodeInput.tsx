import { useEffect, useRef } from "react";

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CodeInput({ value, onChange, disabled }: CodeInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");

  useEffect(() => {
    // Foca o primeiro slot vazio ao montar
    const nextEmptyIndex = chars.findIndex((c) => !c);
    const targetIndex = nextEmptyIndex === -1 ? 5 : nextEmptyIndex;
    inputRefs.current[targetIndex]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const rawVal = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!rawVal) {
      const next = value.slice(0, index) + value.slice(index + 1);
      onChange(next);
      return;
    }

    // Se o usuário digitou mais de 1 caractere (ou colou algo pequeno)
    if (rawVal.length > 1) {
      handlePastedText(rawVal);
      return;
    }

    const char = rawVal[0]!;
    const nextArr = value.split("");
    while (nextArr.length < 6) nextArr.push("");
    nextArr[index] = char;
    const nextStr = nextArr.join("").slice(0, 6);
    onChange(nextStr);

    // Avança para o próximo input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace") {
      if (!chars[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = value.slice(0, index - 1) + value.slice(index);
        onChange(next);
      } else {
        const nextArr = value.split("");
        nextArr[index] = "";
        onChange(nextArr.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePastedText = (rawText: string) => {
    let text = rawText.trim();
    // Se colou o link completo (web ou offy://), extrai o parâmetro ou pathname final
    try {
      if (
        text.includes("://") ||
        text.startsWith("offy:") ||
        text.startsWith("http")
      ) {
        const url = new URL(text);
        const idParam = url.searchParams.get("id");
        if (idParam) {
          text = idParam;
        } else {
          const parts = url.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            text = parts[parts.length - 1]!;
          }
        }
      }
    } catch {
      // Ignora erro de parsing de URL
    }

    const match =
      text.match(/([A-HJ-NP-Z2-9]{6})/i) || text.match(/([A-Z0-9]{6})/i);
    const clean = (match ? match[1]! : text.replace(/[^A-Z0-9]/gi, ""))
      .toUpperCase()
      .slice(0, 6);

    if (clean) {
      onChange(clean);
      const focusIndex = Math.min(clean.length, 5);
      inputRefs.current[focusIndex]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    handlePastedText(pasted);
  };

  return (
    <div className="flex items-center justify-center gap-[12px] my-[10px] select-none">
      {Array.from({ length: 6 }).map((_, i) => {
        const char = chars[i];
        const isFilled = Boolean(char);

        return (
          <div key={i} className="flex flex-col items-center w-[44px]">
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              maxLength={1}
              value={char}
              disabled={disabled}
              onChange={(e) => handleChange(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              className="w-full text-center bg-transparent border-0 outline-none text-[34px] font-bold text-text-primary font-mono tracking-tight cursor-pointer focus:cursor-text"
              style={{ caretColor: "transparent" }}
            />
            {/* Linha sublinhada estilizada idêntica à imagem de referência */}
            <div
              className={`h-[2.5px] w-full rounded-full transition-all duration-200 ${
                isFilled
                  ? "bg-text-primary shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                  : "bg-white/20"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
