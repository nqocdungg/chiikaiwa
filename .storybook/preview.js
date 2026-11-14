import '../client/src/styles/tokens.css';
import '../client/src/styles/globals.css';
import '../client/src/styles/ui.css';
import '../client/src/styles/foundation.css';

/** @type {import('@storybook/react-vite').Preview} */
const preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    options: { storySort: { order: ['Chiikaiwa'] } },
  },
};

export default preview;
