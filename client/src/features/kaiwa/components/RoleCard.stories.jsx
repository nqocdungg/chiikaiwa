import { RoleCard } from './RoleCard.jsx';
import { scenarios } from '../../../demo/kaiwa-fixtures.js';

/** @type {import('@storybook/react-vite').Meta} */
const meta = {
  id: 'components-rolecard',
  title: 'Components/Kaiwa/RoleCard',
  component: RoleCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div
        className="ck-app"
        style={{ padding: 24, minHeight: 500, maxWidth: 720 }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    scenario: scenarios[0],
    roleIndex: 0,
    translated: false,
    longContent: false,
    onTranslate: () => {},
  },
};
export default meta;

export const Japanese = {};
export const Vietnamese = { args: { translated: true } };
export const LongContent = { args: { longContent: true } };
