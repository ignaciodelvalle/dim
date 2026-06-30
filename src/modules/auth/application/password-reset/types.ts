export type PasswordResetRequestState = {
  message: string | null;
  error: string | null;
};

export type UpdatePasswordState = {
  error: string | null;
  ok?: boolean;
};
