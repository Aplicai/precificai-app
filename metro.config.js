const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Sentry recomenda getSentryExpoConfig em vez de getDefaultConfig
// para garantir debug IDs corretos nos source maps (P0-01).
const config = getSentryExpoConfig(__dirname);

// Bloqueia Supabase Edge Functions (Deno/.ts) do bundle RN.
// Sem isso, `expo start` aborta pedindo typescript@~5.9.2 + @types/react.
// `expo export` (deploy) já ignora a pasta — esse fix alinha o dev server.
config.resolver.blockList = [
  /supabase[/\\]functions[/\\].*/,
];

module.exports = config;
