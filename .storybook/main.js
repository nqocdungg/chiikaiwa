/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  framework: '@storybook/react-vite',
  stories: ['../client/src/**/*.stories.jsx'],
  addons: ['@storybook/addon-docs'],
  core: { disableTelemetry: true },
};

export default config;
