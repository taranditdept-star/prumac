import { z } from "zod";
import { uuid } from "./uuid";

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "compassionate", "study", "other"] as const;

export const leaveRequestSchema = z
  .object({
    driver_id: uuid().nullable().optional(), // managers may file on behalf
    leave_type: z.enum(LEAVE_TYPES).default("annual"),
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    reason: z.string().max(500).nullable().optional(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date must be on or after the start date.",
    path: ["end_date"],
  });

export const leaveReviewSchema = z.object({
  leave_id: uuid(),
  decision: z.enum(["approved", "rejected"]),
  review_notes: z.string().max(500).nullable().optional(),
});

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;
export type LeaveReviewInput = z.infer<typeof leaveReviewSchema>;
