import eslint from "@eslint/js"
import ts from "typescript-eslint"
import prettier from "eslint-plugin-prettier/recommended"

export default ts.config(eslint.configs.recommended, ts.configs.strict, prettier as never, {
	ignores: ["out"],

	languageOptions: {
		parser: ts.parser,
		ecmaVersion: 2018,
		sourceType: "module",

		parserOptions: {
			jsx: true,
			useJSXTextNode: true,
			project: "./tsconfig.build.json",
		},
	},
})
