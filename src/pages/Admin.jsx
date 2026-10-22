import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import Footer from "../components/Footer";
import EmptyState from "../components/EmptyState";
import { ListSkeleton } from "../components/Skeleton";
import Tabs, { TabPanel } from "../components/host/Tabs";
import AdminOverview from "../components/admin/AdminOverview";
import AdminUsers from "../components/admin/AdminUsers";
import AdminListings from "../components/admin/AdminListings";
import AdminReviews from "../components/admin/AdminReviews";
import { useAuth, OPEN_AUTH_EVENT } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import "./Host.css";
import "./Admin.css";

export const ADMIN_TABS = ["overview", "users", "listings", "reviews"];

// Administration (rôle ADMIN). L'API protège chaque route ; l'interface masque simplement
// l'espace aux autres rôles.
const Admin = () => {
  const { t } = useLanguage();
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = ADMIN_TABS.includes(tabParam) ? tabParam : "overview";

  const setTab = (id) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === "overview") next.delete("tab");
      else next.set("tab", id);
      return next;
    });
  };

  let content;
  if (loading) {
    content = <ListSkeleton label={t("host.loading")} rows={3} media={false} />;
  } else if (!user || user.role !== "ADMIN") {
    content = (
      <div className="host-page-invite">
        <EmptyState
          icon="key"
          action={
            <>
              {!user && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT))}
                >
                  {t("admin.login")}
                </button>
              )}
              <Link to="/" className="btn btn--ghost">
                {t("property.backHome")}
              </Link>
            </>
          }
        >
          <h1 className="host-page-invite-title">{t("admin.deniedTitle")}</h1>
          <p>{user ? t("admin.deniedText") : t("admin.loginText")}</p>
        </EmptyState>
      </div>
    );
  } else {
    content = (
      <>
        <div className="host-page-header">
          <h1>{t("admin.title")}</h1>
        </div>
        <Tabs
          idPrefix="admin"
          label={t("admin.tabs.label")}
          active={tab}
          onChange={setTab}
          tabs={ADMIN_TABS.map((id) => ({ id, label: t(`admin.tabs.${id}`) }))}
        />
        <TabPanel idPrefix="admin" id={tab}>
          {tab === "overview" && <AdminOverview />}
          {tab === "users" && <AdminUsers currentUserId={user.id} />}
          {tab === "listings" && <AdminListings />}
          {tab === "reviews" && <AdminReviews />}
        </TabPanel>
      </>
    );
  }

  return (
    <>
      <main className="host-page admin-page">
        <div className="host-page-inner">{content}</div>
      </main>
      <Footer />
    </>
  );
};

export default Admin;
