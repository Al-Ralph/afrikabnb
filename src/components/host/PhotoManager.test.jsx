import React, { useState } from "react";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import PhotoManager, { photosFromImages, validatePhotoFiles, MAX_PHOTO_BYTES } from "./PhotoManager";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return {
    ...actual,
    api: { uploadListingImages: vi.fn(), deleteListingImage: vi.fn(), reorderListingImages: vi.fn() },
  };
});

const file = (name, type = "image/jpeg", size = 1000) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const images = [
  { id: "a", url: "https://img.test/a.webp", position: 0 },
  { id: "b", url: "https://img.test/b.webp", position: 1 },
  { id: "c", url: "https://img.test/c.webp", position: 2 },
];

let latest = [];
const Harness = ({ listingId = null, initial = [] }) => {
  const [items, setItems] = useState(() => photosFromImages(initial));
  const [progress, setProgress] = useState(null);
  latest = items;
  return (
    <PhotoManager listingId={listingId} items={items} setItems={setItems} progress={progress} setProgress={setProgress} />
  );
};

const renderManager = (props) =>
  render(
    <LanguageProvider>
      <Harness {...props} />
    </LanguageProvider>
  );

const addFiles = (files) => fireEvent.change(screen.getByLabelText("Ajouter des photos"), { target: { files } });
const tiles = () => within(screen.getByRole("list", { name: /Photos de l’annonce/ })).getAllByRole("listitem");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`);
  URL.revokeObjectURL = vi.fn();
});

describe("validatePhotoFiles", () => {
  test("rejects wrong types, files over 5 MB and files beyond the 10-photo limit", () => {
    const { accepted, rejected } = validatePhotoFiles(
      [file("ok.jpg"), file("doc.pdf", "application/pdf"), file("big.png", "image/png", MAX_PHOTO_BYTES + 1), file("ok2.webp", "image/webp"), file("extra.jpg")],
      8
    );
    expect(accepted.map((f) => f.name)).toEqual(["ok.jpg", "ok2.webp"]);
    expect(rejected).toEqual([
      { name: "doc.pdf", reason: "type" },
      { name: "big.png", reason: "size" },
      { name: "extra.jpg", reason: "count" },
    ]);
  });
});

describe("PhotoManager", () => {
  test("new listing: shows immediate previews, keeps files local and explains rejected files", () => {
    renderManager();
    addFiles([file("salon.jpg"), file("notes.gif", "image/gif"), file("lourde.jpg", "image/jpeg", 6 * 1024 * 1024)]);
    expect(api.uploadListingImages).not.toHaveBeenCalled();
    expect(tiles()).toHaveLength(1);
    expect(screen.getByAltText("Photo 1")).toHaveAttribute("src", "blob:preview-1");
    expect(screen.getByText("Couverture")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("notes.gif");
    expect(alert).toHaveTextContent("format non pris en charge");
    expect(alert).toHaveTextContent("lourde.jpg");
    expect(alert).toHaveTextContent("fichier trop lourd");
    expect(latest[0]).toMatchObject({ status: "pending", id: null });
  });

  test("existing listing: reorders with the arrow buttons and saves the full order", async () => {
    api.reorderListingImages.mockResolvedValue([]);
    renderManager({ listingId: "L1", initial: images });
    fireEvent.click(screen.getByRole("button", { name: "Déplacer vers la droite (Photo 1)" }));
    await waitFor(() => expect(api.reorderListingImages).toHaveBeenCalledWith("L1", ["b", "a", "c"]));
    expect(latest.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(screen.getByText("Photo déplacée en position 2 sur 3.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Déplacer vers la gauche (Photo 1)" })).toBeDisabled();
  });

  test("existing listing: restores the previous order when the API refuses it", async () => {
    api.reorderListingImages.mockRejectedValue(Object.assign(new Error("Ordre invalide"), { status: 400 }));
    renderManager({ listingId: "L1", initial: images });
    fireEvent.click(screen.getByRole("button", { name: "Déplacer vers la gauche (Photo 3)" }));
    expect(await screen.findByText("Ordre invalide")).toBeInTheDocument();
    expect(latest.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  test("existing listing: deletes a photo only after confirmation", async () => {
    api.deleteListingImage.mockResolvedValue([images[1], images[2]]);
    renderManager({ listingId: "L1", initial: images });
    const [first] = tiles();
    fireEvent.click(within(first).getByRole("button", { name: "Retirer" }));
    expect(api.deleteListingImage).not.toHaveBeenCalled();
    fireEvent.click(within(first).getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.deleteListingImage).toHaveBeenCalledWith("L1", "a"));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(latest.map((i) => i.id)).toEqual(["b", "c"]);
  });

  test("existing listing: uploads files one by one, shows the per-file API error (413/415) and retries", async () => {
    const after1 = [...images, { id: "d", url: "https://img.test/d.webp", position: 3 }];
    api.uploadListingImages
      .mockResolvedValueOnce(after1)
      .mockRejectedValueOnce(Object.assign(new Error("Payload Too Large"), { status: 413 }))
      .mockRejectedValueOnce(Object.assign(new Error("Unsupported"), { status: 415 }));
    renderManager({ listingId: "L1", initial: images });
    const one = file("one.jpg");
    const two = file("two.png", "image/png");
    const three = file("three.webp", "image/webp");
    await act(async () => addFiles([one, two, three]));
    await waitFor(() => expect(api.uploadListingImages).toHaveBeenCalledTimes(3));
    expect(api.uploadListingImages).toHaveBeenNthCalledWith(1, "L1", [one]);
    expect(api.uploadListingImages).toHaveBeenNthCalledWith(2, "L1", [two]);
    expect(await screen.findByText("Fichier trop lourd (5 Mo maximum).")).toBeInTheDocument();
    expect(screen.getByText("Format non pris en charge ou image illisible.")).toBeInTheDocument();
    expect(latest.map((i) => i.status)).toEqual(["ready", "ready", "ready", "ready", "error", "error"]);
    expect(latest[3].id).toBe("d");

    // Nouvel essai de la photo refusée (413) : envoyée seule, ajoutée à la fin côté serveur.
    api.uploadListingImages.mockResolvedValueOnce([...after1, { id: "e", url: "https://img.test/e.webp", position: 4 }]);
    const retryButtons = screen.getAllByRole("button", { name: "Réessayer" });
    await act(async () => fireEvent.click(retryButtons[0]));
    await waitFor(() => expect(latest[4]).toMatchObject({ status: "ready", id: "e" }));
    expect(api.uploadListingImages).toHaveBeenLastCalledWith("L1", [two]);
  });

  test("frees the local previews when unmounted", () => {
    const { unmount } = renderManager();
    addFiles([file("a.jpg"), file("b.jpg")]);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-2");
  });
});
