import { act, render } from '@testing-library/react';
import type { TMessage } from 'librechat-data-provider';
import useMessageScrolling, { getScrollPosition } from '../useMessageScrolling';

const mockSetAbortScroll = jest.fn();
let mockIsSubmitting = false;

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { autoScroll: {} },
}));

jest.mock('~/Providers', () => ({
  useMessagesConversation: () => ({
    conversation: { conversationId: 'conversation-1' },
    conversationId: 'conversation-1',
  }),
  useMessagesSubmission: () => ({
    setAbortScroll: mockSetAbortScroll,
    isSubmitting: mockIsSubmitting,
    abortScroll: false,
  }),
}));

let resizeObserverCallback: ResizeObserverCallback | undefined;
const observe = jest.fn();
const disconnect = jest.fn();

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe = observe;
  unobserve = jest.fn();
  disconnect = disconnect;
}

let nextAnimationFrame: FrameRequestCallback | undefined;
const requestAnimationFrameMock = jest.fn((callback: FrameRequestCallback) => {
  nextAnimationFrame = callback;
  return 1;
});
const cancelAnimationFrameMock = jest.fn();

let hookValue: ReturnType<typeof useMessageScrolling>;

function Harness({ messages }: { messages: TMessage[] }) {
  hookValue = useMessageScrolling(messages);

  return (
    <div ref={hookValue.scrollableRef} data-testid="scroll-container">
      <div ref={hookValue.messagesContentRef} data-testid="message-content">
        <div ref={hookValue.messagesEndRef} />
      </div>
    </div>
  );
}

function flushAnimationFrame() {
  const callback = nextAnimationFrame;
  nextAnimationFrame = undefined;
  callback?.(0);
}

describe('getScrollPosition', () => {
  it('treats non-overflowing content as both boundaries', () => {
    expect(getScrollPosition({ scrollTop: 0, scrollHeight: 400, clientHeight: 400 })).toEqual({
      canScroll: false,
      isAtTop: true,
      isAtBottom: true,
    });
  });

  it.each([
    [0, true, false],
    [300, false, false],
    [600, false, true],
  ])('detects the scroll position at scrollTop %i', (scrollTop, isAtTop, isAtBottom) => {
    expect(getScrollPosition({ scrollTop, scrollHeight: 1000, clientHeight: 400 })).toEqual({
      canScroll: true,
      isAtTop,
      isAtBottom,
    });
  });
});

describe('useMessageScrolling', () => {
  const messages = [{ messageId: 'message-1' }] as TMessage[];
  let scrollTop = 0;
  let scrollHeight = 1000;
  let clientHeight = 400;
  let originalResizeObserver: typeof ResizeObserver;
  let originalRequestAnimationFrame: typeof window.requestAnimationFrame;
  let originalCancelAnimationFrame: typeof window.cancelAnimationFrame;
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    mockIsSubmitting = false;
    scrollTop = 0;
    scrollHeight = 1000;
    clientHeight = 400;
    nextAnimationFrame = undefined;
    resizeObserverCallback = undefined;

    originalResizeObserver = global.ResizeObserver;
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    window.requestAnimationFrame = requestAnimationFrameMock;
    window.cancelAnimationFrame = cancelAnimationFrameMock;
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  function renderHarness() {
    const result = render(<Harness messages={messages} />);
    const container = result.getByTestId('scroll-container');
    const content = result.getByTestId('message-content');

    Object.defineProperties(container, {
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      clientHeight: { configurable: true, get: () => clientHeight },
      scrollTo: {
        configurable: true,
        value: jest.fn(({ top }: ScrollToOptions) => {
          if (typeof top === 'number') {
            scrollTop = top;
          }
        }),
      },
    });

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
      flushAnimationFrame();
    });

    return { ...result, container, content };
  }

  it('tracks top, middle, and bottom states without recreating observers on scroll', () => {
    const { container } = renderHarness();

    expect(hookValue.showScrollNavigation).toBe(true);
    expect(hookValue.isAtTop).toBe(true);
    expect(hookValue.isAtBottom).toBe(false);

    scrollTop = 300;
    act(() => {
      hookValue.handleScroll();
      flushAnimationFrame();
    });
    expect(hookValue.isAtTop).toBe(false);
    expect(hookValue.isAtBottom).toBe(false);

    scrollTop = 600;
    act(() => {
      hookValue.handleScroll();
      flushAnimationFrame();
    });
    expect(hookValue.isAtBottom).toBe(true);
    expect(observe).toHaveBeenCalledWith(container);
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('hides navigation when the conversation does not overflow', () => {
    scrollHeight = 400;
    clientHeight = 400;
    renderHarness();

    expect(hookValue.showScrollNavigation).toBe(false);
    expect(hookValue.isAtTop).toBe(true);
    expect(hookValue.isAtBottom).toBe(true);
  });

  it('scrolls to either boundary and manages streaming auto-follow', () => {
    mockIsSubmitting = true;
    const { container, rerender } = renderHarness();
    rerender(<Harness messages={messages} />);
    const preventDefault = jest.fn();
    const event = { preventDefault } as unknown as React.MouseEvent<HTMLButtonElement>;

    act(() => {
      hookValue.handleScrollToTop(event);
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(mockSetAbortScroll).toHaveBeenCalledWith(true);

    act(() => {
      hookValue.handleScrollToNext(event);
    });
    expect(mockSetAbortScroll).toHaveBeenLastCalledWith(true);

    act(() => {
      hookValue.handleScrollToBottom(event);
    });
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
    expect(mockSetAbortScroll).toHaveBeenLastCalledWith(false);
  });

  it('uses instant boundary navigation when reduced motion is requested', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    const { container } = renderHarness();

    act(() => {
      hookValue.handleScrollToTop({
        preventDefault: jest.fn(),
      } as unknown as React.MouseEvent<HTMLButtonElement>);
    });

    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('disconnects the resize observer on unmount', () => {
    const { unmount } = renderHarness();
    unmount();

    expect(disconnect).toHaveBeenCalled();
  });
});
