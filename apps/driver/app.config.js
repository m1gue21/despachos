// Configuración dinámica sobre app.json.
// http (sin https) solo se permite en builds de prueba y desarrollo, para conectar con un API
// local o de piloto sin dominio. El build de producción (Play Store) lo prohíbe.
module.exports = ({ config }) => {
  const allowHttp = process.env.EAS_BUILD_PROFILE !== 'production';
  return {
    ...config,
    plugins: config.plugins.map((p) =>
      p === 'expo-build-properties' ? ['expo-build-properties', { android: { usesCleartextTraffic: allowHttp } }] : p,
    ),
  };
};
