import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import Icon from "../components/Icons";
import EmptyState from "../components/EmptyState";
import "./ResetPassword.css";

const MIN = 8;
const MAX = 72;

// Erreur 400 portant sur le mot de passe (et non sur le jeton) : message de validation de l'API.
const passwordDetail = (err) =>
  Array.isArray(err?.details) ? err.details.find((d) => String(d.path).includes("newPassword")) : null;

// Page du lien reçu par e-mail : /reinitialiser-mot-de-passe?token=…
const ResetPassword = () => {
  const { t } = useLanguage();
  const { logout, openAuth } = useAuth();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(token ? "form" : "missing");

  const validate = () => {
    const errors = {};
    if (password.length < MIN) errors.password = t("passwordReset.tooShort");
    else if (password.length > MAX) errors.password = t("passwordReset.tooLong");
    if (!errors.password && confirm !== password) errors.confirm = t("passwordReset.mismatch");
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const errors = validate();
    setFieldError(errors);
    if (Object.keys(errors).length) return;
    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      // Toutes les sessions sont révoquées côté serveur : le jeton local ne vaut plus rien.
      logout();
      setStatus("success");
    } catch (err) {
      const detail = passwordDetail(err);
      if (err?.status === 400 && detail) setFieldError({ password: detail.message });
      else if (err?.status === 400) setStatus("invalid");
      else if (err?.status === 429) setFormError(t("passwordForgot.tooMany"));
      else setFormError(t("passwordReset.error"));
    } finally {
      setSubmitting(false);
    }
  };

  let content;
  if (status === "success") {
    content = (
      <EmptyState
        icon="key"
        role="status"
        title={t("passwordReset.successTitle")}
        action={
          <button type="button" className="btn btn--primary" onClick={() => openAuth("login")}>
            {t("passwordReset.login")}
          </button>
        }
      >
        <p>{t("passwordReset.successText")}</p>
      </EmptyState>
    );
  } else if (status === "invalid" || status === "missing") {
    content = (
      <EmptyState
        icon="key"
        tone="danger"
        role="alert"
        title={t("passwordReset.invalidTitle")}
        action={
          <button type="button" className="btn btn--secondary" onClick={() => openAuth("forgot")}>
            {t("passwordReset.requestNew")}
          </button>
        }
      >
        <p>{status === "missing" ? t("passwordReset.missingText") : t("passwordReset.invalidText")}</p>
      </EmptyState>
    );
  } else {
    content = (
      <div className="reset-card">
        <span className="reset-card-icon" aria-hidden="true">
          <Icon name="lock" size={26} />
        </span>
        <h1 className="reset-title">{t("passwordReset.title")}</h1>
        <p className="reset-intro">{t("passwordReset.intro")}</p>
        <form className="reset-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <p className="reset-alert" role="alert">
              {formError}
            </p>
          )}
          <div className="reset-field">
            <label htmlFor="reset-password">{t("passwordReset.password")}</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={MIN}
              maxLength={MAX}
              required
              aria-invalid={fieldError.password ? true : undefined}
              aria-describedby={fieldError.password ? "reset-password-error" : undefined}
            />
            {fieldError.password && (
              <p id="reset-password-error" className="reset-field-error">
                {fieldError.password}
              </p>
            )}
          </div>
          <div className="reset-field">
            <label htmlFor="reset-confirm">{t("passwordReset.confirm")}</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              maxLength={MAX}
              required
              aria-invalid={fieldError.confirm ? true : undefined}
              aria-describedby={fieldError.confirm ? "reset-confirm-error" : undefined}
            />
            {fieldError.confirm && (
              <p id="reset-confirm-error" className="reset-field-error">
                {fieldError.confirm}
              </p>
            )}
          </div>
          <button type="submit" className="btn btn--primary reset-submit" disabled={submitting}>
            {submitting ? t("passwordReset.submitting") : t("passwordReset.submit")}
          </button>
        </form>
      </div>
    );
  }

  return <main className="reset-page">{content}</main>;
};

export default ResetPassword;
