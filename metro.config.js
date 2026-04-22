const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Sentry recomenda getSentryExpoConfig em vez de getDefaultConfig
// para garantir debug IDs corretos nos source maps (P0-01).
const config = getSentryExpoConfig(__dirname);

module.exports = config;
