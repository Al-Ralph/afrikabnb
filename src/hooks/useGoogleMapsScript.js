import { useState, useEffect } from "react";
import { useConsent } from "../context/ConsentContext";

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
const PLACES_TIMEOUT_MS = 5000;

const placesAvailable = () => !!window.google?.maps?.places;

export function useGoogleMapsScript() {
  const { thirdPartyAllowed } = useConsent();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!thirdPartyAllowed) {
      setLoaded(false);
      setError(null);
      return;
    }
    if (!GOOGLE_MAPS_API_KEY) {
      setError("REACT_APP_GOOGLE_MAPS_API_KEY manquant");
      return;
    }
    if (placesAvailable()) {
      setLoaded(true);
      return;
    }

    let cancelled = false;
    let intervalId = null;
    let timeoutId = null;

    const stopWaiting = () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      intervalId = null;
      timeoutId = null;
    };

    // La lib "places" peut arriver un peu après l'événement load du script.
    const waitForPlaces = () => {
      if (cancelled) return;
      if (placesAvailable()) {
        setLoaded(true);
        return;
      }
      stopWaiting();
      intervalId = setInterval(() => {
        if (placesAvailable()) {
          stopWaiting();
          if (!cancelled) setLoaded(true);
        }
      }, 100);
      timeoutId = setTimeout(() => {
        stopWaiting();
        if (!cancelled && !placesAvailable()) setError("Google Maps Places indisponible (délai dépassé)");
      }, PLACES_TIMEOUT_MS);
    };

    const onError = () => {
      if (!cancelled) setError("Erreur chargement Google Maps");
    };

    let script = document.querySelector('script[src*="maps.googleapis.com"]');
    if (!script) {
      script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      // Script déjà présent (ex. remontage) : il peut être encore en cours de chargement.
      waitForPlaces();
    }
    script.addEventListener("load", waitForPlaces);
    script.addEventListener("error", onError);

    return () => {
      cancelled = true;
      stopWaiting();
      script.removeEventListener("load", waitForPlaces);
      script.removeEventListener("error", onError);
    };
  }, [thirdPartyAllowed]);

  return {
    loaded: thirdPartyAllowed && loaded,
    error: thirdPartyAllowed ? error : null,
    hasKey: !!GOOGLE_MAPS_API_KEY && thirdPartyAllowed,
  };
}
