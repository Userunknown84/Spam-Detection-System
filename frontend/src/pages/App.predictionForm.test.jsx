// Minimal RTL coverage for issue #820: exercise the prediction form (the
// detector tab in App.jsx) end to end against a mocked backend, since this
// is the core user-facing flow the automated test suite should protect.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import api from '../utils/axiosInstance';
import App from './App';

vi.mock('../utils/axiosInstance', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  pythonApi: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

function renderApp() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Prediction form (App detector tab)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Background fetches (word-of-the-day, wordcloud, feature importance)
    // triggered on mount by sibling components; keep them inert (successful,
    // empty) so their own error/retry UI doesn't interfere with this test.
    api.get.mockImplementation((url) => {
      if (url === '/api/wordcloud') {
        return Promise.resolve({ data: { success: true, data: [] } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ top_features: [] }) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submit button is disabled until text is entered', () => {
    renderApp();
    const submitButton = screen.getByRole('button', { name: /Analyze/i });
    expect(submitButton).toBeDisabled();
  });

  it('submits the typed message to the ML API and renders the result', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        prediction: 'spam',
        confidence: 0.9,
        severity: null,
        explanation: null,
      },
    });

    const user = userEvent.setup();
    renderApp();

    const textarea = screen.getByPlaceholderText(/type your sms or chat message/i);
    await user.type(textarea, 'Win a free prize now!');

    const submitButton = screen.getByRole('button', { name: /Analyze/i });
    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/predict'),
        expect.objectContaining({ text: 'Win a free prize now!' }),
      );
    });

    expect(await screen.findByText('🚫 Spam')).toBeInTheDocument();
  });

  it('shows a retryable error message when the prediction request fails', async () => {
    const error = new Error('Request failed with status code 500');
    error.response = { status: 500, data: { error: 'internal error' } };
    api.post.mockRejectedValueOnce(error);

    const user = userEvent.setup();
    renderApp();

    const textarea = screen.getByPlaceholderText(/type your sms or chat message/i);
    await user.type(textarea, 'Hello there');
    await user.click(screen.getByRole('button', { name: /Analyze/i }));

    expect(await screen.findByText(/Server Error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});
