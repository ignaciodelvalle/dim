export type AuthFormState = {
  error: string | null;
  // Set by signupAction so the multi-step signup form knows to advance to
  // the identity step. loginAction never sets it.
  ok?: boolean;
};

export type IdentityFormState = {
  error: string | null;
  ok?: boolean;
};
