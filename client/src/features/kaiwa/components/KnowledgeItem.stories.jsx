import { KnowledgeItem } from './KnowledgeItem.jsx';
import { knowledge } from '../../../demo/kaiwa-fixtures.js';
/** @type {import('@storybook/react-vite').Meta<typeof KnowledgeItem>} */
const meta = {
  title: 'Components/Kaiwa/KnowledgeItem',
  component: KnowledgeItem,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div
        className="ck-app"
        style={{ padding: 24, minHeight: 300, maxWidth: 480 }}
      >
        <Story />
      </div>
    ),
  ],
  args: { item: knowledge[0], saved: false, onToggle: () => {} },
};
export default meta;
export const Default = {};
export const Saved = { args: { saved: true } };
