import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";

// Sécurité du compte : fermeture de toutes les sessions (jetons de renouvellement) de l'utilisateur.
const SessionsCard = () => {
  const { t } = useLanguage();
  const { logoutAll } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    if (!window.confirm(t("sessions.confirm"))) return;
    setError("");
    setPending(true);
    try {
      // Succès : l'utilisateur est déconnecté, la page Profil affiche l'invitation à se connecter.
      await logoutAll();
    } catch {
      setError(t("sessions.error"));
      setPending(false);
    }
  };

  return (
    <section className="profile-card" aria-labelledby="profile-sessions-title">
      <h2 id="profile-sessions-title" className="profile-card-title">{t("sessions.title")}</h2>
      <p className="profile-field-hint">{t("sessions.text")}</p>
      {error && <p className="account-alert account-alert-error" role="alert">{error}</p>}
      <div className="profile-actions">
        <button type="button" className="account-btn account-btn-danger" onClick={handleClick} disabled={pending}>
          {pending ? t("sessions.pending") : t("sessions.logoutAll")}
        </button>
      </div>
    </section>
  );
};

export default SessionsCard;
