import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    [
      '@sentry/react-native/expo',
      {
        organization: 'consultoria-b3',
        project: 'react-native',
        // SENTRY_AUTH_TOKEN é lido automaticamente do env durante o build.
        // Em prod (Vercel/EAS), setar SENTRY_AUTH_TOKEN para upload automático de source maps.
        url: 'https://sentry.io/',
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
});
