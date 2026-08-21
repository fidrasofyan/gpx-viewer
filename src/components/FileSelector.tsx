/**
 * File selection UI in two variants:
 *  - "list":  vertical rows for the desktop sidebar
 *  - "chips": horizontally scrollable pills for mobile
 * Also renders per-file load errors.
 */

import type { LoadedFile, LoadError } from "../types";

interface Props {
  files: LoadedFile[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  errors: LoadError[];
  onClearErrors: () => void;
  variant: "list" | "chips";
}

const HEADING = "text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

function Errors({ errors, onClearErrors }: { errors: LoadError[]; onClearErrors: () => void }) {
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

export function FileSelector({ files, selectedId, onSelect, onRemove, errors, onClearErrors, variant }: Props) {
  if (variant === "chips") {
    const chip = (active: boolean) =>
      `shrink-0 rounded-full border text-xs transition ${
        active
          ? "border-sky-500/40 bg-sky-500/15 text-zinc-100"
          : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
      }`;

    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className={HEADING}>Files</span>
          {errors.length > 0 && (
            <button type="button" onClick={onClearErrors} className="text-[11px] text-amber-400/80 hover:text-amber-300">
              clear errors
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
          <button type="button" className={chip(selectedId === "all")} onClick={() => onSelect("all")}>
            <span className="px-3 py-1.5 block">All files</span>
          </button>
          {files.map((f) => {
            const active = selectedId === f.id;
            return (
              <div key={f.id} className={`${chip(active)} flex items-center`}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className="block max-w-[9rem] truncate py-1.5 pl-3"
                  title={f.gpx.fileName}
                >
                  {f.gpx.fileName}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${f.gpx.fileName}`}
                  onClick={() => onRemove(f.id)}
                  className="shrink-0 py-1.5 pl-1 pr-2.5 text-zinc-500 transition hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
        <Errors errors={errors} onClearErrors={onClearErrors} />
      </div>
    );
  }

  // "list" variant — desktop sidebar
  const rowCls = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
      active ? "bg-sky-500/15 ring-1 ring-sky-500/30" : "hover:bg-white/5"
    }`;

  return (
    <div>
      <div className={HEADING}>Files</div>
      <div className="space-y-1">
        <button type="button" className={rowCls(selectedId === "all")} onClick={() => onSelect("all")}>
          <span className="flex-1 truncate text-sm font-medium">All files</span>
          <span className="text-xs tabular-nums text-zinc-500">{files.length}</span>
        </button>
        {files.map((f) => {
          const active = selectedId === f.id;
          return (
            <div key={f.id} className={`${rowCls(active)} group`}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(f.id)}>
                <span className="block truncate text-sm">{f.gpx.fileName}</span>
                <span className="block text-[11px] text-zinc-500">
                  {f.gpx.tracks.length} track{f.gpx.tracks.length === 1 ? "" : "s"}
                  {f.gpx.routes.length > 0 &&
                    ` · ${f.gpx.routes.length} route${f.gpx.routes.length === 1 ? "" : "s"}`}
                  {f.gpx.waypoints.length > 0 && ` · ${f.gpx.waypoints.length} wpt`}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${f.gpx.fileName}`}
                onClick={() => onRemove(f.id)}
                className="rounded p-1 text-xs text-zinc-500 opacity-0 transition hover:bg-white/10 hover:text-zinc-200 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <Errors errors={errors} onClearErrors={onClearErrors} />
    </div>
  );
}
