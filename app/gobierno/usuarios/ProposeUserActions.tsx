"use client";

import { useId, useState, useTransition } from "react";

import {
  proposeAdminUpgradeAction,
  proposeGovtUpgradeAction,
  proposeVetUpgradeAction,
} from "@/app/actions/admin-proposals";

type Target = { id: string; displayName: string; role: "owner" | "vet" | "govt" | "admin" };

type Mode = "idle" | "vet" | "govt" | "admin";

export function ProposeUserActions({
  target,
  actorRole,
}: {
  target: Target;
  actorRole: "admin" | "govt";
}) {
  const [mode, setMode] = useState<Mode>("idle");

  const canProposeVet = target.role === "owner";
  const canProposeGovt =
    actorRole === "admin" && (target.role === "owner" || target.role === "vet");
  const canProposeAdmin = actorRole === "admin" && target.role !== "admin"; // anti-pets re-checked server-side

  if (mode === "vet") {
    return <VetProposeForm target={target} onDone={() => setMode("idle")} />;
  }
  if (mode === "govt") {
    return <GovtProposeForm target={target} onDone={() => setMode("idle")} />;
  }
  if (mode === "admin") {
    return <AdminProposeForm target={target} onDone={() => setMode("idle")} />;
  }

  if (!canProposeVet && !canProposeGovt && !canProposeAdmin) {
    return (
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Sin acciones disponibles desde tu rol para este usuario.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canProposeVet && <ActionButton onClick={() => setMode("vet")}>Proponer vet</ActionButton>}
      {canProposeGovt && <ActionButton onClick={() => setMode("govt")}>Proponer govt</ActionButton>}
      {canProposeAdmin && (
        <ActionButton onClick={() => setMode("admin")} tone="danger">
          Proponer admin
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const base =
    "text-xs px-3 py-1.5 rounded-md transition-opacity hover:opacity-90 disabled:opacity-50";
  const variant =
    tone === "danger"
      ? "border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300"
      : "border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300";
  return (
    <button type="button" onClick={onClick} className={`${base} ${variant}`}>
      {children}
    </button>
  );
}

function VetProposeForm({ target, onDone }: { target: Target; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    matriculaNumber: "",
    matriculaJurisdiccion: "",
    operationalProvince: "",
    operationalLocality: "",
    especialidad: "",
    anosExperiencia: "",
  });

  if (submitted) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Solicitud creada. {target.displayName} fue notificado.
      </p>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await proposeVetUpgradeAction({
        targetUserId: target.id,
        matriculaNumber: form.matriculaNumber,
        matriculaJurisdiccion: form.matriculaJurisdiccion,
        operationalProvince: form.operationalProvince,
        operationalLocality: form.operationalLocality,
        especialidad: form.especialidad || null,
        anosExperiencia: form.anosExperiencia ? Number(form.anosExperiencia) : null,
      });
      if ("error" in result) setError(result.error);
      else setSubmitted(true);
    });
  }

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
      <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        Proponer rol vet para {target.displayName}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field
          label="Matrícula"
          value={form.matriculaNumber}
          onChange={(v) => setForm({ ...form, matriculaNumber: v })}
        />
        <Field
          label="Jurisdicción matrícula"
          value={form.matriculaJurisdiccion}
          onChange={(v) => setForm({ ...form, matriculaJurisdiccion: v })}
        />
        <Field
          label="Provincia donde ejerce"
          value={form.operationalProvince}
          onChange={(v) => setForm({ ...form, operationalProvince: v })}
        />
        <Field
          label="Localidad"
          value={form.operationalLocality}
          onChange={(v) => setForm({ ...form, operationalLocality: v })}
        />
        <Field
          label="Especialidad (opcional)"
          value={form.especialidad}
          onChange={(v) => setForm({ ...form, especialidad: v })}
        />
        <Field
          label="Años de exp. (opcional)"
          value={form.anosExperiencia}
          onChange={(v) => setForm({ ...form, anosExperiencia: v })}
          inputMode="numeric"
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creando..." : "Crear solicitud"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function GovtProposeForm({ target, onDone }: { target: Target; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [organismo, setOrganismo] = useState("");
  const [cargo, setCargo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [localities, setLocalities] = useState<
    { id: string; province: string; locality: string }[]
  >([{ id: crypto.randomUUID(), province: "", locality: "" }]);

  if (submitted) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Solicitud creada. Va a ser revisada por otro admin.
      </p>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const cleanLocalities = localities
        .map((l) => ({ province: l.province.trim(), locality: l.locality.trim() }))
        .filter((l) => l.province && l.locality);
      if (cleanLocalities.length === 0) {
        setError("Agregá al menos una localidad.");
        return;
      }
      const routing = cleanLocalities[0];
      const result = await proposeGovtUpgradeAction({
        targetUserId: target.id,
        organismo,
        cargo,
        motivo,
        requestedLocalities: cleanLocalities,
        routingProvince: routing.province,
        routingLocality: routing.locality,
      });
      if ("error" in result) setError(result.error);
      else setSubmitted(true);
    });
  }

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
      <p className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        Proponer rol govt para {target.displayName}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="Organismo" value={organismo} onChange={setOrganismo} />
        <Field label="Cargo" value={cargo} onChange={setCargo} />
      </div>
      <Textarea label="Motivo (mínimo 10 chars)" value={motivo} onChange={setMotivo} rows={2} />
      <div className="space-y-2">
        <p className="text-xs text-neutral-500 dark:text-neutral-500">Localidades solicitadas</p>
        {localities.map((loc, idx) => (
          <div key={loc.id} className="grid grid-cols-2 gap-2">
            <Field
              label="Provincia"
              value={loc.province}
              onChange={(v) => {
                const next = [...localities];
                next[idx] = { ...loc, province: v };
                setLocalities(next);
              }}
            />
            <Field
              label="Localidad"
              value={loc.locality}
              onChange={(v) => {
                const next = [...localities];
                next[idx] = { ...loc, locality: v };
                setLocalities(next);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLocalities([...localities, { id: crypto.randomUUID(), province: "", locality: "" }])
          }
          className="text-xs text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          + Agregar localidad
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creando..." : "Crear solicitud"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function AdminProposeForm({ target, onDone }: { target: Target; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirm, setConfirm] = useState(false);

  if (submitted) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400">
        Solicitud creada. Otro admin la va a revisar.
      </p>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await proposeAdminUpgradeAction({
        targetUserId: target.id,
        motivo,
        routingProvince: "Universal",
        routingLocality: "Universal",
      });
      if ("error" in result) setError(result.error);
      else setSubmitted(true);
    });
  }

  return (
    <div className="rounded border border-amber-300 dark:border-amber-800 p-3 space-y-2 bg-amber-50 dark:bg-amber-950/30">
      <p className="text-xs uppercase tracking-wider text-amber-900 dark:text-amber-300">
        Proponer rol admin para {target.displayName}
      </p>
      <p className="text-[10px] text-amber-800 dark:text-amber-400">
        Importante: el rol admin no puede tener mascotas registradas. Si {target.displayName} tiene
        mascotas activas, la aprobación va a fallar.
      </p>
      <Textarea label="Motivo (mínimo 20 chars)" value={motivo} onChange={setMotivo} rows={3} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        <span className="text-xs text-amber-900 dark:text-amber-300">
          Confirmo que esta persona va a tener acceso administrativo universal.
        </span>
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !confirm}
          className="text-xs px-3 py-1.5 rounded-md bg-amber-700 dark:bg-amber-600 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creando..." : "Crear solicitud"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "text" | "numeric";
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-50"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-neutral-50"
      />
    </div>
  );
}
