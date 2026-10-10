import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TwoFactorCard from './TwoFactorCard';

// These tests type into inputs one character at a time, which is slow on a busy machine or a shared CI runner.
vi.setConfig({ testTimeout: 30000 });

vi.mock('../api', () => ({
  api: {
    account: { twoFactor: { status: vi.fn(), setup: vi.fn(), enable: vi.fn(), disable: vi.fn(), newRecoveryCodes: vi.fn() } },
  },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ refreshUser: vi.fn() }) }));
// The QR image is drawn by a library; what matters here is that the card asks for one from the otpauth link.
vi.mock('qrcode-generator', () => ({
  default: () => ({ addData: vi.fn(), make: vi.fn(), createDataURL: () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
}));

import { api } from '../api';
const tf = api.account.twoFactor as unknown as Record<string, ReturnType<typeof vi.fn>>;

const off = { enabled: false, enabledAt: null, recoveryCodesRemaining: 0, hasPassword: true };
const on = { enabled: true, enabledAt: '2026-10-01T10:00:00.000Z', recoveryCodesRemaining: 10, hasPassword: true };
const codes = ['aaaa-1111-bbbb', 'cccc-2222-dddd', 'eeee-3333-ffff'];

beforeEach(() => { Object.values(tf).forEach(f => f.mockReset()); });

describe('TwoFactorCard', () => {
  it('walks through turning it on: password, scan, confirm a code, save the recovery codes', async () => {
    const user = userEvent.setup();
    tf.status.mockResolvedValueOnce(off).mockResolvedValue(on);
    tf.setup.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Gradzest:a%40b.c?secret=JBSWY3DPEHPK3PXP' });
    tf.enable.mockResolvedValue({ enabled: true, recoveryCodes: codes });

    render(<TwoFactorCard />);
    await user.click(await screen.findByRole('button', { name: /turn on/i }));

    // typing a whole password must work: an input that remounts on every keystroke would keep only the first character
    await user.type(screen.getByLabelText(/current password/i), 'My-Long-Password-1!');
    expect(screen.getByLabelText(/current password/i)).toHaveValue('My-Long-Password-1!');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(tf.setup).toHaveBeenCalledWith('My-Long-Password-1!');

    // the key is shown for manual entry, and the QR image is there
    expect(await screen.findByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    expect(await screen.findByAltText(/qr code/i)).toBeInTheDocument();

    const turnOn = screen.getByRole('button', { name: /^turn on$/i });
    expect(turnOn).toBeDisabled();
    await user.type(screen.getByLabelText(/6-digit code/i), '123456');
    expect(screen.getByLabelText(/6-digit code/i)).toHaveValue('123456');
    await user.click(turnOn);
    expect(tf.enable).toHaveBeenCalledWith('123456');

    // the recovery codes are shown once and must be acknowledged before leaving
    for (const c of codes) expect(await screen.findByText(c)).toBeInTheDocument();
    const done = screen.getByRole('button', { name: /done/i });
    expect(done).toBeDisabled();
    await user.click(screen.getByLabelText(/i have saved these codes/i));
    expect(done).toBeEnabled();
    await user.click(done);

    // back at rest, now showing it is on; the codes are gone from the page
    expect(await screen.findByText(/10 recovery codes left/i)).toBeInTheDocument();
    for (const c of codes) expect(screen.queryByText(c)).not.toBeInTheDocument();
  });

  it('shows the server\'s reason when the password or code is wrong, and stays on that step', async () => {
    const user = userEvent.setup();
    tf.status.mockResolvedValue(off);
    tf.setup.mockRejectedValue(new Error('Current password is incorrect. 4 attempts remaining before lockout.'));
    render(<TwoFactorCard />);
    await user.click(await screen.findByRole('button', { name: /turn on/i }));
    await user.type(screen.getByLabelText(/current password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/4 attempts remaining/);
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it('turning it off asks for the password and a code', async () => {
    const user = userEvent.setup();
    tf.status.mockResolvedValueOnce(on).mockResolvedValue(off);
    tf.disable.mockResolvedValue({ enabled: false });
    render(<TwoFactorCard />);
    await user.click(await screen.findByRole('button', { name: /turn off/i }));

    const submit = screen.getByRole('button', { name: /^turn off$/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/current password/i), 'Pw-123456!');
    expect(submit).toBeDisabled(); // a code is needed too
    await user.type(screen.getByLabelText(/verification code/i), '654321');
    await user.click(submit);
    expect(tf.disable).toHaveBeenCalledWith('Pw-123456!', '654321');
    await waitFor(() => expect(screen.getByText('Off')).toBeInTheDocument());
  });

  it('warns when recovery codes are running low and can make new ones', async () => {
    const user = userEvent.setup();
    tf.status.mockResolvedValue({ ...on, recoveryCodesRemaining: 2 });
    tf.newRecoveryCodes.mockResolvedValue({ recoveryCodes: codes });
    render(<TwoFactorCard />);
    expect(await screen.findByText(/2 recovery codes left\. make new ones soon/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new recovery codes/i }));
    await user.type(screen.getByLabelText(/current password/i), 'Pw-123456!');
    await user.type(screen.getByLabelText(/verification code/i), '654321');
    await user.click(screen.getByRole('button', { name: /make new codes/i }));
    expect(tf.newRecoveryCodes).toHaveBeenCalledWith('Pw-123456!', '654321');
    expect(await screen.findByText(codes[0])).toBeInTheDocument();
  });

  it('explains an account with no password instead of offering a flow that cannot work', async () => {
    tf.status.mockResolvedValue({ ...off, hasPassword: false });
    render(<TwoFactorCard />);
    expect(await screen.findByText(/has no password yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn on/i })).not.toBeInTheDocument();
  });

  it('says so when the settings cannot be loaded', async () => {
    tf.status.mockRejectedValue(new Error('Server error'));
    render(<TwoFactorCard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });
});
