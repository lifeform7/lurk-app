module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    mediaBaseUrl: process.env.EXPO_PUBLIC_LURK_MEDIA_BASE_URL ?? '',
    deviceId: process.env.EXPO_PUBLIC_LURK_DEVICE_ID ?? 'phone01',
  },
});
