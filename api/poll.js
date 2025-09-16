// poll.js

import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // CHANGE: Destructure all necessary fields from the body
    const { startDate, endDate, startTime, endTime, baseTimeZone } = req.body;
    const newPollId = `poll-${Date.now()}`;
    const newPoll = {
      startDate,
      endDate,
      startTime,
      endTime,
      baseTimeZone: baseTimeZone || null,
      timeZones: {},
      availabilities: {},
      createdAt: new Date().toISOString()
    };

    await redis.set(newPollId, newPoll);
    res.status(201).json({ pollId: newPollId });

  } else if (req.method === 'PUT') {
    const { pollId, email, availability, timezone } = req.body;
    const poll = await redis.get(pollId);

    if (poll) {
      if (timezone) poll.timeZones = { ...(poll.timeZones || {}), [email]: timezone };
  poll.availabilities[email] = availability;
      await redis.set(pollId, poll);
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: 'Poll not found' });
    }

  } else if (req.method === 'GET') {
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