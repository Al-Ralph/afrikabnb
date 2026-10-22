import React from "react";

// Pictogrammes au trait, même grammaire que CategoryIcons (viewBox 24, trait 1.75, bouts ronds).
const PATHS = {
  users: [
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20",
    "M10 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z",
    "M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35",
    "M15 5.15a3.25 3.25 0 0 1 0 6.2",
  ],
  bed: ["M3 19V6", "M3 15h18v4", "M21 15v-3a3 3 0 0 0-3-3h-7v6", "M7 12.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z"],
  paw: [
    "M12 20c-2.8 0-5-1.6-5-3.6 0-2.3 2.2-4.9 5-4.9s5 2.6 5 4.9c0 2-2.2 3.6-5 3.6z",
    "M6.5 10.5a1.75 2.25 0 1 0 0-4.5 1.75 2.25 0 0 0 0 4.5z",
    "M17.5 10.5a1.75 2.25 0 1 0 0-4.5 1.75 2.25 0 0 0 0 4.5z",
    "M10 7.5a1.75 2.25 0 1 0 0-4.5 1.75 2.25 0 0 0 0 4.5z",
    "M14 7.5a1.75 2.25 0 1 0 0-4.5 1.75 2.25 0 0 0 0 4.5z",
  ],
  pin: ["M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z", "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  arrowLeft: ["M19 12H5", "M11 18l-6-6 6-6"],
  heart: [
    "M12 20.5s-8-4.6-8-10.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.9c0 6-8 10.6-8 10.6z",
  ],
  search: ["M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15z", "M21 21l-5.2-5.2"],
  calendar: ["M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z", "M4 10h16", "M8.5 3v4", "M15.5 3v4"],
  key: ["M8 15.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z", "M12.5 11H21", "M18 11v3", "M15 11v2"],
  compass: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M15.5 8.5l-2 5-5 2 2-5z"],
  home: ["M4 10.5L12 4l8 6.5", "M6 9v11h12V9", "M10 20v-5h4v5"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  user: ["M20 21v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V21", "M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
};

export const Icon = ({ name, size = 20, className = "", strokeWidth = 1.75 }) => {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
};

// Étoile pleine (note) : forme remplie, pas un caractère Unicode.
export const StarIcon = ({ size = 14, className = "" }) => (
  <svg
    className={`icon-star ${className}`}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" />
  </svg>
);

export default Icon;
