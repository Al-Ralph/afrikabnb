import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ListingForm, { validateListing } from "./ListingForm";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { createListing: vi.fn(), updateListing: vi.fn(), geocode: vi.fn() } };
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
  return handlers;
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
  api.createListing.mockReset();
  api.updateListing.mockReset();
  api.geocode.mockReset();
});

describe("validateListing", () => {
  const base = {
    title: "T", description: "", location: "L", address: "", latitude: "", longitude: "",
    pricePerNight: "10", currency: "XOF", maxGuests: "2", bedrooms: "1", categoryId: "", acceptsPets: false, imageUrl: "",
  };

  test("accepts decimal commas and converts to real numbers", () => {
    const { errors, payload } = validateListing({ ...base, latitude: "6,1319", longitude: "1.2228", pricePerNight: "12,5" });
    expect(errors).toEqual({});
    expect(payload).toMatchObject({ latitude: 6.1319, longitude: 1.2228, pricePerNight: 12.5 });
  });

  test("rejects out-of-range coordinates, a lone coordinate, non-https images and bad integers", () => {
    expect(validateListing({ ...base, latitude: "91", longitude: "0" }).errors.latitude).toBe("latRange");
    expect(validateListing({ ...base, latitude: "0", longitude: "-181" }).errors.longitude).toBe("lngRange");
    expect(validateListing({ ...base, latitude: "6.1" }).errors.longitude).toBe("coordsPair");
    expect(validateListing({ ...base, latitude: "abc", longitude: "1" }).errors.latitude).toBe("invalidNumber");
    expect(validateListing({ ...base, imageUrl: "http://img.test/a.jpg" }).errors.imageUrl).toBe("httpsRequired");
    expect(validateListing({ ...base, maxGuests: "0" }).errors.maxGuests).toBe("guestsRange");
    expect(validateListing({ ...base, bedrooms: "2.5" }).errors.bedrooms).toBe("bedroomsRange");
    expect(validateListing({ ...base, pricePerNight: "0" }).errors.pricePerNight).toBe("pricePositive");
  });
});

describe("ListingForm", () => {
  test("shows client-side errors per field and does not call the API", () => {
    renderForm();
    type(/^Latitude/, "95");
    type(/^Longitude/, "1");
    type(/^URL de l’image/, "http://example.com/a.jpg");
    submit();
    expect(screen.getByLabelText(/^Titre/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Champ obligatoire.")).toHaveLength(3);
    expect(screen.getByText("La latitude doit être comprise entre -90 et 90.")).toBeInTheDocument();
    expect(screen.getByText("L’URL doit commencer par https://")).toBeInTheDocument();
    expect(api.createListing).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Titre/)).toHaveFocus();
  });

  test("creates a listing with the API payload and shows the https image preview", async () => {
    const saved = { id: "99", title: "Villa Lagune" };
    api.createListing.mockResolvedValue(saved);
    const { onSaved } = renderForm();
    fillRequired();
    type(/^Latitude/, "6,1319");
    type(/^Longitude/, "1.2228");
    type(/^Catégorie/, "piscines");
    fireEvent.click(screen.getByLabelText("Animaux acceptés"));
    type(/^URL de l’image/, "https://images.test/villa.jpg");
    expect(screen.getByAltText("Aperçu de l’image")).toHaveAttribute("src", "https://images.test/villa.jpg");
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
      imageUrl: "https://images.test/villa.jpg",
    });
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
    const listing = { id: "5", title: "Ancien", location: "Accra", price: 80, currency: "GHS", maxGuests: 4, bedrooms: 2 };
    api.updateListing.mockResolvedValue({ ...listing, title: "Nouveau" });
    const { onSaved } = renderForm({ listing });
    expect(screen.getByLabelText(/^Devise/)).toHaveValue("GHS");
    type(/^Titre/, "Nouveau");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.updateListing).toHaveBeenCalledWith("5", expect.objectContaining({ title: "Nouveau", pricePerNight: 80, currency: "GHS", maxGuests: 4 }));
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
