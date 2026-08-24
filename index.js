const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function sendEmail(name, email, company, daysSince, tier) {
  let subject = tier === 'warning' ? `Hey ${name}, we missed you` : `${name}, here's what you're missing`;
  let body = `Hi ${name},\n\nIt's been ${daysSince} days. — Team ${company}`;

  try {
    const { data: settings } = await supabase
      .from('email_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (settings) {
      subject = settings.subject
        .replace(/{{name}}/g, name)
        .replace(/{{company}}/g, company)
        .replace(/{{days}}/g, daysSince);

      body = settings.body
        .replace(/{{name}}/g, name)
        .replace(/{{company}}/g, company)
        .replace(/{{days}}/g, daysSince);
    }
  } catch (e) {
    console.log('Template fetch failed, using default');
  }

  const html = body.split('\n').map(line => `<p>${line}</p>`).join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'onboarding@resend.dev', to: email, subject, html })
  });
}

async function runEmailJob() {
  const { data: customers } = await supabase.from('customers').select('*');
  if (!customers) return;
  const now = Date.now();
  for (const customer of customers) {
    const lastLogin = new Date(customer.last_login);
    const daysSince = Math.floor((now - lastLogin.getTime()) / 86400000);
    const email1SentAt = customer.email_1_sent_at ? new Date(customer.email_1_sent_at) : null;
    const daysSinceEmail1 = email1SentAt ? Math.floor((now - email1SentAt.getTime()) / 86400000) : null;

    if (daysSince >= 7 && !customer.email_1_sent) {
      await sendEmail(customer.name, customer.email, customer.company, daysSince, 'warning');
      await supabase.from('customers').update({ email_1_sent: true, email_1_sent_at: new Date().toISOString() }).eq('id', customer.id);
      console.log('Email 1 sent:', customer.email);
    } else if (customer.email_1_sent && !customer.email_2_sent && daysSinceEmail1 >= 5) {
      await sendEmail(customer.name, customer.email, customer.company, daysSince, 'critical');
      await supabase.from('customers').update({ email_2_sent: true, email_2_sent_at: new Date().toISOString() }).eq('id', customer.id);
      console.log('Email 2 sent:', customer.email);
    }
  }
}

// Cron — har 24 ghante mein chale
setInterval(runEmailJob, 24 * 60 * 60 * 1000);
runEmailJob(); // server start hote hi ek baar chale

app.post('/send-email', async (req, res) => {
  const { name, email, company, daysSinceLogin, tier } = req.body;
  await sendEmail(name, email, company, daysSinceLogin, tier);
  res.json({ success: true });
});app.post('/fetch-hubspot', async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      error: 'HubSpot API token is required'
    });
  }

  try {
    const response = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,company&hapikey=${apiKey}`,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
      }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || 'Invalid HubSpot token or access denied'
      );
    }

    const contacts = (data.results || [])
      .map((c) => ({
        name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim(),
        email: c.properties.email || '',
        company: c.properties.company || ''
      }))
      .filter((c) => c.name && c.email);

    res.json({
      success: true,
      contacts
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(3001, () => console.log('Email server running on port 3001'));
