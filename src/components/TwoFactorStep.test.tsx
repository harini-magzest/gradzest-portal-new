import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TwoFactorStep from './TwoFactorStep';

vi.setConfig({ testTimeout: 20000 });

const setup = (props: Partial<React.ComponentProps<typeof TwoFactorStep>> = {}) => {
  const onSubmit = vi.fn();
  const onBack = vi.fn();
  const utils = render(<TwoFactorStep onSubmit={onSubmit} onBack={onBack} submitting={false} {...props} />);
  return { onSubmit, onBack, ...utils };
};

describe('TwoFactorStep', () => {
  it('only lets a full 6-digit code be sent, and sends it trimmed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const button = screen.getByRole('button', { name: /verify and sign in/i });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/verification code/i), '123');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/verification code/i), '456');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith('123456');
  });

  it('accepts a code typed with a space in the middle', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    await user.type(screen.getByLabelText(/verification code/i), '123 456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(onSubmit).toHaveBeenCalledWith('123 456');
  });

  it('switches to a recovery code and back, clearing what was typed', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    await user.type(screen.getByLabelText(/verification code/i), '12');
    await user.click(screen.getByRole('button', { name: /use a recovery code/i }));

    const input = screen.getByLabelText(/recovery code/i);
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeDisabled();
    await user.type(input, 'ab12-cd34-ef56');
    expect(screen.getByRole('button', { name: /verify and sign in/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(onSubmit).toHaveBeenCalledWith('ab12-cd34-ef56');

    await user.click(screen.getByRole('button', { name: /use my authenticator app/i }));
    expect(screen.getByLabelText(/verification code/i)).toHaveValue('');
  });

  it('shows the server\'s message and clears the wrong code so the next try starts fresh', async () => {
    const user = userEvent.setup();
    const { rerender, onSubmit, onBack } = setup();
    await user.type(screen.getByLabelText(/verification code/i), '111111');
    rerender(<TwoFactorStep onSubmit={onSubmit} onBack={onBack} submitting={false} error="Invalid verification code. 4 attempts remaining before lockout." />);
    expect(screen.getByRole('alert')).toHaveTextContent(/4 attempts remaining/);
    expect(screen.getByLabelText(/verification code/i)).toHaveValue('');
  });

  it('cannot be sent twice while a request is in flight, and can go back to the password', async () => {
    const user = userEvent.setup();
    const { onBack, onSubmit } = setup({ submitting: true });
    expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(onBack).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
