import React from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";
import { useConsent } from "../../context/ConsentContext";
import "./LegalPage.css";

const Cookies = () => {
  const { openCookieManager, consent, thirdPartyAllowed } = useConsent();

  return (
    <>
      <main className="legal-page">
        <div className="legal-page-inner">
          <Link to="/" className="legal-back">← Accueil</Link>
          <h1 className="legal-page-title">Cookies et traceurs</h1>
          <p className="legal-page-meta">Dernière mise à jour : 22 octobre 2026 · Consentement valable au maximum 6 mois</p>

          <section className="legal-section">
            <h2>1. Votre choix actuel</h2>
            <p>
              Statut :{" "}
              {!consent
                ? "aucun choix enregistré"
                : thirdPartyAllowed
                  ? "traceurs non essentiels acceptés"
                  : "traceurs non essentiels refusés"}
              .
            </p>
            <p>
              <button type="button" className="legal-action-btn" onClick={openCookieManager}>
                Gérer mes cookies
              </button>
            </p>
          </section>

          <section className="legal-section">
            <h2>2. Inventaire</h2>
            <div className="legal-table-wrap">
              <table className="legal-table">
                <thead>
                  <tr>
                    <th>Nom / mécanisme</th>
                    <th>Type</th>
                    <th>Finalité</th>
                    <th>Durée</th>
                    <th>Consentement</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>afrikabnb_rt</td>
                    <td>Cookie HTTP <em>httpOnly</em>, <em>Secure</em>, <em>SameSite=Strict</em>, limité à /api/auth</td>
                    <td>Maintien de la session : renouvelle la connexion sans ressaisir le mot de passe (jeton aléatoire, renouvelé à chaque usage, illisible par les scripts de la page)</td>
                    <td>30 jours (supprimé à la déconnexion)</td>
                    <td>Exempt (strictement nécessaire au compte)</td>
                  </tr>
                  <tr>
                    <td>afrikabnb_lang</td>
                    <td>Stockage local</td>
                    <td>Mémoriser la langue d’interface</td>
                    <td>Jusqu’à suppression</td>
                    <td>Exempt (préférence utilisateur)</td>
                  </tr>
                  <tr>
                    <td>afrikabnb_currency</td>
                    <td>Stockage local</td>
                    <td>Mémoriser la devise d’affichage choisie (absent en mode automatique)</td>
                    <td>Jusqu’à suppression ou retour au mode automatique</td>
                    <td>Exempt (préférence utilisateur)</td>
                  </tr>
                  <tr>
                    <td>afrikabnb_rates</td>
                    <td>Stockage de session</td>
                    <td>Garder les taux de change publics pour éviter de les recharger (aucune donnée personnelle)</td>
                    <td>6 heures, effacé à la fermeture de l’onglet</td>
                    <td>Exempt (fonctionnement du service)</td>
                  </tr>
                  <tr>
                    <td>afrikabnb_consent</td>
                    <td>Stockage local</td>
                    <td>Mémoriser le choix cookies</td>
                    <td>Max. 6 mois</td>
                    <td>Exempt (preuve du consentement)</td>
                  </tr>
                  <tr>
                    <td>Google Fonts</td>
                    <td>Script / feuille de style tierce</td>
                    <td>Polices web</td>
                    <td>Session / cache navigateur</td>
                    <td>Requis — bloqué tant que non accepté</td>
                  </tr>
                  <tr>
                    <td>Google Maps JavaScript API</td>
                    <td>Script tiers (si clé API)</td>
                    <td>Autocomplétion de lieux</td>
                    <td>Session</td>
                    <td>Requis — bloqué tant que non accepté</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="legal-section">
            <p>
              Le jeton d’accès (valable 15 minutes) n’est conservé qu’en mémoire pendant la visite :
              il n’est plus enregistré dans le stockage local du navigateur (l’ancienne entrée
              afrikabnb_token est supprimée automatiquement). Le bouton « Se déconnecter de tous les
              appareils » du profil ferme toutes les sessions ouvertes.
            </p>
          </section>

          <section className="legal-section">
            <h2>3. Fonctionnement du bandeau</h2>
            <ul>
              <li>
                Deux actions de même niveau : <strong>Tout refuser</strong> et{" "}
                <strong>Tout accepter</strong> (parité d’accès, exigence CNIL).
              </li>
              <li>
                « Tout refuser » : Google Fonts et Google Maps ne sont pas chargés ; le Site
                fonctionne avec polices système et saisie manuelle de destination.
              </li>
              <li>« Tout accepter » : chargement autorisé de Fonts et Maps (si clé configurée).</li>
              <li>Le choix est mémorisé au maximum 6 mois, puis le bandeau réapparaît.</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Alternative technique</h2>
            <p>
              Une alternative future consiste à auto-héberger les polices (fichiers WOFF2 locaux) pour
              supprimer le besoin de consentement pour les Fonts. Non implémenté à ce jour : le
              chargement conditionnel après consentement est en place.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Plus d’informations</h2>
            <p>
              Voir aussi la <Link to="/confidentialite">Politique de confidentialité</Link>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Cookies;
