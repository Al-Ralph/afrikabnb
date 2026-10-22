import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import CookieBanner from "./CookieBanner";
import { ConsentProvider } from "../context/ConsentContext";
import { LanguageProvider } from "../context/LanguageContext";

jest.mock(
  "react-router-dom",
  () => {
    const React = require("react");
    return { Link: ({ to, children, ...rest }) => React.createElement("a", { href: to, ...rest }, children) };
  },
  { virtual: true }
);

const renderBanner = () =>
  render(
    <LanguageProvider>
      <ConsentProvider>
        <CookieBanner />
      </ConsentProvider>
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  document.head.innerHTML = "";
});

describe("CookieBanner", () => {
  test("is shown when no consent decision exists", () => {
    renderBanner();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cookies et traceurs")).toBeInTheDocument();
  });

  test("is hidden when a decision was already stored", () => {
    localStorage.setItem("afrikabnb_consent", JSON.stringify({ choice: "refused", decidedAt: Date.now() }));
    renderBanner();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("links to the cookies policy page", () => {
    renderBanner();
    expect(screen.getByRole("link", { name: "En savoir plus" })).toHaveAttribute("href", "/cookies");
  });

  test("clicking 'Tout accepter' stores acceptance and hides the banner", () => {
    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Tout accepter" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("afrikabnb_consent")).choice).toBe("accepted");
  });

  test("clicking 'Tout refuser' stores refusal and hides the banner", () => {
    renderBanner();
    fireEvent.click(screen.getByRole("button", { name: "Tout refuser" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("afrikabnb_consent")).choice).toBe("refused");
  });

  test("renders in English when the language is en", () => {
    localStorage.setItem("afrikabnb_lang", "en");
    renderBanner();
    expect(screen.getByText("Cookies & trackers")).toBeInTheDocument();
  });
});
