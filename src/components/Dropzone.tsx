/**
 * File dropzone: drag & drop anywhere in the window, or click the button to
 * open a file picker. Accepts .gpx / .xml files.
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  onFiles: (files: File[]) => void;
  /** Button label. */
  label?: string;
  /** Extra classes for the trigger button. */
  buttonClassName?: string;
}

export function Dropzone({ onFiles, label = "Add GPX files", buttonClassName = "" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depthRef = useRef(0);

  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current++;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depthRef.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) {
        onFiles(Array.from(e.dataTransfer.files));
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.xml,application/gpx+xml,text/xml"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={
          buttonClassName ||
          "inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/10 hover:border-white/20"
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {label}
      </button>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-sky-400/60 bg-zinc-900/90 px-12 py-10 text-center shadow-2xl">
            <div className="text-3xl">🗺️</div>
            <div className="mt-3 text-lg font-medium text-white">Drop GPX files</div>
            <div className="mt-1 text-sm text-zinc-400">Parsed locally — nothing is uploaded</div>
          </div>
        </div>
      )}
    </>
  );
}
