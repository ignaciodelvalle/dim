"use client";

// Client component — self-service profile edit form (Slice 3a).
// Handles text fields (displayName, phone) and avatar upload.
// On submit: calls updateProfileAction and uploadAvatarAction server actions.
// On success: shows inline success banner; does NOT redirect (user stays on
// the edit form so they can keep making changes). "Cancelar" goes back to /cuenta.

import { useRef, useState } from "react";

import { updateProfileAction, uploadAvatarAction } from "@/app/actions/profile";

type InitialProfile = {
  displayName: string;
  phone: string;
  avatarUrl: string;
};

type FieldErrors = {
  displayName?: string;
  phone?: string;
  avatar?: string;
};

export function EditProfileForm({ initialProfile }: { initialProfile: InitialProfile }) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [phone, setPhone] = useState(initialProfile.phone);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    initialProfile.avatarUrl || null,
  );
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setFieldErrors((prev) => ({
        ...prev,
        avatar: "Solo se aceptan imágenes JPEG, PNG o WebP",
      }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors((prev) => ({
        ...prev,
        avatar: "La imagen no puede superar 2 MB",
      }));
      return;
    }

    setFieldErrors((prev) => ({ ...prev, avatar: undefined }));
    setPendingAvatarFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      setAvatarPreview(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGlobalError(null);
    setSuccessMessage(null);
    setFieldErrors({});
    setLoading(true);

    try {
      let hasError = false;
      const newErrors: FieldErrors = {};

      // Update text fields
      const textResult = await updateProfileAction({
        displayName,
        phone: phone,
      });

      if ("error" in textResult) {
        hasError = true;
        const msg = textResult.error;
        if (msg.includes("nombre")) {
          newErrors.displayName = msg.replace("VALIDATION_ERROR: ", "");
        } else if (msg.includes("teléfono")) {
          newErrors.phone = msg.replace("VALIDATION_ERROR: ", "");
        } else {
          setGlobalError(msg);
        }
      }

      // Upload avatar if one was selected
      if (pendingAvatarFile && !hasError) {
        const avatarResult = await uploadAvatarAction({
          fileBlob: pendingAvatarFile,
          fileName: pendingAvatarFile.name,
          mimeType: pendingAvatarFile.type,
          fileSize: pendingAvatarFile.size,
        });

        if ("error" in avatarResult) {
          hasError = true;
          if (avatarResult.error.includes("VALIDATION_ERROR")) {
            newErrors.avatar = avatarResult.error.replace("VALIDATION_ERROR: ", "");
          } else {
            // Storage failure — non-blocking for text fields
            newErrors.avatar = `No se pudo subir la foto: ${avatarResult.error.replace("STORAGE_FAILED: ", "")}`;
          }
        } else {
          setPendingAvatarFile(null);
          setAvatarPreview(avatarResult.avatarUrl);
        }
      }

      setFieldErrors(newErrors);
      if (!hasError && Object.keys(newErrors).length === 0) {
        setSuccessMessage("Tus datos fueron actualizados correctamente.");
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const displayNameInitials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Success banner */}
      {successMessage && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">{successMessage}</p>
        </div>
      )}

      {/* Global error */}
      {globalError && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-300">{globalError}</p>
        </div>
      )}

      {/* Avatar upload */}
      <div className="space-y-2">
        <label
          htmlFor="avatarUpload"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          Foto de perfil
        </label>
        <div className="flex items-center gap-4">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Vista previa"
              className="w-16 h-16 rounded-full object-cover border border-neutral-200 dark:border-neutral-800 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-xl font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
              {displayNameInitials || "?"}
            </div>
          )}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-neutral-900 dark:text-neutral-50 underline underline-offset-4 hover:opacity-70 transition-opacity"
            >
              {avatarPreview ? "Cambiar foto" : "Subir foto"}
            </button>
            <p className="text-xs text-neutral-500 dark:text-neutral-500">
              JPEG, PNG o WebP · máx. 2 MB
            </p>
            {fieldErrors.avatar && (
              <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.avatar}</p>
            )}
          </div>
        </div>
        <input
          id="avatarUpload"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleAvatarChange}
        />
      </div>

      {/* displayName */}
      <div>
        <label
          htmlFor="displayName"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          Nombre de display <span className="text-red-500">*</span>
        </label>
        <input
          id="displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          minLength={2}
          maxLength={80}
          placeholder="Tu nombre o apodo"
          className="w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
          aria-describedby={fieldErrors.displayName ? "displayName-error" : undefined}
        />
        {fieldErrors.displayName && (
          <p id="displayName-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {fieldErrors.displayName}
          </p>
        )}
      </div>

      {/* phone */}
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          Teléfono{" "}
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-500">
            (opcional)
          </span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 9 11 1234-5678"
          className="w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
          aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
        />
        {fieldErrors.phone && (
          <p id="phone-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {fieldErrors.phone}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
        <a
          href="/cuenta"
          className="px-5 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
