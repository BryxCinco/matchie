import { z } from "zod";

// Invite-only sign-up form (migration 017). The code itself is checked by
// the hook_check_invite() auth hook in the database; this only catches typos
// before the request. Password limits match the settings form.
export const SignUpSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use at most 72 characters."),
  inviteCode: z
    .string()
    .trim()
    .min(4, "Enter your invite code.")
    .max(64, "That invite code is not valid.")
    .regex(/^[A-Za-z0-9-]+$/, "That invite code is not valid."),
});

export type SignUpInput = z.infer<typeof SignUpSchema>;
