import { ParticipantVideo } from './ParticipantVideo.jsx';
/** @type {import('@storybook/react-vite').Meta<typeof ParticipantVideo>} */
const meta = {
  title: 'Components/Kaiwa/ParticipantVideo',
  component: ParticipantVideo,
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
  args: { name: 'Minh Anh', self: true, camera: false, paused: false },
};
export default meta;
export const Default = {};
export const Reconnecting = { args: { paused: true } };
export const CameraOn = { args: { camera: true } };
