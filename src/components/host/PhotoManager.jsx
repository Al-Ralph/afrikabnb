import React, { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../context/LanguageContext";
import { api } from "../../api/client";
import { interpolate } from "../../utils/plural";
import ConfirmButton from "./ConfirmButton";
import "./PhotoManager.css";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 10;

let keySeq = 0;
const nextKey = () => `photo-local-${++keySeq}`;

// Photos de l'API -> éléments affichés ({ key, id, url, preview?, file?, status, error? }).
// status : "ready" (en ligne), "pending" (annonce pas encore créée), "uploading", "error".
export const photosFromImages = (images = []) =>
  images.map((img, i) => ({
    key: img.id ? `photo-${img.id}` : `photo-fallback-${i}`,
    id: img.id ?? null,
    url: img.url,
    status: "ready",
  }));

// Validation client : type, taille, nombre total. Renvoie { accepted: File[], rejected: [{ name, reason }] }.
export function validatePhotoFiles(files, currentCount) {
  const accepted = [];
  const rejected = [];
  Array.from(files || []).forEach((file) => {
    if (!PHOTO_TYPES.includes(file.type)) rejected.push({ name: file.name, reason: "type" });
    else if (file.size > MAX_PHOTO_BYTES) rejected.push({ name: file.name, reason: "size" });
    else if (currentCount + accepted.length >= MAX_PHOTOS) rejected.push({ name: file.name, reason: "count" });
    else accepted.push(file);
  });
  return { accepted, rejected };
}

const createPreview = (file) => {
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
};

const revokePreview = (item) => {
  if (!item?.preview) return;
  try {
    URL.revokeObjectURL(item.preview);
  } catch {
    // Rien à libérer.
  }
};

// Téléverse les éléments un par un (une requête par fichier) : chaque photo obtient son
// propre résultat (413, 415, 400…) et la progression est réelle. `update(key, patch)` met
// à jour l'élément ; `onProgress(done, total)`. Renvoie { images (dernière liste serveur), failed }.
export async function uploadPhotoItems(listingId, items, update, onProgress) {
  let images = null;
  let failed = 0;
  let done = 0;
  onProgress?.(0, items.length);
  for (const item of items) {
    update(item.key, { status: "uploading", error: null });
    try {
      const list = await api.uploadListingImages(listingId, [item.file]);
      images = list;
      const added = list[list.length - 1];
      update(item.key, { status: "ready", id: added?.id ?? null, url: added?.url || null, error: null });
    } catch (err) {
      failed += 1;
      update(item.key, { status: "error", error: { status: err?.status, message: err?.message } });
    }
    done += 1;
    onProgress?.(done, items.length);
  }
  return { images, failed };
}

// Ordre local des photos en ligne différent de l'ordre serveur -> PATCH de l'ordre.
export async function syncPhotoOrder(listingId, items, serverImages) {
  const ids = items.filter((i) => i.status === "ready" && i.id).map((i) => i.id);
  const serverIds = (serverImages || []).map((img) => img.id);
  if (ids.length < 2 || ids.length !== serverIds.length || ids.every((id, i) => id === serverIds[i])) return serverImages;
  return api.reorderListingImages(listingId, ids);
}

// Gestion des photos d'une annonce : dépôt (glisser-déposer ou bouton), aperçus immédiats,
// réordonnancement (glisser ou boutons), suppression ; la première photo est la couverture.
// Sans `listingId` (nouvelle annonce), tout reste local jusqu'à la création ; sinon chaque
// action est appliquée immédiatement par l'API.
const PhotoManager = ({ listingId, items, setItems, progress, setProgress, disabled = false }) => {
  const { t } = useLanguage();
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  const [dragOver, setDragOver] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [rejected, setRejected] = useState([]);
  const [error, setError] = useState(null);
  const [announce, setAnnounce] = useState("");
  const uploading = items.some((i) => i.status === "uploading");
  const locked = disabled || uploading;
  const activeCount = items.filter((i) => i.status !== "error").length;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Libère les aperçus locaux au démontage.
  useEffect(() => () => itemsRef.current.forEach(revokePreview), []);

  const update = (key, patch) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const upload = async (toUpload) => {
    const { images } = await uploadPhotoItems(listingId, toUpload, update, (done, total) =>
      setProgress({ done, total })
    );
    setProgress(null);
    if (images) {
      try {
        await syncPhotoOrder(listingId, itemsRef.current, images);
      } catch (err) {
        setError(err?.message || t("host.errors.generic"));
      }
    }
  };

  const addFiles = (fileList) => {
    if (locked) return;
    setError(null);
    const { accepted, rejected: refused } = validatePhotoFiles(fileList, activeCount);
    setRejected(refused);
    if (accepted.length === 0) return;
    const added = accepted.map((file) => ({
      key: nextKey(),
      id: null,
      url: null,
      preview: createPreview(file),
      file,
      status: listingId ? "uploading" : "pending",
    }));
    setItems((prev) => [...prev, ...added]);
    setAnnounce(interpolate(t("host.photos.added"), { n: added.length }));
    if (listingId) upload(added);
  };

  const move = async (from, to) => {
    if (locked || to < 0 || to >= items.length || from === to) return;
    const previous = items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setError(null);
    setAnnounce(interpolate(t("host.photos.moved"), { position: to + 1, total: next.length }));
    const ready = next.filter((i) => i.status === "ready");
    if (!listingId || ready.length < 2 || ready.some((i) => !i.id)) return;
    try {
      await api.reorderListingImages(listingId, ready.map((i) => i.id));
    } catch (err) {
      setItems(previous);
      setError(err?.message || t("host.errors.generic"));
    }
  };

  const remove = async (item) => {
    setError(null);
    if (listingId && item.status === "ready" && item.id) {
      try {
        await api.deleteListingImage(listingId, item.id);
      } catch (err) {
        setError(err?.message || t("host.errors.generic"));
        return;
      }
    }
    revokePreview(item);
    setItems((prev) => prev.filter((i) => i.key !== item.key));
    setAnnounce(t("host.photos.removed"));
  };

  const retry = (item) => {
    if (locked || activeCount >= MAX_PHOTOS) return;
    upload([item]);
  };

  const errorText = (err) => {
    if (!err) return "";
    if (err.status === 413) return t("host.photos.errors.tooLarge");
    if (err.status === 415) return t("host.photos.errors.unsupported");
    if (err.status === 429) return t("host.photos.errors.rateLimit");
    return err.message || t("host.errors.generic");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (dragKey) return; // réordonnancement : géré par la vignette
    addFiles(e.dataTransfer?.files);
  };

  const onTileDrop = (e, index) => {
    if (!dragKey) return;
    e.preventDefault();
    e.stopPropagation();
    const from = items.findIndex((i) => i.key === dragKey);
    setDragKey(null);
    move(from, index);
  };

  return (
    <fieldset className="photo-manager" aria-describedby="photo-manager-hint">
      <legend className="photo-manager-legend">{t("host.photos.title")}</legend>
      <p id="photo-manager-hint" className="listing-form-hint">
        {interpolate(t("host.photos.hint"), { max: MAX_PHOTOS })}
      </p>

      <div
        className={`photo-dropzone${dragOver ? " photo-dropzone--over" : ""}${locked ? " photo-dropzone--disabled" : ""}`}
        onDragOver={(e) => {
          if (dragKey) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <svg className="photo-dropzone-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
          <path d="M12 15V4" />
          <path d="M7.5 8.5L12 4l4.5 4.5" />
        </svg>
        <p className="photo-dropzone-text">{t("host.photos.dropText")}</p>
        <button
          type="button"
          className="host-btn"
          onClick={() => inputRef.current?.click()}
          disabled={locked || activeCount >= MAX_PHOTOS}
        >
          {t("host.photos.choose")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t("host.photos.inputLabel")}
          disabled={locked}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="photo-dropzone-count tabular">
          {interpolate(t("host.photos.count"), { n: activeCount, max: MAX_PHOTOS })}
        </p>
      </div>

      {progress && (
        <div className="photo-progress">
          <label htmlFor="photo-progress-bar">
            {interpolate(t("host.photos.progress"), { done: progress.done, total: progress.total })}
          </label>
          <progress id="photo-progress-bar" max={progress.total} value={progress.done} />
        </div>
      )}

      {rejected.length > 0 && (
        <div className="listing-form-alert photo-rejected" role="alert">
          <p>{t("host.photos.rejectedTitle")}</p>
          <ul>
            {rejected.map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <strong>{r.name}</strong> : {interpolate(t(`host.photos.reject.${r.reason}`), { max: MAX_PHOTOS })}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="listing-form-alert" role="alert">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ol className="photo-manager-grid" aria-label={t("host.photos.listLabel")}>
          {items.map((item, index) => {
            const src = item.preview || item.url;
            const position = interpolate(t("host.photos.position"), { n: index + 1 });
            return (
              <li
                key={item.key}
                className={`photo-tile photo-tile--${item.status}${dragKey === item.key ? " photo-tile--dragging" : ""}`}
                draggable={!locked}
                onDragStart={(e) => {
                  setDragKey(item.key);
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => setDragKey(null)}
                onDragOver={(e) => {
                  if (dragKey) e.preventDefault();
                }}
                onDrop={(e) => onTileDrop(e, index)}
              >
                <div className="photo-tile-media">
                  {src ? <img src={src} alt={position} /> : <span className="photo-tile-empty" aria-hidden="true" />}
                  {index === 0 && <span className="photo-tile-cover">{t("host.photos.cover")}</span>}
                  {item.status === "uploading" && (
                    <span className="photo-tile-overlay" role="status">
                      {t("host.photos.uploading")}
                    </span>
                  )}
                  {item.status === "pending" && <span className="photo-tile-tag">{t("host.photos.pending")}</span>}
                </div>
                {item.status === "error" && (
                  <p className="photo-tile-error" role="alert">
                    {errorText(item.error)}
                  </p>
                )}
                <div className="photo-tile-actions">
                  <button
                    type="button"
                    className="photo-tile-btn"
                    onClick={() => move(index, index - 1)}
                    disabled={locked || index === 0}
                    aria-label={`${t("host.photos.moveLeft")} (${position})`}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M19 12H5" />
                      <path d="M11 18l-6-6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="photo-tile-btn"
                    onClick={() => move(index, index + 1)}
                    disabled={locked || index === items.length - 1}
                    aria-label={`${t("host.photos.moveRight")} (${position})`}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M5 12h14" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                  </button>
                  {item.status === "error" && listingId && (
                    <button type="button" className="photo-tile-btn photo-tile-btn--text" onClick={() => retry(item)} disabled={locked}>
                      {t("host.photos.retry")}
                    </button>
                  )}
                  <ConfirmButton
                    className="photo-tile-btn photo-tile-btn--text photo-tile-btn--danger"
                    label={t("host.photos.remove")}
                    prompt={t("host.photos.confirmRemove")}
                    confirmLabel={t("host.confirmYes")}
                    cancelLabel={t("host.confirmNo")}
                    onConfirm={() => remove(item)}
                    disabled={locked}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </fieldset>
  );
};

export default PhotoManager;
