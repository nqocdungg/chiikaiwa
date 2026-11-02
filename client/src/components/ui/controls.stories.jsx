import { Button, IconButton } from './controls.jsx';

/** @type {import('@storybook/react-vite').Meta} */
const meta = {
  title: 'Components/Controls',
  component: Button,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="ck-app" style={{ padding: 24, minHeight: 180 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

export const Primary = {
  args: { variant: 'primary', children: 'Tìm bạn luyện' },
};
export const Secondary = { args: { children: 'Ở lại phòng' } };
export const Danger = { args: { variant: 'danger', children: 'Rời phòng' } };
export const Disabled = { args: { children: 'Chờ kết nối', disabled: true } };
export const SaveIcon = {
  render: () => (
    <IconButton
      name="star"
      label="Lưu kiến thức"
      pressed={false}
      onClick={() => {}}
    />
  ),
};
export const SavedIcon = {
  render: () => (
    <IconButton
      name="star"
      label="Bỏ lưu kiến thức"
      pressed
      onClick={() => {}}
    />
  ),
};
