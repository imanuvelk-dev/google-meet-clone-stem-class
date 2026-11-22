import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      '.figma',
      'playwright-report',
      'test-results',
      'src/design/tokens.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // eslint.config.js itself is not in a tsconfig project, so let the
        // default project pick it up rather than adding allowJs everywhere.
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // The SDK seam: VideoSDK must not leak into feature components. An SDK
    // upgrade should touch src/meeting/ and nothing else. See CLAUDE.md.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/meeting/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@videosdk.live/react-sdk',
              message:
                'Do not import VideoSDK outside src/meeting/. Use our hooks (useParticipants, useLocalMedia) so the fake client can drive the UI. See CLAUDE.md.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['api/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // This file is linted via the default project, which cannot resolve its
    // imports, so type-aware rules only produce false positives here.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
)
