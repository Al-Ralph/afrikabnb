import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ListingForm, { validateListing } from "./ListingForm";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return {
    ...actual,
    api: {
      createListing: vi.fn(),
      updateListing: vi.fn(),
      geocode: vi.fn(),
      uploadListingImages: vi.fn(),
      deleteListingImage: vi.fn(),
      reorderListingImages: vi.fn(),
    },
  };
});

// Pas de Google Maps : saisie manuelle des coordonnées.
vi.mock("../../hooks/useGoogleMapsScript", () => ({
  useGoogleMapsScript: () => ({ loaded: false, error: null, hasKey: false }),
}));

const renderForm = (props = {}) => {
  const handlers = { onSaved: vi.fn(), onCancel: vi.fn() };
  render(
    <LanguageProvider>
      <ListingForm {...handlers} {...props} />
    </LanguageProvider>
  );
  return { ...handlers, ...props };
};

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Publier" }));

const fillRequired = () => {
  type(/^Titre/, "Villa Lagune");
  type(/^Ville/, "Lomé, Togo");
  type(/^Prix par nuit/, "45000");
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
});

describe("validateListing", () => {
  const base = {
    title: "T", description: "", location: "L", address: "", latitude: "", longitude: "",
    pricePerNight: "10", currency: "XOF", maxGuests: "2", bedrooms: "1", categoryId: "", acceptsPets: false,
    amenities: [], instantBook: true,
  };

  test("accepts decimal commas and converts to real numbers", () => {
    const { errors, payload } = validateListing({ ...base, latitude: "6,1319", longitude: "1.2228", pricePerNight: "12,5" });
    expect(errors).toEqual({});
    expect(payload).toMatchObject({ latitude: 6.1319, longitude: 1.2228, pricePerNight: 12.5 });
  });

  test("rejects out-of-range coordinates, a lone coordinate and bad integers", () => {
    expect(validateListing({ ...base, latitude: "91", longitude: "0" }).errors.latitude).toBe("latRange");
    expect(validateListing({ ...base, latitude: "0", longitude: "-181" }).errors.longitude).toBe("lngRange");
    expect(validateListing({ ...base, latitude: "6.1" }).errors.longitude).toBe("coordsPair");
    expect(validateListing({ ...base, latitude: "abc", longitude: "1" }).errors.latitude).toBe("invalidNumber");
    expect(validateListing({ ...base, maxGuests: "0" }).errors.maxGuests).toBe("guestsRange");
    expect(validateListing({ ...base, bedrooms: "2.5" }).errors.bedrooms).toBe("bedroomsRange");
    expect(validateListing({ ...base, pricePerNight: "0" }).errors.pricePerNight).toBe("pricePositive");
  });

  test("sends known amenity codes and the instant booking flag, never an image URL", () => {
    const { errors, payload } = validateListing({ ...base, amenities: ["POOL", "NOT_A_CODE", "WIFI"], instantBook: false });
    expect(errors).toEqual({});
    expect(payload.amenities).toEqual(["POOL", "WIFI"]);
    expect(payload.instantBook).toBe(false);
    expect(payload).not.toHaveProperty("imageUrl");
  });
});

describe("ListingForm", () => {
  test("shows client-side errors per field and does not call the API", () => {
    renderForm();
    type(/^Latitude/, "95");
    type(/^Longitude/, "1");
    submit();
    expect(screen.getByLabelText(/^Titre/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Champ obligatoire.")).toHaveLength(3);
    expect(screen.getByText("La latitude doit être comprise entre -90 et 90.")).toBeInTheDocument();
    expect(api.createListing).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Titre/)).toHaveFocus();
  });

  test("creates a listing with the API payload (amenities, instant booking)", async () => {
    const saved = { id: "99", title: "Villa Lagune" };
    api.createListing.mockResolvedValue(saved);
    const { onSaved } = renderForm();
    fillRequired();
    type(/^Latitude/, "6,1319");
    type(/^Longitude/, "1.2228");
    type(/^Catégorie/, "piscines");
    fireEvent.click(screen.getByLabelText("Animaux acceptés"));
    fireEvent.click(screen.getByLabelText("Climatisation"));
    fireEvent.click(screen.getByLabelText("Groupe électrogène"));
    const instant = screen.getByRole("switch", { name: "Réservation instantanée" });
    expect(instant).toBeChecked();
    fireEvent.click(instant);
    expect(screen.getByText(/vous avez 48 h pour l’accepter/)).toBeInTheDocument();
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, false));
    expect(api.createListing).toHaveBeenCalledWith({
      title: "Villa Lagune",
      description: null,
      location: "Lomé, Togo",
      address: null,
      latitude: 6.1319,
      longitude: 1.2228,
      pricePerNight: 45000,
      currency: "XOF",
      maxGuests: 2,
      bedrooms: 1,
      categoryId: "piscines",
      acceptsPets: true,
      amenities: ["AIR_CONDITIONING", "GENERATOR"],
      instantBook: false,
    });
    expect(api.uploadListingImages).not.toHaveBeenCalled();
  });

  test("maps 400 validation details from the server onto the fields", async () => {
    api.createListing.mockRejectedValue(
      Object.assign(new Error("Données invalides"), {
        status: 400,
        details: [
          { path: "pricePerNight", message: "Prix refusé par le serveur" },
          { path: "rating", message: "Champ inconnu" },
        ],
      })
    );
    const { onSaved } = renderForm();
    fillRequired();
    submit();
    expect(await screen.findByText("Prix refusé par le serveur")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Prix par nuit/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Champ inconnu");
    expect(onSaved).not.toHaveBeenCalled();
  });

  test("edits an existing listing with updateListing", async () => {
    const listing = {
      id: "5", title: "Ancien", location: "Accra", price: 80, currency: "GHS", maxGuests: 4, bedrooms: 2,
      amenities: ["WIFI"], instantBook: false,
    };
    api.updateListing.mockResolvedValue({ ...listing, title: "Nouveau" });
    const { onSaved } = renderForm({ listing });
    expect(screen.getByLabelText(/^Devise/)).toHaveValue("GHS");
    expect(screen.getByLabelText("Wi-Fi")).toBeChecked();
    expect(screen.getByRole("switch", { name: "Réservation instantanée" })).not.toBeChecked();
    type(/^Titre/, "Nouveau");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updateListing).toHaveBeenCalledWith("5", expect.objectContaining({ title: "Nouveau", pricePerNight: 80, currency: "GHS", maxGuests: 4, amenities: ["WIFI"], instantBook: false }));
  });

  test("new listing: creates it, then uploads the photos in the chosen order (first = cover)", async () => {
    api.createListing.mockResolvedValue({ id: "77", title: "Villa Lagune", images: [] });
    api.uploadListingImages
      .mockResolvedValueOnce([{ id: "p2", url: "https://img.test/2.webp" }])
      .mockResolvedValueOnce([
        { id: "p2", url: "https://img.test/2.webp" },
        { id: "p1", url: "https://img.test/1.webp" },
      ]);
    const { onSaved, onDraftSaved } = renderForm({ onDraftSaved: vi.fn() });
    fillRequired();
    const first = new File(["1"], "un.jpg", { type: "image/jpeg" });
    const second = new File(["2"], "deux.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Ajouter des photos"), { target: { files: [first, second] } });
    // La deuxième photo devient la couverture.
    fireEvent.click(screen.getByRole("button", { name: "Déplacer vers la gauche (Photo 2)" }));
    submit();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.uploadListingImages).toHaveBeenNthCalledWith(1, "77", [second]);
    expect(api.uploadListingImages).toHaveBeenNthCalledWith(2, "77", [first]);
    const [saved, isEdit] = onSaved.mock.calls[0];
    expect(isEdit).toBe(false);
    expect(saved).toMatchObject({ id: "77", image: "https://img.test/2.webp", imageUrl: "https://img.test/2.webp" });
    expect(saved.images).toHaveLength(2);
    expect(onDraftSaved).not.toHaveBeenCalled();
  });

  test("new listing: partial photo failure keeps the form open in edit mode with the error", async () => {
    api.createListing.mockResolvedValue({ id: "78", title: "Villa Lagune", images: [] });
    api.uploadListingImages
      .mockResolvedValueOnce([{ id: "p1", url: "https://img.test/1.webp" }])
      .mockRejectedValueOnce(Object.assign(new Error("Image illisible"), { status: 415 }));
    const onDraftSaved = vi.fn();
    const { onSaved } = renderForm({ onDraftSaved });
    fillRequired();
    fireEvent.change(screen.getByLabelText("Ajouter des photos"), {
      target: { files: [new File(["1"], "ok.jpg", { type: "image/jpeg" }), new File(["2"], "ko.jpg", { type: "image/jpeg" })] },
    });
    submit();
    expect(await screen.findByText(/Votre annonce est créée, mais 1 photo\(s\) sur 2/)).toBeInTheDocument();
    expect(screen.getByText("Format non pris en charge ou image illisible.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onDraftSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "78", image: "https://img.test/1.webp" }));
    // L'annonce existe : le formulaire passe en modification (pas de seconde création).
    expect(screen.getByRole("heading", { name: "Modifier l’annonce" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    api.updateListing.mockResolvedValue({ id: "78", title: "Villa Lagune" });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "78", title: "Villa Lagune" }, true));
    expect(api.createListing).toHaveBeenCalledTimes(1);
  });

  test("finds coordinates through the API geocoder", async () => {
    api.geocode.mockResolvedValue([{ displayName: "Lomé", latitude: 6.13, longitude: 1.22 }]);
    renderForm();
    type(/^Adresse/, "Boulevard du 13 janvier, Lomé");
    fireEvent.click(screen.getByRole("button", { name: "Trouver les coordonnées" }));
    await waitFor(() => expect(screen.getByLabelText(/^Latitude/)).toHaveValue("6.13"));
    expect(screen.getByLabelText(/^Longitude/)).toHaveValue("1.22");
    expect(api.geocode).toHaveBeenCalledWith("Boulevard du 13 janvier, Lomé", 1);
  });
});
