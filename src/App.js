import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import CookieBanner from "./components/CookieBanner";
import Home from "./pages/Home";
import PropertyDetails from "./pages/PropertyDetails";
import Host from "./pages/Host";
import Favorites from "./pages/Favorites";
import Profile from "./pages/Profile";
import MapPage from "./pages/MapPage";
import Placeholder from "./pages/Placeholder";
import MentionsLegales from "./pages/legal/MentionsLegales";
import Confidentialite from "./pages/legal/Confidentialite";
import Cookies from "./pages/legal/Cookies";
import CGU from "./pages/legal/CGU";
import "./App.css";

const App = () => {
  return (
    <Router>
      <div className="app-layout">
        <Header />
        <div className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/property/:id" element={<PropertyDetails />} />
            <Route path="/host" element={<Host />} />
            <Route path="/favoris" element={<Favorites />} />
            <Route path="/profil" element={<Profile />} />
            <Route path="/carte" element={<MapPage />} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/cgu" element={<CGU />} />
            <Route path="*" element={<Placeholder />} />
          </Routes>
        </div>
        <CookieBanner />
      </div>
    </Router>
  );
};

export default App;
