import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HostBookings from "../host/HostBookings";
import MyBookings from "../profile/MyBookings";
import GuestBooking from "../../pages/GuestBooking";
import { LanguageProvider } from "../../context/LanguageContext";
import { api, toIsoDay } from "../../api/client";
import { goToPayment } from "./navigation";
import { resetPaymentsConfig } from "../../hooks/usePaymentsConfig";

const TOKEN = "t".repeat(43);
vi.mock("react-router-dom", async () => {
  const React = await vi.importActual("react");
  return {
    useParams: () => ({ token: "t".repeat(43) }),
    Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children),
  };
});
vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return {
    ...actual,
    api: {
      getPaymentsConfig: vi.fn(),
      getMyBookings: vi.fn(),
      getGuestBooking: vi.fn(),
      startGuestPayment: vi.fn(),
      startBookingPayment: vi.fn(),
      cancelBooking: vi.fn(),
      cancelGuestBooking: vi.fn(),
      confirmBooking: vi.fn(),
      declineBooking: vi.fn(),
    },
  };
});
vi.mock("./navigation", () => ({ goToPayment: vi.fn() }));

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toIsoDay(d);
};
const inMinutes = (n) => new Date(Date.now() + n * 60000).toISOString();
const booking = (id, extra = {}) => ({
  id,
  listingId: `l-${id}`,
  checkIn: day(10),
  checkOut: day(12),
  nights: 2,
  guests: 2,
  totalPrice: 90000,
  paymentAmount: 90000,
  currency: "XOF",
  status: "CONFIRMED",
  expiresAt: null,
  listing: { id: `l-${id}`, title: `Séjour ${id}`, location: "Lomé", currency: "XOF" },
  guest: { id: "g", name: `Voyageur ${id}` },
  ...extra,
});

const withLanguage = (ui) => render(<LanguageProvider>{ui}</LanguageProvider>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  sessionStorage.clear();
  resetPaymentsConfig();
  api.getPaymentsConfig.mockResolvedValue({ enabled: true, provider: "fake", currency: "XOF" });
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  window.history.replaceState.mockRestore?.();
});

describe("payment status on booking screens", () => {
  test("host: payment badges (expected before…, paid, refund in progress) when payments are enabled", async () => {
    withLanguage(
      <HostBookings
        bookings={[
          booking("a", { paymentStatus: "UNPAID", paymentDueAt: inMinutes(30) }),
          booking("b", { paymentStatus: "PAID" }),
          booking("c", { status: "CANCELLED", paymentStatus: "REFUND_DUE" }),
        ]}
        onBookingUpdated={vi.fn()}
      />
    );
    expect(await screen.findByText(/^Paiement attendu avant le /)).toBeInTheDocument();
    expect(screen.getByText("Payée")).toBeInTheDocument();
    expect(screen.getByText("Remboursement en cours")).toBeInTheDocument();
  });

  test("host: no payment badge when payments are disabled", async () => {
    api.getPaymentsConfig.mockResolvedValue({ enabled: false });
    withLanguage(<HostBookings bookings={[booking("b", { paymentStatus: "PAID" })]} onBookingUpdated={vi.fn()} />);
    await waitFor(() => expect(api.getPaymentsConfig).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("payment-badge")).not.toBeInTheDocument();
  });

  test("profile: pay button for an unpaid confirmed booking, refund info for a cancelled paid one", async () => {
    api.getMyBookings.mockResolvedValue([
      booking("u", { paymentStatus: "UNPAID", paymentDueAt: inMinutes(20) }),
      booking("r", { status: "CANCELLED", paymentStatus: "REFUND_DUE" }),
    ]);
    api.startBookingPayment.mockResolvedValue({ transactionId: "AFB1", paymentUrl: "https://checkout.cinetpay.com/payment/u" });
    withLanguage(<MyBookings />);
    fireEvent.click(await screen.findByRole("button", { name: "Payer avec Mobile Money" }));
    await waitFor(() => expect(goToPayment).toHaveBeenCalledWith("https://checkout.cinetpay.com/payment/u"));
    expect(api.startBookingPayment).toHaveBeenCalledWith("u", "fr");
    expect(screen.getByText("Remboursement en cours de traitement.")).toBeInTheDocument();
  });

  test("guest tracking page: pays with the tracking token", async () => {
    api.getGuestBooking.mockResolvedValue(booking("g1", { paymentStatus: "UNPAID", paymentDueAt: inMinutes(600) }));
    api.startGuestPayment.mockResolvedValue({ transactionId: "AFB9", paymentUrl: "https://checkout.cinetpay.com/payment/g" });
    withLanguage(<GuestBooking />);
    fireEvent.click(await screen.findByRole("button", { name: "Payer avec Mobile Money" }));
    await waitFor(() => expect(api.startGuestPayment).toHaveBeenCalledWith(TOKEN, "fr"));
    expect(goToPayment).toHaveBeenCalledWith("https://checkout.cinetpay.com/payment/g");
  });

  test("guest tracking page: nothing about payment when payments are disabled", async () => {
    api.getPaymentsConfig.mockResolvedValue({ enabled: false });
    api.getGuestBooking.mockResolvedValue(booking("g2", { paymentStatus: "UNPAID", paymentDueAt: inMinutes(600) }));
    withLanguage(<GuestBooking />);
    expect(await screen.findByText("Séjour g2")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("button", { name: "Payer avec Mobile Money" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-panel")).not.toBeInTheDocument();
  });
});
