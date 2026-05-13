import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Check,
  Compass,
  ExternalLink,
  FileText,
  HelpCircle,
  Map as MapIcon,
  Phone,
  Plane,
  RefreshCw,
  Wind as WindIcon,
  Cloud,
  Fuel as FuelIcon,
  StickyNote,
  X,
} from "lucide-react";
import { AERODROMES, type Aerodrome, type FuelStatus } from "@/lib/aerodromes";
import { ReliabilityBadge } from "@/components/ReliabilityBadge";
import { MetarSection } from "@/components/MetarSection";
import { WindSection } from "@/components/WindSection";
import { ServicesSection } from "@/components/ServicesSection";

export const Route = createFileRoute("/")({
  component: Index,
});

function fuelLabel(s: FuelStatus) {
  return s === "ok" ? "Disponible" : s === "no" ? "Non disponible" : "À confirmer";
}

function FuelIconStatus({ s }: { s: FuelStatus }) {
  if (s === "ok") return <Check className="h-4 w-4 text-[oklch(0.72_0.17_145)]" />;
  if (s === "no") return <X className="h-4 w-4 text-[oklch(0.62_0.22_27)]" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

interface SectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  open: Record<string, boolean>;
  setOpen: (id: string, v: boolean) => void;
}

function Section({ id, title, icon, children, open, setOpen }: SectionProps) {
  const isOpen = open[id];
  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(id, !isOpen)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
      >
        <span className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{title}</span>
        </span>
        <span className="text-xs text-muted-foreground">{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="border-t border-border px-4 py-4">{children}</div>}
    </section>
  );
}

function Index() {
  const [icao, setIcao] = useState(AERODROMES[0].icao);
  const ad = useMemo(() => AERODROMES.find((a) => a.icao === icao)!, [icao]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [briefingTime, setBriefingTime] = useState(new Date());
  const [surfaceWind, setSurfaceWind] = useState<number | null>(null);
  const [temsiImg, setTemsiImg] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const f = () => setIsDesktop(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const defaultsOpen = (id: string) => isDesktop || id === "logistics";
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const ids = ["metar", "wind", "notam", "temsi", "webcam", "logistics", "notes"];
    const m: Record<string, boolean> = {};
    ids.forEach((i) => (m[i] = defaultsOpen(i)));
    setOpenMap(m);
  }, [isDesktop]);
  const setOpen = (id: string, v: boolean) =>
    setOpenMap((prev) => ({ ...prev, [id]: v }));

  const refreshAll = () => {
    setBriefingTime(new Date());
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    setSurfaceWind(null);
    setTemsiImg(null);
  }, [icao]);

  const onTemsiFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setTemsiImg(r.result as string);
    r.readAsDataURL(f);
  };

  const fuelEntries: { key: keyof Aerodrome["fuel"]; label: string }[] = [
    { key: "avgas100ll", label: "Avgas 100LL" },
    { key: "ul91", label: "UL91" },
    { key: "sp98", label: "SP98 / Mogas" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ backgroundColor: "#F4F4F2" }}>
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Plane className="h-5 w-5" />
          <h1 className="text-base font-medium">autogyrodash</h1>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={icao}
              onChange={(e) => setIcao(e.target.value)}
              className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
            >
              {AERODROMES.map((a) => (
                <option key={a.icao} value={a.icao}>
                  {a.icao} · {a.name}
                </option>
              ))}
            </select>
            <button
              onClick={refreshAll}
              className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              tout rafraîchir
            </button>
            <span className="text-xs text-muted-foreground">
              {briefingTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-4 py-4 pb-24" key={refreshKey}>
        {surfaceWind !== null && surfaceWind > 25 && (
          <div className="flex items-start gap-2 rounded-md border border-[oklch(0.85_0.15_95)] bg-[oklch(0.97_0.06_95)] px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>
              Vent surface {Math.round(surfaceWind)} kt — vérifier la cohérence des couches
            </span>
          </div>
        )}

        {/* Verdict */}
        <section className="rounded-lg border border-border bg-muted p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">verdict</p>
              <p className="mt-1 text-2xl font-medium">à évaluer manuellement</p>
              <p className="mt-1 text-sm text-muted-foreground">
                consulter chaque section pour décider
              </p>
            </div>
            <Compass className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.72_0.17_145)]" />
              officiel mesuré
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.85_0.15_95)]" />
              modèle / prévision
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.75_0.17_55)]" />
              déclaratif
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.62_0.22_27)]" />
              communautaire
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Section
            id="metar"
            title="metar / taf"
            icon={<Cloud className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <MetarSection ad={ad} key={`metar-${ad.icao}-${refreshKey}`} />
          </Section>

          <Section
            id="wind"
            title="vent (surface → 2480 ft)"
            icon={<WindIcon className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <WindSection
              ad={ad}
              onSurfaceWind={setSurfaceWind}
              key={`wind-${ad.icao}-${refreshKey}`}
            />
          </Section>

          <Section
            id="notam"
            title="notam"
            icon={<AlertTriangle className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <ReliabilityBadge
                  level="orange"
                  label="Données simulées · FAA NOTAM API (à brancher)"
                />
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    ad.notams.length === 0
                      ? "bg-[oklch(0.72_0.17_145)] text-white"
                      : "bg-[oklch(0.75_0.17_55)] text-white"
                  }`}
                >
                  {ad.notams.length} actif{ad.notams.length > 1 ? "s" : ""}
                </span>
              </div>
              {ad.notams.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun NOTAM actif</p>
              ) : (
                <ul className="space-y-2">
                  {ad.notams.map((n) => (
                    <li key={n.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-mono text-xs">{n.id}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {n.category}
                        </span>
                      </div>
                      <p className="text-sm">{n.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>

          <Section
            id="temsi"
            title="temsi"
            icon={<MapIcon className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <div className="space-y-3">
              <ReliabilityBadge
                level="green"
                label="Officiel Météo France · aviation.meteo.fr"
              />
              <div className="flex flex-wrap gap-2">
                <a
                  href="https://aviation.meteo.fr/login.php"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  ouvrir aeroweb
                </a>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted">
                  <Camera className="h-3.5 w-3.5" />
                  joindre screenshot temsi
                  <input type="file" accept="image/*" onChange={onTemsiFile} className="hidden" />
                </label>
              </div>
              {temsiImg && (
                <img
                  src={temsiImg}
                  alt="TEMSI"
                  className="w-full rounded-md border border-border"
                />
              )}
            </div>
          </Section>

          <Section
            id="webcam"
            title="webcam"
            icon={<Camera className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <div className="space-y-3">
              <ReliabilityBadge level="orange" label="Lien curé manuellement · notion" />
              <p className="text-sm text-muted-foreground">
                Aucune webcam référencée pour {ad.icao}
              </p>
            </div>
          </Section>

          <Section
            id="logistics"
            title="logistique"
            icon={<FuelIcon className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <div className="space-y-5">
              <div className="space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  carburant à l'aérodrome
                </h4>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {fuelEntries.map((f) => (
                    <li
                      key={f.key}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <FuelIconStatus s={ad.fuel[f.key]} />
                        {f.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {fuelLabel(ad.fuel[f.key])}
                      </span>
                    </li>
                  ))}
                </ul>
                {ad.phone && (
                  <a
                    href={`tel:${ad.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    appeler le gestionnaire
                  </a>
                )}
                <div className="rounded-md border border-[oklch(0.85_0.15_95)] bg-[oklch(0.97_0.06_95)] px-3 py-2 text-xs">
                  Disponibilité fuel à confirmer par téléphone avant chaque départ. Données
                  indicatives.
                </div>
                <ReliabilityBadge
                  level="orange"
                  label="Déclaratif BASULM + curation · basulm.ffplum.fr"
                />
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  services à 2 km
                </h4>
                <ServicesSection ad={ad} key={`svc-${ad.icao}-${refreshKey}`} />
              </div>
            </div>
          </Section>

          <Section
            id="notes"
            title="notes pilote"
            icon={<StickyNote className="h-4 w-4" />}
            open={openMap}
            setOpen={setOpen}
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vent en finale, points VFR, dégagement prévu…"
              className="w-full resize-y rounded-md border border-border bg-card p-2 text-sm"
              style={{ minHeight: 60 }}
            />
          </Section>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-7xl">
          <button
            onClick={() => alert("PDF en cours de génération")}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
          >
            <FileText className="h-4 w-4" />
            générer le pdf de briefing
          </button>
        </div>
      </footer>
    </div>
  );
}
