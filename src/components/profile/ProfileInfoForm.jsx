import React, { useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api/client";
import { apiErrorMessage } from "./errorMessage";

const HTTPS_URL = /^https:\/\/[^\s]+$/i;

const ProfileInfoForm = () => {
  const { t } = useLanguage();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const avatarUrl = avatar.trim();
  const avatarValid = avatarUrl === "" || HTTPS_URL.test(avatarUrl);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!avatarValid) {
      setError(t("profile.avatarInvalid"));
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateProfile({ name: name.trim() || null, avatar: avatarUrl || null });
      updateUser(updated);
      setSuccess(t("profile.saved"));
    } catch (err) {
      setError(apiErrorMessage(err, t("profile.genericError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="profile-card" aria-labelledby="profile-info-title">
      <h2 id="profile-info-title" className="profile-card-title">{t("profile.infoTitle")}</h2>
      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <div className="profile-avatar-row">
          <div className="profile-avatar-preview">
            {avatarUrl && avatarValid && !previewFailed ? (
              <img src={avatarUrl} alt={t("profile.avatarPreview")} onError={() => setPreviewFailed(true)} />
            ) : (
              <span aria-hidden="true">{(name || user.email || "?").trim().charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="profile-field profile-field-grow">
            <label htmlFor="profile-avatar">{t("profile.avatar")}</label>
            <input
              id="profile-avatar"
              type="url"
              inputMode="url"
              value={avatar}
              maxLength={191}
              placeholder="https://"
              aria-invalid={!avatarValid}
              aria-describedby={!avatarValid ? "profile-avatar-error" : undefined}
              onChange={(e) => {
                setAvatar(e.target.value);
                setPreviewFailed(false);
              }}
            />
            {!avatarValid && (
              <p id="profile-avatar-error" className="profile-field-error">{t("profile.avatarInvalid")}</p>
            )}
          </div>
        </div>
        <div className="profile-field">
          <label htmlFor="profile-name">{t("profile.name")}</label>
          <input
            id="profile-name"
            type="text"
            value={name}
            maxLength={100}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label htmlFor="profile-email">{t("profile.email")}</label>
          <input
            id="profile-email"
            type="email"
            value={user.email || ""}
            readOnly
            aria-describedby="profile-email-hint"
          />
          <p id="profile-email-hint" className="profile-field-hint">{t("profile.emailHint")}</p>
        </div>
        {error && <p className="account-alert account-alert-error" role="alert">{error}</p>}
        {success && <p className="account-alert account-alert-success" role="status">{success}</p>}
        <div className="profile-actions">
          <button type="submit" className="account-btn account-btn-primary" disabled={saving}>
            {saving ? t("profile.saving") : t("profile.save")}
          </button>
        </div>
      </form>
    </section>
  );
};

export default ProfileInfoForm;
