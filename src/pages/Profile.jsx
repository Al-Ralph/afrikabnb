import React from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import ProfileInfoForm from "../components/profile/ProfileInfoForm";
import PasswordForm from "../components/profile/PasswordForm";
import MyBookings from "../components/profile/MyBookings";
import Footer from "../components/Footer";
import "./Account.css";
import "./Profile.css";

const Profile = () => {
  const { t } = useLanguage();
  const { user, loading, openAuth } = useAuth();

  let content;
  if (loading) {
    content = (
      <div className="account-state" role="status" aria-live="polite">
        <div className="account-spinner" aria-hidden="true" />
      </div>
    );
  } else if (!user) {
    content = (
      <div className="account-state">
        <p>{t("profile.loginRequired")}</p>
        <button type="button" className="account-btn account-btn-primary" onClick={openAuth}>
          {t("profile.loginBtn")}
        </button>
      </div>
    );
  } else {
    content = (
      <div className="profile-layout">
        {/* key : réinitialise le formulaire si un autre compte se connecte. */}
        <ProfileInfoForm key={user.id} />
        <PasswordForm key={`pw-${user.id}`} />
        <MyBookings key={`bk-${user.id}`} />
      </div>
    );
  }

  return (
    <>
      <main className="account-page">
        <div className="account-page-inner">
          <h1 className="account-page-title">{t("profile.title")}</h1>
          {content}
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Profile;
