import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
	{
		ignores: ["**/node_modules/**", "**/dist/**", "**/.pnpm-store/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["backend/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": "off",
		},
	},
	eslintConfigPrettier,
);
