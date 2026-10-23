import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PaymentPanel, { PAYMENT_RETURN_KEY } from "./PaymentPanel";
import PaymentBadge from "./PaymentBadge";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { goToPayment } from "./navigation";
import { resetPaymentsConfig } from "../../hooks/usePaymentsConfig";

vi.mock("../../api/client", async () => {
  const actual = await vi.importActual("../../api/client");
  return { ...actual, api: { getPaymentsConfig: vi.fn() } };
});
vi.mock("./navigation", () => ({ goToPayment: vi.fn() }));

const inMinutes = (n) => new Date(Date.now() + n * 60000).toISOString();
const unpaid = {
  id: "b1",
  status: "CONFIRMED",
  paymentStatus: "UNPAID",
  paymentDueAt: inMinutes(25),
  totalPrice: 20001,
  paymentAmount: 20005,
};

const renderUi = (ui) => render(<LanguageProvider>{ui}</LanguageProvider>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  sessionStorage.clear();
  resetPaymentsConfig();
  api.getPaymentsConfig.mockResolvedValue({ enabled: true, provider: "fake", currency: "XOF" });
});

describe("PaymentPanel", () => {
  test("UNPAID before the deadline: badge, exact XOF amount (rounded), deadline and pay button", async () => {
    renderUi(<PaymentPanel booking={unpaid} start={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Payer avec Mobile Money" })).toBeInTheDocument();
    expect(screen.getByTestId("payment-badge")).toHaveTextContent(/^À payer avant le /);
    expect(screen.getByTestId("payment-amount").textContent.replace(/\s/g, "")).toMatch(/20005/);
    expect(screen.getByText(/Arrondi au multiple de 5 FCFA supérieur/)).toBeInTheDocument();
    expect(screen.getByText(/la réservation est annulée automatiquement/)).toBeInTheDocument();
  });

  test("pay: calls the API with the language, remembers the return context, then redirects", async () => {
    const start = vi.fn().mockResolvedValue({ transactionId: "AFB1", paymentUrl: "https://checkout.cinetpay.com/payment/x" });
    renderUi(<PaymentPanel booking={unpaid} start={start} guestToken="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: "Payer avec Mobile Money" }));
    await waitFor(() => expect(goToPayment).toHaveBeenCalledWith("https://checkout.cinetpay.com/payment/x"));
    expect(start).toHaveBeenCalledWith("fr");
    expect(JSON.parse(sessionStorage.getItem(PAYMENT_RETURN_KEY))).toEqual({
      transactionId: "AFB1",
      bookingId: "b1",
      guestToken: "tok",
    });
  });

  test("pay: 409 shows a clear error and keeps the button", async () => {
    const start = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { status: 409 }));
    renderUi(<PaymentPanel booking={unpaid} start={start} />);
    fireEvent.click(await screen.findByRole("button", { name: "Payer avec Mobile Money" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("n'est plus payable");
    expect(goToPayment).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Payer avec Mobile Money" })).toBeEnabled();
  });

  test.each([
    ["PAID", "Payée", null],
    ["REFUND_DUE", "Remboursement en cours", "Remboursement en cours de traitement."],
    ["REFUNDED", "Remboursée", "Le remboursement a été effectué."],
  ])("%s: badge without pay button", async (paymentStatus, badge, info) => {
    renderUi(<PaymentPanel booking={{ ...unpaid, paymentStatus, status: paymentStatus === "PAID" ? "CONFIRMED" : "CANCELLED" }} start={vi.fn()} />);
    expect(await screen.findByTestId("payment-badge")).toHaveTextContent(badge);
    if (info) expect(screen.getByText(info)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("deadline passed: no pay button", async () => {
    renderUi(<PaymentPanel booking={{ ...unpaid, paymentDueAt: inMinutes(-1) }} start={vi.fn()} />);
    expect(await screen.findByTestId("payment-badge")).toHaveTextContent("Délai de paiement dépassé");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("nothing for a booking without expected payment (NONE, pending request, cancelled unpaid)", async () => {
    const { container } = renderUi(
      <>
        <PaymentPanel booking={{ ...unpaid, paymentStatus: "NONE" }} start={vi.fn()} />
        <PaymentPanel booking={{ ...unpaid, status: "PENDING", paymentStatus: "NONE" }} start={vi.fn()} />
        <PaymentPanel booking={{ ...unpaid, status: "CANCELLED" }} start={vi.fn()} />
      </>
    );
    await waitFor(() => expect(api.getPaymentsConfig).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='payment-panel']")).toBeNull();
  });

  test("payments disabled (or config unavailable): nothing is displayed", async () => {
    api.getPaymentsConfig.mockResolvedValue({ enabled: false, provider: null });
    const { container } = renderUi(<PaymentPanel booking={unpaid} start={vi.fn()} />);
    await waitFor(() => expect(api.getPaymentsConfig).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();

    resetPaymentsConfig();
    api.getPaymentsConfig.mockRejectedValue(new Error("down"));
    const other = renderUi(<PaymentPanel booking={unpaid} start={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(other.container).toBeEmptyDOMElement();
  });
});

describe("PaymentBadge", () => {
  test("host label for an unpaid confirmed booking", () => {
    renderUi(<PaymentBadge booking={unpaid} label="Paiement attendu avant le {date}" />);
    expect(screen.getByTestId("payment-badge")).toHaveTextContent(/^Paiement attendu avant le /);
  });
});
