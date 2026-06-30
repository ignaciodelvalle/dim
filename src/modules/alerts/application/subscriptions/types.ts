// Types for alert-subscriptions use-cases.

import { z } from "zod";

import {
  ALERT_DIRECTIONS,
  ALERT_METRIC_KEYS,
  type AlertDirection,
  type AlertMetricKey,
} from "@/db";

export const CreateAlertSubscriptionSchema = z.object({
  metricKey: z.enum([...ALERT_METRIC_KEYS] as [AlertMetricKey, ...AlertMetricKey[]]),
  direction: z.enum([...ALERT_DIRECTIONS] as [AlertDirection, ...AlertDirection[]]),
  threshold: z.coerce.number().finite(),
  jurisdictionProvince: z.string().min(1).nullable().optional(),
  jurisdictionLocality: z.string().min(1).nullable().optional(),
  label: z.string().max(120).nullable().optional(),
});

export type CreateAlertSubscriptionInput = z.infer<typeof CreateAlertSubscriptionSchema>;
