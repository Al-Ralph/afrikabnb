import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AdminRefunds from "./AdminRefunds";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
});
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { getAdminRefunds: vi.fn(), markRefunded: vi.fn(), markPaymentRefunded: vi.fn() } };
});

const bookingRow = {
  id: "bk1",
  status: "CANCELLED",
  paymentStatus: "REFUND_DUE",
  totalPrice: 20001,
  checkIn: "2027-06-10",
  checkOut: "2027-06-12",
  traveler: { name: "Ama Mensah", email: "ama@example.com", account: false },
  listing: { id: "l1", title: "Villa Lomé" },
  payments: [{ transactionId: "AFB1", amount: 20005, currency: "XOF", method: "OMTG", operatorId: "OP1" }],
};
const isolated = {
  id: "p9",
  transactionId: "AFB9",
  amount: 20005,
  currency: "XOF",
  status: "REFUND_DUE",
  rawStatus: "AMOUNT_MISMATCH",
  method: "OMTG",
  booking: { id: "bk2", listing: { id: "l2", title: "Case Kpalimé" }, traveler: { name: "Kofi", email: "kofi@example.com" } },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getAdminRefunds.mockResolvedValue({ data: [bookingRow], total: 1, payments: [isolated] });
});

const renderRefunds = () =>
  render(
    <LanguageProvider>
      <AdminRefunds />
    </LanguageProvider>
  );

describe("AdminRefunds", () => {
  test("lists bookings to refund and marks one as refunded", async () => {
    api.markRefunded.mockResolvedValue({ ...bookingRow, paymentStatus: "REFUNDED" });
    renderRefunds();
    const row = (await screen.findByText("Villa Lomé")).closest("tr");
    expect(within(row).getByText(/Ama Mensah/)).toHaveTextContent("(sans compte)");
    fireEvent.click(within(row).getByRole("button", { name: "Marquer remboursé" }));
    fireEvent.click(within(row).getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.markRefunded).toHaveBeenCalledWith("bk1"));
    expect(await screen.findByText("Remboursement enregistré.")).toBeInTheDocument();
  });

  test("lists isolated payments (amount mismatch, duplicate) and marks one as refunded", async () => {
    api.markPaymentRefunded.mockResolvedValue({ ...isolated, status: "REFUNDED" });
    renderRefunds();
    const section = await screen.findByRole("region", { name: "Paiements à rembourser isolément" });
    const row = within(section).getByText("AFB9").closest("tr");
    expect(within(row).getByText("Montant ou devise discordants")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Marquer remboursé" }));
    fireEvent.click(within(row).getByRole("button", { name: "Oui, confirmer" }));
    await waitFor(() => expect(api.markPaymentRefunded).toHaveBeenCalledWith("p9"));
    expect(await screen.findByText("Paiement remboursé enregistré.")).toBeInTheDocument();
    expect(screen.queryByText("AFB9")).not.toBeInTheDocument();
  });

  test("switching to « Remboursés » reloads with the REFUNDED filter", async () => {
    renderRefunds();
    await screen.findByText("Villa Lomé");
    fireEvent.click(screen.getByRole("button", { name: "Remboursés" }));
    await waitFor(() => expect(api.getAdminRefunds).toHaveBeenLastCalledWith(expect.objectContaining({ status: "REFUNDED", offset: 0 })));
  });
});
