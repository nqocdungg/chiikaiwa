import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../features/auth/AuthContext.jsx';
import { KaiwaDemo } from './KaiwaDemo.jsx';
/** @type {import('@storybook/react-vite').Meta<typeof KaiwaDemo>} */
const meta = {
  id: 'kaiwa',
  title: 'Chiikaiwa/Giao diện Chiikaiwa',
  component: KaiwaDemo,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <AuthProvider skipInitialCheck={true}>
          <Story />
        </AuthProvider>
      </MemoryRouter>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Giao diện Chiikaiwa đã chốt: trang chính tối giản và phòng ba vùng cố định. Thẻ vai tiếng Nhật, bản dịch Việt tùy chọn. Dữ liệu và thiết bị đều mô phỏng; chưa kết nối API/LiveKit. Xem docs/development/ui.md.',
      },
    },
  },
  argTypes: {
    initialScreen: { control: 'select', options: ['home', 'room'] },
    initialStage: {
      control: 'select',
      options: [
        'selecting',
        'drawing',
        'practice',
        'reconnecting',
        'sharing',
        'exhausted',
        'ended',
      ],
    },
    initialPanel: {
      control: 'select',
      options: ['hints', 'note', 'chat', null],
    },
  },
  render: (args) => <KaiwaDemo key={JSON.stringify(args)} {...args} />,
};
export default meta;
export const Home = { name: 'Trang chính', args: { initialScreen: 'home' } };
export const Room = {
  name: 'Phòng hội thoại',
  args: { initialScreen: 'room' },
};
export const ChoosingDeck = {
  name: 'Chọn bộ · Danh sách dài',
  args: { initialScreen: 'room', initialStage: 'selecting' },
};
export const Drawing = {
  name: 'Bàn thẻ úp',
  args: { initialScreen: 'room', initialStage: 'drawing' },
};
export const LongRole = {
  name: 'Vai dài · Cuộn nội bộ',
  args: { initialScreen: 'room', longContent: true },
};
export const Notes = {
  name: 'Ghi chú riêng',
  args: { initialScreen: 'room', initialPanel: 'note' },
};
export const NotesError = {
  name: 'Lỗi lưu ghi chú',
  args: { initialScreen: 'room', initialNoteError: true },
};
export const HiddenTools = {
  name: 'Thu gọn công cụ',
  args: { initialScreen: 'room', initialPanel: null },
};
export const Sharing = {
  name: 'Chia sẻ màn hình',
  args: { initialScreen: 'room', initialStage: 'sharing' },
};
export const Reconnecting = {
  name: 'Phục hồi kết nối',
  args: { initialScreen: 'room', initialStage: 'reconnecting' },
};
export const Exhausted = {
  name: 'Hết tình huống',
  args: { initialScreen: 'room', initialStage: 'exhausted' },
};
export const Summary = {
  name: 'Tổng kết',
  args: { initialScreen: 'room', initialStage: 'ended' },
};
