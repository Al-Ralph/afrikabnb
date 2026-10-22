import React from "react";
import { useLanguage } from "../context/LanguageContext";
import { useSearch } from "../context/SearchContext";
import { categories } from "../data/listings";
import CategoryIcon from "./CategoryIcons";
import "./Categories.css";

const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);

const Categories = () => {
  const { t } = useLanguage();
  const { appliedSearch, toggleCategory } = useSearch();
  return (
    <div className="categories">
      <div className="categories-scroll">
        {categories.map((cat) => {
          const active = appliedSearch.categoryId === cat.id;
          return (
            <button
              type="button"
              key={cat.id}
              className={`category-item${active ? " category-item--active" : ""}`}
              aria-pressed={active}
              onClick={() => toggleCategory(cat.id)}
            >
              <span className="category-icon" aria-hidden="true"><CategoryIcon id={cat.id} /></span>
              <span className="category-label">{t(`categories.${cat.id}`)}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="categories-filters-btn">
        <FilterIcon />
        <span>{t("categories.filters")}</span>
      </button>
    </div>
  );
};

export default Categories;
