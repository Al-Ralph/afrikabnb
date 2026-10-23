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
            Les utilisateurs connectés peuvent enregistrer des favoris, réserver un logement et,
            après un séjour terminé, publier un avis. Tant que le paiement en ligne n’est pas activé
            sur le Site, la réservation est enregistrée sans qu’aucune transaction financière ne
            soit effectuée ; lorsqu’il est activé, les conditions de paiement ci-dessous
            s’appliquent.
          </p>
          <p>
            <strong>Paiement en ligne (lorsqu’il est activé)</strong> : une réservation confirmée
            (réservation instantanée, ou demande acceptée par l’hôte) se paie par Mobile Money via
            le prestataire de paiement <strong>CinetPay</strong>, en francs CFA (XOF), dans le délai
            indiqué sur la réservation (par défaut 30 minutes pour une réservation instantanée et 24
            heures après l’acceptation d’une demande). Le montant facturé est le prix total de la
            réservation, arrondi le cas échéant au multiple de 5 FCFA supérieur exigé par le
            prestataire ; il est affiché avant tout paiement. Les montants convertis dans une autre
            devise sont indicatifs. Les dates restent réservées pendant ce délai ; à défaut de
            paiement confirmé par le prestataire à l’échéance, la réservation est annulée
            automatiquement et les dates sont libérées. Le paiement est saisi sur la page de
            CinetPay : AfrikaBnB ne reçoit ni ne conserve vos identifiants Mobile Money.
          </p>
          <p>
            <strong>Annulation et remboursement</strong> : une réservation payée peut être annulée
            par le voyageur ou l’hôte avant le jour d’arrivée ; le montant payé est alors remboursé
            au voyageur. De même, un paiement reçu alors que la réservation n’était plus active
            (annulée ou délai de paiement dépassé) est remboursé et ne réactive pas la réservation.
            Les remboursements sont traités manuellement par l’éditeur, via le prestataire de
            paiement ou par transfert Mobile Money ; leur délai dépend du prestataire et de
            l’opérateur et ne peut être garanti. D’éventuels frais de l’opérateur ou du prestataire
            peuvent ne pas être remboursables. Ces modalités de démonstration ne constituent pas
            une politique commerciale définitive ; elles seront précisées avant toute exploitation
            commerciale.
          </p>
          <p>
            <strong>Réservation sans compte</strong> : il est aussi possible de réserver sans créer
            de compte. Une réservation sans compte est toujours une <strong>demande</strong> que
            l’hôte accepte ou refuse sous 48 heures ; elle se suit et s’annule via le lien personnel
            envoyé par e-mail (à ne pas partager). Le nombre de demandes en attente est limité par
            adresse e-mail.
          </p>
          <p>
            <strong>Coordonnées transmises à l’hôte</strong> : toute réservation (avec ou sans
            compte) exige de renseigner un nom, une adresse e-mail, un téléphone et un pays, et
            éventuellement une heure d’arrivée et un message. En validant la réservation, vous
            acceptez les présentes CGU et que ces informations soient transmises à l’hôte du
            logement pour organiser votre séjour (voir la{" "}
            <Link to="/confidentialite">Politique de confidentialité</Link>). Vous vous engagez à
            fournir des coordonnées exactes ; l’hôte s’engage à ne les utiliser que pour ce séjour.
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
