import { memo } from "react";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useTranslation } from "@/languages";
import { useCoverFluidColors } from "../hooks/useCoverFluidColors";

export interface DailyMixCoverProps {
  coverUrl?: string;
  mixNumber: string | number;
  imageLoaded: boolean;
  onLoad?: () => void;
}

const mixLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-roboto-flex), sans-serif",
  fontWeight: 649,
  fontVariationSettings:
    "'wght' 649, 'XOPQ' 100, 'YTAS' 739, 'YTDE' -224, 'YTLC' 494, 'YTUC' 667, 'wdth' 151, 'opsz' 144",
  lineHeight: 0.8,
  letterSpacing: "-0.04em",
};

const mixNumberStyle: React.CSSProperties = {
  fontFamily: "var(--font-roboto-flex), sans-serif",
  fontWeight: 523,
  fontVariationSettings:
    "'wght' 523, 'GRAD' 77, 'XOPQ' 148, 'XTRA' 548, 'YOPQ' 110, 'YTAS' 741, 'YTDE' -305, 'YTFI' 640, 'YTLC' 525, 'YTUC' 748, 'wdth' 121, 'opsz' 144",
  lineHeight: 0.8,
  letterSpacing: "-0.02em",
};

function DailyMixCover({
  coverUrl,
  mixNumber,
  imageLoaded,
  onLoad,
}: DailyMixCoverProps) {
  const { color1, logoColor } = useCoverFluidColors(coverUrl);
  const { locale } = useTranslation();
  const labelLines = locale === "ru" ? ["МИ", "КС"] : ["MIX"];

  return (
    <div
      className={`relative isolate aspect-square w-full overflow-hidden rounded-control select-none ${
        coverUrl && imageLoaded ? "" : "bg-border-alpha-14"
      }`}
    >
      {coverUrl && (
        <CoverImage
          src={coverUrl}
          alt="Mix Cover"
          fill
          sizes="175px"
          className={`object-cover transition-all duration-300 group-hover:brightness-[1.15] ${
            imageLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={onLoad}
        />
      )}

      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: `linear-gradient(45deg, ${color1} 0%, rgba(0, 0, 0, 0.2) 100%)`,
        }}
      />

      <svg
        viewBox="0 0 593 518"
        className="absolute top-[12px] left-[12px] w-[22px] h-[19px] pointer-events-none transition-colors duration-500"
        style={{ fill: logoColor }}
      >
        <path
          d="M 226 19 L 186 52 L 159 98 L 152 125 L 151 156 L 161 199 L 176 197 L 201 183 L 253 116 L 283 102 L 308 104 L 321 112 L 331 124 L 337 138 L 339 162 L 329 194 L 310 216 L 285 226 L 262 225 L 193 209 L 147 208 L 99 219 L 60 241 L 35 265 L 21 285 L 4 330 L 3 379 L 10 405 L 21 428 L 37 450 L 65 475 L 88 488 L 120 498 L 152 499 L 174 494 L 238 458 L 259 452 L 278 452 L 296 457 L 356 495 L 405 513 L 457 513 L 509 494 L 533 477 L 552 458 L 569 434 L 587 387 L 589 342 L 579 303 L 558 267 L 525 237 L 486 219 L 462 214 L 437 214 L 434 225 L 433 254 L 439 278 L 449 295 L 482 330 L 492 359 L 490 376 L 483 391 L 472 404 L 457 413 L 438 417 L 415 414 L 385 401 L 326 366 L 282 356 L 258 358 L 231 366 L 175 399 L 155 407 L 126 404 L 102 382 L 97 366 L 101 338 L 117 316 L 141 301 L 182 294 L 216 300 L 279 319 L 315 320 L 334 316 L 371 297 L 394 275 L 415 245 L 426 221 L 437 177 L 437 130 L 427 91 L 402 50 L 365 19 L 322 3 L 275 2 Z"
          fillRule="evenodd"
        />
      </svg>

      <div
        className="absolute bottom-[8px] left-[10px] flex flex-col text-white text-[44px] pointer-events-none select-none"
        style={mixLabelStyle}
      >
        {labelLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>

      <span
        className="absolute bottom-[8px] right-[10px] text-white text-[46px] pointer-events-none select-none"
        style={mixNumberStyle}
      >
        {mixNumber}
      </span>
    </div>
  );
}

export default memo(DailyMixCover);
