import { z } from "zod";

export const emailLoginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const phoneOtpRequestSchema = z.object({
  // Accepts both +263 and +27 prefixes, or local 07x / 073x formats
  phone: z
    .string()
    .min(9, "Enter a valid phone number")
    .regex(/^[\d\s+()-]{9,15}$/, "Enter a valid phone number"),
});

export const phoneOtpVerifySchema = z.object({
  phone: z.string().min(9),
  token: z.string().length(6, "Enter the 6-digit code"),
});

export const resetPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type PhoneOtpRequestInput = z.infer<typeof phoneOtpRequestSchema>;
export type PhoneOtpVerifyInput = z.infer<typeof phoneOtpVerifySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
