import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewsSection from "./ReviewsSection";
import { LanguageProvider } from "../../context/LanguageContext";
import { api } from "../../api/client";

jest.mock("../../api/client", () => {
  const actual = jest.requireActual("../../api/client");
  return { ...actual, api: { getReviews: jest.fn() } };
});

const review = (i) => ({
  id: `r${i}`,
  rating: 4,
  comment: `Commentaire ${i}`,
  createdAt: "2026-05-02T10:00:00.000Z",
  author: { id: `u${i}`, name: `Auteur ${i}`, avatar: null },
});

const renderSection = () =>
  render(
    <LanguageProvider>
      <ReviewsSection listingId="7" />
    </LanguageProvider>
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("afrikabnb_lang", "fr");
  api.getReviews.mockReset();
});

describe("ReviewsSection", () => {
  test("paginates with 'show more' until every review is loaded", async () => {
    api.getReviews
      .mockResolvedValueOnce({ data: [1, 2, 3, 4, 5].map(review), total: 7, rating: 4.3, reviewCount: 7 })
      .mockResolvedValueOnce({ data: [6, 7].map(review), total: 7, rating: 4.3, reviewCount: 7 });
    renderSection();
    expect(await screen.findByText("Commentaire 5")).toBeInTheDocument();
    expect(api.getReviews).toHaveBeenCalledWith("7", { limit: 5, offset: 0 });
    expect(screen.getByRole("heading", { name: /4\.3 · 7 avis/ })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "4 étoiles sur 5" })).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Voir plus d’avis" }));
    expect(await screen.findByText("Commentaire 7")).toBeInTheDocument();
    expect(api.getReviews).toHaveBeenLastCalledWith("7", { limit: 5, offset: 5 });
    expect(screen.getByText("Auteur 1")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Voir plus d’avis" })).not.toBeInTheDocument());
  });

  test("shows the empty state", async () => {
    api.getReviews.mockResolvedValue({ data: [], total: 0, rating: null, reviewCount: 0 });
    renderSection();
    expect(await screen.findByText("Aucun avis pour le moment.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voir plus d’avis" })).not.toBeInTheDocument();
  });
});
