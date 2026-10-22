import React from "react";

// Tracés SVG (viewBox 24, trait 1.75, coins arrondis) — un tableau de chemins par catégorie.
export const CATEGORY_ICON_PATHS = {
  piscines: [
    "M8 13V5.5A2.5 2.5 0 0 1 10.5 3",
    "M15 13V5.5A2.5 2.5 0 0 1 17.5 3",
    "M8 7.5h7",
    "M8 11h7",
    "M2 17c1.7-1.7 3.3-1.7 5 0s3.3 1.7 5 0 3.3-1.7 5 0 3.3 1.7 5 0",
    "M2 21c1.7-1.7 3.3-1.7 5 0s3.3 1.7 5 0 3.3-1.7 5 0 3.3 1.7 5 0",
  ],
  "bord-mer": [
    "M3 11a9 9 0 0 1 18 0z",
    "M12 11v7",
    "M3 21c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0",
  ],
  safari: [
    "M3 10c2-3 5-4 9-4s7 1 9 4c-2 1-5 1.5-9 1.5S5 11 3 10z",
    "M12 11.5V20",
    "M12 16l-4-3",
    "M12 15l4-2.5",
    "M7 20h10",
  ],
  cabanes: [
    "M3 20L12 4l9 16",
    "M2 20h20",
    "M10 20v-5h4v5",
    "M9.5 11h5",
  ],
  tendance: [
    "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5 1 2.5 2 2.5 0-3-1-5 1-8z",
    "M12 19a2 2 0 0 1-2-2c0-1.5 2-2.5 2-4.5 0 2 2 3 2 4.5a2 2 0 0 1-2 2z",
  ],
  omg: [
    "M7.5 11a4.5 4.5 0 0 1 9 0",
    "M2.5 14c0-1.7 4.3-3 9.5-3s9.5 1.3 9.5 3-4.3 3-9.5 3-9.5-1.3-9.5-3z",
    "M8 18l-2 3",
    "M12 17.5V21",
    "M16 18l2 3",
  ],
  parcs: [
    "M2 20L9 8l7 12z",
    "M13.5 14.5L16 11l6 9h-6",
    "M6.5 13L9 11l2.5 2",
  ],
  iles: [
    "M12 17c0-3 .5-6 1.5-9",
    "M13.5 8c-1-3-4-4-7-3 2 0 4 1 5 3",
    "M13.5 8c1-3.5 4.5-4 7-2.5-3-.5-5 .5-6 2.5",
    "M13.5 8c-3 0-5 2-5.5 4 1.5-1.5 3.5-2.5 5.5-2.5",
    "M13.5 8c2.5 1 3.5 3 3.5 5-.5-2-1.5-3-3.5-3.5",
    "M5 20c1.5-2 4-3 7-3s5.5 1 7 3z",
  ],
  luxe: [
    "M6 3h12l4 6-10 12L2 9z",
    "M2 9h20",
    "M7 9l5 12 5-12",
    "M9.5 3L8 9",
    "M14.5 3L16 9",
  ],
};

const CategoryIcon = ({ id }) => {
  const paths = CATEGORY_ICON_PATHS[id];
  if (!paths) return null;
  return (
    <svg
      className="category-svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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

export default CategoryIcon;
