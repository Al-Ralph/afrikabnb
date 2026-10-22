import { useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Fenêtre modale accessible : focus piégé dans `ref`, Échap pour fermer, défilement de la page
// bloqué, focus rendu à l'élément d'origine à la fermeture. `onKeyDown` reçoit les autres touches.
export function useDialog(open, onClose, { onKeyDown, initialFocusRef } = {}) {
  const ref = useRef(null);
  const handlers = useRef({ onClose, onKeyDown });
  useLayoutEffect(() => {
    handlers.current = { onClose, onKeyDown };
  });

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    const first = initialFocusRef?.current || node?.querySelector(FOCUSABLE) || node;
    first?.focus?.();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handlers.current.onClose?.();
        return;
      }
      if (e.key === "Tab" && node) {
        const items = Array.from(node.querySelectorAll(FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === firstItem || !node.contains(document.activeElement))) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && (document.activeElement === lastItem || !node.contains(document.activeElement))) {
          e.preventDefault();
          firstItem.focus();
        }
        return;
      }
      handlers.current.onKeyDown?.(e);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [open, initialFocusRef]);

  return ref;
}

export default useDialog;
