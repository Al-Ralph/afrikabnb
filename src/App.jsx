import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import CookieBanner from "./components/CookieBanner";
import Home from "./pages/Home";
import PropertyDetails from "./pages/PropertyDetails";
import Favorites from "./pages/Favorites";
import Profile from "./pages/Profile";
import Placeholder from "./pages/Placeholder";
import "./App.css";

// Pages lourdes (Leaflet, tableaux de bord) ou rarement visitées : chargées à la demande.
const Host = lazy(() => import("./pages/Host"));
const MapPage = lazy(() => import("./pages/MapPage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Admin = lazy(() => import("./pages/Admin"));
const MentionsLegales = lazy(() => import("./pages/legal/MentionsLegales"));
const Confidentialite = lazy(() => import("./pages/legal/Confidentialite"));
const Cookies = lazy(() => import("./pages/legal/Cookies"));
const CGU = lazy(() => import("./pages/legal/CGU"));

const App = () => {
  return (
    <Router>
      <div className="app-layout">
        <Header />
        <div className="app-main">
          <Suspense fallback={<div className="app-route-loading" role="status" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/property/:id" element={<PropertyDetails />} />
              <Route path="/host" element={<Host />} />
              <Route path="/favoris" element={<Favorites />} />
              <Route path="/profil" element={<Profile />} />
              <Route path="/carte" element={<MapPage />} />
              <Route path="/reinitialiser-mot-de-passe" element={<ResetPassword />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/mentions-legales" element={<MentionsLegales />} />
              <Route path="/confidentialite" element={<Confidentialite />} />
              <Route path="/cookies" element={<Cookies />} />
              <Route path="/cgu" element={<CGU />} />
              <Route path="*" element={<Placeholder />} />
            </Routes>
          </Suspense>
        </div>
        <CookieBanner />
      </div>
    </Router>
  );
};

export default App;
