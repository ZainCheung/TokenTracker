import React, { useEffect, useState } from "react";
import { MonitorUp, Zap } from "lucide-react";
import { ToggleSwitch, SegmentedControl } from "../components/settings/Controls.jsx";
import { usePetSettings } from "../hooks/use-pet-settings.js";
import { copy } from "../lib/copy";
import { cn } from "../lib/cn";
import { ClawdAnimated } from "../ui/foundation/ClawdAnimated.jsx";
import { FadeIn } from "../ui/foundation/FadeIn.jsx";

const CHARACTERS = [
  { id: "clawd", nameKey: "pet.character.clawd", tint: "from-oai-amber-50 dark:from-orange-950/70" },
  { id: "sprout", nameKey: "pet.character.sprout", tint: "from-oai-brand-100 dark:from-emerald-950/70" },
  { id: "byte", nameKey: "pet.character.byte", tint: "from-oai-gray-200 dark:from-slate-800/70" },
  { id: "ember", nameKey: "pet.character.ember", tint: "from-orange-100 dark:from-orange-950/80" },
];

const PREVIEW_STATES = [
  { id: "idle-living", labelKey: "pet.state.calm" },
  { id: "working-thinking", labelKey: "pet.state.focus" },
  { id: "working-juggling", labelKey: "pet.state.multitask" },
  { id: "working-wizard", labelKey: "pet.state.streak" },
  { id: "happy", labelKey: "pet.state.celebrate" },
  { id: "sleeping", labelKey: "pet.state.rest" },
];

function CharacterCard({ character, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oai-brand-500",
        selected
          ? "border-oai-brand-500/40 bg-white dark:border-oai-brand-500/25 dark:bg-oai-gray-900/80"
          : "border-oai-gray-200/80 bg-white/55 hover:border-oai-gray-400 dark:border-oai-gray-800 dark:bg-oai-gray-950/55 dark:hover:border-oai-gray-600",
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-80 dark:opacity-55", character.tint)} />
      <div className="relative flex items-center gap-2.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-black/15">
          <ClawdAnimated state="idle-living" character={character.id} size={44} />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-oai-black dark:text-white">{copy(character.nameKey)}</span>
          {selected ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-oai-brand-500" aria-hidden /> : null}
        </div>
      </div>
    </button>
  );
}

function PetStage({ character, state, onStateChange }) {
  const stateSpec = PREVIEW_STATES.find(function findState(item) {
    return item.id === state;
  });
  const stateLabel = copy(stateSpec?.labelKey || "pet.state.calm");
  return (
    <section className="relative flex min-h-[400px] flex-col overflow-hidden bg-oai-gray-50 dark:bg-oai-gray-950 sm:min-h-[440px] lg:min-h-[480px]">
      <div
        className="absolute inset-0 opacity-[0.16] dark:opacity-[0.12]"
        style={{ backgroundImage: "radial-gradient(currentColor 0.7px, transparent 0.7px)", backgroundSize: "14px 14px" }}
        aria-hidden
      />
      <div className="relative flex items-center justify-between gap-3 px-5 pt-5">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-oai-gray-500 dark:text-oai-gray-400">
          {copy("pet.preview.states")}
        </span>
        <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white/65 px-3 py-1.5 text-[11px] font-medium text-oai-gray-600 backdrop-blur-md dark:border-white/10 dark:bg-black/20 dark:text-oai-gray-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          {stateLabel}
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-6 py-5">
        <div className="relative flex h-52 w-52 items-center justify-center sm:h-56 sm:w-56">
          <div className="absolute bottom-5 h-3 w-28 rounded-full bg-black/10 blur-sm dark:bg-black/35" aria-hidden />
          <ClawdAnimated state={state} character={character} size={190} />
        </div>
      </div>
      <div className="relative border-t border-oai-gray-200/70 bg-white/70 px-3 py-2 backdrop-blur-sm dark:border-oai-gray-800 dark:bg-oai-gray-950/70">
        <div className="grid grid-cols-3 gap-1" aria-label={copy("pet.preview.states")}>
          {PREVIEW_STATES.map((previewState) => (
            <button
              key={previewState.id}
              type="button"
              onClick={() => onStateChange(previewState.id)}
              aria-pressed={state === previewState.id}
              className={cn(
                "flex min-h-10 flex-col items-center justify-center gap-1 rounded-lg px-1.5 text-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oai-brand-500",
                state === previewState.id
                  ? "font-semibold text-oai-black dark:text-white"
                  : "font-medium text-oai-gray-500 hover:text-oai-black dark:text-oai-gray-400 dark:hover:text-white",
              )}
            >
              <span>{copy(previewState.labelKey)}</span>
              <span
                className={cn(
                  "h-1 w-1 rounded-full transition-colors duration-200",
                  state === previewState.id ? "bg-oai-black dark:bg-white" : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PetPage() {
  const { available, settings, setSetting } = usePetSettings();
  const [previewState, setPreviewState] = useState("idle-living");
  // Auto-cycle the preview until the user picks a state themselves — a manual
  // choice must stick, so the first click stops the rotation for this visit.
  const [autoRotate, setAutoRotate] = useState(true);
  const selectedCharacter = settings.character || "clawd";

  useEffect(() => {
    if (!autoRotate) return undefined;
    const timer = window.setInterval(() => {
      setPreviewState((current) => {
        const index = PREVIEW_STATES.findIndex((item) => item.id === current);
        return PREVIEW_STATES[(index + 1) % PREVIEW_STATES.length].id;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [autoRotate]);

  const sizeOptions = [
    { value: "small", label: copy("pet.size.small") },
    { value: "medium", label: copy("pet.size.medium") },
    { value: "large", label: copy("pet.size.large") },
  ];

  return (
    <div className="flex flex-1 flex-col font-oai text-oai-black antialiased dark:text-oai-white">
      <main className="flex-1 pb-14 pt-8 sm:pt-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <FadeIn y={12}>
            <header className="mb-8">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{copy("pet.page.title")}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-oai-gray-500 dark:text-oai-gray-400">
                {copy("pet.page.subtitle")}
              </p>
            </header>
          </FadeIn>

          <FadeIn y={12} delay={0.04}>
            <div className="overflow-hidden rounded-[28px] border border-oai-gray-200 bg-white/75 dark:border-oai-gray-800 dark:bg-oai-gray-900/60 lg:grid lg:grid-cols-[1.12fr_0.88fr]">
              <PetStage
                character={selectedCharacter}
                state={previewState}
                onStateChange={(state) => {
                  setAutoRotate(false);
                  setPreviewState(state);
                }}
              />

              <aside className="flex flex-col border-t border-oai-gray-200 p-5 dark:border-oai-gray-800 lg:min-h-[480px] lg:border-l lg:border-t-0">
                <section aria-labelledby="pet-character-title">
                  <div>
                    <h2 id="pet-character-title" className="text-sm font-semibold">
                      {copy("pet.characters.title")}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-oai-gray-500 dark:text-oai-gray-400">
                      {copy("pet.characters.subtitle")}
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {CHARACTERS.map((character) => (
                      <CharacterCard
                        key={character.id}
                        character={character}
                        selected={selectedCharacter === character.id}
                        onSelect={() => setSetting("character", character.id)}
                      />
                    ))}
                  </div>
                </section>

                <section className="mt-6 border-t border-oai-gray-200/70 pt-5 dark:border-oai-gray-800">
                  <div className="flex items-center gap-2">
                    <MonitorUp className="h-4 w-4 text-oai-gray-500 dark:text-oai-gray-400" strokeWidth={1.75} aria-hidden />
                    <h2 className="text-sm font-semibold">{copy("pet.controls.title")}</h2>
                  </div>
                  <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium">{copy("pet.controls.show")}</div>
                      <ToggleSwitch
                        checked={settings.visible}
                        onChange={() => setSetting("visible", !settings.visible)}
                        disabled={!available}
                        ariaLabel={copy("pet.controls.show")}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-sm font-medium">{copy("pet.controls.size")}</div>
                      <div className="shrink-0">
                        <SegmentedControl
                          options={sizeOptions}
                          value={settings.size}
                          onChange={(value) => setSetting("size", value)}
                          disabled={!available}
                        />
                      </div>
                    </div>
                  </div>
                </section>
                {!available ? (
                  <div className="mt-6 flex gap-2 rounded-xl bg-oai-gray-100 p-3 text-xs leading-relaxed text-oai-gray-500 dark:bg-oai-gray-800/70 dark:text-oai-gray-400">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {copy("pet.controls.native_only")}
                  </div>
                ) : null}
              </aside>
            </div>
          </FadeIn>
        </div>
      </main>
    </div>
  );
}
