import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../../client/src/App.jsx';

afterEach(cleanup);

it('renders the application entry point', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Chiikaiwa' })).toBeVisible();
});

it('provides a way home from an unknown route', () => {
  render(
    <MemoryRouter initialEntries={['/missing']}>
      <App />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute(
    'href',
    '/',
  );
});
