import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import "./AuthModal.css";

const AuthModal = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptCgu, setAcceptCgu] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setAcceptCgu(false);
    setError("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && !acceptCgu) {
      setError(t("auth.cguRequired"));
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="auth-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="auth-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        ref={dialogRef}
      >
        <button
          type="button"
          className="auth-modal-close"
          onClick={onClose}
          aria-label={t("auth.close")}
          ref={closeBtnRef}
        >
          ×
        </button>
        <h2 id="auth-modal-title" className="auth-modal-title">
          {mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle")}
        </h2>
        <p className="auth-modal-purpose">
          {mode === "login" ? t("auth.loginPurpose") : t("auth.registerPurpose")}{" "}
          <Link to="/confidentialite" className="auth-modal-inline-link" onClick={onClose}>
            {t("auth.privacyLink")}
          </Link>
        </p>
        <form onSubmit={handleSubmit} className="auth-modal-form">
          {error && <p className="auth-modal-error" role="alert">{error}</p>}
          {mode === "register" && (
            <input
              type="text"
              placeholder={t("auth.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="auth-modal-input"
              autoComplete="name"
              aria-label={t("auth.namePlaceholder")}
            />
          )}
          <input
            type="email"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-modal-input"
            required
            autoComplete="email"
            aria-label={t("auth.emailPlaceholder")}
          />
          <input
            type="password"
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-modal-input"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-label={t("auth.passwordPlaceholder")}
          />
          {mode === "register" && (
            <label className="auth-modal-cgu">
              <input
                type="checkbox"
                checked={acceptCgu}
                onChange={(e) => setAcceptCgu(e.target.checked)}
                required
              />
              <span>
                {t("auth.acceptCguBefore")}{" "}
                <Link to="/cgu" className="auth-modal-inline-link" onClick={onClose}>
                  {t("auth.cguLink")}
                </Link>
                {t("auth.acceptCguAfter")}
              </span>
            </label>
          )}
          <button type="submit" className="auth-modal-submit" disabled={loading}>
            {loading ? "..." : mode === "login" ? t("auth.loginBtn") : t("auth.registerBtn")}
          </button>
        </form>
        <p className="auth-modal-switch">
          {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
          <button
            type="button"
            className="auth-modal-link"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setAcceptCgu(false);
            }}
          >
            {mode === "login" ? t("auth.registerBtn") : t("auth.loginBtn")}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthModal;
