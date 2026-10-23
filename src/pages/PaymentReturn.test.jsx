import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaymentReturn, { paymentOutcome } from "./PaymentReturn";
import { LanguageProvider } from "../context/LanguageContext";
import { api } from "../api/client";
import { goToPayment } from "../components/payment/navigation";
import { PAYMENT_RETURN_KEY } from "../components/payment/PaymentPanel";

vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
});
vi.mock("../api/client", async () => {
  const actual = await vi.importActual("../api/client");
  return {
    ...actual,
    api: { getPaymentStatus: vi.fn(), startBookingPayment: vi.fn(), startGuestPayment: vi.fn(), getPaymentsConfig: vi.fn() },
  };
});
vi.mock("../components/payment/navigation", () => ({ goToPayment: vi.fn() }));

const TX = `AFB${"A".repeat(32)}`;
const due = () => new Date(Date.now() + 20 * 60000).toISOString();
const status = (over = {}, booking = {}) => ({
  transactionId: TX,
  status: "PENDING",
  amount: 20005,
  currency: "XOF",
  // Vue publique de GET /status : ni identifiant de réservation ni lien de paiement.
  booking: { status: "CONFIRMED", paymentStatus: "UNPAID", paymentDueAt: due(), ...booking },
  ...over,
});

const renderPage = (tx = TX) => {
  window.history.pushState({}, "", `/paiement/retour${tx ? `?tx=${tx}` : ""}`);
  render(
    <LanguageProvider>
      <PaymentReturn />
    </LanguageProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  sessionStorage.clear();
});

describe("PaymentReturn", () => {
  test("success: shown only after the server-side status says ACCEPTED + PAID", async () => {
    api.getPaymentStatus.mockResolvedValue(status({ status: "ACCEPTED" }, { paymentStatus: "PAID" }));
    renderPage();
    expect(await screen.findByText("Paiement reçu")).toBeInTheDocument();
    expect(api.getPaymentStatus).toHaveBeenCalledWith(TX);
    expect(screen.getByRole("link", { name: "Voir mes voyages" })).toHaveAttribute("href", "/profil");
  });

  test("pending: waiting message, polls again, then shows success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.getPaymentStatus
        .mockResolvedValueOnce(status())
        .mockResolvedValueOnce(status({ status: "ACCEPTED" }, { paymentStatus: "PAID" }));
      renderPage();
      expect(await screen.findByText("Paiement en attente")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(4100);
      expect(await screen.findByText("Paiement reçu")).toBeInTheDocument();
      expect(api.getPaymentStatus).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("failure: retry button starts a new payment for the signed-in traveller (stored context) and redirects", async () => {
    sessionStorage.setItem(PAYMENT_RETURN_KEY, JSON.stringify({ transactionId: TX, bookingId: "b1", guestToken: null }));
    api.getPaymentStatus.mockResolvedValue(status({ status: "REFUSED" }));
    api.startBookingPayment.mockResolvedValue({ transactionId: "AFB2", paymentUrl: "https://checkout.cinetpay.com/payment/y" });
    renderPage();
    expect(await screen.findByText("Paiement non abouti")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer le paiement" }));
    await waitFor(() => expect(goToPayment).toHaveBeenCalledWith("https://checkout.cinetpay.com/payment/y"));
    expect(api.startBookingPayment).toHaveBeenCalledWith("b1", "fr");
  });

  test("failure for a guest without account: retries with the stored tracking token", async () => {
    const token = "g".repeat(43);
    sessionStorage.setItem(PAYMENT_RETURN_KEY, JSON.stringify({ transactionId: TX, bookingId: "b1", guestToken: token }));
    api.getPaymentStatus.mockResolvedValue(status({ status: "REFUSED" }));
    api.startGuestPayment.mockResolvedValue({ transactionId: "AFB3", paymentUrl: "http://localhost:3000/api/payments/fake/AFB3" });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Réessayer le paiement" }));
    await waitFor(() => expect(api.startGuestPayment).toHaveBeenCalledWith(token, "fr"));
    expect(screen.getByRole("link", { name: "Revenir à ma réservation" })).toHaveAttribute("href", `/reservation/${token}`);
  });

  test("failure without stored context (other tab or device): no retry, link back to the trips", async () => {
    api.getPaymentStatus.mockResolvedValue(status({ status: "REFUSED" }));
    renderPage();
    expect(await screen.findByText("Paiement non abouti")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer le paiement" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir mes voyages" })).toHaveAttribute("href", "/profil");
  });

  test("failure after the deadline: no retry", async () => {
    sessionStorage.setItem(PAYMENT_RETURN_KEY, JSON.stringify({ transactionId: TX, bookingId: "b1", guestToken: null }));
    api.getPaymentStatus.mockResolvedValue(status({ status: "REFUSED" }, { status: "CANCELLED" }));
    renderPage();
    expect(await screen.findByText("Paiement non abouti")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer le paiement" })).not.toBeInTheDocument();
  });

  test("invalid or unknown transaction: not found, without calling the API for a malformed id", async () => {
    renderPage("pas-un-id");
    expect(await screen.findByText("Paiement introuvable")).toBeInTheDocument();
    expect(api.getPaymentStatus).not.toHaveBeenCalled();
  });

  test("paymentOutcome maps server statuses (accepted on an inactive booking -> refund)", () => {
    expect(paymentOutcome(status({ status: "ACCEPTED" }, { paymentStatus: "PAID" }))).toBe("success");
    expect(paymentOutcome(status({ status: "ACCEPTED" }, { paymentStatus: "REFUND_DUE" }))).toBe("refund");
    expect(paymentOutcome(status({ status: "FAILED" }))).toBe("failed");
    expect(paymentOutcome(status())).toBe("pending");
  });
});
