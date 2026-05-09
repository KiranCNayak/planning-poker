export type Participant = {
	identityKey: string;
	displayName: string;
	isAuthenticated: boolean;
	voted: boolean;
	vote?: string;
};

export type RoomState = {
	roomId: string;
	shortCode: string;
	name?: string;
	capacity: number;
	members: Participant[];
	votesRevealed: boolean;
	isReconnect: boolean;
	connectionStatus: "connected" | "reconnecting" | "disconnected";
};
