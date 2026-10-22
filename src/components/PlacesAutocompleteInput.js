import React, { useRef, useEffect } from "react";
import { useGoogleMapsScript } from "../hooks/useGoogleMapsScript";
import { useConsent } from "../context/ConsentContext";
import "./PlacesAutocompleteInput.css";

const PlacesAutocompleteInput = ({ value, onChange, placeholder, id, className, ...props }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  // onChange est souvent une fonction inline : on la garde dans une ref pour ne pas
  // recréer l'instance Autocomplete (et un nouveau .pac-container) à chaque rendu.
  const onChangeRef = useRef(onChange);
  const { thirdPartyAllowed } = useConsent();
  const { loaded, error, hasKey } = useGoogleMapsScript();
  const mapsKeyConfigured = !!process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!loaded || !inputRef.current || !window.google?.maps?.places) return;
    if (autocompleteRef.current) return;
    const existingContainers = new Set(document.querySelectorAll(".pac-container"));
    const Autocomplete = window.google.maps.places.Autocomplete;
    const autocomplete = new Autocomplete(inputRef.current, {
      types: ["(regions)"],
      fields: ["formatted_address", "address_components", "geometry"],
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      onChangeRef.current?.(place?.formatted_address || "");
    });
    autocompleteRef.current = autocomplete;
    return () => {
      if (window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocomplete);
      }
      // Retire le conteneur de suggestions créé par cette instance (Google ne le supprime pas).
      document.querySelectorAll(".pac-container").forEach((el) => {
        if (!existingContainers.has(el)) el.remove();
      });
      autocompleteRef.current = null;
    };
  }, [loaded]);

  const manualAria = !thirdPartyAllowed
    ? "Destination (saisie manuelle — Google Maps bloqué sans consentement cookies)"
    : !mapsKeyConfigured
      ? "Destination (saisie manuelle — clé Google Maps non configurée)"
      : "Destination";

  if (!hasKey || error) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        id={id}
        {...props}
        aria-label={error ? "Destination" : manualAria}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      id={id}
      autoComplete="off"
      {...props}
      aria-label="Destination (recherche Google Maps)"
    />
  );
};

export default PlacesAutocompleteInput;
