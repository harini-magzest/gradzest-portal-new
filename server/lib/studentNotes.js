/**
 * Visibility rules for staff notes on a student (User.counselorNotes).
 *
 *   public  — every staff member who can open the student sees it, with the author's name
 *   private — only the author sees it
 *
 * Only the author can edit a note or change its visibility. Notes never reach the student:
 * the User toJSON transform strips them, so these helpers are the only way notes leave the server.
 * Notes written before visibility existed have no value and count as private.
 */

const isPublic = n => n.visibility === 'public';
const isAuthor = (n, viewerId) => String(n.counselorId || '') === String(viewerId);
const canSee = (n, viewerId) => isPublic(n) || isAuthor(n, viewerId);

function serializeNote(n, viewerId) {
  return {
    id: String(n._id),
    text: n.text,
    visibility: isPublic(n) ? 'public' : 'private',
    authorId: String(n.counselorId || ''),
    authorName: n.counselorName || 'Staff',
    mine: isAuthor(n, viewerId),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

/** The notes `viewerId` may see on this student, newest first. */
function notesFor(student, viewerId) {
  return (student?.counselorNotes || [])
    .filter(n => canSee(n, viewerId))
    .map(n => serializeNote(n, viewerId))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

module.exports = { notesFor, canSee, isAuthor, isPublic };
