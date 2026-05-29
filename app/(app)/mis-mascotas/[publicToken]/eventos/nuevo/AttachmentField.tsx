export function AttachmentField() {
  return (
    <div className="space-y-1.5">
      <label htmlFor="attachment" className="block text-sm font-medium text-gob-text">
        Foto adjunta (opcional)
      </label>
      <input
        id="attachment"
        name="attachment"
        type="file"
        accept="image/*"
        className="block w-full text-sm text-gob-text-gray  file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gob-surface-alt  file:text-gob-text  hover:file:bg-gob-surface-alt  file:cursor-pointer"
      />
      <p className="text-xs text-gob-text-muted ">
        Imagen de hasta 5 MB. Por ejemplo: carnet, receta, o foto del momento.
      </p>
    </div>
  );
}
