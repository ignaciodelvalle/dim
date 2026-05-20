import { labelClass } from "@/lib/form-classes";

export function AttachmentField() {
  return (
    <div className="space-y-1.5">
      <label htmlFor="attachment" className={labelClass}>
        Foto adjunta (opcional)
      </label>
      <input
        id="attachment"
        name="attachment"
        type="file"
        accept="image/*"
        className="block w-full text-sm text-neutral-700 dark:text-neutral-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-neutral-100 dark:file:bg-neutral-800 file:text-neutral-900 dark:file:text-neutral-50 hover:file:bg-neutral-200 dark:hover:file:bg-neutral-700 file:cursor-pointer"
      />
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Imagen de hasta 5 MB. Por ejemplo: carnet, receta, o foto del momento.
      </p>
    </div>
  );
}
