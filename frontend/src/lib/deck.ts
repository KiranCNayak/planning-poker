// Keep in sync with backend/src/modules/realtime/socket.ts → VOTE_VALUES
export const DECK = [
	"1",
	"2",
	"3",
	"5",
	"8",
	"13",
	"21",
	"34",
	"55",
	"89",
	"?",
	"☕",
] as const;

export type DeckValue = (typeof DECK)[number];
