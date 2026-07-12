import { useEffect, useState } from "react";

// Click to enlarge to full screen; click anywhere or press Esc to close.
export function ZoomImg({ src, className = "", alt = "" }: { src: string; className?: string; alt?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <img src={src} alt={alt} onClick={() => setOpen(true)}
        className={`${className} cursor-zoom-in`} />
      {open && (
        <div onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out">
          <img src={src} alt={alt} className="max-w-full max-h-full object-contain rounded" />
        </div>
      )}
    </>
  );
}
