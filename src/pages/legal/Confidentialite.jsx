import React from "react";
import { Link } from "react-router-dom";
import Footer from "../../components/Footer";
import "./LegalPage.css";

const Confidentialite = () => (
  <>
    <main className="legal-page">
      <div className="legal-page-inner">
        <Link to="/" className="legal-back">← Accueil</Link>
        <h1 className="legal-page-title">Politique de confidentialité</h1>
        <p className="legal-page-meta">Dernière mise à jour : 22 octobre 2026 · Basée sur les traitements réellement présents dans le code</p>

        <section className="legal-section">
          <h2>1. Responsable du traitement</h2>
          <p>
            Responsable : l’éditeur du Site (auto-entrepreneur) — identité complète dans les{" "}
            <Link to="/mentions-legales">Mentions légales</Link> (
            <span className="legal-todo">[À COMPLÉTER]</span>).
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Données et traitements (inventaire code)</h2>
          <div className="legal-table-wrap">
            <table className="legal-table">
              <thead>
                <tr>
                  <th>Traitement</th>
                  <th>Données</th>
                  <th>Finalité</th>
                  <th>Base légale</th>
                  <th>Durée / stockage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Compte utilisateur</td>
                  <td>E-mail, mot de passe (hashé), nom optionnel</td>
                  <td>Création et gestion du compte démo</td>
                  <td>Exécution du contrat / mesures précontractuelles (inscription volontaire)</td>
                  <td>Conservé en base tant que le compte existe</td>
                </tr>
                <tr>
                  <td>Profil</td>
                  <td>Nom, URL d’avatar (facultatifs)</td>
                  <td>Personnaliser le compte ; affichés publiquement sur les annonces et avis</td>
                  <td>Exécution du contrat</td>
                  <td>Conservé en base tant que le compte existe</td>
                </tr>
                <tr>
                  <td>Réservations</td>
                  <td>Logement, dates d’arrivée et de départ, nombre de voyageurs, montant, statut</td>
                  <td>Enregistrer et gérer le séjour ; nom du voyageur visible par l’hôte du logement</td>
                  <td>Exécution du contrat</td>
                  <td>Conservé en base tant que le compte ou l’annonce existe</td>
                </tr>
                <tr>
                  <td>Coordonnées de réservation (avec ou sans compte)</td>
                  <td>
                    Nom complet, e-mail, téléphone, pays, heure d’arrivée estimée et message à l’hôte
                    (facultatifs), acceptation des CGU
                  </td>
                  <td>
                    Transmettre vos coordonnées à l’hôte du logement réservé (et à lui seul) pour
                    organiser le séjour ; vous envoyer les e-mails de suivi de la réservation
                  </td>
                  <td>Exécution du contrat / mesures précontractuelles (demande de réservation)</td>
                  <td>
                    Conservées avec la réservation ; durée de conservation envisagée : 3 ans au plus
                    après la fin du séjour, sous réserve des obligations légales (purge automatique
                    non encore en place)
                  </td>
                </tr>
                <tr>
                  <td>Réservation sans compte</td>
                  <td>
                    Coordonnées ci-dessus ; jeton du lien de suivi (seule son empreinte SHA-256 est
                    conservée en base)
                  </td>
                  <td>
                    Permettre de réserver sans créer de compte, puis de suivre ou d’annuler la demande
                    via le lien personnel reçu par e-mail ; limiter les abus (nombre de demandes en
                    attente par adresse e-mail, par adresse IP)
                  </td>
                  <td>Exécution du contrat / intérêt légitime (prévention des abus)</td>
                  <td>
                    Lien valable jusqu’à 30 jours après la date de départ ; réservation conservée
                    comme ci-dessus. Une réservation sans compte n’est jamais rattachée à un compte
                    existant
                  </td>
                </tr>
                <tr>
                  <td>Avis</td>
                  <td>Note (1 à 5), commentaire, lien avec le séjour</td>
                  <td>Publier un retour sur un logement et calculer sa note moyenne ; affichés publiquement avec le nom et l’avatar</td>
                  <td>Exécution du contrat (dépôt volontaire)</td>
                  <td>Conservé en base tant que le compte ou l’annonce existe</td>
                </tr>
                <tr>
                  <td>Favoris</td>
                  <td>Liste des logements enregistrés</td>
                  <td>Retrouver ses logements préférés</td>
                  <td>Exécution du contrat</td>
                  <td>Conservé en base tant que le compte existe ; supprimable à tout moment</td>
                </tr>
                <tr>
                  <td>Annonces (hôtes)</td>
                  <td>Titre, description, adresse, coordonnées, prix, photo</td>
                  <td>Publier un logement ; l’e-mail de l’hôte n’est jamais affiché</td>
                  <td>Exécution du contrat</td>
                  <td>Conservé en base jusqu’à suppression de l’annonce ou du compte</td>
                </tr>
                <tr>
                  <td>Session</td>
                  <td>Jeton d’accès (JWT) ; jeton de renouvellement aléatoire, dont seule l’empreinte SHA-256 est conservée en base avec la date de création et le navigateur (user-agent)</td>
                  <td>Maintenir la connexion ; fermer les sessions (déconnexion, « tous les appareils », changement de mot de passe)</td>
                  <td>Intérêt légitime / exécution du contrat</td>
                  <td>Jeton d’accès en mémoire uniquement, 15 minutes (plus rien dans le localStorage) ; cookie httpOnly afrikabnb_rt, 30 jours, supprimé à la déconnexion ; empreintes expirées purgées à la connexion suivante, toutes supprimées avec le compte</td>
                </tr>
                <tr>
                  <td>Préférence de langue</td>
                  <td>Code langue (fr, en…)</td>
                  <td>Afficher l’interface dans la langue choisie</td>
                  <td>Intérêt légitime (préférence utilisateur)</td>
                  <td>localStorage</td>
                </tr>
                <tr>
                  <td>Recherche (UI)</td>
                  <td>Destination, dates, voyageurs</td>
                  <td>Filtrer / afficher les annonces</td>
                  <td>Intérêt légitime</td>
                  <td>Mémoire vive React (non persisté)</td>
                </tr>
                <tr>
                  <td>Consentement cookies</td>
                  <td>Choix accepté / refusé + horodatage</td>
                  <td>Respecter votre choix sur les traceurs</td>
                  <td>Obligation légale</td>
                  <td>localStorage, max. 6 mois</td>
                </tr>
                <tr>
                  <td>Google Fonts (si consentement)</td>
                  <td>Adresse IP, données techniques navigateur (côté Google)</td>
                  <td>Chargement des polices Manrope / Plus Jakarta Sans</td>
                  <td>Consentement</td>
                  <td>Selon politique Google</td>
                </tr>
                <tr>
                  <td>Google Maps Places (si clé + consentement)</td>
                  <td>Saisies de recherche, IP, données techniques</td>
                  <td>Autocomplétion de destination</td>
                  <td>Consentement</td>
                  <td>Selon politique Google</td>
                </tr>
                <tr>
                  <td>Nominatim (OpenStreetMap)</td>
                  <td>Requêtes géocodage via API backend</td>
                  <td>Services cartographiques / lieux</td>
                  <td>Intérêt légitime (fonctionnalité démo)</td>
                  <td>Selon politique OSM / Nominatim</td>
                </tr>
                <tr>
                  <td>Images Unsplash</td>
                  <td>Requêtes HTTP vers images.unsplash.com</td>
                  <td>Illustrer les annonces</td>
                  <td>Intérêt légitime</td>
                  <td>CDN Unsplash</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Non présents dans le code</strong> (donc non traités ici) : paiement, newsletter,
            pixels publicitaires, analytics, chat, YouTube.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Destinataires</h2>
          <p>
            <strong>Hôte du logement réservé</strong> : lorsque vous réservez (avec ou sans compte),
            les coordonnées saisies dans le formulaire de réservation (nom, e-mail, téléphone, pays,
            heure d’arrivée et message) sont transmises à l’hôte de ce logement, dans son espace hôte
            et par e-mail, pour organiser votre séjour. L’hôte agit alors sous sa propre
            responsabilité ; il ne doit utiliser ces données que pour ce séjour. Elles ne sont
            visibles ni des autres utilisateurs ni du public.
          </p>
          <p>
            Données de compte, annonces, réservations, avis et favoris : l’éditeur et son
            hébergeur de base de données, <strong>Supabase</strong> (PostgreSQL, sous-traitant
            au sens de l’article 28 du RGPD, connexions chiffrées). La base est actuellement
            hébergée aux États-Unis (AWS, région us-west-2) : voir « Transferts hors UE ».
            Fournisseurs tiers uniquement si vous acceptez les traceurs non essentiels (Google) ou
            via chargement d’images / API carto (Unsplash, Nominatim).
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Transferts hors UE</h2>
          <p>
            La base de données (Supabase) est hébergée aux États-Unis : ce transfert repose sur
            les garanties contractuelles du sous-traitant (clauses contractuelles types / Data
            Privacy Framework, à confirmer dans son accord de traitement des données). Google
            Fonts, Google Maps et Unsplash peuvent aussi impliquer des traitements hors Union
            européenne. Ces chargements non essentiels (Fonts / Maps) sont conditionnés au
            consentement via le bandeau cookies.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Vos droits (RGPD)</h2>
          <p>
            Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation,
            d’opposition et de portabilité, dans les conditions légales. Contact :{" "}
            <span className="legal-todo">[À COMPLÉTER — e-mail DPO / contact]</span>.
          </p>
          <p>
            Vous pouvez introduire une réclamation auprès de la CNIL (
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>).
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Cookies et traceurs</h2>
          <p>
            Voir la page dédiée <Link to="/cookies">Cookies</Link> et le bandeau de consentement.
            Vous pouvez à tout moment <Link to="/cookies">gérer vos préférences</Link> (lien
            « Gérer mes cookies » dans le pied de page).
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Agents IA</h2>
          <p>
            L’éditeur envisage l’usage d’agents d’assistance IA. Aucun agent IA n’est branché dans
            le code actuel : si des traitements sont ajoutés, cette politique sera mise à jour.
          </p>
        </section>
      </div>
    </main>
    <Footer />
  </>
);

export default Confidentialite;
