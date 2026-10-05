import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import NamasteIntro from './NamasteIntro';

const auth = vi.hoisted(() => ({ isAuthenticated: false, loading: false }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

// jsdom can't play video, so the tests drive the <video> element's events by hand ('playing', 'error') and move the
// clock with fake timers. Lengths below mirror the component: VIDEO_WAIT_MS 2500, VIDEO_HOLD_MS 500, VIDEO_EXIT_MS 700,
// DURATION_MS 3500. After the video ends its last frame is held, then the overlay slides up.
const VIDEO_SECONDS = 5.4;
const HOLD_MS = 500;
const EXIT_MS = 700;
const totalFor = (seconds: number) => Math.round(seconds * 1000) + HOLD_MS + EXIT_MS;
const VIDEO_TOTAL_MS = totalFor(VIDEO_SECONDS);
const SEEN_KEY = 'gz_namaste_seen';

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go {to}</button>;
}

const tree = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <NamasteIntro />
    <GoTo to="/" />
    <GoTo to="/universities" />
    <GoTo to="/student" />
  </MemoryRouter>
);
const renderIntro = (path = '/') => render(tree(path));

const dialog = () => screen.queryByRole('dialog', { name: 'Welcome to Gradzest' });
const video = () => dialog()?.querySelector('video') ?? null;
const drawnHands = () => dialog()?.querySelector('svg') ?? null;
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const goTo = (to: string) => act(() => { fireEvent.click(screen.getByText(`go ${to}`)); });

function videoStartsPlaying(seconds = VIDEO_SECONDS) {
  const el = video()!;
  Object.defineProperty(el, 'duration', { value: seconds, configurable: true });
  act(() => { fireEvent.playing(el); });
}

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({ matches: reduce, media: query, addEventListener: () => {}, removeEventListener: () => {} })),
  });
}

describe('NamasteIntro', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    auth.isAuthenticated = false;
    auth.loading = false;
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  describe('who sees it', () => {
    it('plays for a new, signed-out visitor on the homepage', () => {
      renderIntro('/');
      expect(dialog()).toBeInTheDocument();
    });

    it('is remembered per browser from the moment it starts', () => {
      renderIntro('/');
      expect(localStorage.getItem(SEEN_KEY)).toBe('1');
    });

    it('does not play again once it has played', () => {
      const first = renderIntro('/');
      videoStartsPlaying();
      advance(VIDEO_TOTAL_MS);
      expect(dialog()).toBeNull();
      first.unmount();
      renderIntro('/');
      expect(dialog()).toBeNull();
    });

    it('does not replay after a refresh in the middle of it', () => {
      const first = renderIntro('/');
      videoStartsPlaying();
      advance(1500);
      first.unmount();
      renderIntro('/');
      expect(dialog()).toBeNull();
    });

    it('does not play for a returning visitor', () => {
      localStorage.setItem(SEEN_KEY, '1');
      renderIntro('/');
      expect(dialog()).toBeNull();
    });

    it('does not play for a signed-in user', () => {
      auth.isAuthenticated = true;
      renderIntro('/');
      expect(dialog()).toBeNull();
    });

    it('does not play while a returning browser\'s session is restored, nor if the restore then fails', () => {
      auth.loading = true;
      const view = renderIntro('/');
      expect(dialog()).toBeNull();
      auth.loading = false; // restore failed: signed out, but this browser has signed in before
      view.rerender(tree('/'));
      expect(dialog()).toBeNull();
    });

    it.each(['/student', '/student/universities', '/counselor', '/admin', '/admin/zest', '/soc', '/appteam', '/board'])(
      'never plays on a dashboard (%s)',
      path => {
        renderIntro(path);
        expect(dialog()).toBeNull();
      },
    );

    it.each(['/login', '/forgot-password', '/universities', '/university/12', '/resources', '/search', '/parent/abc123'])(
      'does not play on any page other than the homepage (%s)',
      path => {
        renderIntro(path);
        expect(dialog()).toBeNull();
        expect(localStorage.getItem(SEEN_KEY)).toBeNull();
      },
    );

    it('plays when a new visitor who landed elsewhere first reaches the homepage', () => {
      renderIntro('/universities');
      expect(dialog()).toBeNull();
      goTo('/');
      expect(dialog()).toBeInTheDocument();
    });

    it('plays only once even if the visitor keeps moving between pages', () => {
      renderIntro('/');
      videoStartsPlaying();
      advance(VIDEO_TOTAL_MS);
      expect(dialog()).toBeNull();
      goTo('/universities');
      goTo('/');
      goTo('/student');
      goTo('/');
      expect(dialog()).toBeNull();
    });

    it('does not play for people who prefer reduced motion', () => {
      mockReducedMotion(true);
      renderIntro('/');
      expect(dialog()).toBeNull();
    });

    it('does not play if the browser will not let it remember that it did (it would replay every visit)', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
      renderIntro('/');
      expect(dialog()).toBeNull();
    });
  });

  describe('with the video', () => {
    it('shows only the footage once it plays: no drawn hands, no second greeting, no skip button', () => {
      renderIntro();
      expect(video()).toBeInTheDocument();
      videoStartsPlaying();
      expect(video()).toBeInTheDocument();
      expect(drawnHands()).toBeNull();
      // The greeting is in the footage; drawing "Namaste" over it again would double it up.
      expect(screen.queryByLabelText('Namaste')).toBeNull();
      expect(dialog()?.querySelectorAll('p, button')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
    });

    it('is muted and inline so browsers allow it to autoplay', () => {
      renderIntro();
      expect(video()).toHaveProperty('muted', true);
      expect(video()).toHaveAttribute('playsinline');
    });

    it('stays up for the whole video, holds the last frame, then closes after the slide-up', () => {
      renderIntro();
      videoStartsPlaying();
      advance(VIDEO_TOTAL_MS - 1);
      expect(dialog()).toBeInTheDocument();
      advance(1);
      expect(dialog()).toBeNull();
    });

    it("uses the video's own length rather than a fixed one", () => {
      renderIntro();
      videoStartsPlaying(4);
      advance(totalFor(4) - 1);
      expect(dialog()).toBeInTheDocument();
      advance(1);
      expect(dialog()).toBeNull();
    });

    it('starts the slide-up only after the hold, so the last frame can be read', () => {
      renderIntro();
      videoStartsPlaying();
      expect(dialog()?.style.animation).toContain(`${Math.round(VIDEO_SECONDS * 1000) + HOLD_MS}ms both`);
    });

    it('locks page scroll while it is up and restores it afterwards', () => {
      document.body.style.overflow = 'auto';
      renderIntro();
      expect(document.body.style.overflow).toBe('hidden');
      videoStartsPlaying();
      advance(VIDEO_TOTAL_MS);
      expect(document.body.style.overflow).toBe('auto');
    });

    it('does not swap to the drawn hands if the video errors after it has started playing', () => {
      renderIntro();
      videoStartsPlaying();
      advance(3000);
      act(() => { fireEvent.error(video()!); });
      expect(video()).toBeInTheDocument();
      expect(drawnHands()).toBeNull();
    });

    it('navigating while the intro is up does not restart its clock', () => {
      renderIntro();
      videoStartsPlaying();
      advance(4000);
      goTo('/universities');
      expect(dialog()).toBeInTheDocument();
      advance(VIDEO_TOTAL_MS - 4000 - 1);
      expect(dialog()).toBeInTheDocument();
      advance(1);
      expect(dialog()).toBeNull();
    });
  });

  describe('falling back to the drawn hands', () => {
    it('plays them when the video file fails to load', () => {
      renderIntro();
      act(() => { fireEvent.error(video()!); });
      expect(video()).toBeNull();
      expect(drawnHands()).toBeInTheDocument();
      expect(screen.getByLabelText('Namaste')).toBeInTheDocument();
    });

    it('plays them when the video has not started within 2.5s (autoplay blocked, slow network)', () => {
      renderIntro();
      advance(2499);
      expect(drawnHands()).toBeNull();
      advance(1);
      expect(drawnHands()).toBeInTheDocument();
    });

    it('closes 3.5s after the fallback starts, not 3.5s after the page opened', () => {
      renderIntro();
      advance(2000);
      act(() => { fireEvent.error(video()!); });
      advance(3499);
      expect(dialog()).toBeInTheDocument();
      advance(1);
      expect(dialog()).toBeNull();
    });
  });

  describe('dismissing', () => {
    it('closes on Escape', () => {
      renderIntro();
      videoStartsPlaying();
      act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
      expect(dialog()).toBeNull();
    });

    it('closes when clicked', () => {
      renderIntro();
      videoStartsPlaying();
      act(() => { fireEvent.click(dialog()!); });
      expect(dialog()).toBeNull();
    });

    it('stays dismissed: closing it early still counts as having seen it', () => {
      const first = renderIntro();
      act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
      first.unmount();
      renderIntro();
      expect(dialog()).toBeNull();
    });
  });
});
