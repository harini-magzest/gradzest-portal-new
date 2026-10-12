import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignedFileLink from './SignedFileLink';
import DocPreviewModal from './DocPreviewModal';

vi.mock('../api', () => ({ api: { files: { link: vi.fn() } } }));
import { api } from '../api';

const SIGNED = '/uploads/1700000000000-abc.pdf?uid=u1&exp=1&sig=signature';
const link = api.files.link as unknown as ReturnType<typeof vi.fn>;

describe('SignedFileLink', () => {
  beforeEach(() => { link.mockReset(); link.mockResolvedValue({ url: SIGNED, expiresAt: '' }); });
  afterEach(() => vi.restoreAllMocks());

  it('never puts a token in the page: the href is the bare stored path', () => {
    render(<SignedFileLink href="/uploads/1700000000000-abc.pdf" target="_blank">Open</SignedFileLink>);
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/uploads/1700000000000-abc.pdf');
    expect(link).not.toHaveBeenCalled();
  });

  it('opens the tab on click, then sends it to a freshly signed link', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    render(<SignedFileLink href="/uploads/1700000000000-abc.pdf" target="_blank">Open</SignedFileLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(link).toHaveBeenCalledWith('1700000000000-abc.pdf');
    await waitFor(() => expect(tab.location.href).toBe(SIGNED));
    expect(tab.opener).toBeNull();
  });

  it('downloads through the signed link', async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      if (this.download !== undefined && this.getAttribute('href') === SIGNED) clicked.push(this.getAttribute('href')!);
    });
    const open = vi.spyOn(window, 'open');
    render(<SignedFileLink href="/uploads/1700000000000-abc.pdf" download target="_blank">Download</SignedFileLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Download' }));
    await waitFor(() => expect(clicked).toEqual([SIGNED]));
    expect(open).not.toHaveBeenCalled();
  });

  it('closes the tab and says so when the file cannot be opened', async () => {
    link.mockRejectedValueOnce(new Error('File not found'));
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<SignedFileLink href="/uploads/1700000000000-abc.pdf" target="_blank">Open</SignedFileLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Open' }));
    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(alert).toHaveBeenCalled();
  });

  it('leaves other URLs alone', async () => {
    render(<SignedFileLink href="https://example.com/brochure.pdf" target="_blank">Brochure</SignedFileLink>);
    expect(screen.getByRole('link', { name: 'Brochure' })).toHaveAttribute('href', 'https://example.com/brochure.pdf');
    expect(link).not.toHaveBeenCalled();
  });
});

describe('DocPreviewModal', () => {
  beforeEach(() => { link.mockReset(); link.mockResolvedValue({ url: SIGNED, expiresAt: '' }); });

  it('shows a stored PDF through a signed link it asks for itself', async () => {
    render(<DocPreviewModal url="/uploads/1700000000000-abc.pdf" fileName="Passport" onClose={() => {}} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle('Document Preview')).toHaveAttribute('src', SIGNED));
    expect(link).toHaveBeenCalledWith('1700000000000-abc.pdf');
  });

  it('says the file could not be opened when no link is given', async () => {
    link.mockRejectedValueOnce(new Error('File not found'));
    render(<DocPreviewModal url="/uploads/1700000000000-abc.pdf" onClose={() => {}} />);
    expect(await screen.findByText(/could not be opened/)).toBeInTheDocument();
  });

  it('never hands a signed link to the Google viewer', async () => {
    render(<DocPreviewModal url="/uploads/1700000000000-abc.docx" onClose={() => {}} />);
    const viewer = screen.getByTitle('Document Preview');
    await waitFor(() => expect(link).toHaveBeenCalled());
    expect(viewer.getAttribute('src')).not.toMatch(/sig%3D|sig=/);
  });
});
