import {
	Navigate,
	RouterProvider,
	createBrowserRouter,
	useLocation,
} from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/pages/home-page";
import { LoginPage } from "@/pages/login-page";
import { RegisterPage } from "@/pages/register-page";
import { RoomPage } from "@/pages/room-page";
import { ProfilePage } from "@/pages/profile-page";
import { SettingsPage } from "@/pages/settings-page";
import {
	RoomBannedPage,
	RoomCapacityPage,
	RoomExpiredPage,
} from "@/pages/status-pages";
import { useAuth } from "@/features/auth/use-auth";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { user, isLoading } = useAuth();
	const location = useLocation();

	if (isLoading)
		return (
			<div className="p-8 text-sm text-muted-foreground">Loading...</div>
		);
	if (!user)
		return (
			<Navigate
				to="/login"
				state={{ from: location.pathname }}
				replace
			/>
		);
	return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
	return <AppShell>{children}</AppShell>;
}

const router = createBrowserRouter([
	{
		path: "/",
		element: (
			<AppLayout>
				<HomePage />
			</AppLayout>
		),
	},
	{
		path: "/login",
		element: (
			<AppLayout>
				<LoginPage />
			</AppLayout>
		),
	},
	{
		path: "/register",
		element: (
			<AppLayout>
				<RegisterPage />
			</AppLayout>
		),
	},
	{
		path: "/room/:shortCode",
		element: (
			<AppLayout>
				<RoomPage />
			</AppLayout>
		),
	},
	{
		path: "/profile",
		element: (
			<AppLayout>
				<ProtectedRoute>
					<ProfilePage />
				</ProtectedRoute>
			</AppLayout>
		),
	},
	{
		path: "/settings",
		element: (
			<AppLayout>
				<ProtectedRoute>
					<SettingsPage />
				</ProtectedRoute>
			</AppLayout>
		),
	},
	{
		path: "/room-banned",
		element: (
			<AppLayout>
				<RoomBannedPage />
			</AppLayout>
		),
	},
	{
		path: "/room-capacity",
		element: (
			<AppLayout>
				<RoomCapacityPage />
			</AppLayout>
		),
	},
	{
		path: "/room-expired",
		element: (
			<AppLayout>
				<RoomExpiredPage />
			</AppLayout>
		),
	},
]);

export function AppRouter() {
	return <RouterProvider router={router} />;
}
