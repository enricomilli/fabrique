import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
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
	plugins: [testUtils({ captureOTP: true }), openAPI(), tanstackStartCookies()],
	database: drizzleAdapter(db, {
		provider: "pg",
	}),
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.SERVER_URL,
});
