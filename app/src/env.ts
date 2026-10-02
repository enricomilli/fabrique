import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		SERVER_URL: z.url().optional(),
		DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
		REDIS_URL: z.url({ protocol: /^rediss?$/ }),
		BETTER_AUTH_SECRET: z.string().trim().min(32),
		S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
		S3_REGION: z.string().trim().min(1),
		S3_ACCESS_KEY_ID: z.string().trim().min(1),
		S3_SECRET_ACCESS_KEY: z.string().trim().min(1),
		S3_BUCKET: z.string().trim().min(1),
		S3_FORCE_PATH_STYLE: z
			.enum(["true", "false"])
			.transform((value) => value === "true"),
	},
	clientPrefix: "VITE_",
	client: {
		VITE_APP_TITLE: z.string().min(1).optional(),
	},
	// Vite provides client values. The server reads secrets at runtime.
	runtimeEnv: {
		...import.meta.env,
		...(typeof window === "undefined" ? process.env : {}),
	},
	emptyStringAsUndefined: true,
});
