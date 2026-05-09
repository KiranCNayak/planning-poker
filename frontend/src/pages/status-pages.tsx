import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function StatePage({ title, desc }: { title: string; desc: string }) {
	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-muted-foreground">{desc}</p>
				<Link to="/">
					<Button>Back to Home</Button>
				</Link>
			</CardContent>
		</Card>
	);
}

export const RoomBannedPage = () => (
	<StatePage
		title="You Are Banned"
		desc="You cannot join this room right now."
	/>
);
export const RoomCapacityPage = () => (
	<StatePage
		title="Room Full"
		desc="This room has reached maximum capacity."
	/>
);
export const RoomExpiredPage = () => (
	<StatePage
		title="Room Expired"
		desc="This room is no longer active."
	/>
);
