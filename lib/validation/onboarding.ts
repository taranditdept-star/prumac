import { z } from "zod";

export const onboardingSchema = z.object({
  phone: z.string().trim().min(6, "Enter a valid phone number").max(20),
  licence_number: z
    .string()
    .trim()
    .min(3, "Enter your licence number")
    .max(40)
    .refine((s) => s.toUpperCase() !== "IMPORT-PENDING", "Enter your actual licence number"),
  licence_expires_at: z.string().trim().optional().nullable(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
