import React from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import EmptyState from "../components/EmptyState";
import { useLanguage } from "../context/LanguageContext";
import "./Placeholder.css";

// Route inconnue : page introuvable (404 côté client).
const Placeholder = () => {
  const { t } = useLanguage();
  return (
    <>
      <main className="placeholder-page">
        <EmptyState
          icon="compass"
          action={
            <Link to="/" className="btn btn--primary">
              {t("ui.notFound.cta")}
            </Link>
          }
        >
          <h1 className="placeholder-title">{t("ui.notFound.title")}</h1>
          <p>{t("ui.notFound.text")}</p>
        </EmptyState>
      </main>
      <Footer />
    </>
  );
};

export default Placeholder;
