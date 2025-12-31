/**
 * Device Types
 */
export type DeviceRow = {
  id: string;
  user_id: string | null;
  platform: string;
  apns_token: string | null;
  voip_token: string | null;
  supports_callkit: boolean;
  env: string;
  last_seen: string;
};
