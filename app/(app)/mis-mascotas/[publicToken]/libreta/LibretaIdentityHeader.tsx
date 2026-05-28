// Identity header for the libreta sanitaria. Pure presentation — Parte C
// (Tier-2 shareable) will reuse this with share-token-resolved data.

import Link from "next/link";

import { sexLabel, speciesLabel } from "@/lib/format";
import { tattooLocationLabel } from "@/lib/lookups";

type Props = {
  pet: {
    name: string;
    species: string;
    breed: string | null;
    sex: string;
    microchipId: string | null;
    tattooCode: string | null;
    tattooLocation: string | null;
    publicToken: string;
  };
  photoUrl: string | null;
  ownerFirstName: string | null;
};

export function LibretaIdentityHeader({ pet, photoUrl, ownerFirstName }: Props) {
  const tattooLocLabel = tattooLocationLabel(pet.tattooLocation);
  return (
    <header className="flex items-start gap-5 pb-5 border-b border-gob-border ">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={pet.name}
          className="w-24 h-24 rounded-2xl object-cover shrink-0"
        />
      ) : (
        <div className="w-24 h-24 rounded-2xl bg-gob-surface-alt  flex items-center justify-center text-3xl font-semibold text-gob-text-gray  shrink-0">
          {pet.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-xs text-gob-text-muted  uppercase tracking-wider">Libreta sanitaria</p>
        <h1 className="text-3xl font-semibold tracking-tight text-gob-text  truncate">
          {pet.name}
        </h1>
        <p className="text-sm text-gob-text-gray ">
          {speciesLabel(pet.species)}
          {pet.breed && ` · ${pet.breed}`}
          {` · ${sexLabel(pet.sex)}`}
        </p>
        {pet.microchipId && (
          <p className="text-xs font-mono text-gob-text-muted ">
            <span className="sr-only">Microchip: </span>
            Microchip {pet.microchipId}
          </p>
        )}
        {pet.tattooCode && (
          <p className="text-xs font-mono text-gob-text-muted ">
            <span className="sr-only">Código de tatuaje: </span>
            Tatuaje {pet.tattooCode}
            {tattooLocLabel && ` · ${tattooLocLabel}`}
          </p>
        )}
        {ownerFirstName && (
          <p className="text-xs text-gob-text-muted ">Dueño/a: {ownerFirstName}</p>
        )}
        <p className="text-xs font-mono text-gob-text-muted  tracking-wider pt-1">
          {pet.publicToken}
        </p>
        <Link
          href={`/p/${pet.publicToken}`}
          target="_blank"
          rel="noopener"
          className="inline-block text-xs text-gob-text-muted  underline underline-offset-2 hover:text-gob-text  pt-1"
        >
          Ver perfil público de {pet.name} ↗
        </Link>
      </div>
    </header>
  );
}
