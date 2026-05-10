import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { SHARE_BASE_URL, SOCKET_BASE_URL } from "@/lib/config";
import { computeStats } from "@/features/room/stats";
import { DECK } from "@/lib/deck";
import type { Participant } from "@/features/room/types";
import { tokenStore } from "@/lib/http";

export function RoomPage() {
	const { shortCode = "" } = useParams();
	const { user, anonId, fingerprint } = useAuth();
	const navigate = useNavigate();
	const socketRef = useRef<Socket | null>(null);
	const [members, setMembers] = useState<Participant[]>([]);
	const [votesRevealed, setVotesRevealed] = useState(false);
	const [votes, setVotes] = useState<Record<string, string>>({});
	const [selected, setSelected] = useState<string | null>(null);
	const [myIdentityKey, setMyIdentityKey] = useState<string>("");
	const [status, setStatus] = useState<
		"connected" | "reconnecting" | "disconnected"
	>("disconnected");
	const [capacity] = useState(100);
	const [copied, setCopied] = useState(false);
	const [shareUrl, setShareUrl] = useState("");
	const [qrOpen, setQrOpen] = useState(false);

	useEffect(() => {
		setShareUrl(`${SHARE_BASE_URL}/room/${shortCode}`);
	}, [shortCode]);

	useEffect(() => {
		const displayName =
			user?.username ??
			user?.email ??
			`user_${(anonId ?? "anon").slice(0, 6)}`;

		const socket = io(`${SOCKET_BASE_URL}/room`, {
			transports: ["websocket"],
			// Server builds the identity key from these + IP; never trust client-sent identityKey
			auth: {
				token: tokenStore.get() ?? undefined,
				fingerprint,
			},
		});
		socketRef.current = socket;

		socket.on("connect", () => {
			setStatus("connected");
			socket.emit("room:join", { shortCode, displayName });
		});

		socket.on("disconnect", () => setStatus("disconnected"));
		socket.on("reconnect_attempt", () => setStatus("reconnecting"));

		socket.on(
			"room:state_sync",
			({
				identityKey,
				is_reconnect,
				restored_vote,
			}: {
				identityKey: string;
				is_reconnect: boolean;
				restored_vote: string | null;
			}) => {
				setMyIdentityKey(identityKey);
				if (is_reconnect) setStatus("connected");
				if (restored_vote) setSelected(restored_vote);
			},
		);

		socket.on(
			"user:joined",
			({
				user_id,
				display_name,
				is_authenticated,
			}: {
				user_id: string;
				display_name: string;
				is_authenticated: boolean;
			}) => {
				setMembers((prev) => {
					if (prev.some((m) => m.identityKey === user_id))
						return prev;
					return [
						...prev,
						{
							identityKey: user_id,
							displayName: display_name,
							isAuthenticated: is_authenticated,
							voted: false,
						},
					];
				});
			},
		);

		socket.on("user:left", ({ user_id }: { user_id: string }) => {
			setMembers((prev) => prev.filter((m) => m.identityKey !== user_id));
		});

		socket.on("user:voted", ({ user_id }: { user_id: string }) => {
			setMembers((prev) =>
				prev.map((m) =>
					m.identityKey === user_id ? { ...m, voted: true } : m,
				),
			);
		});

		socket.on(
			"room:votes_revealed",
			({ votes: incoming }: { votes: Record<string, string> }) => {
				setVotes(incoming);
				setVotesRevealed(true);
				setMembers((prev) =>
					prev.map((m) => ({ ...m, vote: incoming[m.identityKey] })),
				);
			},
		);

		socket.on("room:votes_hidden", () => setVotesRevealed(false));
		socket.on("room:reset", () => {
			setVotes({});
			setSelected(null);
			setVotesRevealed(false);
			setMembers((prev) =>
				prev.map((m) => ({ ...m, voted: false, vote: undefined })),
			);
		});

		socket.on("room:capacity_exceeded", () => navigate("/room-capacity"));
		socket.on("room:banned", () => navigate("/room-banned"));
		socket.on("room:expired", () => navigate("/room-expired"));

		return () => {
			socket.disconnect();
		};
	}, [shortCode, fingerprint, user?.username, user?.email, anonId, navigate]);

	const onVote = (value: string) => {
		setSelected(value);
		socketRef.current?.emit("room:vote", { value });
	};

	const stats = computeStats(votes);

	const copyShareUrl = async () => {
		if (!shareUrl) return;
		await navigator.clipboard.writeText(shareUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<CardTitle>Room {shortCode}</CardTitle>
						<div className="flex items-center gap-2">
							<Badge variant="outline">
								{members.length} / {capacity}
							</Badge>
							<Badge
								variant={
									status === "connected"
										? "default"
										: "secondary"
								}>
								{status}
							</Badge>
						</div>
					</div>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Share Room</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
					<div className="space-y-2 text-sm">
						<p className="text-muted-foreground">
							Scan this QR code to open the room on mobile
							instantly.
						</p>
						<p className="rounded-md border bg-muted px-3 py-2 font-mono text-xs">
							{shareUrl}
						</p>
						<Button
							variant="outline"
							size="sm"
							onClick={copyShareUrl}>
							{copied ? "Copied" : "Copy Link"}
						</Button>
					</div>
					<div className="rounded-lg border bg-white p-3">
						<button
							type="button"
							onClick={() => setQrOpen(true)}
							className="cursor-zoom-in"
							aria-label="Expand QR code">
							<QRCodeSVG
								value={shareUrl || shortCode}
								size={144}
							/>
						</button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Participants</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{members.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No participants yet.
						</p>
					) : null}
					{members.map((m) => (
						<div
							key={m.identityKey}
							className="flex items-center justify-between rounded-md border p-2 text-sm">
							<div className="flex items-center gap-2">
								<span>
									{m.displayName}
									{m.identityKey === myIdentityKey
										? " (you)"
										: ""}
								</span>
								<Badge variant="outline">
									{m.isAuthenticated ? "Auth" : "Anon"}
								</Badge>
							</div>
							<span>
								{votesRevealed
									? (m.vote ?? "—")
									: m.voted
										? "Voted"
										: "Waiting"}
							</span>
						</div>
					))}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Pick a Card</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-4 gap-2 md:grid-cols-6 lg:grid-cols-12">
						{DECK.map((v) => (
							<Button
								key={v}
								variant={selected === v ? "default" : "outline"}
								onClick={() => onVote(v)}>
								{v}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			<div className="flex flex-wrap gap-2">
				<Button onClick={() => socketRef.current?.emit("room:reveal")}>
					Reveal
				</Button>
				<Button
					variant="outline"
					onClick={() => socketRef.current?.emit("room:hide")}>
					Hide
				</Button>
				<Button
					variant="outline"
					onClick={() => socketRef.current?.emit("room:reset")}>
					Reset
				</Button>
			</div>

			{votesRevealed ? (
				<Card>
					<CardHeader>
						<CardTitle>Reveal Stats</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-2 text-sm md:grid-cols-2">
						<p>
							<span className="font-medium">Average:</span>{" "}
							{stats.average ?? "N/A"}
						</p>
						<p>
							<span className="font-medium">Median:</span>{" "}
							{stats.median ?? "N/A"}
						</p>
						<p>
							<span className="font-medium">Consensus:</span>{" "}
							{stats.consensus ? "Yes" : "No"}
						</p>
						<p>
							<span className="font-medium">`?` Count:</span>{" "}
							{stats.unknownCount}
						</p>
						<p>
							<span className="font-medium">`☕` Count:</span>{" "}
							{stats.coffeeCount}
						</p>
					</CardContent>
				</Card>
			) : null}

			{qrOpen ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
					onClick={() => setQrOpen(false)}>
					<div
						className="rounded-xl border bg-white p-4 shadow-2xl"
						onClick={(e) => e.stopPropagation()}>
						<div className="mb-3 flex justify-end">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setQrOpen(false)}>
								Close
							</Button>
						</div>
						<QRCodeSVG
							value={shareUrl || shortCode}
							size={320}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
