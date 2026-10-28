import { defineConfig } from "eslint/config";
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default defineConfig([
    eslintPluginUnicorn.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            '@typescript-eslint': typescriptEslint,
            'react': reactPlugin,
            'react-hooks': reactHooksPlugin,
        },
        rules: {
            semi: "error",
            "prefer-const": "error",
            'unicorn/better-regex': 'warn',
            // TypeScript rules
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/no-explicit-any': 'warn',
            // React rules
            'react/react-in-jsx-scope': 'off', // Not needed in React 17+
            'react/prop-types': 'off', // Using TypeScript for prop validation
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
    },
]);