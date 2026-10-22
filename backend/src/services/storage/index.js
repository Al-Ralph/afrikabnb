import { config } from "../../config/env.js";
import { createLocalStorage } from "./local.js";
import { createSupabaseStorage } from "./supabase.js";

// Choix du stockage par STORAGE_DRIVER (validé au démarrage par config/env.js).
// Interface : put(key, buffer, contentType) -> { path, url } ; remove(key).
export const storage =
  config.storage.driver === "supabase"
    ? createSupabaseStorage({
        supabaseUrl: config.storage.supabaseUrl,
        serviceRoleKey: config.storage.supabaseServiceRoleKey,
        bucket: config.storage.bucket,
      })
    : createLocalStorage({ publicBaseUrl: config.publicApiUrl });

export { UPLOADS_DIR } from "./local.js";
