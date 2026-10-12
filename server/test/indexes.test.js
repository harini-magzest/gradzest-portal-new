// The queries the app runs on every request or every page load must be answered from an index. These ask MongoDB for the
// query plan ("explain") and fail if it would read the whole collection.
const User = require('../models/User');
const ChatRoom = require('../models/ChatRoom');
const Meeting = require('../models/Meeting');

const plan = async (Model, filter, sort) => {
  let cursor = Model.collection.find(filter);
  if (sort) cursor = cursor.sort(sort);
  return JSON.stringify((await cursor.explain('queryPlanner')).queryPlanner.winningPlan);
};
const stages = (p) => [...p.matchAll(/"stage":"([A-Z_]+)"/g)].map((m) => m[1]);

beforeAll(async () => {
  // Models build their indexes in the background at start-up: wait for them, and give each collection a few documents so
  // the planner is choosing between real alternatives, not looking at an empty collection
  await Promise.all([User.init(), ChatRoom.init(), Meeting.init()]);
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  await User.collection.insertMany(many(30, (i) => ({
    name: `Index probe ${i}`, email: `index-probe-${i}@example.com`, role: i % 3 ? 'student' : 'counselor',
    counselorId: `c${i % 4}`, sessions: [{ tokenHash: `hash-${i}`, expires: new Date(Date.now() + 1e7) }],
  })));
  await ChatRoom.collection.insertMany(many(30, (i) => ({
    participants: [`u${i}`, `u${i + 1}`], type: 'student-counselor', messages: [], updatedAt: new Date(i * 1000),
  })));
  await Meeting.collection.insertMany(many(30, (i) => ({
    title: `m${i}`, scheduledDate: `2030-01-${String((i % 28) + 1).padStart(2, '0')}`, status: 'scheduled',
    participants: [{ userId: `u${i}`, name: 'x' }],
  })));
});

describe('indexes for the hot queries', () => {
  it('finds a session by its refresh-token hash without scanning every user (every token refresh and logout)', async () => {
    const p = await plan(User, { 'sessions.tokenHash': 'hash-7' });
    expect(stages(p)).not.toContain('COLLSCAN');
    expect(stages(p)).toContain('IXSCAN');
  });

  it('lists users by role, and a counselor\'s students, from an index', async () => {
    expect(stages(await plan(User, { role: 'counselor' }))).not.toContain('COLLSCAN');
    expect(stages(await plan(User, { role: 'student', counselorId: 'c1' }))).not.toContain('COLLSCAN');
  });

  it('lists a person\'s chats, newest first, from an index with no in-memory sort', async () => {
    const s = stages(await plan(ChatRoom, { participants: 'u5' }, { updatedAt: -1 }));
    expect(s).not.toContain('COLLSCAN');
    expect(s).not.toContain('SORT');
  });

  it('finds upcoming meetings, and one person\'s upcoming meetings, from an index', async () => {
    expect(stages(await plan(Meeting, { status: 'scheduled', scheduledDate: { $gte: '2030-01-10' } }))).not.toContain('COLLSCAN');
    expect(stages(await plan(Meeting, { status: 'scheduled', scheduledDate: { $gte: '2030-01-10' }, 'participants.userId': 'u3' })))
      .not.toContain('COLLSCAN');
  });
});
