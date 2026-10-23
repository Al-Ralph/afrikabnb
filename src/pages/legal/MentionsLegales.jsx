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
        <p className="legal-page-meta">Dernière mise à jour : 22 octobre 2026 · Site de démonstration</p>

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
          {/* APRÈS MIGRATION vers la base UE (DEPLOY.md, étape 1) : retirer ce paragraphe sur la
              version de démonstration (us-west-2). */}
          <p>
            Version de démonstration actuelle : exploitée en environnement de développement, avec
            une base de données Supabase hébergée aux États-Unis (AWS, région us-west-2). La
            version mise en ligne utilise les hébergeurs ci-dessous, avec une base de données en
            région Union européenne.
          </p>
          <ul>
            <li>
              Pages du Site (frontend) : <strong>Vercel Inc.</strong>, 440 N Barranca Ave #4133,
              Covina, CA 91723, États-Unis — diffusion via un réseau mondial de serveurs —
              vercel.com. Téléphone : <span className="legal-todo">[À COMPLÉTER]</span>
            </li>
            <li>
              API (serveur applicatif) : <strong>Render Services, Inc.</strong>, 525 Brannan Street,
              Suite 300, San Francisco, CA 94107, États-Unis — serveurs de la région de Francfort
              (Allemagne) — render.com. Téléphone : <span className="legal-todo">[À COMPLÉTER]</span>
            </li>
            <li>
              Base de données et photos : <strong>Supabase</strong>, région Union européenne —
              supabase.com. Adresse et téléphone :{" "}
              <span className="legal-todo">[À COMPLÉTER — voir les conditions de Supabase]</span>
            </li>
            <li>
              E-mails transactionnels : <strong>Resend</strong> (États-Unis) — resend.com.
            </li>
          </ul>
          <p>
            Coordonnées des hébergeurs à vérifier dans leurs conditions d’utilisation au moment de
            la mise en ligne.
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
