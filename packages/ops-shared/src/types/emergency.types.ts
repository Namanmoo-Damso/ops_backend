/**
 * Emergency Types
 */
export type EmergencyRow = {
  id: string;
  ward_id: string;
  type: string;
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  notes: string | null;
  triggered_at: string;
  guardian_notified_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
};

export type EmergencyContactRow = {
  id: string;
  emergency_id: string;
  agency_id: string | null;
  contact_type: string;
  contact_name: string;
  phone_number: string;
  contacted_at: string | null;
  response_status: string;
  notes: string | null;
};

export type EmergencyAgencyRow = {
  id: string;
  name: string;
  type: string;
  phone_number: string;
  address: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
};
