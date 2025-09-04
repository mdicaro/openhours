import { createClient } from '@vercel/kv';

// The client will automatically pick up the environment variables
const kv = createClient();

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

    await kv.set(newPollId, newPoll);
    res.status(201).json({ pollId: newPollId });

  } else if (req.method === 'PUT') {
    // Update participant availability
    const { pollId, email, availability } = req.body;

    // Fetch the current poll data
    const poll = await kv.get(pollId);

    if (poll) {
      // Update the nested object
      poll.availabilities[email] = availability;
      // Save the entire object back
      await kv.set(pollId, poll);
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }

  } else if (req.method === 'GET') {
    // Get a specific poll's data
    const { id } = req.query;
    const poll = await kv.get(id);
    if (poll) {
      res.status(200).json(poll);
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}