import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { apiErrorMessage } from "./errorMessage";

const MIN = 8;
const MAX = 72;

const PasswordForm = () => {
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < MIN || newPassword.length > MAX) {
      setError(t("profile.passwordLength"));
      return;
    }
    if (newPassword !== confirm) {
      setError(t("profile.passwordMismatch"));
      return;
    }
    setSaving(true);
    try {
      await api.updateProfile({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setSuccess(t("profile.passwordChanged"));
    } catch (err) {
      setError(
        err?.status === 401 ? t("profile.passwordWrong") : apiErrorMessage(err, t("profile.genericError"))
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="profile-card" aria-labelledby="profile-password-title">
      <h2 id="profile-password-title" className="profile-card-title">{t("profile.passwordTitle")}</h2>
      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <div className="profile-field">
          <label htmlFor="profile-current-password">{t("profile.currentPassword")}</label>
          <input
            id="profile-current-password"
            type="password"
            value={currentPassword}
            maxLength={MAX}
            required
            autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label htmlFor="profile-new-password">{t("profile.newPassword")}</label>
          <input
            id="profile-new-password"
            type="password"
            value={newPassword}
            minLength={MIN}
            maxLength={MAX}
            required
            autoComplete="new-password"
            aria-describedby="profile-password-hint"
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p id="profile-password-hint" className="profile-field-hint">{t("profile.passwordHint")}</p>
        </div>
        <div className="profile-field">
          <label htmlFor="profile-confirm-password">{t("profile.confirmPassword")}</label>
          <input
            id="profile-confirm-password"
            type="password"
            value={confirm}
            maxLength={MAX}
            required
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="account-alert account-alert-error" role="alert">{error}</p>}
        {success && <p className="account-alert account-alert-success" role="status">{success}</p>}
        <div className="profile-actions">
          <button
            type="submit"
            className="account-btn account-btn-primary"
            disabled={saving || !currentPassword || !newPassword || !confirm}
          >
            {saving ? t("profile.saving") : t("profile.changePassword")}
          </button>
        </div>
      </form>
    </section>
  );
};

export default PasswordForm;
