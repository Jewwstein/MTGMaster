"use client";
import React from "react";
import Image from "next/image";
import { useGame } from "../../state/game";
import { usePageTheme, PageKey } from "@/hooks/usePageTheme";
import PageThemeControls from "@/components/theme/PageThemeControls";

type DeckEntry = { name: string; count: number; commander?: boolean; image?: string | null };
type DeckSummary = { id: string; name: string; updatedAt?: string | null };
type AlternateArtOption = { id: string; image: string | null; setName: string | null };

type DeckPreviewPanelProps = {
  name: string | null;
  deck: Record<string, DeckEntry>;
  thumbs: Record<string, string>;
  onChangeArt: (name: string) => void;
  onUpload: (name: string) => void;
  onClear: (name: string) => void;
  onEnsureThumb: (name: string) => void;
};

function DeckPreviewPanel({ name, deck, thumbs, onChangeArt, onUpload, onClear, onEnsureThumb }: DeckPreviewPanelProps) {
  React.useEffect(() => {
    if (name) onEnsureThumb(name);
  }, [name, onEnsureThumb]);

  if (!name) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-300">Card Preview</h2>
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-500">
          Hover a card to preview artwork.
        </div>
      </div>
    );
  }

  const entry = deck[name];
  const image = entry?.image ?? thumbs[name] ?? null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 shadow-lg">
      <h2 className="text-base font-semibold text-zinc-200">Card Preview</h2>
      <div className="mt-4 flex flex-col gap-4 md:flex-row">
        <div className="relative mx-auto aspect-[63/88] w-full max-w-[320px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-md">
          {image ? (
            <Image src={image} alt={name} fill className="object-contain" unoptimized />
          ) : (
            <div className="grid h-full w-full place-items-center text-sm text-zinc-500">No image available</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 text-sm">
          <div>
            <div className="text-lg font-semibold text-zinc-100">{name}</div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{entry?.commander ? "Commander" : "Non-Commander"}</div>
          </div>
          <div className="text-sm text-zinc-300">
            Count in deck: <span className="font-semibold text-white">{entry?.count ?? 0}</span>
          </div>
          <div className="mt-auto flex flex-wrap gap-2 text-xs">
            <button onClick={() => onChangeArt(name)} className="rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800">
              Change Art
            </button>
            <button onClick={() => onUpload(name)} className="rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800">
              Upload Image
            </button>
            {entry?.image && (
              <button onClick={() => onClear(name)} className="rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800">
                Clear Custom Image
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DecksPage() {
  const themeManager = usePageTheme('decks' as PageKey);
  const { theme } = themeManager;
  const [deckName, setDeckName] = React.useState("New Commander Deck");
  const [deck, setDeck] = React.useState<Record<string, DeckEntry>>({});
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<{ name: string; type_line?: string; image?: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [paste, setPaste] = React.useState("");
  const [importUrl, setImportUrl] = React.useState("");
  const loadDeck = useGame(
    (s) =>
      (s as any).loadDeckFromNames as (
        cards: { name: string; count: number; image?: string | null; commander?: boolean }[],
        commanders: string[],
      ) => void,
  );
  const [saved, setSaved] = React.useState<{ id: string; name: string; deck: Record<string, DeckEntry> }[]>([]);
  const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
  const [serverDecks, setServerDecks] = React.useState<DeckSummary[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [cardMenu, setCardMenu] = React.useState<{ open: boolean; x: number; y: number; name: string | null }>({ open: false, x: 0, y: 0, name: null });
  const cardMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [artModal, setArtModal] = React.useState<{
    open: boolean;
    name: string | null;
    loading: boolean;
    error: string | null;
    cards: AlternateArtOption[];
  }>({ open: false, name: null, loading: false, error: null, cards: [] });
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [previewName, setPreviewName] = React.useState<string | null>(null);
  const [selectedArt, setSelectedArt] = React.useState<AlternateArtOption | null>(null);
  const [hoverArt, setHoverArt] = React.useState<AlternateArtOption | null>(null);
  const [serverSaveMessage, setServerSaveMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);
  const [importMessage, setImportMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  async function ensureThumb(name: string) {
    const entryImage = deck[name]?.image;
    if (entryImage) {
      setThumbs((t) => (t[name] ? t : { ...t, [name]: entryImage }));
      return;
    }

    if (thumbs[name]) return;
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
      const data = await res.json();
      const img =
        data?.image_uris?.small ||
        data?.image_uris?.normal ||
        data?.card_faces?.[0]?.image_uris?.small ||
        data?.card_faces?.[0]?.image_uris?.normal;
      if (img) setThumbs((t) => ({ ...t, [name]: img }));
    } catch {}
  }

  function beginRename(entry: DeckSummary) {
    setRenameError(null);
    setRenamingId(entry.id);
    setRenameName(entry.name ?? "");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameName("");
    setRenameError(null);
  }

  async function submitRename(id: string) {
    const trimmed = renameName.trim();
    if (!trimmed) {
      setRenameError("Name is required");
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : `Rename failed (${res.status})`;
        throw new Error(message);
      }
      const updated = data?.deck as DeckSummary | undefined;
      if (updated) {
        setServerDecks((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
      } else {
        await refreshServerDecks();
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("decks:server-updated"));
      }
      cancelRename();
    } catch (error) {
      console.error("Failed to rename deck", error);
      setRenameError(error instanceof Error ? error.message : "Rename failed");
    } finally {
      setRenameBusy(false);
    }
  }

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("saved_decks_v1");
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);
  function persistSaved(next: { id: string; name: string; deck: Record<string, DeckEntry> }[]) {
    setSaved(next);
    try {
      localStorage.setItem("saved_decks_v1", JSON.stringify(next));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("decks:local-changed"));
      }
    } catch {}
  }
  function saveCurrent() {
    const id = Math.random().toString(36).slice(2);
    const entry = { id, name: deckName || "Untitled Deck", deck: deck };
    persistSaved([entry, ...saved].slice(0, 50));
  }
  function loadSaved(id: string) {
    const item = saved.find((s) => s.id === id);
    if (!item) return;
    setDeckName(item.name);
    setDeck(item.deck);
  }
  function deleteSaved(id: string) {
    persistSaved(saved.filter((s) => s.id !== id));
  }

  function clearDeck() {
    setDeck({});
  }

  function normalizeServerDeck(entry: any): DeckSummary | null {
    if (!entry || typeof entry.id !== "string") return null;
    const name = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name.trim() : "Untitled Deck";
    return {
      id: entry.id,
      name,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : entry.updatedAt ? String(entry.updatedAt) : null,
    };
  }

  async function refreshServerDecks() {
    try {
      const res = await fetch("/api/decks", { cache: "no-store" });
      const data = await res.json();
      const normalized = Array.isArray(data?.decks)
        ? data.decks.map((entry: any) => normalizeServerDeck(entry)).filter(Boolean) as DeckSummary[]
        : [];
      setServerDecks(normalized);
    } catch {}
  }
  React.useEffect(() => {
    refreshServerDecks();
  }, []);

  async function saveToServer() {
    if (busy) return;
    setBusy(true);
    setServerSaveMessage(null);
    try {
      const entries = Object.values(deck).map((e) => ({ name: e.name, count: e.count, commander: !!e.commander, image: e.image ?? null }));
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: deckName || "Untitled Deck", entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : `Save failed (${res.status})`;
        setServerSaveMessage({ type: "error", text: message });
        return;
      }
      if (res.ok && data?.deck) {
        const normalized = normalizeServerDeck(data.deck);
        if (normalized) {
          setServerDecks((prev) => [normalized, ...prev.filter((d) => d.id !== normalized.id)]);
        }
      }
      await refreshServerDecks();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("decks:server-updated"));
      }
      setServerSaveMessage({ type: "success", text: "Deck saved to server." });
    } finally {
      setBusy(false);
    }
  }
  async function loadServer(id: string) {
    try {
      const res = await fetch(`/api/decks/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!data || !data.entries) return;
      setDeckName(data.name || deckName);
      const next: Record<string, DeckEntry> = {};
      for (const e of data.entries as { name: string; count: number; commander?: boolean; image?: string | null }[]) {
        next[e.name] = { name: e.name, count: e.count, commander: !!e.commander, image: e.image ?? null };
      }
      setDeck(next);
    } catch {}
  }
  async function deleteServer(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/decks/${id}`, { method: "DELETE" });
      setServerDecks((prev) => prev.filter((deck) => deck.id !== id));
      await refreshServerDecks();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("decks:server-updated"));
      }
    } finally {
      setBusy(false);
    }
  }

  function addCard(name: string, delta = 1) {
    setDeck((d) => {
      const cur = d[name]?.count ?? 0;
      const next = Math.max(0, cur + delta);
      const commander = d[name]?.commander ?? false;
      const image = d[name]?.image ?? null;
      const copy = { ...d } as Record<string, DeckEntry>;
      if (next === 0) delete copy[name];
      else copy[name] = { name, count: next, commander, image };
      return copy;
    });
  }
  function toggleCommander(name: string) {
    setDeck((d) => {
      const entry = d[name] ?? { name, count: 1, commander: false, image: null };
      const copy = { ...d } as Record<string, DeckEntry>;
      copy[name] = { ...entry, commander: !entry.commander };
      return copy;
    });
  }

  function setCardImage(name: string, image: string | null) {
    setDeck((d) => {
      if (!d[name]) return d;
      const copy = { ...d } as Record<string, DeckEntry>;
      copy[name] = { ...copy[name], image };
      return copy;
    });
    setThumbs((prev) => {
      if (image) return { ...prev, [name]: image };
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }

  const closeCardMenu = React.useCallback(() => {
    setCardMenu({ open: false, x: 0, y: 0, name: null });
  }, []);

  React.useEffect(() => {
    if (!cardMenu.open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-card-menu]") || target?.closest?.("[data-art-modal]") || target?.closest?.("[data-art-menu]") || target?.closest?.("[data-art-modal-content]")) {
        return;
      }
      closeCardMenu();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCardMenu();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [cardMenu.open, closeCardMenu]);

  React.useLayoutEffect(() => {
    if (!cardMenu.open) return;
    const adjust = () => {
      if (!cardMenuRef.current) return;
      const padding = 12;
      const rect = cardMenuRef.current.getBoundingClientRect();
      const maxX = Math.max(padding, window.innerWidth - rect.width - padding);
      const maxY = Math.max(padding, window.innerHeight - rect.height - padding);
      setCardMenu((prev) => {
        if (!prev.open) return prev;
        const nextX = Math.min(Math.max(padding, prev.x), maxX);
        const nextY = Math.min(Math.max(padding, prev.y), maxY);
        if (Math.abs(nextX - prev.x) < 0.5 && Math.abs(nextY - prev.y) < 0.5) return prev;
        return { ...prev, x: nextX, y: nextY };
      });
    };
    adjust();
    window.addEventListener("resize", adjust);
    window.addEventListener("scroll", adjust, true);
    return () => {
      window.removeEventListener("resize", adjust);
      window.removeEventListener("scroll", adjust, true);
    };
  }, [cardMenu.open]);

  const fetchAlternateArt = React.useCallback(async (name: string) => {
    setArtModal((prev) => ({ ...prev, loading: true, error: null, cards: [] }));
    try {
      const query = `!"${name}" unique:prints order=released`; // exact name, unique prints
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setArtModal({ open: true, name, loading: false, error: null, cards: [] });
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      const cards: { id: string; image: string | null; setName: string | null }[] = Array.isArray(data?.data)
        ? (data.data as any[]).map((entry) => ({
            id: typeof entry?.id === "string" ? entry.id : Math.random().toString(36).slice(2),
            image:
              entry?.image_uris?.large ||
              entry?.image_uris?.normal ||
              entry?.image_uris?.small ||
              entry?.card_faces?.[0]?.image_uris?.large ||
              entry?.card_faces?.[0]?.image_uris?.normal ||
              entry?.card_faces?.[0]?.image_uris?.small ||
              null,
            setName: typeof entry?.set_name === "string" ? entry.set_name : null,
          }))
        : [];
      setArtModal({ open: true, name, loading: false, error: null, cards });
    } catch (error) {
      console.error("Failed to load alternate art", error);
      setArtModal({ open: true, name, loading: false, error: "Failed to load alternate art", cards: [] });
    }
  }, []);

  const openArtModal = React.useCallback(
    (name: string) => {
      closeCardMenu();
      setArtModal({ open: true, name, loading: true, error: null, cards: [] });
      fetchAlternateArt(name);
    },
    [closeCardMenu, fetchAlternateArt],
  );

  const closeArtModal = React.useCallback(() => {
    setArtModal({ open: false, name: null, loading: false, error: null, cards: [] });
  }, []);

  const applyArtImage = React.useCallback(
    (name: string, image: string | null) => {
      setCardImage(name, image);
      closeArtModal();
    },
    [closeArtModal],
  );

  React.useEffect(() => {
    if (!artModal.open) {
      setSelectedArt(null);
      setHoverArt(null);
      return;
    }
    if (artModal.cards.length > 0) {
      setSelectedArt((prev) => prev ?? artModal.cards[0]);
    }
  }, [artModal.open, artModal.cards]);

  const handleUploadFor = React.useCallback(
    (name: string) => {
      setUploadError(null);
      closeCardMenu();
      if (fileInputRef.current) {
        fileInputRef.current.dataset.card = name;
        fileInputRef.current.click();
      }
    },
    [closeCardMenu],
  );

  const onUploadChange = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const targetName = event.target.dataset.card;
    event.target.value = "";
    if (!file || !targetName) return;
    setUploadingImage(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", targetName);
      const res = await fetch("/api/card-art/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok || typeof data?.imagePath !== "string") {
        const message = typeof data?.error === "string" ? data.error : `Upload failed (${res.status})`;
        throw new Error(message);
      }
      applyArtImage(targetName, data.imagePath);
    } catch (error) {
      console.error("Card art upload failed", error);
      setUploadError(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  }, [applyArtImage]);

  const handleClearArt = React.useCallback(
    (name: string) => {
      setCardImage(name, null);
      closeCardMenu();
    },
    [closeCardMenu],
  );


  async function searchScryfall(term: string) {
    setLoading(true);
    try {
      const url = `https://api.scryfall.com/cards/search`;
      const params = new URLSearchParams({ q: term });
      const res = await fetch(`${url}?${params.toString()}`);
      const data = await res.json();
      const items = Array.isArray(data?.data)
        ? data.data.map((d: any) => ({
            name: d?.name as string,
            type_line: d?.type_line as string | undefined,
            image:
              d?.image_uris?.small ||
              d?.image_uris?.normal ||
              d?.card_faces?.[0]?.image_uris?.small ||
              d?.card_faces?.[0]?.image_uris?.normal,
          }))
        : [];
      setResults(items.slice(0, 20));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function importFromText(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const acc: Record<string, number> = {};
    for (const raw of lines) {
      let line = raw.replace(/^(?:SB:|Sideboard:)\s*/i, "").trim();
      if (!line) continue;

      let name = line;
      let count = 1;

      const trailing = name.match(/^(.*?)(?:\s+[xX]\s*(\d+))$/);
      if (trailing) {
        name = trailing[1].trim();
        const parsed = parseInt(trailing[2], 10);
        if (Number.isFinite(parsed) && parsed > 0) count = parsed;
      }

      const leading = name.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (leading) {
        const parsed = parseInt(leading[1], 10);
        const rest = leading[2]?.trim();
        if (rest) {
          name = rest;
          if (!trailing && Number.isFinite(parsed) && parsed > 0) {
            count = parsed;
          }
        }
      }

      name = name.trim();
      if (!name) continue;
      acc[name] = (acc[name] ?? 0) + (Number.isFinite(count) && count > 0 ? count : 1);
    }
    for (const [name, count] of Object.entries(acc)) addCard(name, count);
  }

  async function importFromUrl(url: string) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) {
      setImportMessage({ type: "error", text: "Provide a deck URL to import." });
      return;
    }
    setImportBusy(true);
    setImportMessage(null);
    try {
      const res = await fetch("/api/deck-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = typeof data?.error === "string" ? data.error : `Import failed (${res.status})`;
        setImportMessage({ type: "error", text: message });
        return;
      }
      const cards = Array.isArray(data?.cards)
        ? (data.cards as { name?: string; count?: number; commander?: boolean; image?: string | null }[])
        : [];
      if (cards.length === 0) {
        setImportMessage({ type: "error", text: "No cards were returned for that deck." });
        return;
      }

      const nextDeck: Record<string, DeckEntry> = { ...deck };
      const nextThumbs: Record<string, string> = { ...thumbs };
      for (const entry of cards) {
        if (!entry || typeof entry.name !== "string") continue;
        const name = entry.name.trim();
        if (!name) continue;
        const count = Number.isFinite(entry.count) && entry.count ? Math.max(1, Math.floor(entry.count)) : 1;
        const commander = !!entry.commander;
        const image = typeof entry.image === "string" && entry.image.trim().length > 0 ? entry.image.trim() : null;
        const current = nextDeck[name];
        const updatedCount = (current?.count ?? 0) + count;
        const updatedCommander = current?.commander ? true : commander;
        const updatedImage = current?.image ?? image ?? null;
        nextDeck[name] = { name, count: updatedCount, commander: updatedCommander, image: updatedImage };
        if (updatedImage) {
          nextThumbs[name] = updatedImage;
        }
      }

      if (Object.keys(nextDeck).length === 0) {
        setImportMessage({ type: "error", text: "No recognizable cards were found." });
        return;
      }

      setDeck(nextDeck);
      setThumbs(nextThumbs);
      if (typeof data?.name === "string" && data.name.trim().length > 0) {
        setDeckName(data.name.trim());
      }
      setImportUrl("");
      setImportMessage({
        type: "success",
        text: `Imported ${Object.values(nextDeck).reduce((sum, card) => sum + card.count, 0)} cards${
          data?.name ? ` from ${data.name}` : ""
        }`,
      });
    } catch (error) {
      console.error("Deck import failed", error);
      setImportMessage({ type: "error", text: error instanceof Error ? error.message : "Import failed" });
    } finally {
      setImportBusy(false);
    }
  }

  function loadToLibrary() {
    const entries = Object.values(deck);
    const cards = entries.map((e) => ({
      name: e.name,
      count: e.count,
      image: e.image ?? null,
      commander: !!e.commander,
    }));
    const commanders = cards.filter((entry) => entry.commander).map((entry) => entry.name);
    loadDeck(cards, commanders);
  }

  const total = Object.values(deck).reduce((s, e) => s + e.count, 0);

  return (
    <div 
      className="min-h-screen bg-gray-900 text-white p-4"
      style={{
        backgroundImage: theme.backgroundImage ? `url(${theme.backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundAttachment: 'fixed',
        backgroundPosition: 'center',
        '--accent-color': theme.accentColor || '#f59e0b'
      } as React.CSSProperties}
    >
      <PageThemeControls manager={themeManager} />
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold">Deck Builder</h1>
        <div className="mt-1 text-sm text-zinc-400">Search, paste, or import a deck. Mark commanders, then load to Library.</div>

        <div className="mt-6 grid grid-cols-12 gap-4">
          {/* Left: Search */}
          <div className="col-span-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mtgmasters">
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search Scryfall (name/type/oracle)..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none"
              />
              <button onClick={() => searchScryfall(q)} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400">
                Search
              </button>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 font-mtgmasters">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-zinc-300">Server Decks (public)</div>
                <button onClick={refreshServerDecks} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Refresh</button>
              </div>
              {serverDecks.length === 0 && <div className="mt-2 text-sm text-zinc-500">No server decks yet</div>}
              {serverDecks.length > 0 && (
                <div className="mt-2 divide-y divide-zinc-800">
                  {serverDecks.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="flex-1 min-w-0">
                        {renamingId === s.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={renameName}
                              onChange={(e) => setRenameName(e.target.value)}
                              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs outline-none"
                              disabled={renameBusy}
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className="truncate">{s.name}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {renamingId === s.id ? (
                          <>
                            <button
                              onClick={() => submitRename(s.id)}
                              disabled={renameBusy}
                              className="rounded border border-emerald-600 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-600/10 disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelRename}
                              disabled={renameBusy}
                              className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => loadServer(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Load</button>
                            <button
                              onClick={() => beginRename(s)}
                              className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800"
                            >
                              Rename
                            </button>
                            <button onClick={() => deleteServer(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {renameError && <div className="pt-2 text-xs text-rose-400">{renameError}</div>}
                </div>
              )}
            </div>
            <div className="mt-3 max-h-[520px] overflow-auto">
              {loading && <div className="px-2 py-1 text-xs text-zinc-400">Loading...</div>}
              {!loading && results.length === 0 && <div className="px-2 py-1 text-xs text-zinc-500">No results</div>}
              <div className="grid grid-cols-2 gap-2">
                {results.map((r) => (
                  <div key={r.name} className="flex items-center gap-2 rounded border border-zinc-800 p-2">
                    {r.image ? (
                      <Image src={r.image} alt={r.name} width={48} height={67} className="h-16 w-12 flex-shrink-0 rounded" unoptimized />
                    ) : (
                      <div className="h-16 w-12 flex-shrink-0 rounded border border-zinc-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{r.name}</div>
                      <div className="truncate text-[11px] text-zinc-500">{r.type_line}</div>
                    </div>
                    <button onClick={() => addCard(r.name, 1)} className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">
                      Add
                    </button>
                    <button onClick={() => toggleCommander(r.name)} className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800">
                      Commander
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Deck + Imports */}
          <div className="col-span-6 flex flex-col gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2">
                <input
                  value={deckName}
                  onChange={(e) => setDeckName(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
                <div className="text-sm text-zinc-400">{total} cards</div>
              </div>
              <div className="mt-3 max-h-64 overflow-auto rounded border border-zinc-800">
                {Object.values(deck).length === 0 && <div className="px-3 py-2 text-sm text-zinc-500">No cards added</div>}
                {Object.values(deck).length > 0 && (
                  <div className="divide-y divide-zinc-800">
                    {Object.values(deck).map((e) => (
                      <div
                        key={e.name}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                        onMouseEnter={() => setPreviewName(e.name)}
                        onContextMenu={(evt) => {
                          evt.preventDefault();
                          setPreviewName(e.name);
                          setCardMenu({ open: true, x: evt.clientX, y: evt.clientY, name: e.name });
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {thumbs[e.name] ? (
                            <Image src={thumbs[e.name]} alt={e.name} width={28} height={39} className="h-10 w-7 flex-shrink-0 rounded" unoptimized />
                          ) : (
                            <div className="h-10 w-7 flex-shrink-0 rounded border border-zinc-700" />
                          )}
                          <span className="w-6 text-right font-mono">{e.count}×</span>
                          <span className="truncate">{e.name}</span>
                          {e.commander && <span className="rounded bg-sky-600/20 px-2 py-[2px] text-[10px] text-sky-300">Commander</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => addCard(e.name, -1)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">-1</button>
                          <button onClick={() => addCard(e.name, 1)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">+1</button>
                          <button onClick={() => toggleCommander(e.name)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Cmd</button>
                          <button onClick={() => addCard(e.name, -e.count)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={saveCurrent} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Save Deck</button>
                <button onClick={loadToLibrary} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-400">Load to Library</button>
                <button onClick={saveToServer} disabled={busy} className="rounded-md border border-sky-700 px-3 py-2 text-sm text-sky-300 hover:bg-zinc-800 disabled:opacity-50">Save to Server</button>
                <button onClick={clearDeck} className="rounded-md border border-rose-700 px-3 py-2 text-sm text-rose-300 hover:bg-rose-700/10">Clear Deck</button>
                {serverSaveMessage && (
                  <span
                    className={`flex items-center rounded border px-2 py-1 text-[11px] ${
                      serverSaveMessage.type === "success"
                        ? "border-emerald-600 text-emerald-300"
                        : "border-rose-600 text-rose-300"
                    }`}
                  >
                    {serverSaveMessage.text}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-sm font-semibold text-zinc-300">Saved Decks (local)</div>
              {saved.length === 0 && <div className="mt-2 text-sm text-zinc-500">No saved decks yet</div>}
              {saved.length > 0 && (
                <div className="mt-2 divide-y divide-zinc-800">
                  {saved.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="truncate">{s.name}</div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => loadSaved(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Load</button>
                        <button onClick={() => deleteSaved(s.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-800">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-sm font-semibold text-zinc-300">Paste from Text</div>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'One per line. Examples:\nSol Ring\nIsland x8'}
                className="mt-2 h-32 w-full rounded-md border border-zinc-700 bg-zinc-800 p-2 text-sm outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => importFromText(paste)} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Import Text</button>
                <button onClick={() => setPaste("")} className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Clear</button>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="text-sm font-semibold text-zinc-300">Import from URL (Moxfield / Archidekt)</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Paste deck URL..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={() => importFromUrl(importUrl)}
                  disabled={importBusy}
                  className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                >
                  {importBusy ? "Importing…" : "Import"}
                </button>
              </div>
              {importMessage && (
                <div
                  className={`mt-2 rounded border px-3 py-2 text-xs ${
                    importMessage.type === "success"
                      ? "border-emerald-600 bg-emerald-900/40 text-emerald-300"
                      : "border-rose-700 bg-rose-900/40 text-rose-300"
                  }`}
                >
                  {importMessage.text}
                </div>
              )}
              <div className="mt-2 text-xs text-zinc-500">Public lists only. Parsing is best-effort.</div>
            </div>
          </div>
        </div>
      </div>
      {cardMenu.open && cardMenu.name && (
        <div
          data-card-menu
          ref={cardMenuRef}
          className="fixed z-50 w-48 rounded border border-zinc-800 bg-zinc-900 text-xs shadow font-mtgmasters"
          style={{ left: cardMenu.x, top: cardMenu.y }}
        >
          <button className="block w-full px-3 py-2 text-left hover:bg-zinc-800" onClick={() => openArtModal(cardMenu.name!)}>
            Choose Alternate Art
          </button>
          <button className="block w-full px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleUploadFor(cardMenu.name!)}>
            Upload Custom Image
          </button>
          {deck[cardMenu.name]?.image && (
            <button className="block w-full px-3 py-2 text-left hover:bg-zinc-800" onClick={() => handleClearArt(cardMenu.name!)}>
              Clear Custom Image
            </button>
          )}
          <button className="block w-full px-3 py-2 text-left text-zinc-400 hover:bg-zinc-800" onClick={closeCardMenu}>
            Close
          </button>
        </div>
      )}
      <div className="fixed bottom-4 left-4 z-40 w-[320px] max-w-[85vw]">
        <DeckPreviewPanel
          name={previewName}
          deck={deck}
          thumbs={thumbs}
          onChangeArt={openArtModal}
          onUpload={handleUploadFor}
          onClear={handleClearArt}
          onEnsureThumb={ensureThumb}
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={onUploadChange}
      />
      {artModal.open && artModal.name && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={(event) => {
            if ((event.target as HTMLElement).dataset?.artModal === "backdrop") {
              closeArtModal();
            }
          }}
          data-art-modal="backdrop"
        >
          <div
            data-art-modal-content
            className="relative max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">Choose art for {artModal.name}</h2>
                <p className="text-xs text-zinc-400">Select an alternate printing or upload a custom image.</p>
              </div>
              <button className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={closeArtModal}>
                Close
              </button>
            </div>
            {(artModal.loading || uploadingImage) && (
              <div className="mt-4 rounded border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-400">
                {artModal.loading ? "Loading alternate art..." : null}
                {uploadingImage ? "Uploading image..." : null}
              </div>
            )}
            {uploadError && <div className="mt-3 rounded border border-rose-700 bg-rose-900/40 px-3 py-2 text-xs text-rose-300">{uploadError}</div>}
            {artModal.error && <div className="mt-3 rounded border border-rose-700 bg-rose-900/40 px-3 py-2 text-xs text-rose-300">{artModal.error}</div>}
            <div className="mt-4 grid max-h-[60vh] grid-cols-[2fr_3fr] gap-4 overflow-hidden">
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Preview</div>
                <div className="mt-3 flex items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-950">
                  {hoverArt?.image || selectedArt?.image ? (
                    <Image
                      src={(hoverArt?.image ?? selectedArt?.image) as string}
                      alt={artModal.name ?? "Art"}
                      width={480}
                      height={672}
                      className="h-[420px] w-auto object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-[420px] w-full items-center justify-center text-sm text-zinc-500">Hover a printing to preview</div>
                  )}
                </div>
                <div className="mt-2 text-xs text-zinc-400">
                  {hoverArt?.setName || selectedArt?.setName ? <span>Set: {hoverArt?.setName ?? selectedArt?.setName}</span> : <span>No set info</span>}
                </div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Alternate Printings</div>
                <div className="mt-3 max-h-[48vh] space-y-2 overflow-auto pr-1">
                  {artModal.cards.length === 0 && !artModal.loading && !artModal.error && (
                    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
                      No alternate prints found. Try uploading a custom image.
                    </div>
                  )}
                  {artModal.cards.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                      {artModal.cards.map((card) => (
                        <button
                          key={card.id}
                          className={`flex flex-col items-center gap-2 rounded-md border p-2 text-[11px] transition hover:border-amber-400 hover:bg-zinc-900/80 ${
                            selectedArt?.id === card.id ? "border-amber-400 bg-zinc-900/80" : "border-zinc-700 bg-zinc-900/60"
                          }`}
                          onClick={() => {
                            setSelectedArt(card);
                            applyArtImage(artModal.name!, card.image ?? null);
                          }}
                          onMouseEnter={() => setHoverArt(card)}
                          onFocus={() => setHoverArt(card)}
                          onMouseLeave={() => setHoverArt(null)}
                        >
                          <div className="relative w-full overflow-hidden rounded border border-zinc-800">
                            {card.image ? (
                              <Image src={card.image} alt={artModal.name ?? "Art"} width={160} height={223} className="h-40 w-full object-cover" unoptimized />
                            ) : (
                              <div className="flex h-40 w-full items-center justify-center bg-zinc-950 text-zinc-500">No image</div>
                            )}
                          </div>
                          <span className="w-full truncate text-[11px] text-zinc-300">{card.setName ?? "Unknown Set"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
