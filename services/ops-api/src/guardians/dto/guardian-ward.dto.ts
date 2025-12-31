export class AddWardDto {
  wardEmail: string;
  wardPhoneNumber: string;
}

export class UpdateWardDto {
  wardEmail: string;
  wardPhoneNumber: string;
}

export class WardResponseDto {
  id: string;
  email: string;
  phoneNumber: string;
  isPrimary: boolean;
  nickname: string | null;
  profileImageUrl: string | null;
  isLinked: boolean;
  lastCallAt: string | null;
}
