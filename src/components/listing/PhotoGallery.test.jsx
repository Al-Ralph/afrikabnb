import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PhotoGallery from "./PhotoGallery";
import { LanguageProvider } from "../../context/LanguageContext";
import { sortedImages, srcSetFor } from "../../utils/images";

const photo = (n, alt = `Vue ${n}`) => ({ id: `img-${n}`, url: `https://cdn.test/${n}.webp`, alt, position: n - 1 });
const six = [1, 2, 3, 4, 5, 6].map((n) => photo(n));

const renderGallery = (images = six, title = "Villa Lagune") =>
  render(
    <LanguageProvider>
      <button type="button">avant</button>
      <PhotoGallery images={images} title={title} />
    </LanguageProvider>
  );

const viewer = () => screen.getByRole("dialog", { name: "Photos : Villa Lagune" });
const press = (key, opts = {}) => fireEvent.keyDown(document, { key, ...opts });

const setNarrow = (matches) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  delete window.matchMedia;
});

describe("PhotoGallery — desktop grid", () => {
  test("shows one large photo + four small ones and a « show all » button", () => {
    renderGallery();
    const tiles = screen.getAllByRole("button", { name: /^Agrandir la photo/ });
    expect(tiles).toHaveLength(5);
    expect(tiles[0]).toHaveAccessibleName("Agrandir la photo 1 sur 6");
    expect(within(tiles[0]).getByRole("img")).toHaveAttribute("alt", "Vue 1");
    // Première photo prioritaire, les suivantes en chargement paresseux.
    expect(within(tiles[0]).getByRole("img")).toHaveAttribute("loading", "eager");
    expect(within(tiles[3]).getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(screen.getByRole("button", { name: "Afficher toutes les photos" })).toBeInTheDocument();
  });

  test("a single photo: no « show all » button", () => {
    renderGallery([photo(1)]);
    expect(screen.getAllByRole("button", { name: /^Agrandir/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Afficher toutes les photos" })).toBeNull();
  });

  test("falls back to a generated alt text when the photo has none", () => {
    renderGallery([photo(1, null), photo(2, "")]);
    expect(screen.getByRole("img", { name: "Villa Lagune, photo 2" })).toBeInTheDocument();
  });
});

describe("PhotoGallery — full-screen viewer", () => {
  test("opens on the clicked photo, navigates with the keyboard (wrapping) and closes with Escape", () => {
    renderGallery();
    const tile = screen.getByRole("button", { name: "Agrandir la photo 2 sur 6" });
    tile.focus();
    fireEvent.click(tile);

    const dialog = viewer();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("2 / 6")).toBeInTheDocument();
    expect(within(dialog).getByRole("img")).toHaveAttribute("alt", "Vue 2");
    // Le focus entre dans la visionneuse.
    expect(dialog.contains(document.activeElement)).toBe(true);

    press("ArrowRight");
    expect(within(viewer()).getByText("3 / 6")).toBeInTheDocument();
    press("ArrowLeft");
    press("ArrowLeft");
    press("ArrowLeft");
    expect(within(viewer()).getByText("6 / 6")).toBeInTheDocument();
    expect(within(viewer()).getByRole("img")).toHaveAttribute("src", "https://cdn.test/6.webp");

    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Le focus revient sur la vignette d'origine.
    expect(document.activeElement).toBe(tile);
  });

  test("previous / next buttons and the close button", () => {
    renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Afficher toutes les photos" }));
    expect(within(viewer()).getByText("1 / 6")).toBeInTheDocument();
    fireEvent.click(within(viewer()).getByRole("button", { name: "Photo suivante" }));
    expect(within(viewer()).getByText("2 / 6")).toBeInTheDocument();
    fireEvent.click(within(viewer()).getByRole("button", { name: "Photo précédente" }));
    fireEvent.click(within(viewer()).getByRole("button", { name: "Photo précédente" }));
    expect(within(viewer()).getByText("6 / 6")).toBeInTheDocument();
    fireEvent.click(within(viewer()).getByRole("button", { name: "Fermer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("traps the focus inside the viewer (Tab and Shift+Tab loop)", () => {
    renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Agrandir la photo 1 sur 6" }));
    const buttons = within(viewer()).getAllByRole("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    last.focus();
    press("Tab");
    expect(document.activeElement).toBe(first);
    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  test("touch swipe changes the photo", () => {
    renderGallery();
    fireEvent.click(screen.getByRole("button", { name: "Agrandir la photo 1 sur 6" }));
    fireEvent.touchStart(viewer(), { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(viewer(), { changedTouches: [{ clientX: 120 }] });
    expect(within(viewer()).getByText("2 / 6")).toBeInTheDocument();
  });
});

describe("PhotoGallery — mobile carousel", () => {
  test("shows every photo in a swipeable carousel with arrows and a counter", () => {
    setNarrow(true);
    renderGallery();
    const carousel = screen.getByRole("region", { name: "Photos du logement" });
    expect(within(carousel).getAllByRole("button", { name: /^Agrandir/ })).toHaveLength(6);
    expect(within(carousel).getByText("1 / 6")).toBeInTheDocument();
    expect(within(carousel).queryByRole("button", { name: "Photo précédente" })).toBeNull();

    fireEvent.click(within(carousel).getByRole("button", { name: "Photo suivante" }));
    expect(within(carousel).getByText("2 / 6")).toBeInTheDocument();
    expect(within(carousel).getByRole("button", { name: "Photo précédente" })).toBeInTheDocument();

    fireEvent.click(within(carousel).getByRole("button", { name: "Agrandir la photo 3 sur 6" }));
    expect(within(viewer()).getByText("3 / 6")).toBeInTheDocument();
  });
});

describe("image helpers", () => {
  test("sortedImages sorts by position and falls back on the cover image", () => {
    expect(sortedImages({ images: [photo(3), photo(1), photo(2)] }).map((i) => i.id)).toEqual([
      "img-1",
      "img-2",
      "img-3",
    ]);
    expect(sortedImages({ images: [], imageUrl: "https://x/cover.jpg", title: "T" })).toEqual([
      { id: null, url: "https://x/cover.jpg", alt: "T", position: 0 },
    ]);
    expect(sortedImages({ images: [] })).toEqual([]);
  });

  test("srcSetFor builds widths for Unsplash only", () => {
    const set = srcSetFor("https://images.unsplash.com/photo-1?w=800&q=80");
    expect(set).toContain("w=480&q=80 480w");
    expect(set).toContain("w=1600&q=80 1600w");
    expect(srcSetFor("http://localhost:4000/uploads/a.webp")).toBeUndefined();
  });
});
