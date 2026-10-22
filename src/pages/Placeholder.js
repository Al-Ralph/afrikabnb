import React from "react";
import { Link } from "react-router-dom";
import Footer from "../components/Footer";
import "./Placeholder.css";

const Placeholder = () => {
  return (
    <>
      <main className="placeholder-page">
        <div className="placeholder-inner">
          <h1>Page en construction</h1>
          <p>Cette section sera bientôt disponible.</p>
          <Link to="/" className="placeholder-back">← Retour à l'accueil</Link>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Placeholder;
