/**
 * User Types
 */
export type UserType = 'guardian' | 'ward' | null;

export type UserRow = {
  id: string;
  identity: string;
  display_name: string | null;
  user_type: UserType;
  email: string | null;
  nickname: string | null;
  profile_image_url: string | null;
  kakao_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GuardianRow = {
  id: string;
  user_id: string;
  ward_email: string;
  ward_phone_number: string;
  created_at: string;
  updated_at: string;
};

export type GuardianWardRegistrationRow = {
  id: string;
  guardian_id: string;
  ward_email: string;
  ward_phone_number: string;
  linked_ward_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RefreshTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
};

export type NotificationSettingRow = {
  id: string;
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  call_reminder_enabled: boolean;
  health_alert_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminRow = {
  id: string;
  provider: string;
  provider_id: string;
  email: string;
  name: string;
  profile_image_url: string | null;
  role: string;
  organization_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};
