import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import LanguageSelector from "./LanguageSelector";
import ThemeToggle from "./ThemeToggle";
import AuthModal from "./AuthModal";
import "./Header.css";

const LocationIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="header-logo-icon">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
);

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const { t } = useLanguage();
  const { user, logout, authOpen, openAuth, closeAuth } = useAuth();
  const { pathname } = useLocation();
  const overHero = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > (overHero ? 48 : 10));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  // Le menu se ferme à chaque changement de page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, user]);

  const closeMenu = () => setMenuOpen(false);

  const menuLinks = (
    <>
      <Link to="/carte" className="header-user-dropdown-item" onClick={closeMenu}>
        {t("header.map")}
      </Link>
      <Link to="/host" className="header-user-dropdown-item" onClick={closeMenu}>
        {user ? t("header.hostSpace") : t("header.becomeHost")}
      </Link>
    </>
  );

  const dropdown = menuOpen && (
    <div className="header-user-dropdown" id="header-user-menu" role="group" aria-label={t("header.userMenu")}>
      {user ? (
        <>
          <Link to="/profil" className="header-user-dropdown-item" onClick={closeMenu}>
            {t("header.profile")}
          </Link>
          <Link to="/favoris" className="header-user-dropdown-item" onClick={closeMenu}>
            {t("header.favorites")}
          </Link>
          {menuLinks}
          <button
            type="button"
            className="header-user-dropdown-item header-user-dropdown-logout"
            onClick={() => {
              logout();
              closeMenu();
            }}
          >
            {t("header.logout")}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="header-user-dropdown-item header-user-dropdown-strong"
            onClick={() => {
              closeMenu();
              openAuth();
            }}
          >
            {t("header.login")}
          </button>
          {menuLinks}
        </>
      )}
    </div>
  );

  return (
    <>
      <header className={`header ${overHero ? "header--over-hero" : ""} ${scrolled ? "header--scrolled" : ""}`}>
        <div className="header-inner">
          <Link to="/" className="header-logo" aria-label="AfrikaBnB — accueil">
            <span className="header-logo-icon-wrap" aria-hidden="true">
              <LocationIcon />
            </span>
            <span className="header-logo-text">AfrikaBnB</span>
          </Link>
          <nav className="header-nav" aria-label="Navigation principale">
            <Link to="/host" className="header-link">{t("header.becomeHost")}</Link>
            <ThemeToggle />
            <LanguageSelector />
            {user ? (
              <div className="header-user-menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="header-user-trigger"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-controls="header-user-menu"
                  aria-label={`${t("header.userMenu")} — ${user.name || user.email}`}
                  ref={triggerRef}
                >
                  <span className="header-user-avatar">
                    {user.avatar ? <img src={user.avatar} alt="" /> : <UserIcon />}
                  </span>
                  <span className="header-user-name">{user.name || user.email}</span>
                </button>
                {dropdown}
              </div>
            ) : (
              <>
                <button type="button" className="header-btn header-btn-outline header-login-btn" onClick={openAuth}>
                  {t("header.login")}
                </button>
                <div className="header-user-group header-user-menu-wrap" ref={menuRef}>
                  <button
                    type="button"
                    className="header-icon-btn"
                    aria-label={t("header.menu")}
                    aria-expanded={menuOpen}
                    aria-controls="header-user-menu"
                    onClick={() => setMenuOpen((open) => !open)}
                    ref={triggerRef}
                  >
                    <MenuIcon />
                  </button>
                  <button type="button" className="header-icon-btn header-icon-btn-user" aria-label={t("header.profile")} onClick={openAuth}>
                    <UserIcon />
                  </button>
                  {dropdown}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>
      <AuthModal isOpen={authOpen} onClose={closeAuth} />
    </>
  );
};

export default Header;
