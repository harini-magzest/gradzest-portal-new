import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { clickOnEnterOrSpace, clickOnEnter } from './a11y';

function Row({ onClick, onInnerClick, onKeyDown }: { onClick: () => void; onInnerClick?: () => void; onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void }) {
  return (
    <div role="button" tabIndex={0} data-testid="row" onClick={onClick} onKeyDown={onKeyDown}>
      row
      <button type="button" onClick={(e) => { e.stopPropagation(); onInnerClick?.(); }}>inner</button>
    </div>
  );
}

describe('clickOnEnterOrSpace', () => {
  it('does what a click does on Enter and on Space', () => {
    const onClick = vi.fn();
    render(<Row onClick={onClick} onKeyDown={clickOnEnterOrSpace} />);
    const row = screen.getByTestId('row');
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    render(<Row onClick={onClick} onKeyDown={clickOnEnterOrSpace} />);
    for (const key of ['a', 'Tab', 'Escape', 'ArrowDown']) fireEvent.keyDown(screen.getByTestId('row'), { key });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stops Space from scrolling the page', () => {
    render(<Row onClick={() => {}} onKeyDown={clickOnEnterOrSpace} />);
    const notCancelled = fireEvent.keyDown(screen.getByTestId('row'), { key: ' ' });
    expect(notCancelled).toBe(false); // preventDefault was called
  });

  it('leaves a button inside the element its own keys', () => {
    const onClick = vi.fn();
    const onInnerClick = vi.fn();
    render(<Row onClick={onClick} onInnerClick={onInnerClick} onKeyDown={clickOnEnterOrSpace} />);
    // Enter on the inner button: the row's handler must not click the row as well
    fireEvent.keyDown(screen.getByRole('button', { name: 'inner' }), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('clickOnEnter', () => {
  it('activates on Enter but not on Space', () => {
    const onClick = vi.fn();
    render(<Row onClick={onClick} onKeyDown={clickOnEnter} />);
    fireEvent.keyDown(screen.getByTestId('row'), { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('row'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
