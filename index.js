const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/send-email', async (req, res) => {
  const { name, email, company, daysSinceLogin, tier } = req.body;
  const subject = tier === 'warning' ? `Hey ${name}, we missed you` : `${name}, here's what you're missing`;
  const html = `<p>Hey ${name},</p><p>It's been ${daysSinceLogin} days. — Team ${company}</p>`;
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'onboarding@resend.dev', to: email, subject, html })
  });
  
  const data = await response.json();
  res.json(data);
});

app.listen(3001, () => console.log('Email server running on port 3001'));
