import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { SearchProvider } from './context/SearchContext';
import { ConsentProvider } from './context/ConsentContext';
import { CurrencyProvider } from './context/CurrencyContext';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <CurrencyProvider>
      <ConsentProvider>
        <AuthProvider>
          <FavoritesProvider>
            <SearchProvider>
              <App />
            </SearchProvider>
          </FavoritesProvider>
        </AuthProvider>
      </ConsentProvider>
      </CurrencyProvider>
    </LanguageProvider>
  </React.StrictMode>
);
