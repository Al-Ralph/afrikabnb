import React from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";
import "./LegalPage.css";

const CGU = () => (
  <>
    <main className="legal-page">
      <div className="legal-page-inner">
        <Link to="/" className="legal-back">← Accueil</Link>
        <h1 className="legal-page-title">Conditions générales d’utilisation</h1>
        <p className="legal-page-meta">Dernière mise à jour : 22 octobre 2026 · Démonstration — pas de CGV de vente</p>

        <section className="legal-section">
          <h2>1. Objet</h2>
          <p>
            Les présentes Conditions Générales d’Utilisation (CGU) régissent l’accès et l’usage du
            site AfrikaBnB, plateforme de démonstration de marketplace de location courte durée.
          </p>
          <p>
            <strong>Aucune Condition Générale de Vente (CGV) opérationnelle</strong> n’est proposée :
            le Site ne permet pas de conclure une vente ou une réservation payante dans l’état actuel
            du code.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Acceptation</h2>
          <p>
            L’inscription d’un compte implique l’acceptation des présentes CGU via une case à cocher
            non pré-cochée. La navigation hors compte vaut prise de connaissance des règles
            d’usage du Site.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Description du service</h2>
          <p>
            AfrikaBnB présente des annonces (réelles ou fictives selon le mode démo), un compte
            utilisateur (e-mail / mot de passe), une recherche de destination et, selon
            configuration et consentement, des services cartographiques.
          </p>
          <p>
            Les utilisateurs connectés peuvent enregistrer des favoris, réserver un logement
            (sans paiement en ligne : la réservation est enregistrée mais aucune transaction
            financière n’est effectuée) et, après un séjour terminé, publier un avis.
          </p>
          <p>
            La note d’une annonce est la <strong>moyenne des avis</strong> déposés par les
            voyageurs ayant séjourné dans le logement ; un seul avis est possible par séjour.
            L’hôte ne peut pas fixer lui-même cette note. Les annonces et avis de démonstration
            sont fictifs.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Compte utilisateur</h2>
          <ul>
            <li>Vous vous engagez à fournir des informations exactes lors de l’inscription.</li>
            <li>Vous êtes responsable de la confidentialité de vos identifiants.</li>
            <li>
              L’éditeur peut suspendre un compte en cas d’usage abusif ou contraire aux présentes
              CGU.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Usages interdits</h2>
          <ul>
            <li>Tenter de compromettre la sécurité ou le fonctionnement du Site.</li>
            <li>Utiliser le Site à des fins illégales ou trompeuses.</li>
            <li>Usurper l’identité d’autrui.</li>
            <li>Présenter le Site comme un service commercial opérationnel sans l’accord de l’éditeur.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Propriété intellectuelle</h2>
          <p>
            Le contenu du Site (hors contenus tiers licenciés) est protégé. Toute extraction
            massive non autorisée est interdite.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Données personnelles</h2>
          <p>
            Le traitement des données est décrit dans la{" "}
            <Link to="/confidentialite">Politique de confidentialité</Link> et la page{" "}
            <Link to="/cookies">Cookies</Link>.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Responsabilité</h2>
          <p>
            Le Site est fourni à titre de démonstration. L’éditeur ne saurait être tenu responsable
            des dommages indirects liés à l’usage du Site, dans les limites autorisées par la loi.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Modification</h2>
          <p>
            Les CGU peuvent être mises à jour. La date de mise à jour figure en tête de page. En cas
            de changement substantiel, une information pourra être affichée sur le Site.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Droit applicable</h2>
          <p>
            Les présentes CGU sont régies par le droit français. À défaut d’accord amiable, les
            tribunaux compétents seront ceux déterminés selon les règles de procédure française.
          </p>
          <p>
            Médiation de la consommation : non applicable tant qu’aucun service payant n’est
            proposé aux consommateurs — voir livrable Phase 2 (« À FAIRE HUMAIN »).
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Contact</h2>
          <p>
            Contact éditeur : <span className="legal-todo">[À COMPLÉTER — e-mail]</span>
          </p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default CGU;
