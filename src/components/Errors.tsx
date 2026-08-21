/**
 * Per-file load errors ("Skipped" list), rendered wherever the app needs them
 * (file list on desktop/mobile and the empty landing state).
 */

import type { LoadError } from "../types";

export function Errors({ errors, onClearErrors }: { errors: LoadError[]; onClearErrors: () => void }) {
  if (errors.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">
          Skipped
        </span>
        <button
          type="button"
          onClick={onClearErrors}
          className="text-[11px] text-zinc-500 hover:text-zinc-300"
        >
          clear
        </button>
      </div>
      <ul className="space-y-1.5">
        {errors.map((e, i) => (
          <li key={i} className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[11px]">
            <span className="block truncate font-medium text-amber-200/90">{e.fileName}</span>
            <span className="text-zinc-400">{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
