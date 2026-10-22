import React from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";
import "./LegalPage.css";

const MentionsLegales = () => (
  <>
    <main className="legal-page">
      <div className="legal-page-inner">
        <Link to="/" className="legal-back">← Accueil</Link>
        <h1 className="legal-page-title">Mentions légales</h1>
        <p className="legal-page-meta">Dernière mise à jour : 19 octobre 2026 · Site de démonstration</p>

        <section className="legal-section">
          <h2>1. Éditeur du site</h2>
          <p>
            Le site AfrikaBnB (ci-après « le Site ») est édité par un entrepreneur individuel
            (auto-entrepreneur) agissant à titre de démonstration technique.
          </p>
          <ul>
            <li>Nom / dénomination : <span className="legal-todo">[À COMPLÉTER]</span></li>
            <li>SIRET : <span className="legal-todo">[À COMPLÉTER]</span></li>
            <li>Adresse : <span className="legal-todo">[À COMPLÉTER]</span></li>
            <li>E-mail de contact : <span className="legal-todo">[À COMPLÉTER]</span></li>
            <li>TVA : non applicable (franchise en base / CA ≈ 0) — à confirmer</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>2. Directeur de la publication</h2>
          <p>
            Directeur de la publication : <span className="legal-todo">[À COMPLÉTER]</span> (même
            personne que l’éditeur, sauf précision contraire).
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Hébergement</h2>
          <p>
            À la date de cette page, le Site est exploité en environnement de développement /
            démonstration locale. Aucun hébergeur de production n’est encore désigné.
          </p>
          <p>
            Hébergeur (lorsque le Site sera mis en ligne) :{" "}
            <span className="legal-todo">[À COMPLÉTER — nom, adresse, téléphone]</span>
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Nature du service</h2>
          <p>
            AfrikaBnB est une <strong>marketplace de location courte durée en démonstration</strong>.
            Les annonces, notes et contenus illustratifs ne constituent pas une offre commerciale
            opérationnelle. Aucun paiement en ligne n’est proposé dans le code actuel.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Propriété intellectuelle</h2>
          <p>
            Les éléments graphiques, textes et structure du Site appartiennent à l’éditeur ou sont
            utilisés sous licence (notamment images Unsplash). Toute reproduction non autorisée est
            interdite, hors usages légalement permis.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Responsabilité</h2>
          <p>
            Le Site est fourni « en l’état » à des fins de démonstration. L’éditeur ne garantit pas
            l’exactitude des annonces fictives ni la disponibilité continue du service.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Contact</h2>
          <p>
            Pour toute question relative aux présentes mentions :{" "}
            <span className="legal-todo">[À COMPLÉTER — e-mail]</span>
          </p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default MentionsLegales;
