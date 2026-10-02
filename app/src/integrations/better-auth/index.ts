import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { openAPI, testUtils } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { env } from "#/env.ts";
import { db } from "../../db/drizzle";

const trustedOrigins = ["https://fabrique.com"];
export const auth = betterAuth({
	trustedOrigins,
	emailAndPassword: {
		enabled: true,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		// sendResetPassword: async (data) => {
		// 	void sendPasswordResetEmail(data);
		// },
	},
	user: {
		deleteUser: {
			enabled: true,
		},
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const domain = user.email.trim().toLowerCase().split("@")[1];
					if (domain !== "pleias.fr" && domain !== "pleias.ai") {
						throw new APIError("FORBIDDEN", {
							message: "You are not allowed to sign up.",
						});
					}
				},
			},
		},
	},
	plugins: [testUtils({ captureOTP: true }), openAPI(), tanstackStartCookies()],
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.SERVER_URL,
});
