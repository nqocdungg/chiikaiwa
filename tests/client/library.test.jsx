import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../../client/src/App.jsx';
import { api } from '../../client/src/services/api-client.js';
import { getIdentityEpoch } from '../../client/src/services/cache.js';
import { ApiError } from '../../client/src/services/errors.js';

configure({ asyncUtilTimeout: 5000 });

const user = {
  kind: 'user',
  user: {
    id: 'library-owner',
    displayName: 'Minh Anh',
    role: 'learner',
    status: 'active',
  },
};
const topic = {
  id: 'topic',
  versionId: 'deck-version',
  title: 'Gọi món ở quán cà phê',
  level: 'N5',
  description: 'Luyện gọi đồ uống.',
};
const detail = {
  ...topic,
  id: topic.versionId,
  contentId: topic.id,
  knowledgeCount: 1,
  questionCount: 1,
};
const word = {
  id: 'knowledge',
  versionId: 'word-old',
  type: 'grammar',
  expression: 'これをお願いします',
  reading: 'これをおねがいします',
  meaning: 'Cho tôi món này.',
  examples: [
    { japanese: 'コーヒーをお願いします。', vietnamese: 'Cho tôi cà phê.' },
  ],
};
const saved = {
  id: 'saved-item',
  version: 3,
  knowledge: { ...word, versionId: 'word-new' },
};

/** @param {unknown} data */
function response(data) {
  return {
    data,
    meta: { requestId: 'library-test' },
    epoch: getIdentityEpoch(),
  };
}

/** @param {string} path */
function open(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('shows up to six topics per island and resets pagination when the level changes', async () => {
  const topics = Array.from({ length: 7 }, (_, index) => ({
    ...topic,
    id: 'topic-' + index,
    versionId: 'version-' + index,
    title: topic.title + ' ' + (index + 1),
  }));
  const filteredTopic = {
    ...topic,
    title: 'Tìm đường đến nhà ga',
    level: 'N4',
  };
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') return response(user);
    if (path === '/topics')
      return response({ items: topics.slice(0, 6), nextCursor: 'page-two' });
    if (path === '/topics?cursor=page-two')
      return response({ items: topics.slice(6) });
    if (path === '/topics?level=N4')
      return response({ items: [filteredTopic] });
    throw new Error('Unexpected GET ' + path);
  });
  open('/topics');
  expect(
    await screen.findByRole('heading', { name: topics[0]?.title }),
  ).toBeVisible();
  const map = screen.getByRole('list', { name: 'Bộ chủ đề trên đảo' });
  expect(within(map).getAllByRole('button')).toHaveLength(6);
  fireEvent.click(
    within(map).getByRole('button', {
      name: new RegExp(topics[2]?.title ?? ''),
    }),
  );
  expect(screen.getByRole('heading', { name: topics[2]?.title })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Bắt đầu học' })).toHaveAttribute(
    'href',
    '/topics/version-2',
  );
  expect(screen.queryByTestId('island-catch')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Trang đảo tiếp theo' }));
  expect(within(map).getAllByRole('button')).toHaveLength(1);
  expect(screen.getByText('Trang đảo 2 / 2')).toBeVisible();
  const catchOnNext = screen.getByTestId('island-catch');

  fireEvent.click(screen.getByRole('button', { name: 'Trang đảo 2' }));
  expect(screen.getByTestId('island-catch')).toBe(catchOnNext);

  fireEvent.click(screen.getByRole('button', { name: 'Trang đảo 1' }));
  expect(screen.getByText('Trang đảo 1 / 2')).toBeVisible();
  expect(screen.getByTestId('island-catch')).not.toBe(catchOnNext);

  const filter = screen.getByRole('button', { name: 'Lọc trình độ: Tất cả' });
  expect(filter).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('button', { name: 'N4' })).toBeNull();
  fireEvent.click(filter);
  expect(filter).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'N4' }));
  const selectedFilter = screen.getByRole('button', {
    name: 'Lọc trình độ: N4',
  });
  expect(selectedFilter).toHaveAttribute('aria-expanded', 'false');
  expect(selectedFilter).toHaveFocus();
  expect(
    await screen.findByRole('heading', { name: filteredTopic.title }),
  ).toBeVisible();
  expect(screen.getByText('Trang đảo 1 / 1')).toBeVisible();
  expect(screen.queryByTestId('island-catch')).toBeNull();
  expect(get.mock.calls.map(([path]) => path)).toContain('/topics?level=N4');
  expect(screen.getByRole('link', { name: 'Bắt đầu học' })).toHaveAttribute(
    'href',
    '/topics/deck-version',
  );
});

it('opens search inline and restores focus when it closes', async () => {
  const secondTopic = { ...topic, id: 'travel', title: 'Đi du lịch' };
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') return response(user);
    if (path === '/topics') return response({ items: [topic, secondTopic] });
    throw new Error('Unexpected GET ' + path);
  });
  open('/topics');
  expect(
    await screen.findByRole('heading', { name: topic.title }),
  ).toBeVisible();

  const search = screen.getByRole('button', { name: 'Tìm bộ chủ đề' });
  fireEvent.click(search);
  const field = screen.getByRole('searchbox', { name: 'Từ khóa' });
  expect(field).toHaveFocus();
  fireEvent.change(field, { target: { value: 'du lịch' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(search).toHaveAttribute('aria-expanded', 'false');
  expect(search).toHaveFocus();

  fireEvent.click(search);
  const reopened = screen.getByRole('searchbox', { name: 'Từ khóa' });
  expect(reopened).toHaveValue('');
  fireEvent.change(reopened, { target: { value: 'du lịch' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
  expect(
    await screen.findByRole('heading', { name: secondTopic.title }),
  ).toBeVisible();
  expect(search).toHaveAttribute('aria-expanded', 'false');
  expect(search).toHaveFocus();

  fireEvent.click(search);
  expect(screen.getByRole('searchbox', { name: 'Từ khóa' })).toHaveValue(
    'du lịch',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Lọc trình độ: Tất cả' }));
  expect(search).toHaveAttribute('aria-expanded', 'false');
  const levelOption = screen.getByRole('button', { name: 'N4' });
  expect(levelOption).toBeVisible();
  fireEvent.pointerDown(
    screen.getByRole('heading', { name: secondTopic.title }),
  );
  expect(screen.queryByRole('button', { name: 'N4' })).toBeNull();
});

it('keeps one learner header mounted when navigating from home to library and history', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') {
      return response({
        ...user,
        user: { ...user.user, profile: { level: 'N5' } },
      });
    }
    if (path === '/me/coordination') return response({ mode: 'idle' });
    if (path === '/topics') return response({ items: [topic] });
    if (path === '/me/saved-items') return response({ items: [] });
    throw new Error(`Unexpected GET ${path}`);
  });
  open('/home');
  const nav = await screen.findByRole('navigation', {
    name: 'Điều hướng chính',
  });
  const main = screen.getByRole('main');
  const account = screen.getByRole('button', {
    name: 'Menu tài khoản: Minh Anh',
  });
  const level = screen.getByText('N5', { exact: true });
  expect(account).not.toContainElement(level);
  expect(
    level.compareDocumentPosition(account) &
      globalThis.Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  expect(within(nav).getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  fireEvent.click(within(nav).getByRole('link', { name: 'Kho chủ đề' }));
  expect(
    await screen.findByRole('heading', { name: topic.title }),
  ).toBeVisible();
  expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBe(
    nav,
  );
  expect(screen.getByRole('main')).toBe(main);
  expect(within(nav).getByRole('link', { name: 'Kho chủ đề' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  fireEvent.click(within(nav).getByRole('link', { name: 'Ôn cá nhân' }));
  expect(
    await screen.findByText('Bạn chưa lưu mục kiến thức nào.'),
  ).toBeVisible();
  expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBe(
    nav,
  );

  fireEvent.click(within(nav).getByRole('link', { name: 'Lịch sử' }));
  expect(
    await screen.findByRole('heading', { name: 'Lịch sử luyện tập' }),
  ).toBeVisible();
  expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBe(
    nav,
  );
});

it('opens only the deck of the guest trial from the catalog', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me')
      return response({
        kind: 'guest',
        guest: { sessionId: 'trial-id', status: 'active' },
      });
    if (path === '/sessions/trial-id')
      return response({ deckVersionId: topic.versionId });
    if (path === '/topic-versions/deck-version') return response(detail);
    throw new Error(`Unexpected GET ${path}`);
  });
  open('/topics');
  expect(
    await screen.findByRole('heading', { name: topic.title }),
  ).toBeVisible();
  expect(get.mock.calls.map(([path]) => path)).toEqual([
    '/auth/me',
    '/sessions/trial-id',
    '/topic-versions/deck-version',
  ]);
  expect(screen.queryByLabelText('Trình độ')).toBeNull();
});

it('retries an uncertain save with the same key and unsaves using the saved-item version', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') return response(user);
    if (path === '/topic-versions/deck-version') return response(detail);
    if (path === '/topic-versions/deck-version/knowledge')
      return response({ items: [word] });
    if (path === '/me/saved-items') return response({ items: [] });
    throw new Error(`Unexpected GET ${path}`);
  });
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValueOnce(
      new ApiError({ code: 'TIMEOUT', status: 0, message: 'Timeout' }),
    )
    .mockImplementationOnce(async () => response(saved));
  const remove = vi
    .spyOn(api, 'delete')
    .mockImplementation(async () => response(null));
  open('/topics/deck-version');
  expect(await screen.findByText('Cho tôi cà phê.')).toBeVisible();
  const save = screen.getByRole('button', { name: `Lưu ${word.expression}` });
  expect(save).toBeEnabled();
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Chưa xác nhận được kết quả',
  );
  fireEvent.click(save);
  const unsave = await screen.findByRole('button', {
    name: `Bỏ lưu ${word.expression}`,
  });
  expect(post.mock.calls[0]?.slice(0, 2)).toEqual([
    '/me/saved-items',
    { knowledgeVersionId: 'word-old', deckVersionId: 'deck-version' },
  ]);
  expect(post.mock.calls[0]?.[2]?.idempotencyKey).toBeTruthy();
  expect(post.mock.calls[1]?.[2]?.idempotencyKey).toBe(
    post.mock.calls[0]?.[2]?.idempotencyKey,
  );
  fireEvent.click(unsave);
  expect(
    await screen.findByRole('button', { name: `Lưu ${word.expression}` }),
  ).toBeEnabled();
  expect(remove.mock.calls[0]?.[0]).toBe(
    '/me/saved-items/saved-item?expectedVersion=3',
  );
});

it('reloads on a version conflict and removes only against the updated version', async () => {
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') return response(user);
    if (path === '/me/saved-items') {
      const reloaded =
        get.mock.calls.filter(([url]) => url === path).length > 1;
      return response({ items: [{ ...saved, version: reloaded ? 8 : 3 }] });
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  const remove = vi
    .spyOn(api, 'delete')
    .mockRejectedValueOnce(
      new ApiError({ code: 'VERSION_CONFLICT', status: 409, message: 'Stale' }),
    )
    .mockImplementationOnce(async () => response(null));
  open('/saved');
  const button = await screen.findByRole('button', {
    name: `Bỏ lưu ${word.expression}`,
  });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Trạng thái đã thay đổi',
  );
  await waitFor(() => {
    expect(
      get.mock.calls.filter(([url]) => url === '/me/saved-items'),
    ).toHaveLength(2);
  });
  fireEvent.click(button);
  expect(
    await screen.findByText('Bạn chưa lưu mục kiến thức nào.'),
  ).toBeVisible();
  expect(remove.mock.calls.map(([path]) => path)).toEqual([
    '/me/saved-items/saved-item?expectedVersion=3',
    '/me/saved-items/saved-item?expectedVersion=8',
  ]);
  expect(remove.mock.calls[0]?.[1]?.idempotencyKey).not.toBe(
    remove.mock.calls[1]?.[1]?.idempotencyKey,
  );
});

it.each([
  ['NETWORK_ERROR', 0],
  ['SERVICE_UNAVAILABLE', 503],
])('lets the reader retry source details after %s', async (code, status) => {
  let attempts = 0;
  vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') return response(user);
    if (path === '/me/saved-items') return response({ items: [saved] });
    if (path === '/me/saved-items/saved-item/sources') {
      return response({
        items: [
          {
            deckVersionId: 'deck-version',
            knowledgeVersionId: 'word-old',
            createdAt: '2026-11-15T00:00:00Z',
          },
        ],
      });
    }
    if (path === '/topic-versions/deck-version') {
      if (++attempts === 1)
        throw new ApiError({
          code,
          status,
          message: 'Không tải được thông tin nguồn.',
        });
      return response(detail);
    }
    throw new Error(`Unexpected GET ${path}`);
  });
  open('/saved');
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Xem nguồn: ${word.expression}`,
    }),
  );
  const dialog = screen.getByRole('dialog', { name: 'Nguồn đã lưu' });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Không tải được thông tin nguồn.',
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Thử lại' }));
  expect(
    await within(dialog).findByRole('link', { name: 'Xem bản nguồn' }),
  ).toHaveAttribute(
    'href',
    '/topics/deck-version?knowledge=knowledge&revision=word-old',
  );
  expect(attempts).toBe(2);
});

it.each([403, 404])(
  'keeps the source record when access to its topic returns %s',
  async (status) => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/auth/me') return response(user);
      if (path === '/me/saved-items') return response({ items: [saved] });
      if (path === '/me/saved-items/saved-item/sources') {
        return response({
          items: [
            {
              deckVersionId: 'deck-version',
              knowledgeVersionId: 'word-old',
              createdAt: '2026-11-15T00:00:00Z',
            },
          ],
        });
      }
      throw new ApiError({
        code: 'RESOURCE_NOT_FOUND',
        status,
        message: 'Không có quyền đọc nguồn.',
      });
    });
    open('/saved');
    fireEvent.click(
      await screen.findByRole('button', {
        name: `Xem nguồn: ${word.expression}`,
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Nguồn đã lưu' });
    expect(
      await within(dialog).findByText(
        'Học liệu nguồn hiện không còn khả dụng với quyền truy cập của bạn.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('link', { name: 'Xem bản nguồn' }),
    ).toBeNull();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  },
);

it('paginates sources and opens a knowledge item from the original revision', async () => {
  const source = {
    deckVersionId: 'deck-version',
    knowledgeVersionId: 'word-old',
    createdAt: '2026-11-15T00:00:00Z',
  };
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => {
    if (path === '/auth/me') return response(user);
    if (path === '/me/saved-items') return response({ items: [saved] });
    if (path === '/me/saved-items/saved-item/sources')
      return response({ items: [source], nextCursor: 'next-src' });
    if (path === '/me/saved-items/saved-item/sources?cursor=next-src')
      return response({
        items: [
          { ...source, sessionId: 'trial-id', scenarioVersionId: 'scene' },
        ],
      });
    if (path === '/topic-versions/deck-version') return response(detail);
    if (path === '/topic-versions/deck-version/knowledge')
      return response({ items: [word] });
    throw new Error(`Unexpected GET ${path}`);
  });
  open('/saved');
  fireEvent.click(
    await screen.findByRole('button', {
      name: `Xem nguồn: ${word.expression}`,
    }),
  );
  const dialog = screen.getByRole('dialog', { name: 'Nguồn đã lưu' });
  const link = await within(dialog).findByRole('link', {
    name: 'Xem bản nguồn',
  });
  expect(link).toHaveAttribute(
    'href',
    '/topics/deck-version?knowledge=knowledge&revision=word-old',
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Xem thêm' }));
  expect(await within(dialog).findByText('Từ phiên luyện nói ·')).toBeVisible();
  expect(
    within(dialog).getAllByRole('link', { name: 'Xem bản nguồn' }),
  ).toHaveLength(2);
  fireEvent.click(link);
  expect(
    await screen.findByRole('heading', { name: 'Kiến thức ở bản nguồn' }),
  ).toBeVisible();
  expect(await screen.findByText('Cho tôi cà phê.')).toBeVisible();
  expect(get.mock.calls.map(([path]) => path)).toContain(
    '/topic-versions/deck-version/knowledge',
  );
});
