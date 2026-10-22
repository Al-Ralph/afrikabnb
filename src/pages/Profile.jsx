import React from "react";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import ProfileInfoForm from "../components/profile/ProfileInfoForm";
import PasswordForm from "../components/profile/PasswordForm";
import MyBookings from "../components/profile/MyBookings";
import Footer from "../components/Footer";
import EmptyState from "../components/EmptyState";
import { ProfileSkeleton } from "../components/Skeleton";
import "./Account.css";
import "./Profile.css";

const Profile = () => {
  const { t } = useLanguage();
  const { user, loading, openAuth } = useAuth();

  let content;
  if (loading) {
    content = <ProfileSkeleton label={t("host.loading")} />;
  } else if (!user) {
    content = (
      <EmptyState
        icon="user"
        title={t("ui.profile.loginTitle")}
        action={
          <button type="button" className="btn btn--primary" onClick={openAuth}>
            {t("profile.loginBtn")}
          </button>
        }
      >
        <p>{t("profile.loginRequired")}</p>
      </EmptyState>
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
