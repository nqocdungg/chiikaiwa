import '../client/src/styles/ui.css';

/** @type {import('@storybook/react-vite').Preview} */
const preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    options: { storySort: { order: ['Chiikaiwa'] } },
  },
};

export default preview;
