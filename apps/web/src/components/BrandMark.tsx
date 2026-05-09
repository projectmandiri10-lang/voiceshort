import { Mic } from "lucide-react";

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className="brand-lockup">
      <div className={compact ? "brand-mark brand-mark-compact" : "brand-mark"}>
        <div className="brand-mark-inner">
          <Mic size={compact ? 16 : 18} strokeWidth={2.2} />
        </div>
      </div>
      <div>
        <div className={compact ? "brand-title brand-title-compact" : "brand-title"}>
          Real Voice Over Video
        </div>
        {!compact ? <p className="brand-subtitle">AI voice over workspace untuk video sampai 15 menit</p> : null}
      </div>
    </div>
  );
}
