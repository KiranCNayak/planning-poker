import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouter } from "@/app/router";
import { AuthProvider } from "@/features/auth/use-auth";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<AppRouter />
			</AuthProvider>
		</QueryClientProvider>
	</React.StrictMode>,
);
