import { useEffect, useRef, useState } from "react";

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
}

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
}: CodeInputProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
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

    // Se preencheu todos os 6 caracteres
    if (nextStr.length === 6) {
      onComplete?.(nextStr);
    }

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
      if (clean.length === 6) {
        onComplete?.(clean);
      }
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
    <div
      className="flex items-center justify-center gap-[14px] my-[12px] select-none cursor-pointer"
      onClick={() => {
        const nextEmpty = chars.findIndex((c) => !c);
        const target = nextEmpty === -1 ? 5 : nextEmpty;
        inputRefs.current[target]?.focus();
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const char = chars[i];
        const isFilled = Boolean(char);
        const isFocused = focusedIndex === i;

        return (
          <div
            key={i}
            className="flex flex-col items-center w-[42px]"
            onClick={(e) => {
              e.stopPropagation();
              inputRefs.current[i]?.focus();
            }}
          >
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              maxLength={1}
              value={char}
              placeholder="0"
              disabled={disabled}
              onFocus={(e) => {
                setFocusedIndex(i);
                e.target.select();
              }}
              onBlur={() => {
                setFocusedIndex((prev) => (prev === i ? null : prev));
              }}
              onChange={(e) => handleChange(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              className="w-full text-center bg-transparent border-0 outline-none text-[38px] font-bold text-text-primary placeholder:text-text-secondary/25 font-sans tracking-tight cursor-pointer focus:cursor-text select-none leading-none h-[48px]"
              style={{ caretColor: "transparent" }}
            />
            {/* Linha sublinhada estilizada idêntica à imagem de referência */}
            <div
              className={`h-[2px] w-full rounded-full transition-all duration-200 ${
                isFocused
                  ? "bg-text-primary shadow-[0_0_10px_rgba(255,255,255,0.6)] scale-x-105"
                  : isFilled
                    ? "bg-text-primary/90"
                    : "bg-text-secondary/30"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
