import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AvailabilityManager from "./AvailabilityManager";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { getBlockedPeriods: vi.fn(), createBlockedPeriod: vi.fn(), deleteBlockedPeriod: vi.fn() } };
});

const y = new Date().getFullYear() + 1;
const listings = [
  { id: "1", title: "Villa Lagune" },
  { id: "2", title: "Case Kpalimé" },
];
const bookings = [
  {
    id: "b1",
    status: "CONFIRMED",
    checkIn: `${y}-03-10`,
    checkOut: `${y}-03-14`,
    guest: { name: "Kofi" },
    listing: { id: "1", title: "Villa Lagune" },
  },
  {
    id: "b2",
    status: "CANCELLED",
    checkIn: `${y}-04-01`,
    checkOut: `${y}-04-03`,
    guest: { name: "Ama" },
    listing: { id: "1", title: "Villa Lagune" },
  },
];
const period = { id: "bp1", listingId: "1", startDate: `${y}-06-01T00:00:00.000Z`, endDate: `${y}-06-05T00:00:00.000Z`, reason: "Travaux" };

const renderManager = () =>
  render(
    <LanguageProvider>
      <AvailabilityManager listings={listings} bookings={bookings} />
    </LanguageProvider>
  );

const setDates = (start, end) => {
  fireEvent.change(screen.getByLabelText("Première nuit bloquée"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("Date de fin (exclue)"), { target: { value: end } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Bloquer ces dates" }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  Object.values(api).forEach((fn) => fn.mockReset());
  api.getBlockedPeriods.mockResolvedValue([period]);
});

describe("AvailabilityManager", () => {
  test("lists blocked periods and the active bookings of the selected listing", async () => {
    renderManager();
    expect(await screen.findByText("4 nuits · Travaux")).toBeInTheDocument();
    expect(api.getBlockedPeriods).toHaveBeenCalledWith("1", expect.objectContaining({ from: expect.any(String) }));
    expect(screen.getByText("Kofi · 4 nuits")).toBeInTheDocument();
    expect(screen.queryByText(/Ama/)).not.toBeInTheDocument(); // annulée : ne bloque rien

    api.getBlockedPeriods.mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText("Annonce"), { target: { value: "2" } });
    expect(await screen.findByText("Aucune période bloquée à venir.")).toBeInTheDocument();
    expect(api.getBlockedPeriods).toHaveBeenLastCalledWith("2", expect.anything());
    expect(screen.getByText("Aucune réservation à venir pour cette annonce.")).toBeInTheDocument();
  });

  test("blocks new dates with an optional reason", async () => {
    const created = { id: "bp2", listingId: "1", startDate: `${y}-07-01`, endDate: `${y}-07-03`, reason: "Famille" };
    api.createBlockedPeriod.mockResolvedValue(created);
    renderManager();
    await screen.findByText("4 nuits · Travaux");
    setDates(`${y}-07-01`, `${y}-07-03`);
    fireEvent.change(screen.getByLabelText("Raison (facultatif)"), { target: { value: " Famille " } });
    submit();
    await waitFor(() =>
      expect(api.createBlockedPeriod).toHaveBeenCalledWith("1", { startDate: `${y}-07-01`, endDate: `${y}-07-03`, reason: "Famille" })
    );
    expect(await screen.findByText("Dates bloquées.")).toBeInTheDocument();
    expect(screen.getByText("2 nuits · Famille")).toBeInTheDocument();
  });

  test("refuses invalid ranges and dates overlapping a known booking before calling the API", async () => {
    renderManager();
    await screen.findByText("4 nuits · Travaux");
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez une date de début et une date de fin.");
    setDates(`${y}-07-05`, `${y}-07-03`);
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("La date de fin doit être après la date de début.");
    setDates(`${y}-03-12`, `${y}-03-20`);
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Ces dates chevauchent la réservation de Kofi");
    expect(api.createBlockedPeriod).not.toHaveBeenCalled();
  });

  test("shows a clear message on 409 (booking created meanwhile)", async () => {
    api.createBlockedPeriod.mockRejectedValue(Object.assign(new Error("Conflit"), { status: 409 }));
    renderManager();
    await screen.findByText("4 nuits · Travaux");
    setDates(`${y}-08-01`, `${y}-08-04`);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Une réservation existe déjà sur ces dates");
  });

  test("unblocks a period after confirmation", async () => {
    api.deleteBlockedPeriod.mockResolvedValue(undefined);
    renderManager();
    const item = (await screen.findByText("4 nuits · Travaux")).closest("li");
    fireEvent.click(within(item).getByRole("button", { name: "Débloquer" }));
    expect(api.deleteBlockedPeriod).not.toHaveBeenCalled();
    fireEvent.click(within(item).getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.deleteBlockedPeriod).toHaveBeenCalledWith("1", "bp1"));
    expect(await screen.findByText("Aucune période bloquée à venir.")).toBeInTheDocument();
  });

  test("the calendar picker fills the date fields", async () => {
    renderManager();
    await screen.findByText("4 nuits · Travaux");
    fireEvent.click(screen.getByRole("button", { name: "Choisir sur le calendrier" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Masquer le calendrier" })).toHaveAttribute("aria-expanded", "true");
  });
});
