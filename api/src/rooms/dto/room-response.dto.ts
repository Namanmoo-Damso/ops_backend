export class RoomResponseDto {
  id: string;
  roomName: string;
  createdAt: string;
}

export class RoomMemberResponseDto {
  identity: string;
  displayName: string | null;
  joinedAt: string;
}

export class RoomMembersResponseDto {
  roomName: string;
  members: RoomMemberResponseDto[];
}
