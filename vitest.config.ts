import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		sequence: {
			concurrent: true,
		},
		testTimeout: 60_000,
	},
})
