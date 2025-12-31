/**
 * Ward Types
 */
export type WardRow = {
  id: string;
  user_id: string;
  phone_number: string;
  guardian_id: string | null;
  organization_id: string | null;
  ai_persona: string;
  weekly_call_count: number;
  call_duration_minutes: number;
  created_at: string;
  updated_at: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

export type WardLocationRow = {
  id: string;
  ward_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  recorded_at: string;
  battery_level: number | null;
};

export type WardCurrentLocationRow = {
  id: string;
  ward_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  last_updated_at: string;
  battery_level: number | null;
  status: string;
};

export type CallScheduleRow = {
  id: string;
  ward_id: string;
  day_of_week: number;
  time: string;
  is_active: boolean;
  last_reminder_sent_at: string | null;
  created_at: string;
};

export type HealthAlertRow = {
  id: string;
  ward_id: string;
  guardian_id: string;
  type: string;
  severity: string;
  message: string;
  call_summary_id: string | null;
  is_read: boolean;
  created_at: string;
};
