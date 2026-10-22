import { useCallback, useEffect, useState } from "react";

export const PAGE_SIZE = 20;

// Liste paginée de l'administration : `fetchPage({ ...filters, limit, offset })` -> { data, total }.
// Les filtres sont comparés par valeur ; un changement de filtre revient à la première page.
export function useAdminList(fetchPage, filters) {
  const key = JSON.stringify(filters);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ status: "loading", data: [], total: 0 });
  const [lastKey, setLastKey] = useState(key);

  if (key !== lastKey) {
    setLastKey(key);
    setOffset(0);
  }

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: "loading" }));
    return fetchPage({ ...JSON.parse(key), limit: PAGE_SIZE, offset })
      .then((res) => setState({ status: "ready", data: res?.data || [], total: Number(res?.total) || 0 }))
      .catch((err) => setState({ status: "error", data: [], total: 0, error: err }));
  }, [fetchPage, key, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const setData = (updater) => setState((s) => ({ ...s, data: updater(s.data) }));

  return { ...state, offset, setOffset, reload: load, setData };
}
