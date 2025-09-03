import fs from 'fs';
import path from 'path';

// Note: This is for a simple example.
// In a real production app, you would use a proper database.
const DB_PATH = path.join(process.cwd(), 'data/polls.json');

const getPolls = () => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, start with an empty object
    return {};
  }
};

const savePolls = (polls) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(polls, null, 2), 'utf-8');
};

export default async function handler(req, res) {
  const polls = getPolls();

  if (req.method === 'POST') {
    // Create a new poll
    const { emails } = req.body;
    const newPollId = `poll-${Date.now()}`;
    const newPoll = {
      emails,
      availabilities: {},
      createdAt: new Date().toISOString()
    };
    polls[newPollId] = newPoll;
    savePolls(polls);
    res.status(201).json({ pollId: newPollId });
  
  } else if (req.method === 'PUT') {
    // Update participant availability
    const { pollId, email, availability } = req.body;
    if (polls[pollId]) {
      polls[pollId].availabilities[email] = availability;
      savePolls(polls);
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }

  } else if (req.method === 'GET') {
    // Get a specific poll's data
    const { id } = req.query;
    if (polls[id]) {
      res.status(200).json(polls[id]);
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
}