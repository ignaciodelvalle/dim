export type AuthFormState = {
  error: string | null;
  // Set by signupAction so the multi-step signup form knows to advance to
  // the identity step. loginAction never sets it.
  ok?: boolean;
  // Echoes the submitted email back to the login form. React 19 automatically
  // resets an uncontrolled `<form action={fn}>` once the action resolves; on a
  // failed login the action returns (no redirect) and that reset wipes the
  // email the user just typed (the email input is DOM-owned/uncontrolled). The
  // form restores it via `defaultValue`. Never echo the password — it is not
  // round-tripped through server state.
  email?: string;
};

export type IdentityFormState = {
  error: string | null;
  ok?: boolean;
};
