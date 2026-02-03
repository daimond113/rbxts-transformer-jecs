import eslint from "@eslint/js"
import { defineConfig, globalIgnores } from "eslint/config"
import ts from "typescript-eslint"
import prettier from "eslint-plugin-prettier/recommended"

export default defineConfig(
	eslint.configs.recommended,
	ts.configs.strict,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["*.ts"],
				},
			},
		},
	},
	globalIgnores(["**/out"]),
	prettier,
)
