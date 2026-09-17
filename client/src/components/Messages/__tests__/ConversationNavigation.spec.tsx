import { fireEvent, render, screen } from '@testing-library/react';
import ConversationNavigation from '../ConversationNavigation';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

function renderNavigation({ isAtTop = false, isAtBottom = false } = {}) {
  const handlers = {
    onScrollToTop: jest.fn(),
    onScrollToNext: jest.fn(),
    onScrollToBottom: jest.fn(),
  };

  render(<ConversationNavigation isAtTop={isAtTop} isAtBottom={isAtBottom} {...handlers} />);

  return handlers;
}

describe('ConversationNavigation', () => {
  it('exposes localized navigation and button labels', () => {
    renderNavigation();

    expect(
      screen.getByRole('navigation', { name: 'com_ui_conversation_navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_top' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_next_message' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_bottom' })).toBeEnabled();
  });

  it('invokes each available navigation action', () => {
    const handlers = renderNavigation();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_scroll_to_top' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_scroll_to_next_message' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_scroll_to_bottom' }));

    expect(handlers.onScrollToTop).toHaveBeenCalledTimes(1);
    expect(handlers.onScrollToNext).toHaveBeenCalledTimes(1);
    expect(handlers.onScrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('disables only actions that cannot move beyond the current boundary', () => {
    const { rerender } = render(
      <ConversationNavigation
        isAtTop={true}
        isAtBottom={false}
        onScrollToTop={jest.fn()}
        onScrollToNext={jest.fn()}
        onScrollToBottom={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_top' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_next_message' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_bottom' })).toBeEnabled();

    rerender(
      <ConversationNavigation
        isAtTop={false}
        isAtBottom={true}
        onScrollToTop={jest.fn()}
        onScrollToNext={jest.fn()}
        onScrollToBottom={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_top' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_next_message' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'com_ui_scroll_to_bottom' })).toBeDisabled();
  });
});
