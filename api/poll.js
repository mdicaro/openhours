import { Redis } from '@upstash/redis';

// The environment variables will be automatically picked up by Vercel
const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Create a new poll
    const { emails } = req.body;
    const newPollId = `poll-${Date.now()}`;
    const newPoll = {
      emails,
      availabilities: {},
      createdAt: new Date().toISOString()
    };

    await redis.set(newPollId, newPoll);
    res.status(201).json({ pollId: newPollId });

  } else if (req.method === 'PUT') {
    // Update participant availability
    const { pollId, email, availability } = req.body;
    const key = `${pollId}`;
    const poll = await redis.get(key);

    if (poll) {
      // Update the nested object
      poll.availabilities[email] = availability;
      await redis.set(key, poll);
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }

  } else if (req.method === 'GET') {
    // Get a specific poll's data
    const { id } = req.query;
    const poll = await redis.get(id);
    if (poll) {
      res.status(200).json(poll);
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}