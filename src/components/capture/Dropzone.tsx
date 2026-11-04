"use client";

import { useRef, useState } from "react";

export function Dropzone({
  accept,
  multiple,
  onFiles,
  disabled,
  label,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`dropzone${drag ? " drag" : ""}`}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (disabled) return;
        const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h3l2-3h6l2 3h3v13H4z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      <strong className="byline">{label}</strong>
      <span className="hint">JPG of PNG · op de telefoon kunt u direct een foto maken</span>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
