"use client";

// Client component — self-service profile edit form (Slice 3a).
// Handles text fields (displayName, phone) and avatar upload.
// On submit: calls updateProfileAction and uploadAvatarAction server actions.
// On success: shows inline success banner; does NOT redirect (user stays on
// the edit form so they can keep making changes). "Cancelar" goes back to /cuenta.

import { useRef, useState } from "react";

import { updateProfileAction, uploadAvatarAction } from "@/app/actions/profile";
import { looksLikeArPhone } from "@/lib/ar-phone";

function PhoneFormatWarning({ value }: { value: string }) {
  if (!value || looksLikeArPhone(value)) return null;
  return (
    <p className="mt-1 text-xs text-gob-warning-text">
      Formato inusual para Argentina — guardamos igual, revisalo si querés.
    </p>
  );
}

type InitialProfile = {
  displayName: string;
  phone: string;
  avatarUrl: string;
  preferredVetName: string;
  preferredVetPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type FieldErrors = {
  displayName?: string;
  phone?: string;
  avatar?: string;
};

export function EditProfileForm({ initialProfile }: { initialProfile: InitialProfile }) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [phone, setPhone] = useState(initialProfile.phone);
  const [preferredVetName, setPreferredVetName] = useState(initialProfile.preferredVetName);
  const [preferredVetPhone, setPreferredVetPhone] = useState(initialProfile.preferredVetPhone);
  const [emergencyContactName, setEmergencyContactName] = useState(
    initialProfile.emergencyContactName,
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initialProfile.emergencyContactPhone,
  );
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
        preferredVetName,
        preferredVetPhone,
        emergencyContactName,
        emergencyContactPhone,
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
        <div className="rounded-md bg-gob-success/10  border border-gob-success  px-4 py-3">
          <p className="text-sm text-gob-success ">{successMessage}</p>
        </div>
      )}

      {/* Global error */}
      {globalError && (
        <div className="rounded-md bg-gob-danger/10  border border-gob-danger  px-4 py-3">
          <p className="text-sm text-gob-danger ">{globalError}</p>
        </div>
      )}

      {/* Avatar upload */}
      <div className="space-y-2">
        <label htmlFor="avatarUpload" className="block text-sm font-medium text-gob-text-gray ">
          Foto de perfil
        </label>
        <div className="flex items-center gap-4">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Vista previa"
              className="w-16 h-16 rounded-full object-cover border border-gob-border  shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gob-surface-alt  border border-gob-border  flex items-center justify-center text-xl font-semibold text-gob-text-gray  shrink-0">
              {displayNameInitials || "?"}
            </div>
          )}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-gob-text  underline underline-offset-4 hover:opacity-70 transition-opacity"
            >
              {avatarPreview ? "Cambiar foto" : "Subir foto"}
            </button>
            <p className="text-xs text-gob-text-muted ">JPEG, PNG o WebP · máx. 2 MB</p>
            {fieldErrors.avatar && <p className="text-xs text-gob-danger ">{fieldErrors.avatar}</p>}
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
        <label htmlFor="displayName" className="block text-sm font-medium text-gob-text-gray  mb-1">
          Nombre de display <span className="text-gob-danger">*</span>
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
          className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
          aria-describedby={fieldErrors.displayName ? "displayName-error" : undefined}
        />
        {fieldErrors.displayName && (
          <p id="displayName-error" className="mt-1 text-xs text-gob-danger ">
            {fieldErrors.displayName}
          </p>
        )}
      </div>

      {/* phone */}
      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gob-text-gray  mb-1">
          Teléfono <span className="text-xs font-normal text-gob-text-muted ">(opcional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+54 9 11 1234-5678"
          className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
          aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
        />
        {fieldErrors.phone && (
          <p id="phone-error" className="mt-1 text-xs text-gob-danger ">
            {fieldErrors.phone}
          </p>
        )}
        <PhoneFormatWarning value={phone} />
      </div>

      {/* Emergency / vet contact group — appears on <PetEmergencyCard>
          of every pet detail. Tap-to-call linkable. */}
      <fieldset className="space-y-3 rounded-md border border-gob-border  p-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-gob-text-muted ">
          Contactos para emergencias
        </legend>
        <p className="text-xs text-gob-text-muted ">
          Aparecen en la credencial de cada mascota. Si una mascota está perdida y un finder escanea
          el QR, podemos mostrarle estos contactos (según tus preferencias de privacidad).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="preferredVetName"
              className="block text-xs font-medium text-gob-text-gray  mb-1"
            >
              Veterinario/a de cabecera
            </label>
            <input
              id="preferredVetName"
              type="text"
              value={preferredVetName}
              onChange={(e) => setPreferredVetName(e.target.value)}
              maxLength={80}
              placeholder="Dra. Pérez"
              className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
            />
          </div>
          <div>
            <label
              htmlFor="preferredVetPhone"
              className="block text-xs font-medium text-gob-text-gray  mb-1"
            >
              Teléfono del vet
            </label>
            <input
              id="preferredVetPhone"
              type="tel"
              value={preferredVetPhone}
              onChange={(e) => setPreferredVetPhone(e.target.value)}
              placeholder="+54 9 11 1234-5678"
              className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
            />
            <PhoneFormatWarning value={preferredVetPhone} />
          </div>
          <div>
            <label
              htmlFor="emergencyContactName"
              className="block text-xs font-medium text-gob-text-gray  mb-1"
            >
              Contacto de emergencia
            </label>
            <input
              id="emergencyContactName"
              type="text"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              maxLength={80}
              placeholder="Lucía F."
              className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
            />
          </div>
          <div>
            <label
              htmlFor="emergencyContactPhone"
              className="block text-xs font-medium text-gob-text-gray  mb-1"
            >
              Teléfono del contacto
            </label>
            <input
              id="emergencyContactPhone"
              type="tel"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              placeholder="+54 9 11 1234-5678"
              className="w-full text-sm rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
            />
            <PhoneFormatWarning value={emergencyContactPhone} />
          </div>
        </div>
      </fieldset>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm bg-gob-primary  text-white  rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>
        <a
          href="/cuenta"
          className="px-5 py-2 text-sm border border-gob-border-strong  rounded-md hover:bg-gob-surface-alt "
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
